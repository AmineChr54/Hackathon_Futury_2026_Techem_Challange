"""L0 — hierarchical reconciliation.

We forecast at the unit level (where billing happens). Room-level
drill-down is derived by disaggregating the unit forecast using the
historical share each room has of the unit's total.

`reconcile(method=...)` is the dispatch entrypoint. Two methods:

  * ``"proportions"`` (default): bottom-up shares applied to the unit
    forecast. Closed-form, cheap, and preserves the invariant that
    Σ_rooms == unit by construction.
  * ``"mint"``: MinT reconciliation via Nixtla's ``hierarchicalforecast``.
    MinT is strictly better when independent, same-target forecasts exist
    at multiple levels of the hierarchy (room *and* unit). We only
    produce unit-level forecasts today, so MinT has nothing to
    cross-reconcile — calling it raises NotImplementedError rather than
    pretending. The hook is in place for a future per-room L2.

Invariant (enforced in tests):
    forecast_room_i ≥ 0  and  Σ_i forecast_room_i == forecast_unit
"""
from __future__ import annotations

import pandas as pd

from techem.config import RECONCILE_METHOD


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


def reconcile(
    unit_forecast: pd.DataFrame,
    shares: pd.DataFrame,
    room_forecast: pd.DataFrame | None = None,
    method: str | None = None,
) -> pd.DataFrame:
    """Dispatch to the configured reconciliation method.

    Parameters
    ----------
    unit_forecast : unit-level predictions (the only forecast we produce
        today).
    shares : per-room share of unit total (from ``room_shares``).
    room_forecast : independent room-level predictions, required only
        when ``method='mint'``. Leave ``None`` for proportions.
    method : override the config default (``RECONCILE_METHOD``).
    """
    m = (method or RECONCILE_METHOD).lower()
    if m == "proportions":
        return disaggregate(unit_forecast, shares)
    if m == "mint":
        if room_forecast is None:
            raise NotImplementedError(
                "MinT needs independent per-room forecasts. Build a per-room "
                "L2 first, then pass them in as `room_forecast`."
            )
        # Placeholder for the eventual swap:
        #     from hierarchicalforecast.methods import MinTrace
        #     from hierarchicalforecast.core import HierarchicalReconciliation
        #     ...
        raise NotImplementedError("MinT wiring is stubbed; see docstring.")
    raise ValueError(f"Unknown reconciliation method: {method}")


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
