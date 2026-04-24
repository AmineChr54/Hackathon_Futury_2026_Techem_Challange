# Lovable: Backend Integration Prompt

*Copy and paste the following prompt directly into your Lovable chat window to instruct it to replace the mock data with live data from our FastAPI backend.*

---

## Lovable Prompt

**Role:** You are an expert frontend React developer working on connecting our Lovable frontend mockups to a real, live Python FastAPI backend.

**Goal:** Currently, the frontend relies on hardcoded mock data and mock API services. I want you to refactor our data fetching layer to connect to a live REST API backend running at `http://localhost:8123` (or a configured `VITE_API_BASE_URL`).

### Instructions

1. **Create an API Client:**
   - Create a central API client (e.g., in `src/lib/api.ts` or `src/services/api.ts`) using `fetch` or `axios`.
   - Read the base URL from an environment variable `VITE_API_BASE_URL` with a fallback to `http://localhost:8123`.
   - Ensure the client can handle JSON parsing and standard error handling.

2. **Replace Mock Data Hooks:**
   - Locate all current React components or hooks (like `react-query` `useQuery` or custom hooks) that return mock data for Tenant and Landlord dashboards.
   - Refactor them to make real HTTP requests to the endpoints listed below. 
   - Keep the existing UI loading states (spinners/skeletons) and error boundaries intact.

3. **Data Mapping:**
   - Since the backend returns specific snake_case JSON schemas, adapt our frontend TypeScript interfaces to match the backend responses, OR add a small mapping layer if our frontend heavily relies on camelCase properties.

### Available Backend Endpoints (FastAPI)

Here is the exact schema and routing of the backend you are connecting to:

**Global/Setup:**
- `GET /health` : Returns `{"status": "ok", "units": <int>}`
- `GET /units` : Returns a list of units (e.g., `[{"property_id": 1, "unit_id": 101, ...}]`). Use this to populate a global property/unit selector or default to property 1, unit 101.

**Tenant Features (`/unit/{pid}/{uid}`):**
- `GET /forecast/unit/{pid}/{uid}?horizon_days=30`
  *Returns:* `total_point_kwh`, `total_point_cost_eur`, `total_co2_kg`, and an array `series` with daily probabilistic predictions (`date`, `point_kwh`, `q10_kwh`, `q90_kwh`, `cost_eur`, `co2_g`).
- `GET /drilldown/unit/{pid}/{uid}`
  *Returns:* Array of room breakdowns `[{"room_id": 1, "share": 0.4, "total_point_kwh": 120}, ...]`.
- `POST /whatif/unit/{pid}/{uid}`
  *Body:* `{"temp_delta_c": -1.0, "horizon_days": 30}`
  *Returns:* `baseline_kwh`, `counterfactual_kwh`, `delta_kwh`, `delta_cost_eur`, `delta_co2_kg`.
- `GET /peers/{pid}/{uid}`
  *Returns:* Benchmark comparison data like `cohort_avg_daily_kwh`, `percentile_rank_better_than`, and aspirational targets.
- `GET /today/{pid}/{uid}`
  *Returns:* Current day's intraday consumption so far.
- `GET /recommendations/{pid}/{uid}`
  *Returns:* Ranked savings actions `items` and an LLM-generated `narrative`.
- `POST /chat/{pid}/{uid}`
  *Body:* `{"message": "How can I save money?", "history": []}`
  *Returns:* Agentic response in `reply`.

**Landlord Features (`/landlord/property/{pid}`):**
- `GET /landlord/property/{pid}/usage`
  *Returns:* Aggregated usage, cost, and overall property Energy Score.
- `GET /landlord/property/{pid}/insights`
  *Returns:* Heat-loss sensitivity analysis (`flagged_rooms`) and modernization `narrative`.
- `GET /landlord/property/{pid}/roi`
  *Returns:* ROI calculation for modernizations, carbon tax savings, and expected property value increase.
- `GET /landlord/property/{pid}/esg_report`
  *Returns:* Raw `metrics` and an AI-authored executive ESG `narrative`.

**Action Items for You (Lovable):**
Please start by creating the base `api.ts` client. Then, ask me which specific page or feature (e.g., Tenant Dashboard, Landlord ESG Report, or AI Chat) we should wire up first, and generate the updated React component code for it.
