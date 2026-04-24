"""FastAPI endpoints for the prediction engine.

Endpoints:
    GET  /health                      liveness
    GET  /units                       list known units
    GET  /forecast/unit/{pid}/{uid}   point + q10/q90, per-day
    GET  /drilldown/unit/{pid}/{uid}  forecast disaggregated by room
    POST /whatif/unit/{pid}/{uid}     counterfactual via room β
    GET  /peers/{pid}/{uid}           cohort definition + percentile (enhanced)
    GET  /drift                       recent structural-break events
    POST /chat/{pid}/{uid}            conversational tenant assistant (Gemini + tools)
    GET  /recommendations/{pid}/{uid} ranked savings actions
    POST /target/{pid}/{uid}          target-driven plan
    GET  /today/{pid}/{uid}           consumption so far today
    GET  /leaks/{pid}/{uid}           four-signal anomaly detector

The service loads all artifacts at startup. Forecasts use historical
weather by default; the `use_live_weather=true` query param routes
through Meteostat (resilient — falls back to mock).
"""
from __future__ import annotations

from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from techem.config import (
    CONSUMPTION_PARQUET,
    DEFAULT_EMISSION_G_PER_KWH,
    DEFAULT_PRICE_EUR_PER_KWH,
    MODELS_DIR,
    ROOM_SENSITIVITIES,
    SIM_TODAY,
    UNIT_DAILY_PARQUET,
)
from techem.data.external import ensure_mock_geocode, ensure_mock_weather, weather_forecast
from techem.features.engineering import build_feature_frame
from techem.models import l0_reconcile, l1_baseline, l2_quantile, l3_online
from techem.models.drift import detect_drift
from techem.models.whatif import counterfactual_delta_kwh


app = FastAPI(title="Techem Forecast Engine", version="0.2.0")

# CORS for the Vite/React frontend (dev origins). Wildcard is intentional for hackathon use.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@lru_cache(maxsize=1)
def _conformal() -> dict | None:
    return l2_quantile.load_conformal()


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


class HistoryPoint(BaseModel):
    date: str
    kwh: float
    cost_eur: float
    co2_g: float


class HistoryResponse(BaseModel):
    property_id: int
    unit_id: int
    source: str
    days: int
    total_kwh: float
    total_cost_eur: float
    total_co2_kg: float
    series: list[HistoryPoint]


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
    # Enhanced fields
    badge: str = ""
    vs_median_pct: float = float("nan")
    monthly_eur_vs_peers: float = float("nan")
    monthly_co2_g_vs_peers: float = float("nan")
    trend_30d_percentile_delta: float = float("nan")
    equivalents: dict = Field(default_factory=dict)
    aspirational_target_kwh_per_m2: float = float("nan")
    aspirational_saving_eur: float = float("nan")


# -- New schemas --

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    tools_called: list[str] = Field(default_factory=list)


class TargetRequest(BaseModel):
    target_value: float = Field(..., description="Monthly target: EUR or kg CO₂.")
    target_unit: str = Field(..., description="'EUR' or 'KG_CO2'.")
    horizon_days: int = 30
    mode: str = Field("Balanced", description="Tenant's lifestyle mode")


class TargetResponse(BaseModel):
    feasible: bool
    projected: float
    target: float
    gap: float
    plan_narrative: str
    actions: list[dict] = Field(default_factory=list)


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
    stitched["kwh"] = stitched["kwh"].ffill()
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


