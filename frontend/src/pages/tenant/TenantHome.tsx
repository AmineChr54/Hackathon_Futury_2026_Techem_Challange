import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Teco } from "@/components/Teco";
import {
  tenantToday as mockTenantToday,
  coachingTips,
  suggestedPrompts,
  badges,
  tenantNotifications as mockNotifications,
} from "@/lib/mockData";
import { useUnitContext } from "@/lib/unitContext";
import { useToday, useForecast, useHistory, useRecommendations, useLeaks } from "@/hooks/useApi";
import {
  forecastToDailySeries,
  forecastToMonthlySeries,
  forecastToYearlySeries,
  todayToView,
} from "@/lib/adapters";
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
  Cloud,
  Flame,
  Euro,
  Leaf,
  ChevronRight,
  Sparkles,
  Bell,
  Trophy,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  unit: string;
  delta: string;
  tone: "primary" | "eco" | "charcoal";
}) => {
  const toneClass = {
    primary: "bg-primary-soft text-primary",
    eco: "bg-accent-soft text-accent",
    charcoal: "bg-secondary text-charcoal",
  }[tone];
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="surface-card min-w-[150px] flex-1 p-4 cursor-pointer"
    >
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-extrabold">{value}</span>
        <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-1 text-[11px] font-semibold text-accent">{delta}</div>
    </motion.div>
  );
};

const ranges = ["Daily", "Monthly", "Yearly"] as const;
type Range = (typeof ranges)[number];

type Mode = "Comfort" | "Balanced" | "Saver";
const modeData: { name: Mode; icon: string }[] = [
  { name: "Comfort", icon: "🛋️" },
  { name: "Balanced", icon: "⚖️" },
  { name: "Saver", icon: "🌱" },
];

const toneStyles = {
  success: "border-l-accent bg-accent-soft/40 text-accent",
  tip: "border-l-primary bg-primary-soft/40 text-primary",
  warning: "border-l-warning bg-warning/10 text-warning",
} as const;

