"""Blocked time-series cross-validation.

The critical correctness property: never train on any date that occurs
after a validation date for the *same unit*. Shuffled CV across units
silently leaks weather and behavioural information from the future.

`blocked_time_splits` yields (train_idx, val_idx) positional indices on a
sorted frame. Upstream sorting is the caller's responsibility; we assert
it for safety.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import numpy as np
import pandas as pd


@dataclass
class SplitSpec:
    min_train_days: int = 180
    step_days: int = 30
    horizon_days: int = 30
    n_splits: int | None = None


def _assert_sorted(df: pd.DataFrame) -> None:
    ok = df[["property_id", "unit_id", "date"]].apply(
        lambda col: col.is_monotonic_increasing
    )
    # Group-wise check: sorted within each unit.
    prev = None
    for (pid, uid), grp in df.groupby(["property_id", "unit_id"], observed=True):
        if not grp["date"].is_monotonic_increasing:
            raise ValueError(f"Frame not sorted by date within unit ({pid},{uid})")
        prev = (pid, uid)


def blocked_time_splits(
    df: pd.DataFrame,
    spec: SplitSpec = SplitSpec(),
    date_col: str = "date",
) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    """Expanding-window splits keyed on a global timeline.

    Train on everything up to day T; validate on (T, T + horizon].
    T advances in steps of `step_days`. All units share the same T so
    that when you evaluate horizon-30 metrics, you're comparing apples
    to apples across units.
    """
    _assert_sorted(df)
    dates = pd.to_datetime(df[date_col]).reset_index(drop=True)
    t_min = dates.min()
    t_max = dates.max()
    cut = t_min + pd.Timedelta(days=spec.min_train_days)
    step = pd.Timedelta(days=spec.step_days)
    horizon = pd.Timedelta(days=spec.horizon_days)

    splits = []
    while cut + horizon <= t_max:
        train = np.where(dates <= cut)[0]
        val = np.where((dates > cut) & (dates <= cut + horizon))[0]
        if len(train) and len(val):
            splits.append((train, val))
        cut = cut + step

    if spec.n_splits is not None:
        splits = splits[-spec.n_splits:]

    for tr, va in splits:
        yield tr, va
