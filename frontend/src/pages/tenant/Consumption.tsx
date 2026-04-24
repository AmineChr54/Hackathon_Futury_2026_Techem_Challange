import { useMemo, useState } from "react";
import { tenantToday as mockTenantToday } from "@/lib/mockData";
import { useUnitContext } from "@/lib/unitContext";
import { useForecast, useHistory, useToday } from "@/hooks/useApi";
import {
  forecastToDailySeries,
  forecastToMonthlySeries,
  forecastToYearlySeries,
  todayToView,
} from "@/lib/adapters";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Teco } from "@/components/Teco";
import { Sparkles, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

type Metric = "consumption" | "cost" | "co2";
type Range = "Daily" | "Monthly" | "Yearly";
type ChartType = "area" | "line" | "bar";

const metricMeta: Record<Metric, { label: string; unit: string; color: string }> = {
  consumption: { label: "Consumption", unit: "kWh", color: "hsl(var(--accent))" },
  cost: { label: "Cost", unit: "€", color: "hsl(var(--primary))" },
  co2: { label: "CO₂", unit: "kg", color: "hsl(var(--charcoal))" },
};

const rangeXKey: Record<Range, string> = {
  Daily: "label",
  Monthly: "label",
  Yearly: "label",
};

const Consumption = () => {
  const [metric, setMetric] = useState<Metric>("consumption");
  const [range, setRange] = useState<Range>("Daily");
  const [type, setType] = useState<ChartType>("area");
  const [compare, setCompare] = useState(true);

  const { selectedPid, selectedUid } = useUnitContext();
  const forecastQ = useForecast(selectedPid, selectedUid, 30);
  const historyQ = useHistory(selectedPid, selectedUid, 365);
  const todayQ = useToday(selectedPid, selectedUid);

  const tenantToday = useMemo(
    () => todayToView(todayQ.data, forecastQ.data, mockTenantToday),
    [todayQ.data, forecastQ.data],
  );

  const rangeData = useMemo<Record<Range, any[]>>(
    () => ({
      Daily: forecastToDailySeries(forecastQ.data),
      Monthly: forecastToMonthlySeries(forecastQ.data),
      Yearly: forecastToYearlySeries(forecastQ.data),
    }),
    [forecastQ.data],
  );

  const raw = rangeData[range];
  const xKey = rangeXKey[range];
  const m = metricMeta[metric];

  // Split actual vs forecast into two parallel series so we can render
  // a solid line for actuals and a dashed line for predictions.
  const data = raw.map((d, i) => {
    const next = raw[i + 1];
    return {
      ...d,
      actual: d.kind === "actual" ? d[metric] : null,
      // Connect last actual point to forecast line for visual continuity.
      forecast:
        d.kind === "forecast"
          ? d[metric]
          : next && next.kind === "forecast"
          ? d[metric]
          : null,
    };
  });

  const actuals = raw.filter((d) => d.kind === "actual");
  const forecasts = raw.filter((d) => d.kind === "forecast");

  const totalActual = actuals.reduce((s: number, d: any) => s + d[metric], 0);
  const totalForecast = forecasts.reduce((s: number, d: any) => s + d[metric], 0);
  const avgTotal = actuals.reduce((s: number, d: any) => s + d.avg, 0);
  const diff = avgTotal ? ((totalActual - avgTotal) / avgTotal) * 100 : 0;

  const fmt = (n: number) =>
    metric === "cost" ? `€${n.toFixed(0)}` : n.toFixed(metric === "consumption" && range === "Daily" ? 1 : 0);

  // Forecast headline (predictive model output)
  const forecastHeadline =
    range === "Daily"
      ? `Tomorrow's predicted use: ${tenantToday.predictedTomorrowKwh} kWh`
      : range === "Monthly"
      ? `Predicted next-month cost: €${tenantToday.predictedMonthCostEur}`
      : `Predicted year-end CO₂: ${tenantToday.predictedMonthCo2Kg * 12} kg`;

  const renderChart = () => {
    const common = { data, margin: { top: 6, right: 6, left: -22, bottom: 0 } };
    const firstForecastIdx = data.findIndex((d) => d.kind === "forecast");
    const forecastBoundary =
      firstForecastIdx > 0 ? data[firstForecastIdx][xKey] : null;

    return (
      <ComposedChart {...common}>
        <defs>
          <linearGradient id="ag-actual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={m.color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={m.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ag-forecast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={m.color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={m.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
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
        <Legend wrapperStyle={{ fontSize: 11 }} />

        {forecastBoundary && (
          <ReferenceLine
            x={forecastBoundary}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            label={{
              value: "Forecast →",
              position: "insideTopRight",
              fill: "hsl(var(--muted-foreground))",
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        )}

        {type === "bar" ? (
          <>
            <Bar
              dataKey="actual"
              fill={m.color}
              radius={[8, 8, 0, 0]}
              name={`${m.label} (actual)`}
            />
            <Bar
              dataKey="forecast"
              fill={m.color}
              fillOpacity={0.35}
              radius={[8, 8, 0, 0]}
              name={`${m.label} (forecast)`}
            />
          </>
        ) : type === "line" ? (
          <>
            <Line
              type="monotone"
              dataKey="actual"
              stroke={m.color}
              strokeWidth={3}
              dot={{ r: 3 }}
              name={`${m.label} (actual)`}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={m.color}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name={`${m.label} (forecast)`}
              connectNulls
            />
          </>
        ) : (
          <>
            <Area
              type="monotone"
              dataKey="actual"
              stroke={m.color}
              strokeWidth={2.5}
              fill="url(#ag-actual)"
              name={`${m.label} (actual)`}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke={m.color}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              fill="url(#ag-forecast)"
              name={`${m.label} (forecast)`}
              connectNulls
            />
          </>
        )}

        {compare && (
          <Line
            type="monotone"
            dataKey="avg"
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="2 4"
            dot={false}
            name="Benchmark"
          />
        )}
      </ComposedChart>
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Consumption</h1>
        <p className="text-sm text-muted-foreground">
          Explore your usage, cost, and CO₂ — past and predicted.
        </p>
      </header>

      {/* Metric selector */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(metricMeta) as Metric[]).map((k) => {
          const meta = metricMeta[k];
          const active = metric === k;
          return (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-foreground/10 bg-foreground text-background shadow-pop"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                {meta.label}
              </div>
              <div className="mt-0.5 text-base font-extrabold">{meta.unit}</div>
            </button>
          );
        })}
      </div>

      {/* Range and type */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-secondary p-0.5 text-[11px] font-bold">
          {(["Daily", "Monthly", "Yearly"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 transition ${
                range === r ? "bg-card shadow-soft text-foreground" : "text-muted-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-secondary p-0.5">
          {(
            [
              ["area", "Area"],
              ["line", "Line"],
              ["bar", "Bar"],
            ] as [ChartType, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                type === t ? "bg-card shadow-soft text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <section className="surface-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold">
              {fmt(totalActual)}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">
                {metric !== "cost" ? m.unit : ""}
              </span>
            </div>
            <div className={`text-xs font-bold ${diff < 0 ? "text-accent" : "text-primary"}`}>
              {diff < 0 ? (
                <TrendingDown className="mr-0.5 inline h-3 w-3" />
              ) : (
                <TrendingUp className="mr-0.5 inline h-3 w-3" />
              )}
              {Math.abs(diff).toFixed(1)}% vs benchmark
            </div>
          </div>
          <button
            onClick={() => setCompare((v) => !v)}
            className={`chip border ${
              compare
                ? "border-foreground/15 bg-foreground text-background"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            Benchmark
          </button>
        </div>

        {/* Legend chips for actual vs forecast */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: m.color }} />
            <span className="text-muted-foreground">Actual</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5 border-t-2 border-dashed"
              style={{ borderColor: m.color }}
            />
            <span className="text-muted-foreground">Forecast (AI model)</span>
          </span>
          {compare && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 border-t-2 border-dotted border-muted-foreground" />
              <span className="text-muted-foreground">Benchmark</span>
            </span>
          )}
        </div>

        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Forecast / predictive insight card */}
      <section className="surface-card overflow-hidden bg-gradient-charcoal p-4 text-charcoal-foreground">
        <div className="flex items-start gap-3">
          <Teco mood="happy" size={56} />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-80">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Predictive model
            </div>
            <h3 className="mt-0.5 text-sm font-extrabold">{forecastHeadline}</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              Forecasts use your past usage, weather outlook, and your apartment's profile.
              Predicted saving potential: <span className="text-accent font-bold">€{tenantToday.predictedSavingPotentialEur.toFixed(1)}</span> this month.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip bg-white/10 text-white">
                Forecast total: {fmt(totalForecast)} {metric !== "cost" ? m.unit : ""}
              </span>
              <span className="chip bg-white/10 text-white">
                Anomaly risk: {tenantToday.anomalyRisk}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Anomaly hint */}
      <section className="surface-card flex items-start gap-3 border-l-4 border-l-warning p-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-warning/15 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-warning">Predicted anomaly window</div>
          <p className="mt-0.5 text-sm font-semibold">
            The model expects a small evening spike on Wednesday based on the cold-front
            forecast. Want Teco to plan around it?
          </p>
        </div>
      </section>

      {/* Comparisons */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            vs last period
          </div>
          <div className="mt-1 text-xl font-extrabold text-accent">−12%</div>
          <p className="mt-1 text-xs text-muted-foreground">Great trend, keep it up.</p>
        </div>
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            vs neighbors
          </div>
          <div className="mt-1 text-xl font-extrabold text-accent">−18%</div>
          <p className="mt-1 text-xs text-muted-foreground">Top 25% in your building.</p>
        </div>
      </div>
    </div>
  );
};

export default Consumption;
