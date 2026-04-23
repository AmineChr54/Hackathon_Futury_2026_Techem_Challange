"""FastAPI endpoints for the prediction engine.

Endpoints:
    GET  /health                      liveness
    GET  /units                       list known units
    GET  /forecast/unit/{pid}/{uid}   point + q10/q90, per-day
    GET  /drilldown/unit/{pid}/{uid}  forecast disaggregated by room
    POST /whatif/unit/{pid}/{uid}     counterfactual via room β
    GET  /peers/{pid}/{uid}           cohort definition + percentile
    GET  /drift                       recent structural-break events

The service loads all artifacts at startup. Forecasts use historical
weather by default; the `use_live_weather=true` query param routes
through Meteostat (resilient — falls back to mock).
"""
from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from techem.config import (
    CONSUMPTION_PARQUET,
    DEFAULT_EMISSION_G_PER_KWH,
    DEFAULT_PRICE_EUR_PER_KWH,
    MODELS_DIR,
    ROOM_SENSITIVITIES,
    UNIT_DAILY_PARQUET,
)
from techem.data.external import ensure_mock_geocode, ensure_mock_weather, weather_forecast
from techem.features.engineering import build_feature_frame
from techem.models import l0_reconcile, l1_baseline, l2_quantile, l3_online
from techem.models.drift import detect_drift
from techem.models.whatif import counterfactual_delta_kwh


app = FastAPI(title="Techem Forecast Engine", version="0.1.0")


# ---------- lazy artifact loaders ----------

@lru_cache(maxsize=1)
def _unit_daily() -> pd.DataFrame:
    df = pd.read_parquet(UNIT_DAILY_PARQUET)
    df["date"] = pd.to_datetime(df["date"])
    return df


@lru_cache(maxsize=1)
def _consumption() -> pd.DataFrame:
    df = pd.read_parquet(CONSUMPTION_PARQUET)
    df["date"] = pd.to_datetime(df["date"])
    return df


@lru_cache(maxsize=1)
def _features() -> pd.DataFrame:
    return build_feature_frame(_unit_daily())


@lru_cache(maxsize=1)
def _models():
    tw, qs = l2_quantile.load_models()
    l1 = l1_baseline.load()
    return tw, qs, l1


@lru_cache(maxsize=1)
def _room_shares() -> pd.DataFrame:
    return l0_reconcile.room_shares(_consumption())


@lru_cache(maxsize=1)
def _room_sens() -> pd.DataFrame:
    return pd.read_parquet(ROOM_SENSITIVITIES)


@lru_cache(maxsize=1)
def _l3_state() -> dict[str, float]:
    return l3_online.load_state()


# ---------- pydantic schemas ----------

class ForecastPoint(BaseModel):
    date: str
    point_kwh: float
    q10_kwh: float
    q90_kwh: float
    cost_eur: float
    co2_g: float


class ForecastResponse(BaseModel):
    property_id: int
    unit_id: int
    source: str
    horizon_days: int
    total_point_kwh: float
    total_point_cost_eur: float
    total_co2_kg: float
    drivers: dict = Field(default_factory=dict)
    series: list[ForecastPoint]


class RoomBreakdown(BaseModel):
    room_id: int
    share: float
    total_point_kwh: float


class WhatIfRequest(BaseModel):
    room_id: Optional[int] = None
    temp_delta_c: float = Field(..., description="Setpoint delta in °C. Negative = tenant turns down.")
    horizon_days: int = 30
    use_live_weather: bool = False


class WhatIfResponse(BaseModel):
    baseline_kwh: float
    counterfactual_kwh: float
    delta_kwh: float
    delta_cost_eur: float
    delta_co2_kg: float


class PeersResponse(BaseModel):
    property_id: int
    unit_id: int
    cohort_size: int
    cohort_definition: dict
    percentile_rank_better_than: float
    unit_avg_daily_kwh: float
    cohort_avg_daily_kwh: float


# ---------- helpers ----------

def _unit_row(pid: int, uid: int) -> pd.DataFrame:
    unit = _unit_daily()
    rows = unit[(unit["property_id"] == pid) & (unit["unit_id"] == uid)]
    if rows.empty:
        raise HTTPException(404, f"Unit ({pid},{uid}) not found")
    return rows


