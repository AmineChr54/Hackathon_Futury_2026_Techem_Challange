# Plan — Prediction Engine (post-critique, Section-8-aware)

## Context

The brainstorm at [docs/brainstorm/Brainstorm_Prediction_and_UX_Claude.md](docs/brainstorm/Brainstorm_Prediction_and_UX_Claude.md) laid out a three-layer modeling architecture (L1 climate baseline, L2 building, L3 tenant-online) with SHAP explainability and peer benchmarking. An external AI reviewed it ([docs/Extras/Criticize_Suggestions.md](docs/Extras/Criticize_Suggestions.md)) and proposed several ML-grade enhancements: causal inference for counterfactuals, hierarchical reconciliation, quantile regression, drift detection, shadow deployment, an LLM anomaly narrator, and a Pareto cost-vs-comfort engine.

The user has since clarified (Section 8 of the brainstorm):
- Buildings use **multiple energy sources** (Erdgas, Fernwärme, Heizöl), not just gas.
- Billing is **per-unit**, with a "dig deeper" drill-down to **per-room** stats.
- Live external APIs are **permitted** (keyless preferred; paid deferred).
- **Mobile-first browser** target, **English** only.

This plan (a) re-criticizes the external critique — adopting what holds up, rejecting what's overkill for a hackathon, and adding the issues the critique missed — and (b) specifies the implementation plan for the prediction engine only. Frontend is parked for a separate plan.

---

## 1. Re-criticism: which of the AI's suggestions actually hold up

### 1.1 ✅ Adopt (genuinely correct, worth the build effort)

| Suggestion | Verdict | Why |
|---|---|---|
| **Quantile regression (10/50/90)** for uncertainty bands | **Adopt** | LightGBM native support (`objective='quantile'`); three cheap models replace arbitrary ±σ bands with mathematically defensible intervals. Also unlocks honest Forecast Ribbon in UI. |
| **Hierarchical Time Series (MinT) reconciliation** | **Adopt** | Real problem: billing is per-unit but data is per-room. Summing noisy room forecasts *will* be worse than direct unit forecasts. Nixtla's `hierarchicalforecast` is a ~50-line add. |
| **Data leakage from weather forecasts** (train on actual temp, predict on forecasts) | **Adopt** | Classic over-optimism trap. Fix: inject Gaussian noise into temp features during training, scaled by horizon (σ≈1°C at h=1d, σ≈2–3°C at h=7d, σ≈4°C at h=14d). Ten lines of code, saves the model's honor. |
| **API resilience layer** (cache + static JSON fallback) | **Adopt** | A 90-second live demo failing on a Meteostat timeout is the #1 avoidable hackathon disaster. SQLite cache + bundled `mock_weather.json`. |

### 1.2 ⚠️ Adopt in simplified form (overkill as proposed, but the instinct is right)

| Suggestion | Verdict | What to do instead |
|---|---|---|
| **Causal inference for What-If slider** (DoubleML, T/S-Learner) | **Simplify** | The critique is correct that a vanilla LightGBM will overestimate savings from a 1°C drop — correlational confounding is real. But a full causal-ML library for a hackathon is too heavy. **Fix:** fit a physics-informed per-room response coefficient `β_room = ∂kWh / ∂HDD` (rolling window, robust regression) and use *that* for counterfactuals. It's causal-by-construction because HDD *is* the exogenous driver. Document the assumption explicitly. |
| **PSI / KS drift detection** | **Simplify** | Adopt the *concept* but keep it lightweight. Monitor residual distribution with a monthly KS test (`scipy.stats.ks_2samp`); if p < 0.01, flag a structural break. Don't pull in `evidently.ai` or a full monitoring stack. |
| **Shadow-mode L3 for 3 months** | **Document only** | Right in principle, invisible in a demo. Write it into the architecture doc as the production deployment policy. Don't build it for the hackathon. |

### 1.3 ❌ Reject or defer (scope creep for "prediction engine")

