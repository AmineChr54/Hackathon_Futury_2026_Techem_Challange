"""Per-room β coefficients — the causal-lite what-if primitive.

Why not just re-score LightGBM with a perturbed input? Because LightGBM
learned correlations, not causal effects. If better-insulated buildings
happen to run cooler, LightGBM will attribute the *insulation* to the
*cool setting*, and tell the tenant a 1°C drop saves more than it will.

We fit, per (unit, room), a simple physical regression:

    kWh_room ≈ α + β · HDD_15 + γ · m²

HDD is exogenous (weather is not caused by the tenant), so β is
causal-by-construction up to the linearity assumption. For the what-if,
a 1°C setpoint drop is approximated as a 1-unit increase in HDD's base:
new HDD_{base-1} = HDD_{base} + 1 on heating days.

We use robust regression (Huber) to stay stable under the zero-inflated,
heavy-tailed distribution.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import HuberRegressor

from techem.config import ROOM_SENSITIVITIES


def _fit_one(room_df: pd.DataFrame) -> dict:
    X = room_df[["hdd_15", "livingspace"]].values
    y = room_df["kwh"].values
    if len(room_df) < 60 or np.std(X[:, 0]) < 0.1:
        return {"alpha": float(np.mean(y)), "beta_hdd": 0.0, "gamma_m2": 0.0, "n": int(len(room_df))}
    try:
        model = HuberRegressor(max_iter=200).fit(X, y)
        return {
            "alpha": float(model.intercept_),
            "beta_hdd": float(model.coef_[0]),
            "gamma_m2": float(model.coef_[1]),
            "n": int(len(room_df)),
        }
    except Exception:
        return {"alpha": float(np.mean(y)), "beta_hdd": 0.0, "gamma_m2": 0.0, "n": int(len(room_df))}


def fit_room_sensitivities(consumption: pd.DataFrame) -> pd.DataFrame:
    """Expects the raw room-level frame plus HDD_15 engineered in."""
    df = consumption.copy()
    if "hdd_15" not in df.columns:
        df["hdd_15"] = (15.0 - df["outside_temp"]).clip(lower=0)
    rows = []
    for (pid, uid, rid), sub in df.groupby(["property_id", "unit_id", "room_id"], observed=True):
        coeffs = _fit_one(sub)
        coeffs.update({"property_id": int(pid), "unit_id": int(uid), "room_id": int(rid)})
        rows.append(coeffs)
    out = pd.DataFrame(rows)
    out.to_parquet(ROOM_SENSITIVITIES, index=False)
    return out


def counterfactual_delta_kwh(
    sensitivities: pd.DataFrame,
    property_id: int,
    unit_id: int,
    room_id: int | None,
    temp_delta_c: float,
    future_outside_temp: np.ndarray,
    base_c: float = 15.0,
) -> float:
    """Estimated kWh change over the horizon for a setpoint change.

    A negative `temp_delta_c` (e.g., -1°C setpoint) means *lower indoor
    setpoint*, which reduces the effective base for HDD. Equivalently,
    HDD decreases by 1 on every heating day.

    Positive result → more kWh; negative → savings.
    """
    mask = (sensitivities["property_id"] == property_id) & (sensitivities["unit_id"] == unit_id)
    if room_id is not None:
        mask &= sensitivities["room_id"] == room_id
    rows = sensitivities[mask]
    if rows.empty:
        return 0.0
    hdd_old = np.clip(base_c - future_outside_temp, 0, None)
    hdd_new = np.clip(base_c + temp_delta_c - future_outside_temp, 0, None)
    delta_hdd = hdd_new - hdd_old
    return float((rows["beta_hdd"].values.reshape(-1, 1) * delta_hdd.reshape(1, -1)).sum())