const TenantHome = () => {
  const [range, setRange] = useState<Range>("Daily");
  const [mode, setMode] = useState<Mode>("Balanced");
  const { selectedPid, selectedUid } = useUnitContext();
  const todayQ = useToday(selectedPid, selectedUid);
  const forecastQ = useForecast(selectedPid, selectedUid, 30);
  const histQ = useHistory(selectedPid, selectedUid, 365);
  const recsQ = useRecommendations(selectedPid, selectedUid);
  const leaksQ = useLeaks(selectedPid, selectedUid);

  const t = useMemo(
    () => todayToView(todayQ.data, forecastQ.data, mockTenantToday),
    [todayQ.data, forecastQ.data],
  );

  const consumptionDaily = useMemo(
    () => forecastToDailySeries(forecastQ.data),
    [forecastQ.data],
  );
  const consumptionMonthly = useMemo(
    () => forecastToMonthlySeries(forecastQ.data, histQ.data),
    [forecastQ.data, histQ.data],
  );
  const consumptionYearly = useMemo(
    () => forecastToYearlySeries(forecastQ.data, histQ.data),
    [forecastQ.data, histQ.data],
  );

  // Build live notifications from /recommendations + /leaks; fall back to mock when offline.
  const tenantNotifications = useMemo(() => {
    const live: typeof mockNotifications = [];
    const recItems = recsQ.data?.items ?? [];
    if (recItems.length > 0) {
      const top = recItems[0];
      const title = (top.title as string) ?? "Personalised tip";
      const body =
        (top.description as string) ??
        recsQ.data?.narrative ??
        "We have a tailored saving suggestion for you.";
      live.push({ id: "rec", title, body, tone: "tip" });
    }
    const sigs = leaksQ.data?.raw_signals ?? [];
    if (sigs.length > 0) {
      const sig = sigs[0];
      live.push({
        id: "leak",
        title: "Heads up — anomaly detected",
        body:
          (sig.description as string) ??
          leaksQ.data?.narrative ??
          "Your usage pattern looks unusual. Want Teco to check?",
        tone: "warning",
      });
    }
    return live.length ? [...live, ...mockNotifications.slice(0, 2)] : mockNotifications;
  }, [recsQ.data, leaksQ.data]);

  const monthProgress = (t.spentThisMonthEur / t.monthlyTargetEur) * 100;

  // Range-aware summary numbers
  const summary = useMemo(() => {
    if (range === "Monthly") {
      return {
        consumption: { value: "286", unit: "kWh", delta: "↓ 12% vs Mar" },
        cost: { value: "€96", unit: "", delta: "−€36 vs avg" },
        co2: { value: "64", unit: "kg", delta: "↓ 18 kg saved" },
        title: "This month at a glance",
      };
    }
    if (range === "Yearly") {
      return {
        consumption: { value: "3,920", unit: "kWh", delta: "↓ 6% YoY" },
        cost: { value: "€1,465", unit: "", delta: "−€55 vs 2024" },
        co2: { value: "880", unit: "kg", delta: "↓ 60 kg saved" },
        title: "Year at a glance",
      };
    }
    return {
      consumption: {
        value: t.consumptionKwh.toFixed(1),
        unit: "kWh",
        delta: "↓ 8% vs avg",
      },
      cost: { value: `€${t.costEur.toFixed(2)}`, unit: "", delta: "−€1.90 saved" },
      co2: { value: t.co2SavedKg.toFixed(1), unit: "kg", delta: "🌱 nice work" },
      title: "Today at a glance",
    };
  }, [range, t]);

  // Range-aware chart data, splitting actual / forecast
  const chartData = useMemo(() => {
    const raw =
      range === "Daily"
        ? consumptionDaily
        : range === "Monthly"
          ? consumptionMonthly
          : consumptionYearly;
    return raw.map((d, i, arr) => {
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
    });
  }, [range]);

  const forecastBoundary =
    chartData.find((d) => d.kind === "forecast")?.label ?? null;

  return (
    <div className="space-y-5 pt-2">
      {/* Greeting */}
      <section className="surface-card overflow-hidden bg-gradient-hero p-4">
        <div className="flex items-start gap-3">
          <Teco mood="happy" size={72} />
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Good evening, Anna
            </div>
            <h1 className="text-xl font-extrabold leading-tight">
              You're saving like a pro 🌱
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-semibold shadow-soft">
              <Cloud className="h-3.5 w-3.5 text-accent" />
              {t.outsideTempC}°C • {t.weather}
            </div>
          </div>
        </div>
      </section>

      {/* Mode selector
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-accent" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mode</span>
        </div>
        <div className="flex rounded-full bg-secondary p-0.5 text-[11px] font-bold">
          {modeData.map((m) => (
            <button
              key={m.name}
              onClick={() => setMode(m.name)}
              className={`rounded-full px-2.5 py-1 transition ${
                mode === m.name
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground"
              }`}
            >
              {m.icon} {m.name}
            </button>
          ))}
        </div>
      </section> */}

      {/* Range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{summary.title}</h2>
        <div className="flex rounded-full bg-secondary p-0.5 text-[11px] font-bold">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 transition ${range === r
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground"
                }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 scroll-hide">
        <SummaryCard
          icon={Flame}
          label="Consumption"
          value={summary.consumption.value}
          unit={summary.consumption.unit}
          delta={summary.consumption.delta}
          tone="primary"
        />
        <SummaryCard
          icon={Euro}
          label={range === "Yearly" ? "Year cost" : range === "Monthly" ? "Month cost" : "Today's cost"}
          value={summary.cost.value}
          unit={summary.cost.unit}
          delta={summary.cost.delta}
          tone="charcoal"
        />
        <SummaryCard
          icon={Leaf}
          label="CO₂ saved"
          value={summary.co2.value}
          unit={summary.co2.unit}
          delta={summary.co2.delta}
          tone="eco"
        />
      </div>

      {/* Chart with actual + forecast */}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {range === "Daily"
                ? "This week + forecast"
                : range === "Monthly"
                  ? "Last 6 months + forecast"
                  : "Yearly trend + forecast"}
            </div>
            <h3 className="text-base font-bold">Consumption — actual vs predicted</h3>
          </div>
          <Link
            to="/tenant/consumption"
            className="inline-flex items-center gap-0.5 text-xs font-bold text-primary"
          >
            More <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-accent" />
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
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
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
                stroke="hsl(var(--accent))"
                strokeWidth={2.5}
                fill="url(#g1)"
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

      {/* Predictive insight chip */}
      <Link
        to="/tenant/consumption"
        className="surface-card flex items-center gap-3 border border-accent/30 p-4"
      >
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent">
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
            Teco's forecast
          </div>
          <div className="text-sm font-bold">
            Predicted next-month cost: €{t.predictedMonthCostEur} • saving potential €
            {t.predictedSavingPotentialEur.toFixed(1)}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {/* Monthly target */}
      <Link to="/tenant/budget" className="surface-card flex items-center gap-3 p-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold text-muted-foreground">Monthly budget</div>
          <div className="text-sm font-bold">
            €{t.spentThisMonthEur.toFixed(0)} of €{t.monthlyTargetEur} used
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-eco"
              style={{ width: `${Math.min(monthProgress, 100)}%` }}
            />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {/* Teco Coach card */}
      <section className="surface-card overflow-hidden bg-gradient-charcoal p-4 text-charcoal-foreground">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-80">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Teco the Coach • Today
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="flex-1">
            <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{coachingTips[1].body}</ReactMarkdown>
            </div>
            <Link
              to="/tenant/coach"
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground active:scale-95 transition"
            >
              Chat with Teco <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Teco mood="happy" size={64} float />
        </div>
      </section>

      {/* Smart framed notifications */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-bold">Smart notifications</h3>
        </div>
        {tenantNotifications.slice(0, 4).map((n) => (
          <div
            key={n.id}
            className={`surface-card border-l-4 p-4 ${toneStyles[n.tone].split(" ")[0]}`}
          >
            <div className="flex items-start gap-3">
              <Teco mood="happy" size={36} float={false} />
              <div className="flex-1">
                <div className={`text-xs font-bold ${toneStyles[n.tone].split(" ")[2]}`}>
                  {n.title}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-foreground prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{n.body}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Suggested prompts */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Ask Teco</h3>
        <div className="flex flex-wrap gap-2">
          {suggestedPrompts.slice(0, 8).map((p) => (
            <Link
              key={p}
              to="/tenant/coach"
              className="chip border border-border bg-card text-foreground hover:border-accent hover:text-accent transition"
            >
              {p}
            </Link>
          ))}
        </div>
      </section>

      {/* Badges teaser */}
      <Link to="/tenant/budget" className="surface-card flex items-center gap-3 p-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-warning/15 text-warning">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold text-muted-foreground">Achievements</div>
          <div className="text-sm font-bold">3 of 6 badges earned · tap to celebrate</div>
          <div className="mt-1 flex gap-1.5">
            {badges.map((b) => (
              <span
                key={b.name}
                className={`grid h-7 w-7 place-items-center rounded-full text-sm ${b.earned ? "bg-accent-soft" : "bg-muted opacity-40"
                  }`}
                title={b.name}
              >
                {b.icon}
              </span>
            ))}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
};

export default TenantHome;
