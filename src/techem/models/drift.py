"""Residual drift detector.

Monthly Kolmogorov-Smirnov test: is the last 30-day distribution of
residuals meaningfully different from the prior 180-day baseline?
If p < threshold, flag a structural break for this unit.

Tenant-facing use: prompt the "did something change?" dialog in the UI
(new appliance, more people living here, renovation). The tenant's
answer is a free label for re-training.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats

from techem.config import DRIFT_BASELINE_DAYS, DRIFT_P_THRESHOLD


@dataclass
class DriftEvent:
    property_id: int
    unit_id: int
    date: str
    p_value: float
    ks_stat: float
    n_recent: int
    n_baseline: int


def detect_drift(
    unit_hist: pd.DataFrame,
    y_col: str = "kwh",
    pred_col: str = "l2_pred",
    baseline_days: int = DRIFT_BASELINE_DAYS,
    recent_days: int = 30,
    p_threshold: float = DRIFT_P_THRESHOLD,
) -> list[DriftEvent]:
    events: list[DriftEvent] = []
    unit_hist = unit_hist.sort_values(["property_id", "unit_id", "date"], kind="stable").copy()
    unit_hist["resid"] = unit_hist[y_col].astype("float32") - unit_hist[pred_col].astype("float32")

    for (pid, uid), sub in unit_hist.groupby(["property_id", "unit_id"], observed=True):
        if len(sub) < baseline_days + recent_days:
            continue
        sub = sub.sort_values("date")
        cutoff = sub["date"].iloc[-recent_days]
        baseline_start = sub["date"].iloc[-(baseline_days + recent_days)]
        recent = sub[sub["date"] >= cutoff]["resid"].dropna().values
        baseline = sub[(sub["date"] >= baseline_start) & (sub["date"] < cutoff)]["resid"].dropna().values
        if len(recent) < 10 or len(baseline) < 60:
            continue
        ks = stats.ks_2samp(recent, baseline, alternative="two-sided")
        if ks.pvalue < p_threshold:
            events.append(
                DriftEvent(
                    property_id=int(pid),
                    unit_id=int(uid),
                    date=str(sub["date"].iloc[-1].date() if hasattr(sub["date"].iloc[-1], "date") else sub["date"].iloc[-1]),
                    p_value=float(ks.pvalue),
                    ks_stat=float(ks.statistic),
                    n_recent=int(len(recent)),
                    n_baseline=int(len(baseline)),
                )
            )
    return events
