# Brainstorm — Prediction Engine + Tenant UX

> Working notes. Goal: a forecasting platform that is (a) accurate enough to trust, (b) self-explaining to a non-technical tenant, and (c) compounding — it gets smarter over a 10-year contract by learning that specific household.

---

## 1. Starting point: what the CSV actually gives us vs. what we wish it gave us

### 1.1 What's in the data (confirmed from `data/properties/property_*.csv`)

Per row, daily granularity:

| Column | Type | Notes |
|---|---|---|
| `date` | daily | ~5 yrs of history (2019-12 onward), 20 properties, ~400k rows |
| `zipcode`, `city` | geo | proxy for climate zone + regional building stock |
| `energysource` | categorical | in the sample almost entirely `Erdgas` (natural gas) |
| `energyusage [kWh]` | target | per room per day |
| `livingspace [m²]` | property attr | per unit |
| `mean outside temperature [°C]` | exogenous | daily mean only — no intraday |
| `roomnumber` | id | row is per-room — not per-unit |
| `emission factor [g/kWh]` | multiplier | source-dependent |
| `unitnumber` | id | flat within the building |

### 1.2 What's missing (this is the interesting part)

The user's wishlist of features — occupancy count, building age, insulation class, boiler efficiency, room setpoint behavior, window quality, floor position — is **not in the CSV**. We have three options, and the smart platform uses all three:

1. **Ask the tenant once** via onboarding (see §5.3). Anything we ask gets used for benchmarking immediately.
2. **Infer from the data we do have**, via unsupervised features (see §3).
3. **Enrich from external sources** keyed on zipcode / coordinates (see §2).

This framing — "we'll start with what you're comfortable sharing, infer the rest, get better each month" — is also the UX hook. It turns a data gap into an engagement loop.

---

## 2. External data enrichment (keyed on zipcode / lat-long)

The CSV has `zipcode` + `city` for every row. That unlocks a lot:

| Source | What it gives us | How we use it |
|---|---|---|
| **Meteostat / DWD** | Hourly temp, humidity, wind, solar radiation, cloud cover | HDD, forecast horizon up to 14 days, solar gain proxy |
| **Zensus 2022 (DE)** | Avg household size per zipcode, % of buildings by age band, ownership rates | Prior for household size if the tenant doesn't tell us |
| **BBSR building-typology** | German residential building typology (EFH/MFH, construction era, typical U-values) | Prior for insulation class |
| **Tabula/Episcope** | Energy reference values per building era × type | Benchmark "what a typical 1970s MFH in this climate zone should consume" |
| **Netztransparenz / ENTSO-E** | Grid mix + real emission factor for electricity | Dynamic CO2, not a static number |
| **Gas/heat tariff feeds** | €/kWh trajectory, futures curve | Cost forecast with uncertainty bands |
| **Elevation (SRTM / Open-Elevation)** | m above sea level | Temperature adjustment per tech spec |
| **Sun path (pvlib)** | Azimuth, daylight hours | Passive solar contribution estimate |

Keying everything off `zipcode` means we can offer **"vs. peers in your area with the same m²"** from day one, no tenant input required.

---

## 3. Feature engineering — the deep dive

### 3.1 Per-row engineered features (cheap, high-value)

- **HDD / CDD** (heating/cooling degree days), base 15°C and 18°C variants — HDD is the single strongest predictor for heating.
- **Temperature lag windows** (1d, 3d, 7d rolling means) — thermal mass of the building means yesterday's cold still matters.
- **Normalized intensity**: `kWh / m²` — required for cross-property comparability.
- **Per-HDD intensity**: `kWh / (m² · HDD)` — a building's *efficiency signature*. Flat lines across winter = efficient. Spiky = leaky.
- **Day-of-week + holiday flags** — weekend vs weekday behavior reveals occupancy patterns.
- **Month / season** + harmonic (sin/cos) encoding — avoids the Jan-1 → Dec-31 discontinuity trees struggle with.
- **Solar day-length** — correlates with both heating need and tenant daylight behavior.

### 3.2 Inferred (latent) features — where a 10-year contract pays off

None of these require the tenant to fill a form. They emerge from the data itself:

- **Thermal signature** = slope of (kWh/m²) vs HDD, per room. Separates the *building* (fixed slope baseline) from the *tenant* (offset + variance).
- **Setpoint proxy**: the outdoor temperature at which a room first hits zero usage. Low threshold (~12°C) = tenant tolerates cool. High (~18°C) = comfort-prioritizer.
- **Behavioral archetype** (K-Means on daily shape): "Constant Heater", "Night Dropper", "Weekend Away", "Cold Sleeper", "Holiday Shut-down".
- **Room usage classification**: a low-variance, low-mean room is probably a bathroom; high-variance with evening peaks = living room; flat with morning spike = kitchen. We don't need labels; the model can use the cluster id.
- **Building envelope quality**: residuals of a temperature-only model. If a unit's usage is consistently *higher* than temperature predicts for its floor/position, the envelope is leaky.
- **Thermal inertia**: how many days of usage a cold snap takes to normalize. Heavy masonry ≠ lightweight retrofit.
- **Anomaly score**: deviation from the tenant's own rolling baseline. Separate "good anomaly" (vacation, reduced) from "bad" (leak, stuck valve, broken window).

