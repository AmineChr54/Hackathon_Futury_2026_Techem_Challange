"""Forecast evaluation metrics at multiple horizons."""
from __future__ import annotations

import numpy as np
import pandas as pd


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))


def mape(y_true: np.ndarray, y_pred: np.ndarray, eps: float = 1e-3) -> float:
    """Mean absolute percentage error with a floor to stabilise near zero."""
    denom = np.clip(np.abs(y_true), eps, None)
    return float(np.mean(np.abs(y_true - y_pred) / denom))


def pinball(y_true: np.ndarray, y_pred: np.ndarray, q: float) -> float:
    diff = y_true - y_pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def crps_from_quantiles(
    y_true: np.ndarray, q10: np.ndarray, q50: np.ndarray, q90: np.ndarray
) -> float:
    """Cheap CRPS approximation from three quantiles via pinball average."""
    return (pinball(y_true, q10, 0.1) + pinball(y_true, q50, 0.5) + pinball(y_true, q90, 0.9)) / 3


def coverage(y_true: np.ndarray, q_low: np.ndarray, q_high: np.ndarray) -> float:
    return float(np.mean((y_true >= q_low) & (y_true <= q_high)))


def horizon_report(
    df_val: pd.DataFrame,
    y_col: str = "kwh",
    pred_col: str = "pred",
    horizons_days: tuple[int, ...] = (1, 7, 14, 30),
) -> pd.DataFrame:
    """Collapse per-row predictions into a horizon-aggregated report.

    Assumes `df_val` has a `horizon_days` column (distance from the cut
    to the validation date). Returns a frame indexed by horizon.
    """
    out = []
    for h in horizons_days:
        sub = df_val[df_val["horizon_days"] <= h]
        if sub.empty:
            continue
        out.append({
            "horizon_days": h,
            "n": int(len(sub)),
            "mae": mae(sub[y_col].values, sub[pred_col].values),
            "mape": mape(sub[y_col].values, sub[pred_col].values),
        })
    return pd.DataFrame(out)
