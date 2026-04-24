# Implementation Overview — Techem Forecast Engine

This document is a mid-level walk-through of the prediction-engine backend: what it does, how the pieces fit together, and what was added in the most recent session on top of the handoff at [Implementation_Handoff.md](Implementation_Handoff.md). Read this before editing the backend or demoing the API.

---

## 1. What this backend is

A FastAPI service that exposes an energy-forecasting engine over 275 residential units across 20 German properties. For any unit it can answer four tenant-facing questions:

1. **How much energy / cost / CO₂ will I use over the next N days?** (`/forecast`)
2. **Which rooms are driving that?** (`/drilldown`)
3. **If I turn the thermostat down 1 °C, what do I save?** (`/whatif`)
4. **Am I using more or less than similar units?** (`/peers`)

Plus an operational endpoint:

5. **Which units' usage patterns have structurally changed?** (`/drift`)

Under the hood it is a four-layer forecasting stack (L0–L3), trained once on 1 year of unit-day consumption records and served via lazy artifact loading. The L2 point forecaster hits **MAE 4.35 kWh/day / MAPE 3.7 % at a 30-day horizon**; conformal-calibrated quantile bands now cover **~0.80** on held-out folds (up from 0.69 pre-calibration).

---

## 2. What was added this session

The previous session left the engine functionally complete but with four gaps. All of them were closed.

