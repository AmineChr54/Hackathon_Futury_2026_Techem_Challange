"""Feature ablation — the jury-facing artefact replacing `01_ablation.ipynb`.

For each feature group (weather, HDD, calendar, lags, unit rollups),
retrain the L2 Tweedie model without that group and report the horizon
MAE delta. The group whose removal hurts most is the one doing the most
work — which is the story you want in a one-slide summary.

Run:
    python -m scripts.ablation
"""
from __future__ import annotations

import pandas as pd

from techem.config import UNIT_DAILY_PARQUET
from techem.features.engineering import (
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    build_feature_frame,
)
from techem.models import l2_quantile
from techem.models.cv import SplitSpec, blocked_time_splits
from techem.models.metrics import mae

ABLATIONS = {
    "none (full)": set(),
    "no_weather": {"outside_temp", "temp_roll1", "temp_roll3", "temp_roll7"},
    "no_hdd": {"hdd_12", "hdd_15", "hdd_18"},
    "no_calendar": {"dow", "is_weekend", "month_sin", "month_cos", "doy_sin", "doy_cos"},
    "no_lags": {"kwh_lag1", "kwh_lag_roll1", "kwh_lag_roll3", "kwh_lag_roll7"},
    "no_unit_attrs": {"unit_livingspace", "unit_n_rooms"},
}


def _run_one(feat: pd.DataFrame, drop: set[str]) -> dict:
    keep_cols = [c for c in FEATURE_COLUMNS if c not in drop]
    cols = keep_cols + list(CATEGORICAL_COLUMNS)
    cut_spec = SplitSpec(min_train_days=180, step_days=30, horizon_days=30)

    preds = []
    for tr, va in blocked_time_splits(feat, cut_spec):
        tr_df = feat.iloc[tr]
        va_df = feat.iloc[va]

        import lightgbm as lgb
        ds = lgb.Dataset(tr_df[cols], label=tr_df["kwh"], categorical_feature=list(CATEGORICAL_COLUMNS), free_raw_data=False)
        params = {
            "objective": "tweedie", "tweedie_variance_power": 1.5,
            "metric": "mae", "learning_rate": 0.05, "num_leaves": 63,
            "min_data_in_leaf": 40, "verbose": -1,
        }
        booster = lgb.train(params, ds, num_boost_round=300)
        p = booster.predict(va_df[cols]).clip(min=0)
        preds.append(pd.DataFrame({"y": va_df["kwh"].values, "p": p}))
    pred_all = pd.concat(preds)
    return {"mae": mae(pred_all["y"].values, pred_all["p"].values), "n": len(pred_all)}


def main() -> None:
    unit = pd.read_parquet(UNIT_DAILY_PARQUET)
    feat = build_feature_frame(unit).dropna(subset=["kwh_lag1"]).reset_index(drop=True)

    rows = []
    baseline_mae = None
    for name, drop in ABLATIONS.items():
        r = _run_one(feat, drop)
        r["ablation"] = name
        r["dropped"] = ", ".join(sorted(drop)) if drop else "(full model)"
        if baseline_mae is None:
            baseline_mae = r["mae"]
        r["delta_mae"] = r["mae"] - baseline_mae
        r["delta_pct"] = 100 * r["delta_mae"] / baseline_mae if baseline_mae else 0.0
        rows.append(r)
        print(f"  {name:20s}  MAE={r['mae']:.4f}  Δ={r['delta_mae']:+.4f}  ({r['delta_pct']:+.1f}%)")

    df = pd.DataFrame(rows)[["ablation", "dropped", "n", "mae", "delta_mae", "delta_pct"]]
    print("\nablation summary:")
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
