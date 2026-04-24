"""Today's consumption — synthesised intra-day view.

Since data is daily-granularity only, we approximate "consumption so far
today" by scaling the full-day actual/forecast using a German residential
heating diurnal curve (peaks at 07:00 and 19:00).

    today = max(date) in the unit's history (last date with actuals).
    fraction_so_far = cumulative diurnal curve up to the current wall-clock hour.
    kwh_so_far = today_total_kwh × fraction_so_far
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from techem.config import DEFAULT_EMISSION_G_PER_KWH, DEFAULT_PRICE_EUR_PER_KWH

_CURVE_PATH = Path(__file__).resolve().parent / ".." / "data" / "diurnal_curve.json"


def _load_curve() -> list[float]:
    with open(_CURVE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_today(
    property_id: int,
    unit_id: int,
    unit_daily: pd.DataFrame,
    override_hour: int | None = None,
) -> dict:
    """Build the /today response for a single tenant.

    Parameters
    ----------
    override_hour : int | None
        If set, pretend the wall-clock is at this hour (0–23).
        Useful for deterministic testing.
    """
    me = unit_daily[
        (unit_daily["property_id"] == property_id)
        & (unit_daily["unit_id"] == unit_id)
    ].copy()
    if me.empty:
        raise ValueError(f"Unit ({property_id},{unit_id}) not found")

    me = me.sort_values("date")
    today_row = me.iloc[-1]
    today_date = pd.to_datetime(today_row["date"]).date()
    today_kwh = float(today_row["kwh"])

    # Source-specific price and emission.
    source = str(today_row["source"])
    price = DEFAULT_PRICE_EUR_PER_KWH.get(source, 0.12)
    emission = float(today_row.get("emission_factor_g_per_kwh", 0.0)) or DEFAULT_EMISSION_G_PER_KWH.get(source, 250.0)

    # Diurnal scaling.
    curve = np.array(_load_curve(), dtype="float64")
    hour = override_hour if override_hour is not None else datetime.now().hour
    hour = max(0, min(23, hour))
    fraction = float(curve[: hour + 1].sum() / curve.sum())

    kwh_so_far = today_kwh * fraction
    cost_full = today_kwh * price
    co2_full = today_kwh * emission  # grams

    # -- Comparisons --
    yesterday_kwh = float("nan")
    if len(me) >= 2:
        yesterday_kwh = float(me.iloc[-2]["kwh"])
    vs_yesterday_pct = float("nan")
    if yesterday_kwh > 0:
        vs_yesterday_pct = round((today_kwh / yesterday_kwh - 1.0) * 100, 1)

    # Same weekday average over last 8 weeks.
    dow = pd.to_datetime(today_date).weekday()
    me["_dow"] = pd.to_datetime(me["date"]).dt.weekday
    same_dow = me[(me["_dow"] == dow) & (me.index != me.index[-1])].tail(8)
    vs_weekday_avg_pct = float("nan")
    if not same_dow.empty:
        avg = float(same_dow["kwh"].mean())
        if avg > 0:
            vs_weekday_avg_pct = round((today_kwh / avg - 1.0) * 100, 1)

    return {
        "date": str(today_date),
        "as_of_hour": hour,
        "kwh_so_far": round(kwh_so_far, 2),
        "kwh_full_day": round(today_kwh, 2),
        "cost_eur_so_far": round(kwh_so_far * price, 2),
        "cost_eur_full_day": round(cost_full, 2),
        "co2_g_so_far": round(kwh_so_far * emission, 1),
        "co2_g_full_day": round(co2_full, 1),
        "vs_yesterday_pct": vs_yesterday_pct,
        "vs_same_weekday_avg_pct": vs_weekday_avg_pct,
    }