### 3.3 Features we *ask* for — bare minimum, maximum payoff

Every onboarding question should unlock visible value. Limit to what moves the model most:

1. **How many people live here?** (drives DHW share, occupancy hours)
2. **Roughly when was the building built?** (era → Tabula typology → insulation prior)
3. **Which rooms do you use most in the evening?** (validates room-classification clusters)
4. **Do you work from home?** (flattens the weekday dip)
5. **Any recent upgrades?** (windows, boiler, insulation — these create structural breaks the model needs to know about)

Answers 1–2 alone let us replace the zipcode-level prior with a household-level one, which is usually a big accuracy win.

---

## 4. Modeling strategy

### 4.1 Layered architecture (not one model — three)

```
    ┌─────────────────────────────────────────────┐
    │  L3  Tenant-level online learner (per unit) │  — adapts over 10 yrs
    ├─────────────────────────────────────────────┤
    │  L2  Building-level batch model             │  — thermal signature, envelope
    ├─────────────────────────────────────────────┤
    │  L1  Climate-zone / typology baseline       │  — peer benchmarks, cold-start
    └─────────────────────────────────────────────┘
```

- **L1 (baseline)**: gradient boosted on (zipcode cluster, building era, m², HDD, source, month). Purpose: cold-start any new tenant, drive peer comparisons.
- **L2 (building)**: per-property residuals from L1. Captures envelope quality — usable even if the tenant churns, because it's about the unit not the person.
- **L3 (tenant)**: a lightweight online model (e.g. Bayesian updating on top of L1+L2, or a small LSTM fine-tuned per unit). This is what learns "Amine leaves for Tunisia every February and the kitchen radiator is broken".

### 4.2 Concrete model choices (not one, a ladder)

| Stage | Model | Why |
|---|---|---|
| Day-0 baseline | **LightGBM / XGBoost** on tabular features | Beats LSTMs on sparse tabular with <1M rows; trains in seconds |
| Seasonal accuracy | **Prophet or NeuralProphet** per unit | Handles yearly + weekly seasonality with interpretable components |
| Long-horizon | **Temporal Fusion Transformer (TFT)** | Attention over static + known-future + unknown-past; gives per-feature importance out of the box → feeds explanations |
| Online adaptation | **Bayesian ridge / Kalman filter on TFT residuals** | Cheap per-tenant update, doesn't need retraining the TFT |

Start with LightGBM + Prophet. Only climb the ladder if results plateau. A well-tuned LightGBM with HDD, lags, and tenant one-hot often matches an LSTM and is 100× faster to iterate on.

### 4.3 Where the accuracy actually comes from

In this kind of problem, people over-invest in model choice and under-invest in the three things that actually move the error bars:

1. **HDD with the right base temperature** (try 12°C, 15°C, 18°C per property — not one global value).
2. **Temperature forecast quality**, not historical temp. A perfect model on bad weather input is worse than a mediocre model on good weather input.
3. **Detecting structural breaks** (tenant change, boiler swap, new windows). Most "model drift" is actually an un-modeled event. A simple changepoint detector on residuals prevents the model from silently getting worse.

### 4.4 The 10-year learning loop

A contract runs 10 yrs. Design for that explicitly:

- **Memory**: per-unit model state persists across years. Don't retrain from scratch each season.
- **Confidence improves**: show wider prediction intervals in year 1, tighter in year 3. The UI should expose this — "we're 80% sure now vs 95% sure after next winter".
- **Delta tracking**: every major tenant-visible forecast gets logged with its actual outcome. Calibration plots become a trust artifact.
- **Drift alarms**: if year-over-year residuals shift > threshold, flag to the tenant ("something changed — was it a new appliance, more people, a renovation?") and let them confirm. Their answer trains the structural-break detector.

---

## 5. UX — "conscious tenant" design

### 5.1 Guiding principle

Every chart must answer *three* questions at a glance:

1. **Am I doing okay?** (status: green / yellow / red)
2. **Compared to what?** (peer benchmark same zipcode + m² + household size)
3. **What should I do?** (one concrete action, not a paragraph)

If a chart doesn't answer all three, it's decoration.

### 5.2 Dashboard modules (concrete)

