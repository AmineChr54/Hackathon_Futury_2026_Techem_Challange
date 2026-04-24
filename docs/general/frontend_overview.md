# 🎨 Techem Prediction Engine: Frontend Overview

This document provides a comprehensive overview of the Techem EcoCoach frontend architecture. It is designed to help coordinate integration with the Python FastAPI backend, specifically by highlighting how the application is currently structured, routed, and driven by mock data.

---

## 🛠️ 1. Tech Stack & Architecture

- **Framework:** React 18, Vite, TypeScript
- **Routing:** React Router v6
- **State & Data Fetching:** React Query (`@tanstack/react-query`)
- **Styling:** Tailwind CSS, `shadcn/ui` (Radix UI primitives, Sonner/Toaster for notifications)
- **Structure:** 
  - `src/pages/` - Contains role-based views (Tenant vs Landlord).
  - `src/components/` - Shared UI elements, layouts, and `shadcn/ui` components.
  - `src/lib/` - Utility functions and the centralized **mock data layer**.

---

## 🔀 2. Routing & Navigation (`src/App.tsx`)

The application starts with a global `RoleSelector` (`/`) and splits into two distinct, layout-wrapped sub-applications.

### 👥 Tenant Sub-App (`/tenant`)
Wrapped in `TenantLayout.tsx`, this section is built for individual renters to monitor and optimize their energy usage.

| Path | Component | Description | Corresponds to Backend Endpoint |
| :--- | :--- | :--- | :--- |
| `/tenant` | `TenantHome.tsx` | Dashboard showing today's consumption, goals, and quick coaching notifications. | `/today/{pid}/{uid}` |
| `/tenant/consumption` | `Consumption.tsx` | Time-series charts for daily, monthly, and yearly historical actuals + future forecasts. | `/forecast/unit/{pid}/{uid}` |
| `/tenant/apartment` | `Apartment.tsx` | Room-level drilldown showing heating impact and identifying potential leakage areas. | `/drilldown/unit/{pid}/{uid}` |
| `/tenant/coach` | `AICoach.tsx` | The conversational LLM chat interface for personalized energy advice. | `/chat/{pid}/{uid}` |
| `/tenant/budget` | `Budget.tsx` | Allows tenants to set cost/CO₂ targets and see if they are on track. | `/target/{pid}/{uid}` |
| `/tenant/insights` | `Insights.tsx` | Displays specific anomaly warnings, leak detections, and recommended savings actions. | `/leaks/` & `/recommendations/` |
| `/tenant/settings` | `Settings.tsx` | User profile, peer comparisons (cohorts), leaderboards, and gamified badges. | `/peers/{pid}/{uid}` |

### 🏢 Landlord Sub-App (`/landlord`)
Wrapped in `LandlordLayout.tsx`, this section is tailored for property managers to oversee building portfolios and plan retrofits.

| Path | Component | Description | Corresponds to Backend Endpoint |
| :--- | :--- | :--- | :--- |
| `/landlord` | `Portfolio.tsx` | High-level KPI dashboard: total MWh, costs, CO₂ tons, and average Energy Class. | `/landlord/property/{pid}/usage` |
| `/landlord/buildings` | `Buildings.tsx` | Master list of all managed properties. | `/units` (grouped by property) |
| `/landlord/buildings/:id`| `BuildingDetail.tsx`| Deep-dive into a specific property's trends and metrics. | `/landlord/property/{pid}/usage` |
| `/landlord/classes` | `EnergyClasses.tsx` | Distribution of properties across Energy Classes (A+ to H). | Derived from `usage` endpoint |
| `/landlord/costs` | `Costs.tsx` | Financial breakdown, cost trajectories, and CO₂ tax burden. | `/landlord/property/{pid}/usage` |
| `/landlord/advisor` | `Advisor.tsx` | ROI calculator and scenario planner for retrofits (insulation, heat pumps, etc.). | `/landlord/property/{pid}/roi` |
| `/landlord/insights` | `Insights.tsx` | AI-flagged thermal issues (heat-loss) across the portfolio. | `/landlord/property/{pid}/insights` |
| `/landlord/reports` | `Reports.tsx` | Automated ESG executive summaries for investors. | `/landlord/property/{pid}/esg_report` |

---

## 🗃️ 3. The Mock Data Layer (`src/lib/mockData.ts`)

Currently, the entire application is powered by hardcoded TypeScript objects exported from `mockData.ts`. **To integrate the backend, these specific objects need to be replaced by live `fetch` calls.**

**Key Tenant Mock Objects to Replace:**
- `tenantToday`: Replace with `/today`
- `consumptionDaily` / `consumptionMonthly`: Replace with `/forecast`
- `rooms`: Replace with `/drilldown`
- `coachingTips` / `tenantNotifications`: Replace with `/recommendations` & `/leaks`
- `leaderboard`: Replace with `/peers`

**Key Landlord Mock Objects to Replace:**
- `portfolioKpis`: Replace with aggregations from `/landlord/property/{pid}/usage`
- `buildings` & `buildingTrend`: Replace with `/landlord/property/{pid}/usage`
- `retrofitScenarios`: Replace with `/landlord/property/{pid}/roi`
- `landlordAdvisories`: Replace with `/landlord/property/{pid}/insights` & `/landlord/property/{pid}/esg_report`

---

### 💡 Integration Next Steps
1. **API Client Setup**: Add `axios` or a native `fetch` wrapper pointing to `VITE_API_BASE_URL` (default: `http://localhost:8123`).
2. **React Query Hooks**: Build custom hooks (e.g., `useForecast(pid, uid)`, `useLandlordInsights(pid)`) that call the backend.
3. **Component Refactoring**: Swap out the imports from `mockData.ts` in the respective page components to use the new live React Query hooks.
