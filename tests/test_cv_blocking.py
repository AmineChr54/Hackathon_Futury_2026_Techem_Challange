"""Guard the time-series CV correctness invariant.

The bug we never want: a validation date that is earlier than a training
date for any unit in the same fold. If this passes silently, metrics
over-state performance and the 10-year-contract story is a lie.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from techem.models.cv import SplitSpec, blocked_time_splits


def _synthetic(n_units: int = 5, n_days: int = 400) -> pd.DataFrame:
    dates = pd.date_range("2020-01-01", periods=n_days, freq="D")
    rows = []
    for u in range(n_units):
        for d in dates:
            rows.append({"property_id": 1, "unit_id": u, "date": d, "kwh": float(u + d.dayofyear)})
    return pd.DataFrame(rows).sort_values(["property_id", "unit_id", "date"]).reset_index(drop=True)


def test_train_strictly_before_validation():
    df = _synthetic()
    spec = SplitSpec(min_train_days=60, step_days=30, horizon_days=30)
    any_split = False
    for tr, va in blocked_time_splits(df, spec):
        any_split = True
        tr_max = df.iloc[tr]["date"].max()
        va_min = df.iloc[va]["date"].min()
        assert va_min > tr_max, f"leak: val starts {va_min} but train goes to {tr_max}"
    assert any_split, "expected at least one split on 400 days of synthetic data"


def test_no_unit_shuffle_across_folds():
    df = _synthetic()
    spec = SplitSpec(min_train_days=60, step_days=30, horizon_days=30)
    for tr, va in blocked_time_splits(df, spec):
        units_tr = set(df.iloc[tr][["property_id", "unit_id"]].itertuples(index=False, name=None))
        units_va = set(df.iloc[va][["property_id", "unit_id"]].itertuples(index=False, name=None))
        # Every validation unit must have appeared in training (we're not
        # doing leave-unit-out CV); this is the expected shape for
        # within-unit time-series CV.
        assert units_va <= units_tr


def test_rejects_unsorted_frame():
    df = _synthetic()
    scrambled = df.sample(frac=1, random_state=0).reset_index(drop=True)
    with pytest.raises(ValueError):
        list(blocked_time_splits(scrambled))
