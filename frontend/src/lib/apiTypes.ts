// TypeScript types matching the FastAPI backend schemas (snake_case).
// Source of truth: src/techem/serve/api.py

export type Unit = {
  property_id: number;
  unit_id: number;
  source: string;
  city: string;
  zipcode: string | number;
};

export type Health = {
  status: string;
  units: number;
};

export type ForecastPoint = {
  date: string;
  point_kwh: number;
  q10_kwh: number;
  q90_kwh: number;
  cost_eur: number;
  co2_g: number;
};

export type ForecastResponse = {
  property_id: number;
  unit_id: number;
  source: string;
  horizon_days: number;
  total_point_kwh: number;
  total_point_cost_eur: number;
  total_co2_kg: number;
  drivers: Record<string, unknown>;
  series: ForecastPoint[];
};

export type HistoryPoint = {
  date: string;
  kwh: number;
  cost_eur: number;
  co2_g: number;
};

export type HistoryResponse = {
  property_id: number;
  unit_id: number;
  source: string;
  days: number;
  total_kwh: number;
  total_cost_eur: number;
  total_co2_kg: number;
  series: HistoryPoint[];
};

export type RoomBreakdown = {
  room_id: number;
  share: number;
  total_point_kwh: number;
};

export type WhatIfRequest = {
  room_id?: number | null;
  temp_delta_c: number;
  horizon_days?: number;
  use_live_weather?: boolean;
};

export type WhatIfResponse = {
  baseline_kwh: number;
  counterfactual_kwh: number;
  delta_kwh: number;
  delta_cost_eur: number;
  delta_co2_kg: number;
};

export type PeersResponse = {
  property_id: number;
  unit_id: number;
  cohort_size: number;
  cohort_definition: Record<string, unknown>;
  percentile_rank_better_than: number;
  unit_avg_daily_kwh: number;
  cohort_avg_daily_kwh: number;
  badge: string;
  vs_median_pct: number;
  monthly_eur_vs_peers: number;
  monthly_co2_g_vs_peers: number;
  trend_30d_percentile_delta: number;
  equivalents: Record<string, unknown>;
  aspirational_target_kwh_per_m2: number;
  aspirational_saving_eur: number;
};

export type TodayResponse = {
  date: string;
  as_of_hour: number;
  kwh_so_far: number;
  kwh_full_day: number;
  cost_eur_so_far: number;
  cost_eur_full_day: number;
  co2_g_so_far: number;
  co2_g_full_day: number;
  vs_yesterday_pct: number;
  vs_same_weekday_avg_pct: number;
};

export type RecommendationItem = {
  id?: string;
  title?: string;
  description?: string;
  estimated_saving_eur?: number;
  estimated_saving_kwh?: number;
  room_id?: number | null;
  [k: string]: unknown;
};

export type RecommendationsResponse = {
  items: RecommendationItem[];
  narrative: string | null;
  unit_context?: Record<string, unknown>;
};

export type LeakSignal = {
  type?: string;
  severity?: string;
  description?: string;
  [k: string]: unknown;
};

export type LeaksResponse = {
  raw_signals: LeakSignal[];
  summary: Record<string, unknown>;
  narrative: string | null;
};

export type ChatRequest = {
  message: string;
  history?: { role: string; parts: string[] }[];
};

export type ChatResponse = {
  reply: string;
  tools_called: string[];
};

export type TargetRequest = {
  target_value: number;
  target_unit: "EUR" | "KG_CO2";
  horizon_days?: number;
  mode?: string;
};

export type TargetResponse = {
  feasible: boolean;
  projected: number;
  target: number;
  gap: number;
  plan_narrative: string;
  actions: Array<Record<string, unknown>>;
};

export type LandlordUsage = {
  property_id: number;
  total_units: number;
  total_livingspace_m2: number;
  total_kwh: number;
  total_cost_eur: number;
  total_co2_kg: number;
  efficiency_kwh_per_m2_yr: number;
  energy_score: string; // "A"..."G"
};

export type FlaggedRoom = {
  unit_id: number;
  room_id: number;
  heat_loss_sensitivity: number;
};

export type LandlordInsights = {
  property_id: number;
  flagged_rooms: FlaggedRoom[];
  narrative: string | null;
  summary: string | Record<string, unknown>;
};

export type LandlordRoi = {
  current_carbon_tax_eur: number;
  potential_carbon_tax_savings_eur: number;
  potential_property_value_increase_eur: number;
  assumptions: Record<string, unknown>;
};

export type LandlordEsg = {
  property_id: number;
  metrics: {
    environmental: {
      total_co2_kg: number;
      energy_score: string;
      carbon_intensity_kg_per_m2: number;
    };
    social: Record<string, string>;
    governance: Record<string, string>;
  };
  narrative: string | null;
};