| Gap | Fix | Files |
|---|---|---|
| `pd.fillna(method="ffill")` would raise on pandas ≥ 2.x on the hot `/forecast` path | Replaced with `.ffill()` | [src/techem/serve/api.py:195](../../src/techem/serve/api.py#L195) |
| Four endpoints (`/forecast`, `/drilldown`, `/whatif`, `/peers`, `/drift`) were defined but never end-to-end verified | Smoke-tested via `curl` against a running uvicorn; all return 200 with well-formed JSON. Confirmed the what-if sign is correct (−1 °C → −227 kWh savings) | — |
| Quantile band coverage was **0.687** vs a nominal 0.80 target — bands were narrower than advertised | Added **asymmetric split-conformal** calibration: per-horizon δ_lo / δ_hi computed on blocked-CV residuals, persisted to disk, applied at inference. Coverage now **0.796**. | [src/techem/models/l2_quantile.py](../../src/techem/models/l2_quantile.py), [scripts/train.py](../../scripts/train.py), [src/techem/serve/api.py](../../src/techem/serve/api.py), new artifact `models/artifacts/l2_conformal.json` |
| No test that the resilience layer actually works with the network down | New test file with 4 cases (mock fixtures present, geocode falls back, weather falls back, `/forecast?use_live_weather=true` still returns 200 under monkeypatched failure) | [tests/test_offline_resilience.py](../../tests/test_offline_resilience.py), `httpx` added to [requirements.txt](../../requirements.txt) |
| Reconciler was hard-coded to proportions with no hook for MinT | Added `RECONCILE_METHOD` config flag and a `reconcile()` dispatch. MinT path is stubbed with an honest `NotImplementedError` explaining it needs per-room forecasters we don't build yet — the hook is in place for future work. | [src/techem/config.py](../../src/techem/config.py), [src/techem/models/l0_reconcile.py](../../src/techem/models/l0_reconcile.py) |
| Ablation script crashed on Windows cp1252 and didn't persist output | Fixed the unicode bug (`Δ` → `d`), added markdown export to [reports/ablation.md](../../reports/ablation.md) | [scripts/ablation.py](../../scripts/ablation.py) |

**Test count went from 6/6 to 10/10.**

The one-year dataset caveat (2019-12 → 2020-12, not the ~5 years the brainstorm assumed) is unchanged — it remains a framing note for the pitch, not a code issue.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  L3  Tenant online updater                                        │
│       Per-unit EWMA of L2 residuals (span = 30 days)              │
│       Added to p50 at inference; state in l3_state.json           │
├──────────────────────────────────────────────────────────────────┤
│  L2  Unit-level forecaster      <-- the hero                      │
│       • LightGBM Tweedie (point estimate, zero-inflation safe)    │
│       • 3× LightGBM Quantile (0.1 / 0.5 / 0.9)                    │
│       • Weather-noise injection during training (horizon-scaled)  │
│       • Split-conformal widening applied at inference            ★│
├──────────────────────────────────────────────────────────────────┤
│  L1  Peer baseline / cold-start                                   │
│       LightGBM Tweedie on typology features (source, m², n_rooms) │
│       For units not in the training set — not used in the hot path│
├──────────────────────────────────────────────────────────────────┤
│  L0  Hierarchical reconciliation                                  │
│       Bottom-up proportions (shares × unit forecast)              │
│       MinT dispatch stubbed pending per-room L2                  ★│
└──────────────────────────────────────────────────────────────────┘
       ★ = touched / added this session
```

The crossing-cut adjacencies matter:
- L2 produces the number everything else derives from.
- L3 is the only layer that changes at inference based on recent residuals — it's the "learns over time" story.
- L0 converts unit kWh into per-room kWh for the drill-down.
- L1 exists so the pitch can honestly claim the system works for brand-new units without history.

---

## 4. Request flow, end to end

### `/forecast/unit/{pid}/{uid}?horizon_days=30&use_live_weather=false`

1. **Load history** for the unit ([src/techem/serve/api.py:146](../../src/techem/serve/api.py#L146) `_unit_row`).
2. **Build a future frame** of `horizon_days` dated rows ([src/techem/serve/api.py:153](../../src/techem/serve/api.py#L153) `_future_frame`). Outside temperatures come from:
   - Meteostat forecast via `weather_forecast()` if `use_live_weather=true` (goes through the `@resilient` cache + fallback)
   - Otherwise: same-day-of-year lookup from history, falling back to last observed temperature.
3. **Stitch history + future** and run the full feature pipeline so lag features at the boundary are correct ([src/techem/features/engineering.py](../../src/techem/features/engineering.py)).
4. **Score**:
   - `p50 = L2_tweedie(X)` for the point estimate
   - `q10 = L2_q10(X)`, `q90 = L2_q90(X)` for the raw band
5. **Widen the band** using the conformal deltas (`apply_conformal`) — picks the smallest horizon bucket ≥ h for each future day, widens `q10` down by `δ_lo` and `q90` up by `δ_hi`.
6. **Add the L3 residual** (per-unit EWMA) to the point estimate.
7. **Convert** to €/kWh and gCO₂/kWh using the unit's source (default tables in [src/techem/config.py](../../src/techem/config.py) override to the per-row factor when the CSV has one).
8. **Return** the full daily series plus totals plus a `drivers` dict that explains what influenced the forecast.

### `/drilldown/unit/{pid}/{uid}`
Calls `forecast_unit` internally, then multiplies the unit total by per-room historical shares (180-day lookback). Invariant: Σ rooms == unit (enforced by `check_reconciliation_invariant` in tests).

### `/whatif/unit/{pid}/{uid}` (POST)
Body: `{room_id?, temp_delta_c, horizon_days, use_live_weather}`. Computes the counterfactual by the **per-room β** method: each room has a Huber-regressed `∂kWh / ∂HDD` coefficient fit offline. The delta is `β × Δ(HDD caused by Δ temp)` summed across the horizon — causal-by-construction because HDD is an exogenous driver, not a correlational confound.

### `/peers/{pid}/{uid}`
Defines a cohort as units with same source, same city, and living space within ±20 %. Returns the percentile rank (`% of cohort with higher average daily kWh than me`).

### `/drift?property_id=..&unit_id=..`
Runs a two-sample KS test on L2 residuals: 30-day recent window vs 120-day baseline. Flags each unit where p < 0.01 as a structural-break event. Useful for the "something changed — broken window? new pet?" UX prompt.

### `/health`, `/units`
Trivial liveness and catalog endpoints.

---

## 5. Features (35 columns fed to L2)

Grouped the way the ablation reports them:

| Group | Columns | Why it matters (per ablation) |
|---|---|---|
| **lags** | `kwh_lag1`, `kwh_lag_roll1/3/7` | **Dominant**. Removing them: +73.9 % MAE |
| **weather** | `outside_temp`, `temp_roll1/3/7` | Second-most important. Removing: +28.8 % MAE |
| **hdd** | `hdd_12`, `hdd_15`, `hdd_18` | Small marginal lift (+1.4 %) — weather features subsume most of it |
| **unit_attrs** | `unit_livingspace`, `unit_n_rooms` | Rollup features for per-unit normalization (+1.2 %) |
| **calendar** | `dow`, `is_weekend`, `month_sin/cos`, `doy_sin/cos` | **Unexpected**: ablation shows −4.4 % without them. Within CV noise but worth re-examining |
| **categorical** | `source`, `city`, `zipcode`, `property_id`, `unit_id` | Passed to LightGBM as native categoricals |
| **zero flags** | summer-usage binary + `kwh_is_zero` | Helps Tweedie handle the zero-inflated summer tail |

Full list: [src/techem/features/engineering.py](../../src/techem/features/engineering.py) `FEATURE_COLUMNS` + `CATEGORICAL_COLUMNS`.

The ablation artifact is at [reports/ablation.md](../../reports/ablation.md) and is the jury-facing evidence that the feature choices earn their place.

---

## 6. External data & the resilience layer

Two live, keyless sources are wired up ([src/techem/data/external.py](../../src/techem/data/external.py)):

- **pgeocode** for zipcode → lat/lon
- **Meteostat** for daily temperature history + short-range forecast

Both go through [`@resilient`](../../src/techem/serve/resilience.py), which:
1. Checks a disk cache (`data/cache/http`, TTL 6 h for weather, 30 days for geocode).
2. Calls the live API on miss.
3. On any exception — network error, library import failure, empty result — falls back to bundled JSON at `data/external/mock_weather.json` / `mock_geocode.json`.
4. Caches the live result for next time.

**Why this matters:** the #1 avoidable hackathon disaster is a live Meteostat timeout during the demo. With the resilience layer, pulling the network cable keeps the API returning sensible responses. This is now covered by four dedicated tests in [tests/test_offline_resilience.py](../../tests/test_offline_resilience.py).

---

## 7. Data pipeline

```
data/properties/*.csv       (20 raw CSVs, room × day × source, ~405k rows)
        │  scripts/consolidate_data_if_stale.sh  (actually: scripts.train does this lazily)
        ▼
data/processed/consumption.parquet   (405k rows, room-level, long format)
        │  groupby(property, unit, date).sum
        ▼
data/processed/unit_daily.parquet    (84,661 rows, unit × day)
        │  build_feature_frame()
        ▼
in-memory feature frame              (84,661 rows × 35 columns)
        │  blocked time-series CV (6 folds) + final fit on all data
        ▼
models/artifacts/*.lgb + l2_conformal.json + l3_state.json
```

Consolidation is idempotent and cached — `scripts.train` only rebuilds the parquets if they're missing.

---

## 8. Artifacts on disk

| Path | What it is | Producer |
|---|---|---|
| `data/processed/consumption.parquet` | Room-level long-format consumption | `scripts.audit` / `scripts.train` |
| `data/processed/unit_daily.parquet` | Unit-level daily aggregates | `scripts.train` |
| `data/processed/room_sensitivities.parquet` | Per-room β coefficient for what-if | `scripts.train` (via `fit_room_sensitivities`) |
| `data/external/mock_weather.json` | Offline-fallback temperature series | auto-created on first startup |
| `data/external/mock_geocode.json` | Offline-fallback geocode | auto-created on first startup |
| `models/artifacts/l2_tweedie.lgb` | Point forecast booster | `scripts.train` |
| `models/artifacts/l2_q{10,50,90}.lgb` | Quantile boosters | `scripts.train` |
| `models/artifacts/l2_conformal.json` | **New.** Per-horizon conformal widenings | `scripts.train` |
| `models/artifacts/l1_baseline.lgb` | Cold-start peer model | `scripts.train` |
| `models/artifacts/l3_state.json` | Per-unit EWMA residuals | `scripts.train` |

---

## 9. How to run

```bash
# One-off (first time or after data / code changes)
source .venv/Scripts/activate
python -m scripts.audit         # optional: data diagnostic
python -m scripts.train         # builds every artifact under models/artifacts/
python -m scripts.ablation      # feature ablation -> reports/ablation.md  (~10 min)
python -m pytest tests/ -q      # 10 tests

# Serve (frontend hits this)
uvicorn techem.serve.api:app --host 127.0.0.1 --port 8765 --app-dir src
```

Quick sanity-check once the server is up:

```bash
curl "http://127.0.0.1:8765/health"
curl "http://127.0.0.1:8765/forecast/unit/1/1?horizon_days=14"
curl "http://127.0.0.1:8765/peers/1/1"
curl -X POST "http://127.0.0.1:8765/whatif/unit/1/1" \
     -H "Content-Type: application/json" \
     -d '{"temp_delta_c":-1.0,"horizon_days":30,"use_live_weather":false}'
```

---

## 10. Honest caveats (the stuff the jury might ask)

- **One year of data.** Dataset spans 2019-12 → 2020-12. The 10-year-learning-contract is a pitch framing, not an empirical demonstration. A future year would let us show the decay of the L3 residual over time, which is currently not demo-able.
- **Post-conformal coverage is 0.796, not exactly 0.80.** Finite-sample slack. Good enough for calibrated bands; a larger calibration set would tighten it.
- **MinT not actually used.** The config flag is in place and `l0_reconcile.reconcile()` dispatches to it, but the implementation raises because we only produce unit-level forecasts — MinT needs at least two levels to reconcile. Building a per-room L2 is the prerequisite, not plugging in a library.
- **Drift detector fires 135 of 275 units.** That's the small-dataset ratio talking (120-day baseline / 30-day recent is aggressive for 1 year of data). Production thresholds (`baseline_days=180, recent_days=60, p_threshold=1e-3`) would fire far less; see the snippet in the handoff.
- **Windows cp1252 gotcha.** Non-ASCII characters in `print()` break on Windows. The existing scripts are ASCII-safe; if you add new prints, keep them that way.
- **`n_rooms` jitters day-to-day** for a few units. Feature engineering takes the median. If you see per-room drill-downs where the room count looks wrong, that's the source.

---

## 11. What's NOT done (still queued)

These are Priority-3 nice-to-haves from the continuation plan:

- **Tabula / Zensus typology priors.** Placeholders exist in `external.py`; the static JSON / CSV files aren't bundled. Shipping them lets L1 cold-start for units not in the training data.
- **L3 shadow mode on `/forecast`.** A `?shadow=true` flag that returns `L2` vs `L2+L3` side-by-side would be a compelling "it learns over time" demo.
- **Live electricity emission factors.** The pipeline honors the static factor from the CSV; a live Electricity Maps feed for electricity-sourced rows is deferred (requires signup).

Everything else on the original plan is live, tested, and serving.
