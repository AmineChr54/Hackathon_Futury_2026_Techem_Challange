"""L2 — unit-level forecaster.

Two heads:
    • A Tweedie regressor (point estimate, handles zero-inflation natively).
    • Three quantile regressors (0.1, 0.5, 0.9) giving calibrated bands.

The Tweedie head is the "how much" forecast used everywhere else in the
stack. The quantile heads are the uncertainty envelope shown in the UI.
We train both because their losses disagree on what a good prediction is
for a zero-inflated target — Tweedie minimises pinball's rich cousin,
quantile-0.5 is a pure median. Reporting both prevents over-claiming.

Noise injection on the temperature features during training — scaled by
the prediction horizon — is the critique's "data leakage from weather
forecasts" fix: training sees roughly the noise distribution inference
will see.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from techem.config import EVAL_HORIZONS_DAYS, MODELS_DIR, QUANTILES
from techem.features.engineering import CATEGORICAL_COLUMNS, FEATURE_COLUMNS

CONFORMAL_FILE = "l2_conformal.json"

TEMP_FEATS_FOR_NOISE = ("outside_temp", "temp_roll1", "temp_roll3", "temp_roll7")
TEMP_NOISE_STD_BY_HORIZON = {1: 1.0, 7: 2.5, 14: 3.5, 30: 4.0}


@dataclass
class L2Config:
    n_estimators: int = 600
    learning_rate: float = 0.05
    num_leaves: int = 63
    min_data_in_leaf: int = 40
    feature_fraction: float = 0.9
    bagging_fraction: float = 0.9
    bagging_freq: int = 5
    seed: int = 0


def _lgb_base_params(cfg: L2Config) -> dict:
    return {
        "learning_rate": cfg.learning_rate,
        "num_leaves": cfg.num_leaves,
        "min_data_in_leaf": cfg.min_data_in_leaf,
        "feature_fraction": cfg.feature_fraction,
        "bagging_fraction": cfg.bagging_fraction,
        "bagging_freq": cfg.bagging_freq,
        "seed": cfg.seed,
        "verbose": -1,
    }


def _inject_weather_noise(
    X: pd.DataFrame, rng: np.random.Generator, horizon_days: int
) -> pd.DataFrame:
    """Perturb temperature features with N(0, σ(h)) to simulate forecast error."""
    std = TEMP_NOISE_STD_BY_HORIZON.get(horizon_days, 4.0)
    X = X.copy()
    for col in TEMP_FEATS_FOR_NOISE:
        if col in X.columns:
            X[col] = X[col].astype("float32") + rng.normal(0, std, len(X)).astype("float32")
    return X


def _feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    cols = list(FEATURE_COLUMNS) + list(CATEGORICAL_COLUMNS)
    return df[cols].copy()


def fit_tweedie(
    df: pd.DataFrame,
    y_col: str = "kwh",
    cfg: L2Config = L2Config(),
    noise_horizon_days: int = 7,
) -> lgb.Booster:
    """Train the Tweedie point model on the full frame."""
    rng = np.random.default_rng(cfg.seed)
    X = _feature_frame(df)
    X = _inject_weather_noise(X, rng, noise_horizon_days)
    y = df[y_col].astype("float32").values
    ds = lgb.Dataset(X, label=y, categorical_feature=list(CATEGORICAL_COLUMNS), free_raw_data=False)
    params = _lgb_base_params(cfg) | {
        "objective": "tweedie",
        "tweedie_variance_power": 1.5,
        "metric": "mae",
    }
    booster = lgb.train(params, ds, num_boost_round=cfg.n_estimators)
    return booster


def fit_quantiles(
    df: pd.DataFrame,
    y_col: str = "kwh",
    cfg: L2Config = L2Config(),
    quantiles: tuple[float, ...] = QUANTILES,
    noise_horizon_days: int = 7,
) -> dict[float, lgb.Booster]:
    rng = np.random.default_rng(cfg.seed)
    X = _feature_frame(df)
    X = _inject_weather_noise(X, rng, noise_horizon_days)
    y = df[y_col].astype("float32").values
    models: dict[float, lgb.Booster] = {}
    for q in quantiles:
        ds = lgb.Dataset(X, label=y, categorical_feature=list(CATEGORICAL_COLUMNS), free_raw_data=False)
        params = _lgb_base_params(cfg) | {
            "objective": "quantile",
            "alpha": q,
            "metric": "quantile",
        }
        models[q] = lgb.train(params, ds, num_boost_round=cfg.n_estimators)
    return models


def predict(booster: lgb.Booster, df: pd.DataFrame) -> np.ndarray:
    X = _feature_frame(df)
    y = booster.predict(X)
    return np.clip(y, 0.0, None).astype("float32")


def save_models(
    tweedie: lgb.Booster,
    quantiles: dict[float, lgb.Booster],
    directory: Path = MODELS_DIR,
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    tweedie.save_model(str(directory / "l2_tweedie.lgb"))
    for q, m in quantiles.items():
        m.save_model(str(directory / f"l2_q{int(q * 100):02d}.lgb"))


def load_models(directory: Path = MODELS_DIR) -> tuple[lgb.Booster, dict[float, lgb.Booster]]:
    tweedie = lgb.Booster(model_file=str(directory / "l2_tweedie.lgb"))
    quantiles = {}
    for q in QUANTILES:
        path = directory / f"l2_q{int(q * 100):02d}.lgb"
        if path.exists():
            quantiles[q] = lgb.Booster(model_file=str(path))
    return tweedie, quantiles


# ---------- split-conformal calibration ----------
#
# CQR-style asymmetric conformalization: on held-out fold residuals, we
# compute per-horizon-bucket widenings (delta_lo, delta_hi) so that the
# empirical coverage of [q10 - delta_lo, q90 + delta_hi] is at least the
# nominal 0.80. Buckets are aligned to EVAL_HORIZONS_DAYS; an inference
# row at day h picks the smallest bucket >= h (falling back to the
# largest bucket).

def _bucket_for(horizon_days: int, buckets: tuple[int, ...]) -> int:
    for b in buckets:
        if horizon_days <= b:
            return b
    return buckets[-1]


def compute_conformal_deltas(
    cv_preds: pd.DataFrame,
    y_col: str = "kwh",
    q_low_col: str = "q10",
    q_high_col: str = "q90",
    alpha: float = 0.20,
    horizons: tuple[int, ...] = EVAL_HORIZONS_DAYS,
) -> dict:
    """Return per-horizon-bucket conformal widenings.

    For each bucket b (= cumulative horizon), take rows with
    `horizon_days <= b` and compute:
        s_hi_i = y_i - q90_i        (positive => q90 was too low)
        s_lo_i = q10_i - y_i        (positive => q10 was too high)
        delta_hi = empirical (1 - alpha/2) quantile of s_hi (floored at 0)
        delta_lo = empirical (1 - alpha/2) quantile of s_lo (floored at 0)
    """
    out: dict[str, dict] = {"alpha": alpha, "buckets": {}}
    y = cv_preds[y_col].values
    ql = cv_preds[q_low_col].values
    qh = cv_preds[q_high_col].values
    hor = cv_preds["horizon_days"].values
    one_sided = 1.0 - alpha / 2.0
    for b in horizons:
        mask = hor <= b
        if mask.sum() < 10:
            continue
        s_hi = y[mask] - qh[mask]
        s_lo = ql[mask] - y[mask]
        d_hi = float(max(0.0, np.quantile(s_hi, one_sided)))
        d_lo = float(max(0.0, np.quantile(s_lo, one_sided)))
        out["buckets"][str(b)] = {"delta_lo": d_lo, "delta_hi": d_hi, "n": int(mask.sum())}
    return out


def save_conformal(deltas: dict, directory: Path = MODELS_DIR) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / CONFORMAL_FILE).write_text(json.dumps(deltas, indent=2))


def load_conformal(directory: Path = MODELS_DIR) -> dict | None:
    path = directory / CONFORMAL_FILE
    if not path.exists():
        return None
    return json.loads(path.read_text())


def apply_conformal(
    q10: np.ndarray,
    q90: np.ndarray,
    horizon_days_per_row: np.ndarray,
    deltas: dict | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Widen q10/q90 using per-horizon deltas. No-op if deltas is None."""
    if not deltas or not deltas.get("buckets"):
        return q10, q90
    buckets = tuple(sorted(int(k) for k in deltas["buckets"].keys()))
    d_lo = np.zeros_like(q10, dtype="float32")
    d_hi = np.zeros_like(q90, dtype="float32")
    for i, h in enumerate(horizon_days_per_row):
        b = _bucket_for(int(h), buckets)
        row = deltas["buckets"][str(b)]
        d_lo[i] = row["delta_lo"]
        d_hi[i] = row["delta_hi"]
    q10_new = np.clip(q10 - d_lo, 0.0, None).astype("float32")
    q90_new = (q90 + d_hi).astype("float32")
    return q10_new, q90_new
