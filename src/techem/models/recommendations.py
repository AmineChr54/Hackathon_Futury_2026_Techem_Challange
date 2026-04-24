"""Algorithmic recommendations engine — ranked savings actions.

Uses per-room β_hdd sensitivities to compute the monthly € and kg-CO₂
saving per degree of setpoint reduction for each room, then enriches with
rule-based behavioural actions.

The structured list can be narrated by Gemini (hybrid) or returned raw
when no API key is available.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

from techem.config import DEFAULT_EMISSION_G_PER_KWH, DEFAULT_PRICE_EUR_PER_KWH

log = logging.getLogger(__name__)


@dataclass
class Recommendation:
    action: str
    room_id: int | None
    monthly_eur_saving: float
    monthly_co2_g_saving: float
    confidence: str  # "high", "medium", "low"
    source: str  # "setpoint", "behaviour", "insulation"


def compute_recommendations(
    property_id: int,
    unit_id: int,
    unit_daily: pd.DataFrame,
    consumption: pd.DataFrame,
    room_sens: pd.DataFrame,
    min_eur_saving: float = 2.0,
) -> dict:
    """Return ranked list of savings actions for a tenant.

    Returns a dict with "items" key containing a list of recommendation dicts.
    """
    me = unit_daily[
        (unit_daily["property_id"] == property_id)
        & (unit_daily["unit_id"] == unit_id)
    ]
    if me.empty:
        return {"items": [], "unit_context": {}}

    source = str(me["source"].iloc[0])
    price = DEFAULT_PRICE_EUR_PER_KWH.get(source, 0.12)
    emission = float(me["emission_factor_g_per_kwh"].iloc[0]) or DEFAULT_EMISSION_G_PER_KWH.get(source, 250.0)
    livingspace = float(me["livingspace"].median())
    city = str(me["city"].iloc[0])

    # -- Setpoint-based recommendations (one per room) --
    my_sens = room_sens[
        (room_sens["property_id"] == property_id)
        & (room_sens["unit_id"] == unit_id)
    ].copy()

    items: list[dict] = []

    if not my_sens.empty:
        # Average HDD days per month (rough: ~12 HDD-days/month in German winter).
        avg_hdd_days_per_month = 12.0

        for _, row in my_sens.iterrows():
            beta = float(row["beta_hdd"])
            if beta <= 0:
                continue
            # kWh saved per month for a 1°C setpoint reduction in this room.
            kwh_per_month_per_deg = beta * avg_hdd_days_per_month
            eur_saving = kwh_per_month_per_deg * price
            co2_saving = kwh_per_month_per_deg * emission  # grams

            if eur_saving < min_eur_saving:
                continue

            items.append(asdict(Recommendation(
                action=f"Lower setpoint by 1°C in room {int(row['room_id'])}",
                room_id=int(row["room_id"]),
                monthly_eur_saving=round(eur_saving, 2),
                monthly_co2_g_saving=round(co2_saving, 1),
                confidence="high",
                source="setpoint",
            )))

    # -- Behavioural recommendations --
    me_sorted = me.sort_values("date").copy()
    me_sorted["_dow"] = pd.to_datetime(me_sorted["date"]).dt.weekday

    # Weekend vs weekday usage
    wknd = me_sorted[me_sorted["_dow"] >= 5]["kwh"]
    wkdy = me_sorted[me_sorted["_dow"] < 5]["kwh"]
    if not wknd.empty and not wkdy.empty:
        wknd_mean = float(wknd.mean())
        wkdy_mean = float(wkdy.mean())
        if wknd_mean > wkdy_mean * 1.15:
            diff = wknd_mean - wkdy_mean
            monthly_save = diff * 8  # ~8 weekend days/month
            items.append(asdict(Recommendation(
                action="Reduce weekend heating — your weekends use 15%+ more than weekdays. Consider scheduling lower setpoints.",
                room_id=None,
                monthly_eur_saving=round(monthly_save * price, 2),
                monthly_co2_g_saving=round(monthly_save * emission, 1),
                confidence="medium",
                source="behaviour",
            )))

    # Summer standby detection: if any room has non-zero summer usage.
    room_data = consumption[
        (consumption["property_id"] == property_id)
        & (consumption["unit_id"] == unit_id)
    ].copy()
    if not room_data.empty:
        room_data["_month"] = pd.to_datetime(room_data["date"]).dt.month
        summer = room_data[room_data["_month"].isin([6, 7, 8])]
        if not summer.empty:
            room_summer = summer.groupby("room_id", observed=True)["kwh"].sum()
            standby_rooms = room_summer[room_summer > 5]  # > 5 kWh total in summer
            for rid, total in standby_rooms.items():
                monthly_equiv = float(total) / 3  # 3 summer months
                items.append(asdict(Recommendation(
                    action=f"Room {int(rid)} uses energy even in summer — check for standby heating or leaks.",
                    room_id=int(rid),
                    monthly_eur_saving=round(monthly_equiv * price, 2),
                    monthly_co2_g_saving=round(monthly_equiv * emission, 1),
                    confidence="medium",
                    source="behaviour",
                )))

    # High β_hdd relative to cohort → insulation recommendation.
    if not my_sens.empty and len(room_sens) > 10:
        cohort_beta_median = float(room_sens["beta_hdd"].median())
        cohort_beta_std = float(room_sens["beta_hdd"].std())
        if cohort_beta_std > 0:
            for _, row in my_sens.iterrows():
                z = (float(row["beta_hdd"]) - cohort_beta_median) / cohort_beta_std
                if z > 1.5:
                    items.append(asdict(Recommendation(
                        action=f"Room {int(row['room_id'])} is unusually sensitive to cold — may indicate poor window insulation.",
                        room_id=int(row["room_id"]),
                        monthly_eur_saving=round(float(row["beta_hdd"]) * 5 * price, 2),  # rough
                        monthly_co2_g_saving=round(float(row["beta_hdd"]) * 5 * emission, 1),
                        confidence="low",
                        source="insulation",
                    )))

    # Sort by saving descending.
    items.sort(key=lambda x: x["monthly_eur_saving"], reverse=True)

    unit_context = {
        "livingspace_m2": livingspace,
        "source": source,
        "city": city,
        "price_eur_per_kwh": price,
        "emission_g_per_kwh": emission,
    }

    return {"items": items, "unit_context": unit_context}