| Suggestion | Verdict | Reason |
|---|---|---|
| **RAG-powered LLM anomaly narrator** | **Defer to UX plan** | Strong UX feature, but scope is prediction engine only. Add to the frontend plan later. |
| **Pareto cost-vs-comfort engine** | **Defer to UX plan** | Generalization of the what-if slider. The modeling primitives (quantile forecasts + per-room β coefficients) are the same; the UX is the add-on. Don't build the engine now, just ensure the API exposes the primitives. |

### 1.4 🔍 What the critique missed (and matters)

These are issues the external AI did not flag but should have, given the data:

1. **Zero-inflated target distribution.** The CSV has many rows with `energyusage = 0.0` (summer months, unused rooms). A single regression model underperforms on this bimodal distribution. **Fix:** two-stage model — `P(usage > 0 | features)` × `E[usage | usage > 0, features]`, or switch to **Tweedie regression** (LightGBM supports `objective='tweedie'`). Quick diagnostic: plot the histogram of kWh per property before committing.

2. **Multi-source buildings require source-specific models.** Per the Section-8 answer, properties use Erdgas, Fernwärme, or Heizöl. These have fundamentally different thermal inertia, delivery efficiency, and billing dynamics. **Fix:** `energysource` is a first-class categorical feature with interaction terms (`energysource × HDD`, `energysource × month`). For Fernwärme specifically, consider a separate baseline model — district heating has a heat-exchanger loss profile that Erdgas doesn't.

3. **Time-series CV blocking.** The brainstorm mentions "rolling origin CV" but the critique didn't flag the blocking requirement. **Fix:** expanding-window CV *within* each unit, never shuffled across units. Use `sklearn.model_selection.TimeSeriesSplit` grouped by `(property, unit)`.

4. **Evaluation horizon matters more than point MAPE.** A tenant cares about annual cost forecasts, not day-ahead accuracy. **Fix:** report MAE, MAPE, and pinball loss at multiple horizons (1d, 7d, 30d, 90d, 365d). The 365d number is the one the jury will remember.

5. **Static emission factor in the CSV.** The `emission factor [g/kWh]` column looks constant per source in the sample. If we want the "dynamic CO₂" claim from the brainstorm, we must override it with a live feed (Electricity Maps for electricity, or static per-source constants for gas/oil/Fernwärme). Not an ML issue, but a data pipeline correctness issue.

6. **Per-unit feature engineering for per-unit billing.** Since billing aggregates to unit, the unit-level features (`total_m²`, `n_rooms`, `source_mix`, `floor_position_proxy`) are as important as the per-row weather features. The critique focused on hierarchical reconciliation but didn't call out the unit-level feature roll-up that has to happen first.

7. **Calibration of the prediction intervals.** Quantile regression gives you bands, but are they *calibrated*? (Does the 90% band actually contain 90% of actuals?) **Fix:** reliability plot on the holdout; conformal-prediction correction if miscalibrated. Five lines with `mapie`.

---

## 2. Implementation plan — Prediction Engine

### 2.1 Architecture (revised from brainstorm §4)

```
    ┌──────────────────────────────────────────────────────────┐
    │  L3  Tenant online updater                               │
    │       Bayesian ridge / EWMA on L2 residuals, per unit    │
    ├──────────────────────────────────────────────────────────┤
    │  L2  Unit-level quantile forecaster                      │
    │       LightGBM Tweedie + 3× LightGBM Quantile (0.1/0.5/0.9) │
    │       Features: weather + HDD + lags + unit-level rollups│
    ├──────────────────────────────────────────────────────────┤
    │  L1  Peer baseline + typology prior                      │
    │       Gradient boosting on (zipcode cluster,             │
    │       energysource, era_prior, m², HDD, month)           │
    ├──────────────────────────────────────────────────────────┤
    │  L0  Hierarchical reconciliation (MinT, Nixtla)          │
    │       Enforces room → unit → building consistency        │
    │       Room-level forecasts are a drill-down, not a sum   │
    └──────────────────────────────────────────────────────────┘
```

