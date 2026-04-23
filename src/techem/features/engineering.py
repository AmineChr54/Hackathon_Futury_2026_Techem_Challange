"""Feature engineering for the L2 forecaster.

Input : unit-level daily frame (from data.consolidate.build_unit_daily).
Output: same rows, enriched with HDD variants, temperature lags, harmonic
        month/day encodings, unit-level rollups, a zero-usage flag, and
        leak-free rolling lags of the target.
"""
from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

from techem.config import HDD_BASES_C, LAG_WINDOWS_DAYS


def _hdd(temp: pd.Series, base: float) -> pd.Series:
    return (base - temp).clip(lower=0.0)


def add_weather_features(df: pd.DataFrame, temp_col: str = "outside_temp") -> pd.DataFrame:
    df = df.copy()
    for base in HDD_BASES_C:
        df[f"hdd_{int(base)}"] = _hdd(df[temp_col], base).astype("float32")
    # Temperature lags and rolling means, computed within unit to avoid bleed.
    df = df.sort_values(["property_id", "unit_id", "date"], kind="stable")
    grp = df.groupby(["property_id", "unit_id"], observed=True)[temp_col]
    for w in LAG_WINDOWS_DAYS:
        df[f"temp_roll{w}"] = grp.transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean()).astype("float32")
    return df


def add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    d = pd.to_datetime(df["date"])
    df["dow"] = d.dt.dayofweek.astype("int8")
    df["is_weekend"] = (df["dow"] >= 5).astype("int8")
    df["month"] = d.dt.month.astype("int8")
    df["doy"] = d.dt.dayofyear.astype("int16")
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12).astype("float32")
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12).astype("float32")
    df["doy_sin"] = np.sin(2 * np.pi * df["doy"] / 365.25).astype("float32")
    df["doy_cos"] = np.cos(2 * np.pi * df["doy"] / 365.25).astype("float32")
    return df


def add_target_lags(
    df: pd.DataFrame,
    y_col: str = "kwh",
    windows: Iterable[int] = LAG_WINDOWS_DAYS,
) -> pd.DataFrame:
    """Add leak-free lagged rolling statistics of the target.

    Each lag is shifted by 1 day before the rolling window is taken,
    so the features at time t depend only on t-1..t-1-w.
    """
    df = df.sort_values(["property_id", "unit_id", "date"], kind="stable").copy()
    grp = df.groupby(["property_id", "unit_id"], observed=True)[y_col]
    for w in windows:
        df[f"kwh_lag_roll{w}"] = grp.transform(
            lambda s: s.shift(1).rolling(w, min_periods=1).mean()
        ).astype("float32")
    df["kwh_lag1"] = grp.shift(1).astype("float32")
    return df


def add_unit_rollups(df: pd.DataFrame) -> pd.DataFrame:
    """Unit-level static attributes (constant in time for a given unit)."""
    df = df.copy()
    # livingspace per unit is already summed during aggregation, but some
    # units may shrink/grow if the raw data has fluctuations — use the
    # median over the history as a stable attribute.
    stable = df.groupby(["property_id", "unit_id"], observed=True).agg(
        unit_livingspace=("livingspace", "median"),
        unit_n_rooms=("n_rooms", "median"),
        unit_source=("source", "first"),
        unit_zipcode=("zipcode", "first"),
    ).reset_index()
    df = df.merge(stable, on=["property_id", "unit_id"], how="left")
    df["unit_livingspace"] = df["unit_livingspace"].astype("float32")
    df["unit_n_rooms"] = df["unit_n_rooms"].astype("int16")
    return df


def add_zero_flags(df: pd.DataFrame, y_col: str = "kwh") -> pd.DataFrame:
    df = df.copy()
    df["is_zero"] = (df[y_col] <= 0).astype("int8")
    df["is_summer"] = df["date"].dt.month.isin([6, 7, 8]).astype("int8")
    return df


FEATURE_COLUMNS: tuple[str, ...] = (
    "outside_temp",
    "hdd_12", "hdd_15", "hdd_18",
    "temp_roll1", "temp_roll3", "temp_roll7",
    "dow", "is_weekend",
    "month_sin", "month_cos",
    "doy_sin", "doy_cos",
    "kwh_lag1", "kwh_lag_roll1", "kwh_lag_roll3", "kwh_lag_roll7",
    "unit_livingspace", "unit_n_rooms",
    "is_summer",
)

CATEGORICAL_COLUMNS: tuple[str, ...] = (
    "unit_source", "unit_zipcode",
)


def build_feature_frame(unit_daily: pd.DataFrame) -> pd.DataFrame:
    """Apply the full feature pipeline. Input must be unit-level daily."""
    df = unit_daily.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = add_weather_features(df)
    df = add_calendar_features(df)
    df = add_target_lags(df)
    df = add_unit_rollups(df)
    df = add_zero_flags(df)
    for c in CATEGORICAL_COLUMNS:
        df[c] = df[c].astype("category")
    return df