@app.get("/weather/forecast")
def weather_forecast_endpoint(
    zipcode: str = Query("10115"),
    days: int = Query(8, ge=1, le=14),
) -> list[dict]:
    """8-day weather forecast for the tenant home widget."""
    import math
    from datetime import datetime as dt

    WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    try:
        wx = weather_forecast(zipcode, horizon_days=days + 2)
    except Exception:
        # Return synthetic fallback so the widget still renders.
        today = SIM_TODAY
        return [
            {
                "date": (today + timedelta(days=i)).isoformat(),
                "day": WEEKDAYS[(today + timedelta(days=i)).weekday()],
                "high": round(18 - 0.3 * i, 0),
                "low": round(5 + 0.2 * i, 0),
                "condition": "partly_cloudy" if i % 3 else "sunny",
            }
            for i in range(days)
        ]

    out: list[dict] = []
    for _, row in wx.head(days).iterrows():
        d = pd.to_datetime(row["date"])
        tavg = float(row["tavg"]) if pd.notna(row["tavg"]) else 10.0
        # Derive approximate high/low from daily average.
        high = round(tavg + 4.0, 0)
        low = round(tavg - 4.0, 0)

        # Classify into simple conditions based on temperature.
        if tavg >= 22:
            cond = "sunny"
        elif tavg >= 15:
            cond = "partly_cloudy"
        elif tavg >= 8:
            cond = "cloudy"
        elif tavg >= 2:
            cond = "rainy"
        else:
            cond = "snowy"

        out.append({
            "date": d.date().isoformat(),
            "day": WEEKDAYS[d.weekday()],
            "high": int(high),
            "low": int(low),
            "condition": cond,
        })

    return out


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

    # Split-conformal widening of the prediction band (no-op if artifact missing).
    horizon_per_row = np.arange(1, len(future_feat) + 1, dtype="int32")
    q10, q90 = l2_quantile.apply_conformal(q10, q90, horizon_per_row, _conformal())

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


