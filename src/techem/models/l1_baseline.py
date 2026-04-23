"""L1 peer baseline — the cold-start / typology prior.

This model knows nothing unit-specific; it predicts from (zipcode cluster,
source, m², HDD, month). Purpose:
  • Cold start — provide a reasonable forecast for a never-seen unit.
  • Peer benchmark — serve the "average flat like yours" line in the UI.

Uses a simple GBM on features available for any new unit with just
address + m² + energy source.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from techem.config import MODELS_DIR

FEATURES_L1 = (
    "unit_livingspace",
    "hdd_15",
    "month",
    "outside_temp",
    "temp_roll7",
)
CATEGORICAL_L1 = ("unit_source", "unit_zipcode")


@dataclass
class L1Config:
    n_estimators: int = 400
    learning_rate: float = 0.05
    num_leaves: int = 31
    min_data_in_leaf: int = 80
    seed: int = 0


def fit(df: pd.DataFrame, y_col: str = "kwh", cfg: L1Config = L1Config()) -> lgb.Booster:
    cols = list(FEATURES_L1) + list(CATEGORICAL_L1)
    X = df[cols].copy()
    y = df[y_col].astype("float32").values
    ds = lgb.Dataset(X, label=y, categorical_feature=list(CATEGORICAL_L1), free_raw_data=False)
    params = {
        "objective": "tweedie",
        "tweedie_variance_power": 1.5,
        "metric": "mae",
        "learning_rate": cfg.learning_rate,
        "num_leaves": cfg.num_leaves,
        "min_data_in_leaf": cfg.min_data_in_leaf,
        "seed": cfg.seed,
        "verbose": -1,
    }
    return lgb.train(params, ds, num_boost_round=cfg.n_estimators)


def predict(booster: lgb.Booster, df: pd.DataFrame) -> np.ndarray:
    cols = list(FEATURES_L1) + list(CATEGORICAL_L1)
    return np.clip(booster.predict(df[cols]), 0.0, None).astype("float32")


def peer_percentile(
    unit_df: pd.DataFrame,
    cohort_df: pd.DataFrame,
    metric_col: str = "kwh",
) -> float:
    """Rank this unit's mean daily usage against a cohort.

    Lower is better (more efficient), so percentile 0 = best-in-cohort,
    percentile 100 = worst. We return the tenant-facing score where
    higher is better, i.e., 100 - raw percentile.
    """
    unit_mean = unit_df[metric_col].mean()
    cohort_means = cohort_df.groupby(["property_id", "unit_id"], observed=True)[metric_col].mean()
    if cohort_means.empty:
        return float("nan")
    rank = float((cohort_means > unit_mean).mean() * 100)
    return rank


def save(booster: lgb.Booster, directory: Path = MODELS_DIR) -> None:
    booster.save_model(str(directory / "l1_baseline.lgb"))


def load(directory: Path = MODELS_DIR) -> lgb.Booster:
    return lgb.Booster(model_file=str(directory / "l1_baseline.lgb"))
