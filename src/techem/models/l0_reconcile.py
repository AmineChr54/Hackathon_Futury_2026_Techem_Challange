"""L0 — hierarchical reconciliation.

We forecast at the unit level (where billing happens). Room-level
drill-down is derived by disaggregating the unit forecast using the
historical share each room has of the unit's total.

This implements proportions reconciliation (bottom-up shares). MinT from
Nixtla's `hierarchicalforecast` is a strictly better reconciler but
requires aligned, per-node forecasts we don't all have — we use a
MinT-compatible interface so swapping in the full library is one line.

Invariant (enforced in tests):
    forecast_room_i ≥ 0  and  Σ_i forecast_room_i == forecast_unit
"""
from __future__ import annotations

import pandas as pd


def room_shares(consumption: pd.DataFrame, lookback_days: int = 180) -> pd.DataFrame:
    """Each room's share of its unit's total usage over the lookback window."""
    df = consumption.copy()
    df["date"] = pd.to_datetime(df["date"])
    max_date = df["date"].max()
    cutoff = max_date - pd.Timedelta(days=lookback_days)
    recent = df[df["date"] >= cutoff]

    unit_totals = recent.groupby(["property_id", "unit_id"], observed=True)["kwh"].sum()
    room_totals = recent.groupby(["property_id", "unit_id", "room_id"], observed=True)["kwh"].sum()

    shares = room_totals.reset_index()
    shares = shares.merge(
        unit_totals.rename("unit_total").reset_index(),
        on=["property_id", "unit_id"],
    )
    shares["share"] = (shares["kwh"] / shares["unit_total"]).fillna(0.0)

    # Rooms with total 0 get an equal share of 0 (the forecast will
    # attribute nothing to them, which is correct — they're unused).
    n_rooms = shares.groupby(["property_id", "unit_id"], observed=True)["room_id"].transform("count")
    # Edge: a unit where every room was zero over the lookback → equal split.
    zero_units = shares.groupby(["property_id", "unit_id"], observed=True)["unit_total"].transform("sum") == 0
    shares.loc[zero_units, "share"] = 1.0 / n_rooms[zero_units]

    return shares[["property_id", "unit_id", "room_id", "share"]]


def disaggregate(
    unit_forecast: pd.DataFrame,
    shares: pd.DataFrame,
) -> pd.DataFrame:
    """
    unit_forecast columns: property_id, unit_id, date, kwh_pred (and
        optionally q10, q50, q90).
    shares columns: property_id, unit_id, room_id, share.
    Returns a room-level frame with the same prediction columns.
    """
    merged = unit_forecast.merge(shares, on=["property_id", "unit_id"])
    pred_cols = [c for c in unit_forecast.columns if c.startswith("kwh_") or c.startswith("q")]
    for c in pred_cols:
        merged[c] = merged[c] * merged["share"]
    drop = ["share"]
    return merged.drop(columns=drop)


def check_reconciliation_invariant(
    room_level: pd.DataFrame,
    unit_level: pd.DataFrame,
    pred_col: str = "kwh_pred",
    atol: float = 1e-4,
) -> bool:
    """Return True iff Σ_rooms pred == unit pred for every (unit, date)."""
    room_sum = room_level.groupby(["property_id", "unit_id", "date"], observed=True)[pred_col].sum().reset_index()
    merged = unit_level.merge(room_sum, on=["property_id", "unit_id", "date"], suffixes=("_unit", "_rooms"))
    diff = (merged[f"{pred_col}_unit"] - merged[f"{pred_col}_rooms"]).abs()
    return bool((diff <= atol).all())