1. **"Where you stand today"** — single-glance card. This month's kWh, € and CO₂, with a peer percentile ("you're in the top 30% most efficient flats like yours"). One sentence verdict.
2. **Forecast ribbon** — next 7 / 30 / 365 days projection with uncertainty band. Hover shows which driver (weather, pricing, behavior) contributes what %.
3. **Thermal fingerprint** — the (kWh/m² vs HDD) scatter per room. Peer baseline overlayed as a shaded corridor. When your dot leaves the corridor, the app explains why.
4. **What-if slider** — "turn the living room down 1°C" → animated re-forecast of cost + CO₂ over the rest of the year. Make the saving concrete: "that's one flight Berlin→Rome in CO₂, or 2 Netflix subs in euros".
5. **Anomaly inbox** — not a notification stream, a reviewable log: "Tuesday's bathroom usage was 3× normal. Was it guests, a leak, or something else?" The tenant's tap trains the model.
6. **Year-on-year diff** — same week last year vs this year, with weather normalized out. The normalization is key — "you used 12% less *after* accounting for the warmer winter" is the insight, not raw kWh diff.

### 5.3 Onboarding as progressive disclosure

Don't front-load a 15-question form. Ask one question per session, pegged to a visible upgrade:

- After first chart: "We're comparing you to all 80m² flats in 06110. Tell us how many people live here and we'll narrow that to your real peer group." → instant before/after.
- After first anomaly: "Was this a guest weekend?" → behavioral label feeds the archetype model.
- After first winter: "Did you change anything big this year?" → structural break labels.

Every answer must *visibly* improve the chart they just looked at. That's the loop.

### 5.4 Explainability — non-negotiable

Because the goal is *tenant awareness*, the model cannot be a black box. Options:

- **Per-prediction decomposition**: for TFT or LightGBM, use SHAP or native attention to render "this month's bill breakdown" as stacked contributions: 40% cold weather, 30% household size, 20% your building's insulation, 10% your habits. The *10% you can control* is the lever.
- **Counterfactual narration**: "If outside temp had been normal, you'd have used 15% less." → separates effort from luck.
- **Comparison tooltips**: on every chart, hovering a peer line reveals "peers = 47 flats, 60–90 m², zipcode 06xxx, gas heat, 2-person households". Transparency builds trust.

### 5.5 The conscientiousness nudge (do carefully)

Behavioral nudges work but can backfire:

- ✅ Social proof with a neutral tone ("you're at the median for your group") — evidence-based, non-shaming.
- ✅ Loss framing with real stakes ("at current pace you'll overshoot last year's bill by €210").
- ✅ Goal setting *chosen by the tenant* — opt-in targets, never defaulted.
- ❌ Gamification points / badges — shown to work short-term, dropout after 6 months. For a 10-year product, avoid.
- ❌ Shaming comparisons ("you use more than 80% of neighbors") — triggers backfire effect in roughly 20% of users per literature.

---

## 6. Wedge: what makes this actually *win* the hackathon

Against a crowded field of "we built a dashboard with a forecast chart", three things stand out:

1. **The peer-benchmark must be real.** Compute it live from the 20-property dataset with a clear cohort definition (same city cluster, ±20% m², same energy source). Show the cohort size. Most submissions will fake this.
2. **The self-explaining decomposition.** Stacked SHAP contributions on every forecast — weather, building, habits — with the "habit" slice being the only actionable one highlighted. This directly answers the jury's "why should I trust this / what do I do about it" reflex.
3. **The compounding narrative.** Show a slide or demo mode: "Year 1 forecast ±22%. Year 2 ±14%. Year 3 ±9%." Even if simulated, this communicates the 10-year contract advantage that competitors won't think to surface.

---

## 7. Suggested build order (hackathon-pragmatic)

1. **Parse + unify** all 20 property CSVs into a tidy long-format (date, property, unit, room, kWh, temp, m², source, zipcode, emission).
2. **Derive HDD, lags, intensity, room-clusters.** Cache.
3. **LightGBM baseline** predicting daily kWh per room. Use a rolling origin CV, report MAE + MAPE per property.
4. **Prophet per unit** for the 30/90/365-day views.
5. **Cohort benchmark function**: `peers(unit) → cohort df → percentiles`.
6. **Frontend skeleton** with the 6 modules from §5.2, hardcoded data first, then wired.
7. **SHAP stacked-bar** component — the explainability hero feature.
8. **What-if slider** — wire setpoint change → re-score via the LightGBM model directly (fast enough).
9. **Demo-mode projection of multi-year accuracy** — the pitch artifact.

Everything past step 5 is a UX investment, not a modeling one. That's deliberate: the jury will remember the experience, the model only has to be credibly good, not SOTA.

---

## 8. Open questions to resolve with the team

- Do we have any *multi-source* buildings in the 20 properties, or is it all `Erdgas`? (affects whether energy-source modeling is useful or decorative)
- Is room-level billing actually how Techem operates, or is per-unit the real product unit? (affects whether room-level forecasts are a feature or a curiosity)
- Are we allowed to hit external APIs live in the demo, or should we pre-cache weather? (latency + reliability tradeoff)
- Target platform for the demo: browser only, or do they want a mobile view?
- Language: German-first with English toggle? Tenants will be German.
