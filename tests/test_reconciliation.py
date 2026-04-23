"""Hierarchical reconciliation invariant.

If the per-room forecasts don't sum to the unit forecast, the drill-down
UI lies to the tenant. The test uses synthetic predictions and historical
consumption to exercise the `disaggregate` + `check_reconciliation_invariant`
pipeline end-to-end.
"""
from __future__ import annotations

import pandas as pd
import pytest

from techem.models.l0_reconcile import (
    check_reconciliation_invariant,
    disaggregate,
    room_shares,
)


def _sample_consumption():
    rows = []
    for d in pd.date_range("2020-01-01", periods=180, freq="D"):
        # Unit (1,1) has 3 rooms with different intensities.
        for rid, weight in [(1, 0.5), (2, 0.3), (3, 0.2)]:
            rows.append({
                "property_id": 1,
                "unit_id": 1,
                "room_id": rid,
                "date": d,
                "kwh": 10.0 * weight + (d.dayofyear % 7) * 0.1 * weight,
            })
    return pd.DataFrame(rows)


def test_shares_sum_to_one():
    df = _sample_consumption()
    sh = room_shares(df)
    sums = sh.groupby(["property_id", "unit_id"])["share"].sum()
    assert (sums.round(6) == 1.0).all()


def test_disaggregation_preserves_unit_totals():
    df = _sample_consumption()
    sh = room_shares(df)

    unit_forecast = pd.DataFrame({
        "property_id": [1, 1, 1],
        "unit_id": [1, 1, 1],
        "date": pd.to_datetime(["2021-01-01", "2021-01-02", "2021-01-03"]),
        "kwh_pred": [12.0, 13.5, 9.8],
    })

    room_forecast = disaggregate(unit_forecast, sh)
    assert check_reconciliation_invariant(room_forecast, unit_forecast)


def test_zero_unit_gets_equal_split():
    """When every room has been zero over the lookback, disaggregate equally."""
    rows = []
    for d in pd.date_range("2020-01-01", periods=30, freq="D"):
        for rid in (1, 2, 3, 4):
            rows.append({"property_id": 1, "unit_id": 9, "room_id": rid, "date": d, "kwh": 0.0})
    df = pd.DataFrame(rows)
    sh = room_shares(df)
    assert pytest.approx(sh["share"].unique().tolist(), rel=1e-6) == [0.25]
