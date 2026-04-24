# Tenant-facing features: chatbot, recommendations, target solver, today, peers++, leaks

## Context

This is a Techem hackathon project — a FastAPI backend that forecasts per-unit heating consumption using a 4-layer ML stack (L0–L3), with daily granularity data from 2019-12 to 2020-12 across 20 properties / 275 units. Existing endpoints (`/forecast`, `/drilldown`, `/whatif`, `/peers`, `/drift`) are technically solid but operator-oriented. The hackathon pitch needs a **tenant-facing** story: a resident opens the app and sees useful, interactive, actionable insights. This plan adds six tenant-facing features and the LLM glue that makes them conversational.

Key constraints derived from exploration:
- **No sub-daily data** — "today so far" must be synthesized from a diurnal curve on top of today's forecast.
- **No auth** — tenant is identified by `(property_id, unit_id)` in the path, matching existing endpoints.
- **Room-level `β_hdd` sensitivities already exist** in `room_sensitivities.parquet` — the key primitive for both recommendations and leak detection.
- **"Today" = latest date in the dataset** (2020-12-something), per user decision. Demo-honest; no fake live clock.
- **Recommendations = hybrid**: algorithm finds actions, Gemini rewrites them in friendly language.
- **Target = pure-LLM with tool access**: Gemini calls `/forecast`, `/whatif`, `/drilldown` and reasons.
- **Leaks = all four signals fed to Gemini** for reasoning.

## Deliverables

Six new or enhanced endpoints, one new `techem.llm` package, three new models modules, and a config addition for the Gemini API key.

### Endpoint summary

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `POST /chat/{pid}/{uid}` | Conversational tenant assistant (Gemini + tool calls) |
| 2 | `GET /recommendations/{pid}/{uid}` | Ranked savings actions (algo + LLM narration) |
| 3 | `POST /target/{pid}/{uid}` | User sets a monthly € or kg-CO₂ target; LLM returns plan |
| 4 | `GET /today/{pid}/{uid}` | Consumption / cost / CO₂ so far today |
| 5 | `GET /peers/{pid}/{uid}` (enhance) | Richer cohort metrics with badges and fun facts |
| 6 | `GET /leaks/{pid}/{uid}` | Four-signal leak/anomaly detector with LLM explanation |

---

## 1. LLM foundation (`src/techem/llm/`)

**New package**, wraps Google's Gemini SDK with our internal tools.

Files:
- [src/techem/llm/__init__.py](src/techem/llm/__init__.py)
- [src/techem/llm/gemini.py](src/techem/llm/gemini.py) — client factory + tool-call loop
- [src/techem/llm/tools.py](src/techem/llm/tools.py) — function declarations bound to internal helpers (not HTTP self-calls)
- [src/techem/llm/prompts.py](src/techem/llm/prompts.py) — system prompts

**Tools exposed to the model** (each is a thin wrapper around existing internals — we call Python functions directly, not HTTP, to keep latency low):
- `get_forecast(horizon_days)` → reuses the code path inside [src/techem/serve/api.py](src/techem/serve/api.py) `/forecast` handler.
- `get_drilldown(horizon_days)` → reuses `/drilldown` handler.
- `what_if(temp_delta_c, room_id?, horizon_days)` → reuses `/whatif` handler.
- `get_peers()` → reuses `/peers` handler.
- `get_today()` → from section 4 below.
- `get_leak_signals()` → from section 6 below.
- `get_recommendations()` → from section 2 below (for `/chat` and `/target` to call).

**Tenant context injection**: every Gemini call is pre-bound to `(property_id, unit_id)`; tools don't accept those params from the model — prevents the LLM from asking about neighbors' data.

**Dependency**: add `google-generativeai` to [requirements.txt](requirements.txt). Default model: `gemini-2.5-flash` (fast + cheap + tool-calling). Override via env.

**Config** ([src/techem/config.py](src/techem/config.py)):
- `GEMINI_API_KEY` from env (no default; endpoints return 503 if missing so non-LLM features still work offline).
- `GEMINI_MODEL = "gemini-2.5-flash"`.
- `LLM_MAX_TOOL_ITERATIONS = 6`.

---

## 2. `GET /recommendations/{pid}/{uid}` — hybrid savings engine

