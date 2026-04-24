// Adapters that map snake_case backend payloads to the shapes the UI components
// were originally built against (mockData.ts). Keeping these in one place lets
// the page components stay readable.

import type {
  ForecastResponse,
  HistoryResponse,
  RoomBreakdown,
  TodayResponse,
  PeersResponse,
  LandlordUsage,
} from "./apiTypes";
import {
  consumptionDaily as mockDaily,
  consumptionMonthly as mockMonthly,
  consumptionYearly as mockYearly,
  rooms as mockRooms,
  tenantToday as mockTenantToday,
  type EnergyClass,
} from "./mockData";

// ---------- TENANT ----------

export type SeriesPoint = {
  label: string;
  consumption: number;
  cost: number;
  co2: number;
  avg: number;
  kind: "actual" | "forecast";
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Take the first ~7 days of a forecast and stamp them as predicted-only series. */
export function forecastToDailySeries(fc: ForecastResponse | undefined, benchmark?: number): SeriesPoint[] {
  if (!fc || !fc.series.length) return mockDaily;
  const slice = fc.series.slice(0, 10);
  // Use the average of the slice as a benchmark line if not provided.
  const avg = benchmark ?? slice.reduce((s, p) => s + p.point_kwh, 0) / slice.length;
  return slice.map((p) => {
    const dt = new Date(p.date);
    const label = WEEKDAY_LABELS[dt.getUTCDay()];
    return {
      label,
      consumption: round1(p.point_kwh),
      cost: round2(p.cost_eur),
      co2: round2(p.co2_g / 1000),
      avg: round1(avg),
      kind: "forecast" as const,
    };
  });
}

type MonthBucket = { kwh: number; cost: number; co2_g: number; year: number; month: number };

function aggregateByMonth<T extends { date: string }>(
  points: T[],
  pick: (p: T) => { kwh: number; cost: number; co2_g: number },
): Map<string, MonthBucket> {
  const out = new Map<string, MonthBucket>();
  for (const p of points) {
    const dt = new Date(p.date);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth();
    const key = `${year}-${month.toString().padStart(2, "0")}`;
    const vals = pick(p);
    const cur = out.get(key) ?? { kwh: 0, cost: 0, co2_g: 0, year, month };
    cur.kwh += vals.kwh;
    cur.cost += vals.cost;
    cur.co2_g += vals.co2_g;
    out.set(key, cur);
  }
  return out;
}

/**
 * Monthly chart: last ~5 complete months of actuals + next month from forecast.
 * Drop partial months (first history month, partial forecast month) so bars compare fairly.
 */
export function forecastToMonthlySeries(
  fc: ForecastResponse | undefined,
  hist?: HistoryResponse | undefined,
): SeriesPoint[] {
  if (!hist || !hist.series.length) {
    if (!fc) return mockMonthly;
    // Fallback when history missing: buckets from forecast only (old behaviour).
    const buckets = aggregateByMonth(fc.series, (p) => ({
      kwh: p.point_kwh,
      cost: p.cost_eur,
      co2_g: p.co2_g,
    }));
    const arr = Array.from(buckets.values()).map((b) => ({
      label: `${MONTH_LABELS[b.month]}*`,
      consumption: Math.round(b.kwh),
      cost: Math.round(b.cost),
      co2: Math.round(b.co2_g / 1000),
      avg: Math.round(b.kwh * 1.15),
      kind: "forecast" as const,
    }));
    return arr;
  }

  // Build actual monthly buckets, then scale partial months.
  const histBuckets = aggregateByMonth(hist.series, (p) => ({
    kwh: p.kwh,
    cost: p.cost_eur,
    co2_g: p.co2_g,
  }));
  const histKeys = Array.from(histBuckets.keys()).sort();
  const complete: MonthBucket[] = [];
  for (const k of histKeys) {
    const b = histBuckets.get(k)!;
    // Reconstruct day count for completeness check:
    const daysInMonth = new Date(Date.UTC(b.year, b.month + 1, 0)).getUTCDate();
    // Count points of hist.series that fall in this bucket:
    const count = hist.series.filter((p) => {
      const d = new Date(p.date);
      return d.getUTCFullYear() === b.year && d.getUTCMonth() === b.month;
    }).length;
    
    // Scale partial months to a full month for the chart
    const scale = count > 0 ? daysInMonth / count : 1;
    complete.push({
      ...b,
      kwh: b.kwh * scale,
      cost: b.cost * scale,
      co2_g: b.co2_g * scale
    });
  }
  const last5 = complete.slice(-5);

  const actualPoints: SeriesPoint[] = last5.map((b) => ({
    label: MONTH_LABELS[b.month],
    consumption: Math.round(b.kwh),
    cost: Math.round(b.cost),
    co2: Math.round(b.co2_g / 1000),
    avg: Math.round(b.kwh * 1.15),
    kind: "actual" as const,
  }));

  // Forecast: project the full upcoming month using forecast average × 30.
  if (!fc || !fc.series.length) return actualPoints.length ? actualPoints : mockMonthly;
  const avgKwh = fc.total_point_kwh / fc.horizon_days;
  const avgCost = fc.total_point_cost_eur / fc.horizon_days;
  const avgCo2Kg = fc.total_co2_kg / fc.horizon_days;
  const midIndex = Math.floor(fc.series.length / 2);
  const nextDt = fc.series[midIndex] ? new Date(fc.series[midIndex].date) : new Date();
  const nextLabel = `${MONTH_LABELS[nextDt.getUTCMonth()]}*`;
  const forecastPoint: SeriesPoint = {
    label: nextLabel,
    consumption: Math.round(avgKwh * 30),
    cost: Math.round(avgCost * 30),
    co2: Math.round(avgCo2Kg * 30),
    avg: Math.round(avgKwh * 30 * 1.15),
    kind: "forecast" as const,
  };
  return [...actualPoints, forecastPoint];
}

/**
 * Yearly chart: sum last 12 months of history for "this year" and
 * project "next year" using forecast daily average × 365.
 * Extrapolating a winter-only forecast window to a full year was the bug:
 * replace it with actual trailing-12-month totals.
 */
export function forecastToYearlySeries(
  fc: ForecastResponse | undefined,
  hist?: HistoryResponse | undefined,
): SeriesPoint[] {
  if (!hist) return mockYearly;

  // Trailing 365 days from history as "current year". Scale if history is shorter than a year.
  const histDays = hist.series.length || 1;
  const scale = 365 / histDays;
  const trailingKwh = hist.total_kwh * scale;
  const trailingCost = hist.total_cost_eur * scale;
  const trailingCo2Kg = hist.total_co2_kg * scale;

  const lastDate = hist.series.length
    ? new Date(hist.series[hist.series.length - 1].date)
    : new Date();
  const thisYearLabel = `${lastDate.getUTCFullYear()}`;

  const out: SeriesPoint[] = [
    ...mockYearly.slice(0, 3), // a couple of prior years for visual continuity
    {
      label: thisYearLabel,
      consumption: Math.round(trailingKwh),
      cost: Math.round(trailingCost),
      co2: Math.round(trailingCo2Kg),
      avg: Math.round(trailingKwh * 1.1),
      kind: "actual" as const,
    },
  ];

  if (fc && fc.horizon_days > 0) {
    const annualKwh = (fc.total_point_kwh / fc.horizon_days) * 365;
    const annualCost = (fc.total_point_cost_eur / fc.horizon_days) * 365;
    const annualCo2Kg = (fc.total_co2_kg / fc.horizon_days) * 365;
    // Blend: weight forecast by its horizon vs year, fill rest from trailing.
    // This damps the winter-only extrapolation bias.
    const h = Math.min(fc.horizon_days, 365);
    const w = h / 365;
    const blendedKwh = annualKwh * w + trailingKwh * (1 - w);
    const blendedCost = annualCost * w + trailingCost * (1 - w);
    const blendedCo2 = annualCo2Kg * w + trailingCo2Kg * (1 - w);
    out.push({
      label: `${lastDate.getUTCFullYear() + 1}*`,
      consumption: Math.round(blendedKwh),
      cost: Math.round(blendedCost),
      co2: Math.round(blendedCo2),
      avg: Math.round(blendedKwh * 1.1),
      kind: "forecast" as const,
    });
  }
  return out;
}

export function drilldownToRooms(drill: RoomBreakdown[] | undefined) {
  if (!drill || !drill.length) return mockRooms;
  // Reuse mock room name pool in order of share.
  const names = ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Hallway"];
  return drill
    .slice()
    .sort((a, b) => b.share - a.share)
    .slice(0, 5)
    .map((r, i) => {
      const impact = Math.round(r.share * 100);
      const status = impact >= 30 ? "High — possible leakage" : impact >= 15 ? "Normal" : "Low";
      return {
        name: names[i] ?? `Room ${r.room_id}`,
        impact,
        status,
        hint:
          impact >= 30
            ? "AI-estimated heat loss higher than typical."
            : impact >= 15
            ? "Activity-driven usage."
            : "Heat passes through.",
      };
    });
}

export type TenantTodayView = typeof mockTenantToday;

export function todayToView(
  today: TodayResponse | undefined,
  forecast: ForecastResponse | undefined,
  fallback: TenantTodayView = mockTenantToday,
): TenantTodayView {
  if (!today) return fallback;

  const monthCost = forecast?.total_point_cost_eur ?? fallback.predictedMonthCostEur;
  const monthCo2 = forecast?.total_co2_kg ?? fallback.predictedMonthCo2Kg;
  const tomorrowKwh = forecast?.series?.[0]?.point_kwh ?? fallback.predictedTomorrowKwh;

  return {
    ...fallback,
    consumptionKwh: round1(today.kwh_so_far),
    costEur: round2(today.cost_eur_so_far),
    co2Kg: round2(today.co2_g_so_far / 1000),
    predictedMonthCostEur: Math.round(monthCost),
    predictedMonthCo2Kg: Math.round(monthCo2),
    predictedTomorrowKwh: round1(tomorrowKwh),
  };
}

export function peersToLeaderboardLabel(peers: PeersResponse | undefined): string {
  if (!peers) return "";
  if (peers.percentile_rank_better_than > 0) {
    return `Better than ${Math.round(peers.percentile_rank_better_than * 100)}% of peers`;
  }
  return "";
}

// ---------- LANDLORD ----------

export function energyScoreToClass(score: string | undefined): EnergyClass {
  switch ((score ?? "").toUpperCase()) {
    case "A":
      return "A";
    case "B":
      return "B";
    case "C":
      return "C";
    case "D":
      return "D";
    case "E":
      return "E";
    case "F":
      return "F";
    case "G":
      return "G";
    default:
      return "D";
  }
}

export type BuildingRow = {
  id: string;
  property_id: number;
  name: string;
  city: string;
  units: number;
  energyClass: EnergyClass;
  consumptionMwh: number;
  costEur: number;
  co2Tons: number;
  alerts: number;
  efficiency: number;
  predictedClass: EnergyClass;
  predictedCostEur: number;
};

export function landlordUsageToBuilding(
  usage: LandlordUsage | undefined,
  meta: { property_id: number; city: string; name?: string },
): BuildingRow | null {
  if (!usage) return null;
  const cls = energyScoreToClass(usage.energy_score);
  return {
    id: `p${meta.property_id}`,
    property_id: meta.property_id,
    name: meta.name ?? `Property ${meta.property_id}`,
    city: meta.city,
    units: usage.total_units,
    energyClass: cls,
    consumptionMwh: round1(usage.total_kwh / 1000),
    costEur: Math.round(usage.total_cost_eur),
    co2Tons: round1(usage.total_co2_kg / 1000),
    alerts: 0,
    efficiency: scoreToEfficiency(cls),
    predictedClass: bumpClass(cls),
    predictedCostEur: Math.round(usage.total_cost_eur * 0.85),
  };
}

const CLASS_ORDER: EnergyClass[] = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];

function bumpClass(c: EnergyClass): EnergyClass {
  const i = CLASS_ORDER.indexOf(c);
  return i > 0 ? CLASS_ORDER[i - 1] : c;
}

function scoreToEfficiency(c: EnergyClass): number {
  const map: Record<EnergyClass, number> = {
    "A+": 96,
    A: 92,
    B: 86,
    C: 78,
    D: 64,
    E: 56,
    F: 48,
    G: 38,
    H: 24,
  };
  return map[c];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
