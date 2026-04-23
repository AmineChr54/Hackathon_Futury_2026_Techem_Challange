"""L3 — per-unit online residual learner.

After L2 scores a unit, the remaining error is mostly tenant habit — WFH
vs office, a January vacation, a new baby, an unused guest room. A
one-parameter EWMA of the residuals captures this without retraining.

    y_hat_L3(t) = y_hat_L2(t) + EWMA[y(s) - y_hat_L2(s), s < t]

Scope: deliberately tiny. State = one float per unit. Trivial to persist,
trivial to reset when the drift detector flags a structural break.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from techem.config import EWMA_SPAN_DAYS, MODELS_DIR

STATE_PATH = MODELS_DIR / "l3_state.json"


def compute_state(
    unit_hist: pd.DataFrame,
    y_col: str = "kwh",
    pred_col: str = "l2_pred",
    span: int = EWMA_SPAN_DAYS,
) -> dict[str, float]:
    """Return {'<property_id>:<unit_id>': latest_ewma_residual}."""
    out: dict[str, float] = {}
    unit_hist = unit_hist.sort_values(["property_id", "unit_id", "date"], kind="stable")
    for (pid, uid), sub in unit_hist.groupby(["property_id", "unit_id"], observed=True):
        resid = (sub[y_col].astype("float32") - sub[pred_col].astype("float32"))
        ewma = resid.ewm(span=span, adjust=False).mean()
        out[f"{int(pid)}:{int(uid)}"] = float(ewma.iloc[-1]) if len(ewma) else 0.0
    return out


def apply_state(state: dict[str, float], property_id: int, unit_id: int, y_hat: float) -> float:
    key = f"{int(property_id)}:{int(unit_id)}"
    return float(y_hat + state.get(key, 0.0))


def save_state(state: dict[str, float], path: Path = STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state), encoding="utf-8")


def load_state(path: Path = STATE_PATH) -> dict[str, float]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
