# Implementation Handoff — Prediction Engine

> Hand-off for the next model/session. Plan reference: [docs/Plan/Prediction_Engine_Plan.md](../Plan/Prediction_Engine_Plan.md). Everything below is already on disk and runs end-to-end.

## TL;DR of what's done

- **Project scaffolded** (venv, `requirements.txt`, `pyproject.toml`, `src/techem/` package, tests, scripts).
- **Data pipeline** (20 CSVs → `consumption.parquet` + `unit_daily.parquet`).
- **External APIs wired** with resilience layer (Meteostat + pgeocode via `diskcache` + static JSON fallback).
- **Feature engineering** (HDD base 12/15/18, temp lags, calendar harmonics, target lags, unit rollups, zero-inflation flags).
- **L2 models trained**: Tweedie point + 3× quantile (0.1/0.5/0.9), weather-forecast noise injection during training.
- **L1 peer baseline** (LightGBM Tweedie on typology features).
- **L0 reconciliation** via proportions (room shares × unit forecast, MinT-compatible interface).
- **Per-room β** coefficients (Huber regression on HDD) for causal-lite what-if.
- **L3 online updater** (EWMA on residuals, JSON-persisted state).
- **Drift detector** (KS two-sample test on residuals, monthly window).
- **FastAPI service** with `/health`, `/units`, `/forecast`, `/drilldown`, `/whatif`, `/peers`, `/drift`.
- **Tests green**: 6/6 pass covering CV blocking correctness + reconciliation invariants.
- **Audit + ablation scripts** produced in place of notebooks.

## How to run it

```bash
# one-off
source .venv/Scripts/activate
python -m scripts.audit               # data diagnostic
python -m scripts.train               # builds all artifacts under models/artifacts/
python -m scripts.ablation            # feature ablation table
python -m pytest tests/ -q            # 6 tests

# serve (mobile-first frontend should hit this)
uvicorn techem.serve.api:app --host 127.0.0.1 --port 8765
```

Health check responded `{"status":"ok","units":275}` and `/units` returned the expected 275 units across 20 properties.

## Current model metrics (from `scripts.train`)

| horizon | rows | MAE (kWh/day) | MAPE |
|---|---|---|---|
| 1d | 1,359 | 2.79 | 23.7% |
| 7d | 9,043 | 4.74 | 6.4% |
| 14d | 18,377 | 4.39 | 4.2% |
| 30d | 39,740 | 4.35 | 3.7% |

Quantile **coverage(q10,q90) = 0.687** vs target 0.80 — under-covered, **conformal correction needed** (noted in plan §1.2 / §1.4 item 7).

## Critical finding that diverges from the brainstorm

**The data is only 1 year (2019-12-31 → 2020-12-30), not 5 years.** The brainstorm assumed "~5 yrs of history". I adjusted CV defaults accordingly (`min_train_days=180`, `step_days=30`, `horizon_days=30`, `EVAL_HORIZONS_DAYS=(1,7,14,30)`). The 10-year-contract learning narrative still holds as a *pitch*, but it cannot be empirically demonstrated with this dataset — any "year 1 ±22% / year 3 ±9%" slide would be simulated. **Flag this to the team and the jury.**

## File map

```
.
├── data/
│   ├── properties/            # 20 raw CSVs (unchanged)
│   └── processed/
│       ├── consumption.parquet       # 405k rows, room-level
│       ├── unit_daily.parquet        # 84.6k rows, unit-level
│       └── room_sensitivities.parquet
├── models/artifacts/
│   ├── l1_baseline.lgb
│   ├── l2_tweedie.lgb
│   ├── l2_q10.lgb / l2_q50.lgb / l2_q90.lgb
│   └── l3_state.json
├── src/techem/
│   ├── config.py                      # paths + knobs (single source of truth)
│   ├── data/
│   │   ├── consolidate.py             # CSV → parquet
│   │   └── external.py                # Meteostat + pgeocode (keyless)
│   ├── features/engineering.py
│   ├── models/
│   │   ├── cv.py                      # blocked time-series CV
│   │   ├── metrics.py                 # MAE, MAPE, pinball, coverage
│   │   ├── l0_reconcile.py            # room shares disaggregation
│   │   ├── l1_baseline.py             # peer baseline + percentile
│   │   ├── l2_quantile.py             # Tweedie + 3×quantile + noise injection
│   │   ├── l3_online.py               # EWMA residual updater
│   │   ├── whatif.py                  # Huber β per room
│   │   └── drift.py                   # KS drift detector
│   └── serve/
│       ├── api.py                     # FastAPI
│       └── resilience.py              # @resilient cache + fallback
├── scripts/
│   ├── train.py                       # end-to-end training
│   ├── audit.py                       # data diagnostic
│   └── ablation.py                    # feature ablation table
├── tests/
│   ├── test_cv_blocking.py
│   └── test_reconciliation.py
├── requirements.txt
├── pyproject.toml
└── .gitignore
```