def _future_frame(pid: int, uid: int, horizon: int, use_live: bool) -> pd.DataFrame:
    """Build a feature frame for the next `horizon` days of this unit."""
    hist = _unit_row(pid, uid).sort_values("date")
    last = hist.iloc[-1]
    start = (pd.to_datetime(last["date"]) + pd.Timedelta(days=1)).date()
    future_dates = [start + timedelta(days=i) for i in range(horizon)]

    if use_live:
        try:
            wx = weather_forecast(str(last["zipcode"]), horizon_days=horizon + 3)
            wx["date"] = pd.to_datetime(wx["date"]).dt.date
            temp_map = dict(zip(wx["date"], wx["tavg"]))
            temps = [float(temp_map.get(d, last["outside_temp"])) for d in future_dates]
        except Exception:
            temps = [float(last["outside_temp"])] * horizon
    else:
        # Seasonal lookup: same day-of-year from last year in hist if available.
        hist_indexed = hist.set_index(pd.to_datetime(hist["date"]).dt.strftime("%m-%d"))["outside_temp"]
        temps = [
            float(hist_indexed.get(d.strftime("%m-%d"), last["outside_temp"]))
            for d in future_dates
        ]

    fut = pd.DataFrame({
        "property_id": pid,
        "unit_id": uid,
        "date": pd.to_datetime(future_dates),
        "kwh": np.nan,
        "livingspace": last["livingspace"],
        "n_rooms": last["n_rooms"],
        "outside_temp": temps,
        "emission_factor_g_per_kwh": last["emission_factor_g_per_kwh"],
        "source": last["source"],
        "zipcode": last["zipcode"],
        "city": last["city"],
    })

    # Stitch history + future and run the feature pipeline so lag features
    # at the boundary are correct. For the NaN target lags in the future,
    # we carry the last observed kwh value forward — the model only sees
    # the lag feature at inference time.
    stitched = pd.concat([hist, fut], ignore_index=True).sort_values("date")
    stitched["kwh"] = stitched["kwh"].fillna(method="ffill")
    feat = build_feature_frame(stitched)
    future_feat = feat[feat["date"] >= pd.to_datetime(start)].reset_index(drop=True)
    return future_feat, hist


# ---------- routes ----------

@app.on_event("startup")
def _startup() -> None:
    ensure_mock_weather()
    ensure_mock_geocode()
    _unit_daily()
    _consumption()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "units": int(_unit_daily()[["property_id", "unit_id"]].drop_duplicates().shape[0])}


@app.get("/units")
def list_units() -> list[dict]:
    u = _unit_daily()[["property_id", "unit_id", "source", "city", "zipcode"]].drop_duplicates()
    return u.to_dict(orient="records")


@app.get("/forecast/unit/{pid}/{uid}", response_model=ForecastResponse)
def forecast_unit(
    pid: int,
    uid: int,
    horizon_days: int = Query(30, ge=1, le=90),
    use_live_weather: bool = Query(False),
) -> ForecastResponse:
    tw, qs, _ = _models()
    future_feat, hist = _future_frame(pid, uid, horizon_days, use_live_weather)
    if future_feat.empty:
        raise HTTPException(500, "Could not build future frame")

    p50 = l2_quantile.predict(tw, future_feat)
    q10 = l2_quantile.predict(qs[0.1], future_feat)
    q90 = l2_quantile.predict(qs[0.9], future_feat)

    state = _l3_state()
    adj = state.get(f"{pid}:{uid}", 0.0)
    p50 = np.clip(p50 + adj, 0, None)

    source = str(hist.iloc[-1]["source"])
    price = DEFAULT_PRICE_EUR_PER_KWH.get(source, 0.12)
    emission = float(hist.iloc[-1]["emission_factor_g_per_kwh"]) or DEFAULT_EMISSION_G_PER_KWH.get(source, 250.0)

    series = []
    for i, (d, y, ylo, yhi) in enumerate(zip(future_feat["date"], p50, q10, q90)):
        series.append(ForecastPoint(
            date=pd.to_datetime(d).date().isoformat(),
            point_kwh=float(y),
            q10_kwh=float(ylo),
            q90_kwh=float(yhi),
            cost_eur=float(y) * price,
            co2_g=float(y) * emission,
        ))

    total_kwh = float(p50.sum())
    return ForecastResponse(
        property_id=pid,
        unit_id=uid,
        source=source,
        horizon_days=horizon_days,
        total_point_kwh=total_kwh,
        total_point_cost_eur=total_kwh * price,
        total_co2_kg=total_kwh * emission / 1000.0,
        drivers={
            "weather_adjusted": bool(use_live_weather),
            "l3_residual_applied": float(adj),
        },
        series=series,
    )