@app.get("/history/unit/{pid}/{uid}", response_model=HistoryResponse)
def history_unit(
    pid: int,
    uid: int,
    days: int = Query(365, ge=1, le=1825),
) -> HistoryResponse:
    """Past `days` of actual daily consumption with cost/CO₂ attached."""
    rows = _unit_row(pid, uid).sort_values("date").copy()
    rows = rows.tail(days)
    source = str(rows.iloc[-1]["source"])
    price = DEFAULT_PRICE_EUR_PER_KWH.get(source, 0.12)
    emission = float(rows.iloc[-1]["emission_factor_g_per_kwh"]) or DEFAULT_EMISSION_G_PER_KWH.get(source, 250.0)

    series = []
    for _, r in rows.iterrows():
        kwh = float(r["kwh"]) if pd.notna(r["kwh"]) else 0.0
        series.append(HistoryPoint(
            date=pd.to_datetime(r["date"]).date().isoformat(),
            kwh=kwh,
            cost_eur=kwh * price,
            co2_g=kwh * emission,
        ))
    total_kwh = float(sum(p.kwh for p in series))
    return HistoryResponse(
        property_id=pid,
        unit_id=uid,
        source=source,
        days=len(series),
        total_kwh=total_kwh,
        total_cost_eur=total_kwh * price,
        total_co2_kg=total_kwh * emission / 1000.0,
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
    from techem.models.peers_extended import compute_extended_peers

    try:
        ext = compute_extended_peers(pid, uid, _unit_daily())
    except ValueError as e:
        raise HTTPException(404, str(e))

    return PeersResponse(
        property_id=pid,
        unit_id=uid,
        **ext,
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


# ========== NEW TENANT-FACING ENDPOINTS ==========


@app.get("/today/{pid}/{uid}")
def today(pid: int, uid: int) -> dict:
    """Today's consumption so far, cost, and CO₂ — synthesised from diurnal curve."""
    from techem.models.today import compute_today
    try:
        return compute_today(pid, uid, _unit_daily())
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/recommendations/{pid}/{uid}")
def recommendations(
    pid: int,
    uid: int,
    horizon_days: int = Query(30, ge=1, le=90),
) -> dict:
    """Ranked savings actions — algo core + optional LLM narration."""
    from techem.models.recommendations import compute_recommendations
    from techem.llm.gemini import generate_text, is_available
    from techem.llm.prompts import RECOMMENDATIONS_SYSTEM_PROMPT

    raw = compute_recommendations(pid, uid, _unit_daily(), _consumption(), _room_sens())

    if not raw["items"]:
        return {"items": [], "narrative": None, "unit_context": raw.get("unit_context", {})}

    # Try LLM narration.
    narrative = None
    if is_available():
        import json
        try:
            prompt = (
                f"Unit context: {json.dumps(raw['unit_context'])}\n\n"
                f"Machine-generated actions:\n{json.dumps(raw['items'], indent=2)}\n\n"
                "Rewrite these as 3–5 tenant-friendly bullets."
            )
            narrative = generate_text(RECOMMENDATIONS_SYSTEM_PROMPT, prompt)
        except Exception:
            pass  # Graceful degradation.

    return {
        "items": raw["items"],
        "narrative": narrative,
        "unit_context": raw.get("unit_context", {}),
    }


@app.get("/leaks/{pid}/{uid}")
def leaks(pid: int, uid: int) -> dict:
    """Four-signal anomaly detector with optional LLM explanation."""
    from techem.models.leaks import detect_all
    from techem.llm.gemini import generate_text, is_available
    from techem.llm.prompts import LEAKS_SYSTEM_PROMPT

    report = detect_all(pid, uid, _unit_daily(), _consumption(), _room_sens())

    narrative = None
    if report["signals"] and is_available():
        import json
        try:
            prompt = (
                f"Anomaly signals detected:\n{json.dumps(report['signals'], indent=2)}\n\n"
                f"Summary: {json.dumps(report['summary'])}\n\n"
                "Explain to the tenant what these signals mean and what to do."
            )
            narrative = generate_text(LEAKS_SYSTEM_PROMPT, prompt)
        except Exception:
            pass

    return {
        "raw_signals": report["signals"],
        "summary": report["summary"],
        "narrative": narrative,
    }


@app.post("/chat/{pid}/{uid}", response_model=ChatResponse)
def chat(pid: int, uid: int, req: ChatRequest) -> ChatResponse:
    """Conversational tenant assistant — Gemini with tool calls."""
    from techem.llm.gemini import chat_with_tools, is_available
    from techem.llm.tools import build_bound_tools, TOOL_DECLARATIONS
    from techem.llm.prompts import CHAT_SYSTEM_PROMPT

    if not is_available():
        raise HTTPException(503, "Chat requires a Gemini API key (GEMINI_API_KEY env var)")

    tools = build_bound_tools(pid, uid)
    reply = chat_with_tools(
        system_prompt=CHAT_SYSTEM_PROMPT,
        user_message=req.message,
        bound_tools=tools,
        tool_declarations=TOOL_DECLARATIONS,
        history=req.history or None,
    )

    return ChatResponse(
        reply=reply or "I'm sorry, I couldn't generate a response. Please try again.",
        tools_called=list(tools.keys()),  # potential tools; actual calls logged server-side
    )


@app.post("/target/{pid}/{uid}", response_model=TargetResponse)
def target(pid: int, uid: int, req: TargetRequest) -> TargetResponse:
    """Target-driven plan: tenant sets a monthly € or CO₂ target, LLM builds a plan."""
    from techem.llm.gemini import chat_with_tools, is_available
    from techem.llm.tools import build_bound_tools, TOOL_DECLARATIONS
    from techem.llm.prompts import TARGET_SYSTEM_PROMPT

    # Get baseline projection.
    fr = forecast_unit(pid, uid, horizon_days=req.horizon_days, use_live_weather=False)

    if req.target_unit.upper() == "EUR":
        projected = fr.total_point_cost_eur
    elif req.target_unit.upper() == "KG_CO2":
        projected = fr.total_co2_kg
    else:
        raise HTTPException(400, "target_unit must be 'EUR' or 'KG_CO2'")

    gap = projected - req.target_value
    feasible_guess = gap <= projected * 0.3  # heuristic: <30% cut is usually feasible

    if not is_available():
        # Fallback: return structured data without LLM narrative.
        return TargetResponse(
            feasible=feasible_guess,
            projected=round(projected, 2),
            target=req.target_value,
            gap=round(gap, 2),
            plan_narrative="AI assistant is unavailable. See the projected value and gap above to assess feasibility.",
            actions=[],
        )

    # Build LLM prompt with context.
    tools = build_bound_tools(pid, uid)
    user_msg = (
        f"The tenant's projected monthly {'cost is €' if req.target_unit.upper() == 'EUR' else 'CO₂ is '}"
        f"{projected:.2f}{' EUR' if req.target_unit.upper() == 'EUR' else ' kg CO₂'} "
        f"over the next {req.horizon_days} days.\n"
        f"Their target is {req.target_value} {req.target_unit}.\n"
        f"Gap to close: {gap:.2f}.\n"
        f"The tenant selected '{req.mode}' lifestyle mode.\n\n"
        "Use the available tools (what_if, get_recommendations, get_peers) to build a concrete "
        "action plan. Tailor the tone and aggressiveness of the recommendations to their chosen lifestyle mode. "
        "For each action, state the expected saving. Assess whether the target "
        "is realistic. If not, suggest the closest achievable number."
    )

    plan_text = chat_with_tools(
        system_prompt=TARGET_SYSTEM_PROMPT,
        user_message=user_msg,
        bound_tools=tools,
        tool_declarations=TOOL_DECLARATIONS,
    )

    return TargetResponse(
        feasible=feasible_guess,
        projected=round(projected, 2),
        target=req.target_value,
        gap=round(gap, 2),
        plan_narrative=plan_text or "Could not generate a plan.",
        actions=[],
    )


# ========== NEW LANDLORD-FACING ENDPOINTS ==========


@app.get("/landlord/property/{pid}/usage")
def landlord_usage(pid: int) -> dict:
    """Dashboard metrics: total usage, cost, CO₂, and Energy Score."""
    from techem.models.landlord import compute_property_usage
    try:
        return compute_property_usage(pid, _unit_daily())
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/landlord/property/{pid}/insights")
def landlord_insights(pid: int) -> dict:
    """AI Coacher: Identifies severe heat-loss rooms and generates modernization advice."""
    from techem.models.landlord import compute_property_insights
    from techem.llm.gemini import generate_text, is_available
    from techem.llm.prompts import LANDLORD_INSIGHTS_PROMPT

    raw = compute_property_insights(pid, _room_sens())

    narrative = None
    if raw["flagged_rooms"] and is_available():
        import json
        try:
            prompt = (
                f"Property {pid} analysis.\n"
                f"Flagged Rooms:\n{json.dumps(raw['flagged_rooms'], indent=2)}\n\n"
                "Please provide real-estate coaching insights as per your instructions."
            )
            narrative = generate_text(LANDLORD_INSIGHTS_PROMPT, prompt)
        except Exception:
            pass

    return {
        "property_id": pid,
        "flagged_rooms": raw["flagged_rooms"],
        "narrative": narrative,
        "summary": raw["summary"],
    }


@app.get("/landlord/property/{pid}/roi")
def landlord_roi(pid: int) -> dict:
    """Financial & Eco-friendly incentives: carbon tax savings and property value increases."""
    from techem.models.landlord import compute_property_usage, compute_property_roi
    try:
        usage = compute_property_usage(pid, _unit_daily())
        return compute_property_roi(pid, usage)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/landlord/property/{pid}/esg_report")
def landlord_esg_report(pid: int) -> dict:
    """Generates an ESG report with metrics and an AI-authored executive summary."""
    from techem.models.landlord import compute_property_usage, compute_esg_report
    from techem.llm.gemini import generate_text, is_available
    from techem.llm.prompts import LANDLORD_ESG_PROMPT

    try:
        usage = compute_property_usage(pid, _unit_daily())
    except ValueError as e:
        raise HTTPException(404, str(e))

    report = compute_esg_report(pid, usage)

    narrative = None
    if is_available():
        import json
        try:
            prompt = (
                f"Property {pid} ESG Metrics:\n"
                f"{json.dumps(report, indent=2)}\n\n"
                "Write the executive ESG summary."
            )
            narrative = generate_text(LANDLORD_ESG_PROMPT, prompt)
        except Exception:
            pass

    return {
        "property_id": pid,
        "metrics": report,
        "narrative": narrative,
    }