**Algorithmic core** ([src/techem/models/recommendations.py](src/techem/models/recommendations.py), new):
1. Load per-room `β_hdd` from [data/processed/room_sensitivities.parquet](data/processed/room_sensitivities.parquet).
2. Compute the **monthly €/°C** and **kg-CO₂/°C** saving for each room using emission/price factors from `config.SOURCE_FACTORS` (already used in [serve/api.py:251](src/techem/serve/api.py)).
3. Rank rooms by absolute saving, filter out negligible (< 2 € / month).
4. Add non-setpoint actions from simple rules:
   - If `is_weekend` baseline > weekday → "you use more on weekends, consider scheduling".
   - If summer `is_zero` flag rate high but one room keeps usage → "flag standby heating".
   - High `β_hdd` relative to cohort → piggy-back on leak detector (section 6) to add "insulation check" reco.
5. Return a list of `Recommendation {action, room_id?, monthly_eur_saving, monthly_co2_g_saving, confidence, source}`.

**LLM layer** ([src/techem/llm/prompts.py](src/techem/llm/prompts.py)):
- System prompt: "You are a friendly home-energy coach. Rewrite these machine-generated actions as 3–5 tenant-friendly bullets. Never invent numbers."
- Feed the structured list + unit metadata (m², source, city).
- Output schema enforced via Pydantic: `{items: [{title, body, saving_eur, saving_co2_kg, difficulty}]}`.

**Endpoint**: `GET /recommendations/{pid}/{uid}?horizon_days=30` → `RecommendationsResponse`. Works without Gemini: if `GEMINI_API_KEY` missing, returns the raw algo output with generic titles.

---

## 3. `POST /target/{pid}/{uid}` — target-driven plan

**Input** (new Pydantic model in [serve/api.py](src/techem/serve/api.py)):
```json
{ "target_value": 70, "target_unit": "EUR" | "KG_CO2", "horizon_days": 30 }
```

