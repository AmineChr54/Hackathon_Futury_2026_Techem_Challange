# 🚀 Techem Prediction Engine: Backend Endpoint Overview

This document provides a comprehensive overview of all API endpoints and functionalities provided by the Techem Prediction Engine backend. The backend is built using FastAPI and leverages several machine learning models (quantile regression, conformal calibration, hierarchical reconciliation) and an LLM (Gemini) for dynamic, personalized insights.

---

## 🛠️ 1. System & Infrastructure

Basic operational endpoints to monitor the health and available data in the system.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | **Health Check:** Returns system liveness status and the total number of unique properties/units available in the loaded dataset. |
| `GET` | `/units` | **List Units:** Returns a list of all known units, including property ID, unit ID, energy source (e.g., Gas, District Heating), city, and zipcode. |
| `GET` | `/drift` | **Drift Detection:** Identifies recent structural break events (data drift) in consumption behavior by comparing historical baselines against recent data. Can be filtered by `property_id` and `unit_id`. |

---

## 🔮 2. Core Prediction & Analytics

These endpoints form the backbone of the prediction engine, providing granular forecasting and "what-if" scenarios based on weather, thermal performance, and historical usage.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/forecast/unit/{pid}/{uid}` | **Probabilistic Forecast:** Predicts future energy consumption (kWh), cost (€), and CO₂ emissions (g) over a given `horizon_days` (default 30). Returns a point prediction alongside calibrated uncertainty bounds (10th/90th quantiles via split-conformal prediction). Supports optional live weather integration. |
| `GET` | `/drilldown/unit/{pid}/{uid}` | **Hierarchical Drilldown:** Disaggregates the unit-level consumption forecast down to the individual room level using hierarchical reconciliation (MinT approach), showing the percentage share and total kWh per room. |
| `POST` | `/whatif/unit/{pid}/{uid}` | **Counterfactual Analysis:** Evaluates the impact of behavioral changes. Takes a `temp_delta_c` parameter (e.g., -1°C) to calculate the expected reduction in kWh, cost, and CO₂ if the tenant turns down the heating, using learned room-level heat-loss sensitivities. |

---

## 👥 3. Tenant API (Engagement & AI)

These endpoints drive the tenant-facing application, providing transparency, personalized recommendations, and interactive AI engagement to foster energy-conscious behavior.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/today/{pid}/{uid}` | **Today's Consumption:** Synthesizes the current day's estimated consumption, cost, and CO₂ so far based on a diurnal usage curve. |
| `GET` | `/peers/{pid}/{uid}` | **Cohort Comparison:** Compares the unit's consumption against an automatically generated cohort of similar properties (e.g., same city, similar size). Provides percentile rankings, benchmark averages, and aspirational savings targets. |
| `GET` | `/recommendations/{pid}/{uid}` | **Personalized Savings Actions:** Analyzes consumption patterns and room sensitivities to generate ranked, actionable savings advice (e.g., "Turn down heating in the living room"). If available, the LLM converts these into tenant-friendly narratives. |
| `GET` | `/leaks/{pid}/{uid}` | **Anomaly & Leak Detection:** Uses a four-signal anomaly detector (trend breaks, high baseload, weekend spikes, weather decoupling) to identify potential leaks or inefficiencies. Provides LLM-generated explanations for detected issues. |
| `POST` | `/target/{pid}/{uid}` | **Target-Driven Plan:** The tenant sets a monthly cost (€) or CO₂ reduction target. The LLM evaluates feasibility against projected usage and generates a concrete action plan using available tools. |
| `POST` | `/chat/{pid}/{uid}` | **Conversational Assistant:** A Gemini-powered chat endpoint with agentic tool-calling. Tenants can ask questions like "How can I save €20 this month?", and the AI will interactively call the backend models (What-If, Peers, Recommendations) to provide data-backed answers. |

---

## 🏢 4. Landlord API (Portfolio & ESG)

These endpoints empower landlords and property managers with portfolio-wide analytics, return on investment insights, and automated ESG reporting.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/landlord/property/{pid}/usage` | **Dashboard Metrics:** Aggregates total property-level usage, cost, CO₂ emissions, and calculates an overall Energy Score. |
| `GET` | `/landlord/property/{pid}/insights` | **AI Coacher (Thermal Insights):** Identifies rooms or units with severe heat-loss (high thermal sensitivity). Generates actionable real-estate modernization advice via LLM (e.g., window insulation upgrades). |
| `GET` | `/landlord/property/{pid}/roi` | **ROI & Modernization Calculator:** Highlights financial and eco-friendly incentives for improvements, calculating potential carbon tax savings, expected property value increases, and ROI timelines. |
| `GET` | `/landlord/property/{pid}/esg_report` | **ESG Automation:** Automatically generates an investor-ready ESG report. Combines raw metrics (carbon footprint, energy intensity) with an AI-authored executive summary detailing portfolio performance and compliance trajectories. |

---

### 💡 Notable Architectural Features
- **Offline Resilience:** All tenant-facing and landlord-facing LLM features degrade gracefully. If the LLM API is unavailable, endpoints return structured tabular data instead of failing.
- **Dynamic Weather Integration:** Forecasts can optionally poll live Meteostat data to adjust predictions based on actual upcoming weather forecasts.
- **FastAPI Documentation:** Navigate to `http://localhost:<PORT>/docs` when the server is running to interactively test all endpoints using the auto-generated Swagger UI.