Two changes from the brainstorm:
- **L0 added** for hierarchical reconciliation. Predict at unit level natively; derive room-level proportions from the reconciler.
- **L2 is the hero** (was vague). It's the quantile Tweedie model. L3 is a thin online layer on top.

### 2.2 Build order

1. **Data consolidation** ([data/properties/*.csv](data/properties/) → unified parquet)
   - Long-format schema: `(property_id, unit_id, room_id, date, source, kWh, m², outside_temp, emission_factor, zipcode, city)`
   - Validate: check zero-inflation histogram per property, confirm multi-source distribution, detect CSV parsing edge cases (comma vs tab, `[°C]` header char, decimal comma).
   - Output: `data/processed/consumption.parquet`

2. **External data wiring (keyless first)**
   - **Meteostat** (keyless) — historical + 14d forecast hourly → daily aggregate. Keyed on `(lat, lon, elevation)` derived from zipcode (`pgeocode` package, keyless).
   - **Open-Elevation** (keyless) — elevation lookup per zipcode.
   - **Tabula/Episcope** — typology prior; ship as a bundled static JSON (no live API needed, data is essentially static).
   - **Zensus 2022** — household-size prior per zipcode; bundled CSV.
   - **Resilience layer:** `diskcache`-backed wrapper around every API call with a `mock_*.json` fallback. Decorator pattern: `@resilient(fallback="mock_weather.json")`.
   - **Deferred (documented, not built):** ENTSO-E live grid mix, Electricity Maps, live gas tariff APIs. These need keys/signup. Stub with a config-driven €/kWh and static emission factor for the demo.

3. **Feature engineering**
   - Per-row: HDD at base 12/15/18°C, 1/3/7-day temp lags, `kWh/m²`, day-of-week, holiday flag (German), month harmonics.
   - Per-unit rollup: `total_m²`, `n_rooms`, `source`, `source_mix_if_mixed`, zipcode cluster id.
   - Per-room latent: room-cluster id from K-Means on daily usage shape (4–6 clusters); rolling 30-day mean/variance.
   - Zero-usage indicator: binary feature for summer months; feeds two-stage or Tweedie model.

4. **Baseline: LightGBM Tweedie, per-unit**
   - Single model across all properties, `unit_id` as categorical.
   - Expanding-window time-series CV, grouped by unit — never shuffled.
   - Report MAE + MAPE + pinball loss at h = 1d/7d/30d/90d/365d.
   - Ablation on features (w/o weather, w/o HDD, w/o lags) — the ablation table IS the story for the jury.

5. **Quantile regression layer**
   - Three LightGBM models: quantile 0.1, 0.5, 0.9.
   - Same feature set and CV split as Tweedie.
   - Calibration check: on holdout, fraction of actuals within [q10, q90] should be ~80%. If off, apply `mapie` conformal correction.

6. **Hierarchical reconciliation**
   - `Nixtla/HierarchicalForecast` with MinT reconciler.
   - Hierarchy: `property → unit → room`.
   - Forecast at unit level, reconcile downward for drill-down; sum upward to property level.

7. **Per-room β coefficients (causal-lite for what-if)**
   - Rolling 180-day robust regression: `kWh_room ~ α + β·HDD` per (unit, room).
   - β is the marginal sensitivity used by the what-if slider: "turn down 1°C" ≈ shift HDD baseline, recompute via β.
   - Store: `data/processed/room_sensitivities.parquet`.

8. **L3 online updater**
   - Per unit, maintain EWMA of L2 residuals (span = 30 days).
   - On inference: `y_hat = L2(x) + EWMA_residual(unit)`.
   - Save state to disk; updated nightly in a real deployment, on-demand for the demo.

9. **Drift detector**
   - Monthly KS test on L2 residual distribution vs. rolling 180-day baseline.
   - Trigger: p < 0.01 → log a structural-break event with timestamp and unit.
   - Endpoint exposes recent events for the UX's "something changed" flag.

10. **Backend API surface (FastAPI)**
    - `GET /forecast/unit/{unit_id}?horizon=30d` → `{dates, median, q10, q90, drivers: {weather, building, habits}}`
    - `GET /drilldown/unit/{unit_id}` → per-room breakdown (reconciled)
    - `POST /whatif/unit/{unit_id}` with `{room_id, temp_delta_c}` → re-scored forecast + savings
    - `GET /peers/{unit_id}` → cohort definition + percentile
    - `GET /drift/{unit_id}` → recent structural-break events

### 2.3 Critical files to create

| Path | Purpose |
|---|---|
| `src/data/consolidate.py` | 20 CSVs → unified parquet |
| `src/data/external.py` | Meteostat + Open-Elevation + pgeocode, with `@resilient` cache/fallback |
| `src/features/engineering.py` | HDD, lags, rollups, room clusters, zero-inflation flags |
| `src/models/l1_baseline.py` | Typology + peer baseline (cold-start) |
| `src/models/l2_quantile.py` | LightGBM Tweedie + 3× quantile |
| `src/models/l0_reconcile.py` | Nixtla MinT wrapper |
| `src/models/whatif.py` | Per-room β regression + counterfactual scoring |
| `src/models/drift.py` | KS test on residuals |
| `src/serve/api.py` | FastAPI endpoints |
| `src/serve/resilience.py` | `@resilient` decorator + cache layer |
| `tests/test_cv_blocking.py` | Guard against accidental shuffled CV (correctness critical) |
| `tests/test_reconciliation.py` | Assert room sums match unit forecasts post-MinT |
| `notebooks/00_data_audit.ipynb` | Zero-inflation, source distribution, missingness diagnostics |
| `notebooks/01_ablation.ipynb` | Feature ablation table for the jury |

### 2.4 Verification

- `pytest tests/` — CV blocking and reconciliation invariants must pass.
- `notebooks/00_data_audit.ipynb` — visual confirmation of zero-inflation handling, multi-source coverage, missing-day detection.
- `notebooks/01_ablation.ipynb` — produces a single table: MAE per horizon × feature-group ablation. This artifact is the modeling story.
- Calibration plot in `notebooks/02_calibration.ipynb` — quantile bands contain the right fraction of actuals at h=7d, 30d, 90d.
- End-to-end smoke test: `uvicorn src.serve.api:app` + curl each endpoint for one unit → sanity-check response shapes and latency (target <500ms per call, cached).
- Offline failure drill: disable network, confirm every endpoint still returns via the resilience layer's static JSON fallback.

### 2.5 What's explicitly out of scope

- Frontend / mobile UI (separate plan)
- RAG anomaly narrator (UX plan)
- Pareto optimizer UI (UX plan)
- ENTSO-E / Electricity Maps / live tariff APIs (stubbed; post-hackathon)
- Shadow-mode L3 gating (production policy only; document, don't build)
- SOTA model chasing (Temporal Fusion Transformer, N-BEATS) — not promised, ladder-up only if LightGBM plateaus

---

## 3. Summary verdict on the external critique

**Accept 4 of its suggestions** (quantile regression, hierarchical reconciliation, weather-forecast noise injection, API resilience) — these are correct and materially improve both demo safety and model honesty.

**Simplify 3** (causal ML → per-room β coefficients; drift detection → lightweight KS; shadow mode → doc-only) — the critique's instincts are right but the full production implementations are hackathon-inappropriate.

**Defer 2** (LLM narrator, Pareto engine) — genuinely great features, but out of scope for the prediction-engine plan.

**Add 7 issues the critique missed** (zero-inflation, multi-source modeling, CV blocking, multi-horizon evaluation, static emission factor, per-unit feature rollup, calibration check) — several of these would have caused silent failures the judge-facing metrics wouldn't have revealed.

Net effect: the plan is ~30% more work than the original brainstorm but demonstrably more defensible. The ablation table and the honest calibration plot are the artifacts that win the jury over — not the model zoo.
