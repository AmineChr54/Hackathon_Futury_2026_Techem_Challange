import { useMemo } from "react";
import { Link } from "react-router-dom";
import { buildingTrend, landlordAdvisories } from "@/lib/mockData";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { Teco } from "@/components/Teco";
import {
  Building2,
  Zap,
  Euro,
  CloudFog,
  AlertCircle,
  Gauge,
  ChevronRight,
  TrendingDown,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const Kpi = ({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn" | "good";
}) => {
  const toneClass = {
    default: "bg-secondary text-charcoal",
    warn: "bg-primary-soft text-primary",
    good: "bg-accent-soft text-accent",
  }[tone];
  return (
    <div className="surface-card p-4">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-extrabold">{value}</div>
      {sub && (
        <div className="text-[11px] font-semibold text-muted-foreground">{sub}</div>
      )}
    </div>
  );
};

const Portfolio = () => {
  const { buildings, kpis: portfolioKpis } = useLandlordPortfolio();

  // Map trend rows to actual/forecast series for the chart (mock — backend
  // does not expose historical aggregates yet).
  const chartData = useMemo(
    () =>
      buildingTrend.map((d, i, arr) => {
        const next = arr[i + 1];
        return {
          ...d,
          actual: d.kind === "actual" ? d.consumption : null,
          forecast:
            d.kind === "forecast"
              ? d.consumption
              : next && next.kind === "forecast"
              ? d.consumption
              : null,
        };
      }),
    [],
  );
  const forecastBoundary =
    chartData.find((d) => d.kind === "forecast")?.month ?? null;

  return (
    <div className="space-y-5 pt-2">
      <header>
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Portfolio Overview
        </div>
        <h1 className="text-2xl font-extrabold">Good morning, Daniel</h1>
        <p className="text-sm text-muted-foreground">
          12 buildings • 220 units • Q2 review ready.
        </p>
      </header>

      {/* Teco for Landlords — strategic, advisory tone */}
      <Link
        to="/landlord/advisor"
        className="surface-card flex items-center gap-3 overflow-hidden bg-gradient-charcoal p-4 text-charcoal-foreground"
      >
        <Teco mood="happy" size={56} float={false} />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            <Sparkles className="h-3 w-3" /> Teco for Landlords
          </div>
          <div className="text-sm font-extrabold">
            Predicted next-year cost: €
            {(portfolioKpis.predictedNextYearCostEur / 1000).toFixed(0)}k
          </div>
          <p className="text-[11px] opacity-90">
            Recommended retrofits could save up to €
            {(portfolioKpis.predictedRetrofitSavingsEur / 1000).toFixed(0)}k/year and
            shift portfolio to class {portfolioKpis.predictedAvgClassNextYear}.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 opacity-80" />
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Kpi
          icon={Building2}
          label="Buildings"
          value={String(portfolioKpis.buildings)}
          sub="220 units"
        />
        <Kpi
          icon={Zap}
          label="Total energy"
          value={`${portfolioKpis.totalConsumptionMwh} MWh`}
          sub="last 12 months"
        />
        <Kpi
          icon={Euro}
          label="Operating cost"
          value={`€${(portfolioKpis.totalCostEur / 1000).toFixed(0)}k`}
          sub="annual"
        />
        <Kpi
          icon={CloudFog}
          label="CO₂"
          value={`${portfolioKpis.totalCo2Tons} t`}
          sub="annual"
          tone="warn"
        />
        <Kpi
          icon={AlertCircle}
          label="Flagged"
          value={String(portfolioKpis.flagged)}
          sub="need attention"
          tone="warn"
        />
        <Kpi
          icon={Gauge}
          label="Avg class"
          value={portfolioKpis.avgClass}
          sub={`forecast: ${portfolioKpis.predictedAvgClassNextYear}`}
          tone="good"
        />
      </div>

      {/* Trend with predictive overlay */}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Portfolio energy trend
            </div>
            <h3 className="text-base font-bold">Consumption (MWh) — actual + forecast</h3>
          </div>
          <span className="chip bg-accent-soft text-accent">
            <TrendingDown className="h-3 w-3" /> −9% YoY
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-charcoal" />
            <span className="text-muted-foreground">Actual</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-accent" />
            <span className="text-muted-foreground">Forecast</span>
          </span>
        </div>
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  fontSize: 12,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                }}
              />
              {forecastBoundary && (
                <ReferenceLine
                  x={forecastBoundary}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                />
              )}
              <Bar
                dataKey="actual"
                fill="hsl(var(--charcoal))"
                radius={[8, 8, 0, 0]}
                name="Actual"
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(var(--accent))"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                name="Forecast"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Advisor highlight */}
      <Link
        to="/landlord/advisor"
        className="surface-card flex items-start gap-3 p-4"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-charcoal text-charcoal-foreground">
          <Wrench className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-charcoal">
            <Sparkles className="h-3 w-3 text-accent" /> Retrofit Advisor
          </div>
          <div className="text-sm font-extrabold">
            Birkenallee 5 (Class G → predicted E)
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Highest-impact opportunity this quarter. Insulation + windows.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {/* Top buildings */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">Buildings needing attention</h3>
          <Link to="/landlord/buildings" className="text-xs font-bold text-primary">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {buildings
            .filter((b) => b.alerts > 0)
            .slice(0, 3)
            .map((b) => (
              <Link
                to={`/landlord/buildings/${b.id}`}
                key={b.id}
                className="surface-card flex items-center gap-3 p-3.5"
              >
                <EnergyClassBadge c={b.energyClass} />
                <div className="flex-1">
                  <div className="text-sm font-bold">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {b.city} • {b.units} units • {b.alerts} alert
                    {b.alerts > 1 ? "s" : ""} • forecast: {b.predictedClass}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
        </div>
      </section>

      {/* Advisory cards */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Advisor insights</h3>
        {landlordAdvisories.slice(0, 3).map((c) => {
          const tone =
            c.tone === "warn"
              ? "border-l-primary text-primary"
              : c.tone === "good"
              ? "border-l-accent text-accent"
              : "border-l-charcoal text-charcoal";
          return (
            <div
              key={c.tag}
              className={`surface-card border-l-4 p-4 ${tone.split(" ")[0]}`}
            >
              <div className={`text-[11px] font-bold uppercase tracking-wider ${tone.split(" ")[1]}`}>
                {c.tag}
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">{c.text}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default Portfolio;