**Flow**:
1. Call internal forecast to get the **projected monthly cost / CO₂** (`p50`, plus `q10`/`q90` for uncertainty framing).
2. Compute `gap = projected - target`.
3. Hand over to Gemini (per user's pure-LLM choice for this endpoint) with:
   - Projected value and bands.
   - Target and gap (positive = need to save; negative = target already met, suggest stretch goals).
   - Room drilldown shares.
   - Tools available: `what_if`, `get_peers`, `get_recommendations`.
4. System prompt instructs it to produce a concrete plan: what to change, expected saving per action, whether target is realistic, and if not, the closest achievable number.

**Response**: `{ feasible: bool, projected, target, gap, plan_narrative, actions: [{action, expected_saving, source}] }` — the `actions` array is populated from tool-call outputs, so numbers are grounded even though the plan is LLM-written.

---

## 4. `GET /today/{pid}/{uid}` — today so far

**Problem**: data is daily; there is no "till now" reading.

**Approach** ([src/techem/models/today.py](src/techem/models/today.py), new):
1. Define `today = max(date)` from the unit's history — the last date we have actuals for.
2. Run the 1-day forecast for `today + 1` (next-day projection → used as "today's forecast" for the demo framing). Actually simpler: use the actual `today` row as the full-day value, since we *have* the reading. Run the forecast only for `today + 1 .. today + N` for future-looking features.
3. For "till now" scaling, use a **diurnal curve** from literature for German residential heating (peaks at 07:00 and 19:00). Store as a 24-element normalized array in [src/techem/data/diurnal_curve.json](src/techem/data/diurnal_curve.json) (bundled, no external dep).
4. `hour = datetime.now().hour` (real wall-clock hour — this is the one "live" element).
5. `fraction_so_far = sum(curve[0:hour+1]) / sum(curve)`; `kwh_so_far = today_total_kwh * fraction_so_far`.
6. Convert to € and g CO₂ via `config.SOURCE_FACTORS`.

**Response**:
```json
{
  "date": "2020-12-28",
  "as_of_hour": 14,
  "kwh_so_far": 8.3, "kwh_full_day": 14.1,
  "cost_eur_so_far": 0.91, "cost_eur_full_day": 1.55,
  "co2_g_so_far": 1670, "co2_g_full_day": 2830,
  "vs_yesterday_pct": -4.2,
  "vs_same_weekday_avg_pct": +2.1
}
```

The yesterday/weekday comparisons come from `_unit_daily()` (already cached in [serve/api.py:49](src/techem/serve/api.py)).

---

## 5. `GET /peers/{pid}/{uid}` — enhanced cohort view

**Enhance existing endpoint** in [src/techem/serve/api.py:337](src/techem/serve/api.py). Keep the current cohort definition (±20 % m², same source, same city) but expand the response.

**New module** [src/techem/models/peers_extended.py](src/techem/models/peers_extended.py):
- `percentile_rank` (already exists) → add a **badge** derived from it: `{Top 10%: "Eco Champion", Top 25%: "Efficient", Mid: "Typical", Bottom 25%: "Headroom to save"}`.
- `vs_median_pct` — how much more/less than the cohort median.
- `monthly_eur_vs_peers` / `monthly_co2_g_vs_peers` — signed delta.
- **Fun equivalents** (client-side material): CO₂ saved vs cohort average translated to `trees_equivalent` (1 tree ≈ 21 kg CO₂/yr), `km_driven_equivalent` (1 kg CO₂ ≈ 5 km in avg car), `phone_charges_equivalent` (1 kWh ≈ 125 charges). These are constants in [config.py](src/techem/config.py).
- `trend_30d` — percentile now vs percentile 30 days ago (slope + direction arrow).
- `cohort_best_practice_hint` — if bottom 50 %, compute what the top-10% unit in the cohort uses per m² and return the delta as an aspirational target.

Response fields (extension, backward compatible):
```
cohort_size, cohort_definition, percentile_rank_better_than,   (existing)
badge, vs_median_pct, monthly_eur_vs_peers, monthly_co2_g_vs_peers,
trend_30d_percentile_delta, equivalents: {trees, km_driven, phone_charges},
aspirational_target_kwh_per_m2, aspirational_saving_eur
```

---

## 6. `GET /leaks/{pid}/{uid}` — four-signal anomaly engine

**New module** [src/techem/models/leaks.py](src/techem/models/leaks.py). Produces structured signals; Gemini reasons over them.

### Signal A — Abnormal `β_hdd` (insulation proxy)
- For each room of the unit, look up `β_hdd` in `room_sensitivities.parquet`.
- Compute **cohort z-score** of `β_hdd` within the same peer cohort (section 5).
- If `z > 2`, emit `{kind: "high_temp_sensitivity", room_id, z, likely_cause: "window/insulation"}`.

### Signal B — Weather-controlled residual anomalies
- Pull last 30 days of residuals from `l3_state.json` / recompute via L2.
- Flag days where `residual > 3 * mad` (median absolute deviation) → emit `{kind: "unexpected_spike", date, residual_kwh, context: "not explained by weather"}`.
- Cluster consecutive flagged days → "ongoing issue" flag.

### Signal C — Room-vs-peers share anomaly
- Compute last-14-day room share via `l0_reconcile.proportions()` (already existing in [src/techem/models/l0_reconcile.py](src/techem/models/l0_reconcile.py)).
- Compare to the unit's 180-day historical share; flag rooms where current share deviates by > 2× historical stdev.
- Emit `{kind: "room_share_drift", room_id, historical_share, current_share}`.

### Signal D — Flatline / stuck sensor
- Scan the last 14 days per room for:
  - All identical non-zero values (stuck reading), OR
  - All zero during a cold period (`HDD_15 > 5` avg) — device likely down, not a real zero.
- Emit `{kind: "sensor_suspect", room_id, pattern: "flatline" | "zero_in_cold"}`.

### Orchestration
- Module entry-point `detect_all(property_id, unit_id) -> LeakReport` runs A/B/C/D and returns the structured list.
- Endpoint `/leaks/{pid}/{uid}` returns both:
  - `raw_signals` (the structured list, always present).
  - `narrative` (Gemini turns the signals into a 3-paragraph tenant-readable explanation: what's likely wrong, why we think so, what to do). If Gemini key missing, `narrative` is `null`.
- The same `detect_all()` is registered as a tool for the chatbot (section 1).

---

## Registration / wiring

All new endpoints and models are wired in [src/techem/serve/api.py](src/techem/serve/api.py):
- Import the three new model modules at module top (lazy-load their artifacts via `lru_cache` like the existing loaders).
- Add the new Pydantic response models alongside `ForecastResponse` et al.
- Add six new route handlers.
- Gemini client is lazy-initialized on first chat/reco/target/leak-narrative call and cached.

No breaking changes to existing endpoints (the `/peers` change is additive).

---

## Critical files (touched)

- [requirements.txt](requirements.txt) — add `google-generativeai`.
- [src/techem/config.py](src/techem/config.py) — Gemini key/model, equivalents constants.
- [src/techem/serve/api.py](src/techem/serve/api.py) — new endpoints, enhance `/peers`.
- [src/techem/llm/__init__.py](src/techem/llm/__init__.py) *(new)*
- [src/techem/llm/gemini.py](src/techem/llm/gemini.py) *(new)*
- [src/techem/llm/tools.py](src/techem/llm/tools.py) *(new)*
- [src/techem/llm/prompts.py](src/techem/llm/prompts.py) *(new)*
- [src/techem/models/recommendations.py](src/techem/models/recommendations.py) *(new)*
- [src/techem/models/today.py](src/techem/models/today.py) *(new)*
- [src/techem/models/peers_extended.py](src/techem/models/peers_extended.py) *(new)*
- [src/techem/models/leaks.py](src/techem/models/leaks.py) *(new)*
- [src/techem/data/diurnal_curve.json](src/techem/data/diurnal_curve.json) *(new, static)*
- [tests/test_tenant_endpoints.py](tests/test_tenant_endpoints.py) *(new)*

## Reused existing code

- `SOURCE_FACTORS` for €/CO₂ conversion — [src/techem/config.py](src/techem/config.py).
- `peer_percentile()` — [src/techem/models/l1_baseline.py:64](src/techem/models/l1_baseline.py).
- Cohort definition block — [src/techem/serve/api.py:348](src/techem/serve/api.py).
- `_unit_daily()`, `_features()`, `_consumption()` loaders — [src/techem/serve/api.py:49](src/techem/serve/api.py).
- `proportions()` reconciliation — [src/techem/models/l0_reconcile.py](src/techem/models/l0_reconcile.py).
- Drift residual logic — [src/techem/models/drift.py](src/techem/models/drift.py) (used by Signal B).
- `@resilient` decorator — [src/techem/serve/resilience.py](src/techem/serve/resilience.py) (wrap the Gemini call too, so the API survives if Google rate-limits us during the demo).

---

## Verification

1. **Unit tests** ([tests/test_tenant_endpoints.py](tests/test_tenant_endpoints.py)) — use FastAPI `TestClient`:
   - `/today` returns non-zero `kwh_so_far < kwh_full_day` at hour 14.
   - `/recommendations` returns ≥ 1 item with positive `monthly_eur_saving`.
   - `/target` with a tight target returns `feasible=false` + plan; with a loose target returns `feasible=true`.
   - `/peers` returns a badge in the expected set.
   - `/leaks` returns the four-signal shape; injects a synthetic flatline into mock data to force Signal D.
   - All LLM-dependent endpoints run in a mode where `GEMINI_API_KEY` is unset → assert graceful fallback (no 500s, `narrative=null`).

2. **Live smoke** — run `uvicorn techem.serve.api:app` and `curl` each endpoint for `property_id=1, unit_id=1`. Paste a few responses into the pitch deck.

3. **LLM smoke** — with a real `GEMINI_API_KEY` in env, hit `/chat/1/1` with "why did I use more heat this week than last?" and confirm the model calls `get_today`, `get_leak_signals`, and responds coherently.

4. **Offline resilience** — run the existing [tests/test_offline_resilience.py](tests/test_offline_resilience.py) plus one new test that kills Gemini (patch to raise) and verifies `/leaks` still returns `raw_signals`.

---

## Open items to confirm during implementation

- Exact Gemini model name — planning on `gemini-2.5-flash`; swap if your key is tied to a different tier.
- Whether the chatbot needs **multi-turn history** persisted between HTTP calls. First pass: stateless (client sends the whole thread). If the frontend needs session-based state, add Redis or an in-memory dict later.
- Streaming responses — first pass is non-streaming JSON. Upgrade to SSE if demo UX needs it.
