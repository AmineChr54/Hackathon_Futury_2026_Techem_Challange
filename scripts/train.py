"""End-to-end training pipeline.

Reads the consolidated parquet, builds features, trains L1 + L2 + quantile
models, computes room sensitivities, fits L3 state, runs drift detection,
saves everything to `models/artifacts/`, and prints a horizon report.

Run:
    python -m scripts.train
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent / "src"))

from techem.config import (
    CONSUMPTION_PARQUET,
    EVAL_HORIZONS_DAYS,
    MODELS_DIR,
    UNIT_DAILY_PARQUET,
)
from techem.data.consolidate import build_consumption_parquet, build_unit_daily
from techem.features.engineering import build_feature_frame
from techem.models import l1_baseline, l2_quantile, l3_online
from techem.models.cv import SplitSpec, blocked_time_splits
from techem.models.drift import detect_drift
from techem.models.metrics import horizon_report, mae, mape, pinball, coverage
from techem.models.whatif import fit_room_sensitivities


def _ensure_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not CONSUMPTION_PARQUET.exists():
        build_consumption_parquet()
    if not UNIT_DAILY_PARQUET.exists():
        build_unit_daily()
    return (
        pd.read_parquet(CONSUMPTION_PARQUET),
        pd.read_parquet(UNIT_DAILY_PARQUET),
    )


def evaluate_with_cv(feat: pd.DataFrame) -> pd.DataFrame:
    """Blocked time-series CV. Returns per-fold predictions for reporting."""
    cut_specs = SplitSpec(min_train_days=180, step_days=30, horizon_days=30)
    preds = []
    for fold_idx, (tr, va) in enumerate(blocked_time_splits(feat, cut_specs)):
        tr_df = feat.iloc[tr]
        va_df = feat.iloc[va]
        tw = l2_quantile.fit_tweedie(tr_df, noise_horizon_days=30)
        qs = l2_quantile.fit_quantiles(tr_df, noise_horizon_days=30)

        p50 = l2_quantile.predict(tw, va_df)
        q10 = l2_quantile.predict(qs[0.1], va_df)
        q50 = l2_quantile.predict(qs[0.5], va_df)
        q90 = l2_quantile.predict(qs[0.9], va_df)

        cut_date = tr_df["date"].max()
        fold = va_df[["property_id", "unit_id", "date", "kwh"]].copy()
        fold["pred"] = p50
        fold["q10"] = q10
        fold["q50"] = q50
        fold["q90"] = q90
        fold["horizon_days"] = (pd.to_datetime(fold["date"]) - pd.to_datetime(cut_date)).dt.days
        fold["fold"] = fold_idx
        preds.append(fold)
        print(f"  fold {fold_idx}: train<= {cut_date.date()}  val_rows={len(va_df):,}")
    return pd.concat(preds, ignore_index=True)


def main() -> None:
    print("[1/7] Loading data")
    consumption, unit_daily = _ensure_data()
    print(f"      room-level rows = {len(consumption):,}")
    print(f"      unit-level rows = {len(unit_daily):,}")

    print("[2/7] Feature engineering")
    feat = build_feature_frame(unit_daily)
    print(f"      features rows = {len(feat):,}  columns = {len(feat.columns)}")

    # Drop the first week for each unit — target lags are NaN there.
    feat = feat.dropna(subset=["kwh_lag1"]).reset_index(drop=True)

    print("[3/7] L2 blocked CV + quantiles")
    cv_preds = evaluate_with_cv(feat)

    print("\n[eval] Horizon report (point median pred):")
    print(horizon_report(cv_preds, y_col="kwh", pred_col="pred", horizons_days=EVAL_HORIZONS_DAYS).to_string(index=False))

    print("\n[eval] Quantile calibration:")
    cov_80 = coverage(cv_preds["kwh"].values, cv_preds["q10"].values, cv_preds["q90"].values)
    p10 = pinball(cv_preds["kwh"].values, cv_preds["q10"].values, 0.1)
    p90 = pinball(cv_preds["kwh"].values, cv_preds["q90"].values, 0.9)
    print(f"      coverage(q10,q90) = {cov_80:.3f}  (target ~ 0.80)")
    print(f"      pinball(0.1)      = {p10:.4f}")
    print(f"      pinball(0.9)      = {p90:.4f}")
    print(f"      overall MAE       = {mae(cv_preds['kwh'].values, cv_preds['pred'].values):.4f}")
    print(f"      overall MAPE      = {mape(cv_preds['kwh'].values, cv_preds['pred'].values):.4f}")

    print("\n[4/7] Final fit on all data")
    tweedie = l2_quantile.fit_tweedie(feat)
    quantiles = l2_quantile.fit_quantiles(feat)
    l2_quantile.save_models(tweedie, quantiles)

    print("[5/7] L1 peer baseline")
    l1 = l1_baseline.fit(feat)
    l1_baseline.save(l1)

    print("[6/7] Room beta sensitivities + L3 state + drift")
    fit_room_sensitivities(consumption)

    feat_for_l3 = feat.copy()
    feat_for_l3["l2_pred"] = l2_quantile.predict(tweedie, feat_for_l3)
    state = l3_online.compute_state(feat_for_l3, y_col="kwh", pred_col="l2_pred")
    l3_online.save_state(state)
    print(f"      L3 state entries = {len(state)}")

    drift_events = detect_drift(feat_for_l3, baseline_days=120, recent_days=30)
    print(f"      drift events = {len(drift_events)}")
    for e in drift_events[:5]:
        print(f"        unit ({e.property_id},{e.unit_id}) p={e.p_value:.4f} ks={e.ks_stat:.3f}")

    print("[7/7] Done. Artifacts:")
    for p in sorted(MODELS_DIR.glob("*")):
        print(f"      {p.name}  ({p.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
