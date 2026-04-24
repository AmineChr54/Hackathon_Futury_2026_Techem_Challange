import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { buildingTrend } from "@/lib/mockData";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { useLandlordInsights } from "@/hooks/useApi";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { Teco } from "@/components/Teco";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  ArrowLeft,
  MapPin,
  Users,
  Zap,
  Euro,
  CloudFog,
  AlertTriangle,
  Wrench,
  Sparkles,
  TrendingDown,
} from "lucide-react";

const BuildingDetail = () => {
  const { id } = useParams();
  const { buildings } = useLandlordPortfolio();
  const b = buildings.find((x) => x.id === id) ?? buildings[0];
  const insightsQ = useLandlordInsights(b?.property_id ?? NaN);

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

  if (!b) return null;

  // Mock unit grid
  const units = Array.from({ length: b.units }).map((_, i) => ({
    n: i + 1,
    flagged: [3, 7, 11].includes(i),
  }));

  return (
    <div className="space-y-4 pt-2">
      <Link
        to="/landlord/buildings"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <header className="surface-card p-4">
        <div className="flex items-start gap-3">
          <EnergyClassBadge c={b.energyClass} size="lg" />
          <div className="flex-1">
            <h1 className="text-lg font-extrabold">{b.name}</h1>
            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {b.city}, Germany
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Forecast
            </div>
            <div className="text-base font-extrabold text-accent">
              {b.predictedClass}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-secondary p-2.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="mt-1 text-sm font-extrabold">{b.units}</div>
            <div className="text-[10px] text-muted-foreground">units</div>
          </div>
          <div className="rounded-2xl bg-secondary p-2.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="mt-1 text-sm font-extrabold">{b.consumptionMwh}</div>
            <div className="text-[10px] text-muted-foreground">MWh / yr</div>
          </div>
          <div className="rounded-2xl bg-secondary p-2.5">
            <CloudFog className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="mt-1 text-sm font-extrabold">{b.co2Tons}</div>
            <div className="text-[10px] text-muted-foreground">t CO₂</div>
          </div>
        </div>
      </header>

      {/* Predictive insight from Teco for Landlords */}
      <section className="surface-card flex items-start gap-3 p-4">
        <Teco mood="happy" size={48} float={false} />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-charcoal">
            <Sparkles className="h-3 w-3 text-accent" /> Teco for Landlords
          </div>
          <p className="text-sm font-semibold">
            With recommended retrofits, this building is predicted to reach class{" "}
            <strong className="text-accent">{b.predictedClass}</strong> with annual cost
            around <strong>€{(b.predictedCostEur / 1000).toFixed(1)}k</strong>.
          </p>
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last 6 months + forecast
            </div>
            <h3 className="text-base font-bold">Consumption — actual vs predicted</h3>
          </div>
          <span className="chip bg-accent-soft text-accent">
            <TrendingDown className="h-3 w-3" /> trending down
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-charcoal" />
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
              margin={{ top: 6, right: 4, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="bd1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--charcoal))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--charcoal))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="actual"
                stroke="hsl(var(--charcoal))"
                strokeWidth={2.5}
                fill="url(#bd1)"
                connectNulls
                name="Actual"
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(var(--accent))"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                connectNulls
                name="Forecast"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Unit grid */}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Unit overview</h3>
          <span className="chip bg-primary-soft text-primary">3 flagged</span>
        </div>
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {units.map((u) => (
            <div
              key={u.n}
              className={`grid aspect-square place-items-center rounded-lg text-[10px] font-bold ${
                u.flagged
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              {u.n}
            </div>
          ))}
        </div>
      </section>

      {/* Hotspots — live insights from /landlord/property/{pid}/insights */}
      <section className="surface-card border-l-4 border-l-warning p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            <div className="text-xs font-bold text-warning">Maintenance hotspot</div>
            <p className="text-sm font-semibold">
              {insightsQ.data?.narrative ??
                (typeof insightsQ.data?.summary === "string"
                  ? insightsQ.data.summary
                  : "Riser line 2 shows higher heat loss. Consider hydraulic balancing.")}
            </p>
            {insightsQ.data?.flagged_rooms?.length ? (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {insightsQ.data.flagged_rooms.slice(0, 3).map((r) => (
                  <li key={`${r.unit_id}-${r.room_id}`}>
                    Unit {r.unit_id} · room {r.room_id} · sensitivity{" "}
                    {r.heat_loss_sensitivity.toFixed(2)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <Link
        to="/landlord/advisor"
        className="surface-card flex items-center gap-3 overflow-hidden bg-gradient-charcoal p-4 text-charcoal-foreground"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
          <Wrench className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-accent">
            <Sparkles className="h-3 w-3" /> Open Retrofit Advisor
          </div>
          <p className="text-sm font-bold">See upgrade scenarios for this building</p>
        </div>
      </Link>
    </div>
  );
};

export default BuildingDetail;