## What's NOT done (next-model's queue)

### Must-do

1. **API smoke test** — `/forecast`, `/drilldown`, `/whatif`, `/peers`, `/drift` were defined but only `/health` and `/units` were actually hit end-to-end before token budget ran out. Run each with `curl` (examples below) and fix any pydantic / DataFrame-column mismatches.
   ```bash
   curl "http://127.0.0.1:8765/forecast/unit/1/1?horizon_days=14"
   curl "http://127.0.0.1:8765/peers/1/1"
   curl "http://127.0.0.1:8765/drilldown/unit/1/1?horizon_days=14"
   curl -X POST "http://127.0.0.1:8765/whatif/unit/1/1" -H "Content-Type: application/json" \
        -d '{"temp_delta_c":-1.0,"horizon_days":30,"use_live_weather":false}'
   ```
   Likely issue: `build_feature_frame` in `api._future_frame` re-computes features on a stitched history+future frame; verify the `kwh_lag1` feature is non-NaN on the future rows after the ffill.

2. **Conformal calibration for quantiles** — coverage 0.687 < 0.80 target. Add a post-hoc conformal step in `l2_quantile.py`: compute residual quantiles on a held-out fold, widen q10/q90 by that amount. Five lines with `mapie` or hand-rolled.

3. **Swap proportions reconciliation for MinT** — `hierarchicalforecast>=1.5` is installed. `l0_reconcile.py` is structured so you can plug in `MinTrace` with one function swap. Current proportions approach works and satisfies the invariant, but MinT gives strictly better forecasts when you already have per-level models.

4. **Offline drill / resilience test** — `ensure_mock_weather()` is defined but there's no end-to-end test that with network disabled, `/forecast?use_live_weather=true` still returns sensibly via the fallback. Add `tests/test_offline_resilience.py`.

### Nice-to-have (for a stronger submission)

5. **Tabula/Zensus typology priors** — `src/techem/data/external.py` has placeholders for the static priors but they aren't bundled yet. Shipping `data/external/tabula.json` + `data/external/zensus.csv` would let L1 cold-start for a genuinely new unit that isn't in the training set.

6. **Static emission factors override** — the CSV's `emission_factor_g_per_kwh` is baked in; we fall back to `DEFAULT_EMISSION_G_PER_KWH` only if the row is null. To tell a "dynamic CO₂" story, add a live Electricity Maps call for electricity-sourced rows (requires signup → deferred per plan).

7. **Ablation script is written but hasn't been run** — `python -m scripts.ablation` should produce the jury-facing feature-importance table. Validate output.

8. **L3 shadow mode** — documented in plan §1.2 as doc-only. If time permits, a flag on `/forecast` to compare `L2` vs `L2+L3` side-by-side would be a compelling demo for the "it learns over time" story.

### Out of scope for prediction engine (go to frontend plan)

- RAG anomaly narrator
- Pareto cost-vs-comfort slider UI
- Mobile-first dashboard itself
- Explainability UI (SHAP stacked bars) — the API exposes enough primitives; the rendering belongs to the FE plan

## Known caveats

- **Windows codepage (cp1252)** breaks unicode in `print()`. Scripts use ASCII-safe strings now. Be aware if you add new prints.
- **`future_frame` uses seasonal lookup by month-day** when `use_live_weather=false`. With only 1 year of data there's no prior year to look up; we fall back to the last observed temperature. This will look pessimistic for long horizons — a note for the demo.
- **Drift detector fires 135 events** out of 275 units. This is driven by the tiny dataset (120-day baseline, 30-day recent — the ratio is aggressive). In production with multi-year baselines it would fire far less. Consider loosening thresholds for the demo (`baseline_days=180, recent_days=60, p_threshold=0.001`).
- **`n_rooms` inconsistency**: some units' room count fluctuates day-to-day. Feature engineering takes the median. Worth double-checking in `scripts.audit` output.

## Handy diagnostic snippets

```python
# Inspect a single unit's full history and forecast:
from techem.models import l2_quantile
from techem.features.engineering import build_feature_frame
import pandas as pd
u = pd.read_parquet("data/processed/unit_daily.parquet")
feat = build_feature_frame(u)
mine = feat[(feat.property_id==1) & (feat.unit_id==1)]
tw, qs = l2_quantile.load_models()
mine["pred"] = l2_quantile.predict(tw, mine)
print(mine[["date","kwh","pred"]].tail(30))
```

```python
# Re-run drift with looser thresholds (for the demo):
from techem.models.drift import detect_drift
events = detect_drift(features_df_with_l2_pred, baseline_days=180, recent_days=60, p_threshold=1e-3)
```