@app.get("/drilldown/unit/{pid}/{uid}")
def drilldown_unit(
    pid: int,
    uid: int,
    horizon_days: int = Query(30, ge=1, le=90),
) -> list[RoomBreakdown]:
    fr = forecast_unit(pid, uid, horizon_days=horizon_days, use_live_weather=False)
    shares = _room_shares()
    mine = shares[(shares["property_id"] == pid) & (shares["unit_id"] == uid)]
    if mine.empty:
        raise HTTPException(404, f"No room shares for ({pid},{uid})")
    out = []
    for _, row in mine.iterrows():
        out.append(RoomBreakdown(
            room_id=int(row["room_id"]),
            share=float(row["share"]),
            total_point_kwh=float(row["share"] * fr.total_point_kwh),
        ))
    return out


@app.post("/whatif/unit/{pid}/{uid}", response_model=WhatIfResponse)
def whatif(pid: int, uid: int, req: WhatIfRequest) -> WhatIfResponse:
    future_feat, hist = _future_frame(pid, uid, req.horizon_days, req.use_live_weather)
    if future_feat.empty:
        raise HTTPException(500, "Could not build future frame")

    tw, _, _ = _models()
    baseline = float(l2_quantile.predict(tw, future_feat).sum())

    sens = _room_sens()
    future_outside = future_feat["outside_temp"].values
    delta = counterfactual_delta_kwh(
        sens,
        property_id=pid,
        unit_id=uid,
        room_id=req.room_id,
        temp_delta_c=req.temp_delta_c,
        future_outside_temp=future_outside,
    )
    counter = baseline + delta

    source = str(hist.iloc[-1]["source"])
    price = DEFAULT_PRICE_EUR_PER_KWH.get(source, 0.12)
    emission = float(hist.iloc[-1]["emission_factor_g_per_kwh"]) or DEFAULT_EMISSION_G_PER_KWH.get(source, 250.0)
    return WhatIfResponse(
        baseline_kwh=baseline,
        counterfactual_kwh=counter,
        delta_kwh=delta,
        delta_cost_eur=delta * price,
        delta_co2_kg=delta * emission / 1000.0,
    )


@app.get("/peers/{pid}/{uid}", response_model=PeersResponse)
def peers(pid: int, uid: int) -> PeersResponse:
    unit = _unit_daily()
    me = unit[(unit["property_id"] == pid) & (unit["unit_id"] == uid)]
    if me.empty:
        raise HTTPException(404, f"Unit ({pid},{uid}) not found")

    my_m2 = float(me["livingspace"].median())
    my_source = str(me["source"].iloc[0])
    my_city = str(me["city"].iloc[0])

    lo, hi = 0.8 * my_m2, 1.2 * my_m2
    cohort = unit[
        (unit["livingspace"].between(lo, hi))
        & (unit["source"].astype(str) == my_source)
        & (unit["city"].astype(str) == my_city)
        & ~((unit["property_id"] == pid) & (unit["unit_id"] == uid))
    ]
    cohort_keys = cohort[["property_id", "unit_id"]].drop_duplicates()

    unit_mean = float(me["kwh"].mean())
    cohort_means = cohort.groupby(["property_id", "unit_id"], observed=True)["kwh"].mean()
    if cohort_means.empty:
        return PeersResponse(
            property_id=pid, unit_id=uid,
            cohort_size=0,
            cohort_definition={"m2_range": [lo, hi], "source": my_source, "city": my_city},
            percentile_rank_better_than=float("nan"),
            unit_avg_daily_kwh=unit_mean,
            cohort_avg_daily_kwh=float("nan"),
        )
    pct_better = float((cohort_means > unit_mean).mean() * 100)
    return PeersResponse(
        property_id=pid,
        unit_id=uid,
        cohort_size=int(len(cohort_keys)),
        cohort_definition={
            "m2_range": [round(lo, 1), round(hi, 1)],
            "source": my_source,
            "city": my_city,
        },
        percentile_rank_better_than=pct_better,
        unit_avg_daily_kwh=unit_mean,
        cohort_avg_daily_kwh=float(cohort_means.mean()),
    )


@app.get("/drift")
def drift(
    property_id: Optional[int] = None,
    unit_id: Optional[int] = None,
) -> list[dict]:
    tw, _, _ = _models()
    feat = _features().copy()
    feat["l2_pred"] = l2_quantile.predict(tw, feat)
    if property_id is not None:
        feat = feat[feat["property_id"] == property_id]
    if unit_id is not None:
        feat = feat[feat["unit_id"] == unit_id]
    events = detect_drift(feat, baseline_days=120, recent_days=30)
    return [e.__dict__ for e in events]
