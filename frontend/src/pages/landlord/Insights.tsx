import { Teco } from "@/components/Teco";
import { landlordAdvisories } from "@/lib/mockData";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { useLandlordInsights } from "@/hooks/useApi";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { TrendingDown, TrendingUp, AlertCircle, ShieldCheck, Sparkles, Leaf, Coins } from "lucide-react";
import { Link } from "react-router-dom";

const LandlordInsights = () => {
  const { buildings, kpis: portfolioKpis } = useLandlordPortfolio();
  const flagged = buildings.filter((b) => ["F", "G", "H"].includes(b.energyClass));
  // Show AI narrative for the worst building, if any.
  const worst = flagged[0] ?? buildings[0];
  const narrativeQ = useLandlordInsights(worst?.property_id ?? NaN);

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Portfolio intelligence and strategic recommendations from Teco.
        </p>
      </header>

      {/* Teco strategic summary */}
      <section className="surface-card overflow-hidden bg-gradient-charcoal p-5 text-charcoal-foreground">
        <div className="flex items-start gap-3">
          <Teco mood="happy" size={56} float={false} />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
              <Sparkles className="h-3 w-3" /> Teco for Landlords
            </div>
            <h3 className="mt-1 text-base font-extrabold">
              Portfolio efficiency is improving
            </h3>
            <p className="mt-1 text-xs opacity-90">
              {narrativeQ.data?.narrative ??
                `Your portfolio has improved 9% year-over-year. ${flagged.length} buildings still need attention. Recommended retrofits could save €${(portfolioKpis.predictedRetrofitSavingsEur / 1000).toFixed(0)}k/year.`}
            </p>
          </div>
        </div>
      </section>

      {/* Predictive KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Predicted next-year cost
          </div>
          <div className="mt-1 text-xl font-extrabold">
            €{(portfolioKpis.predictedNextYearCostEur / 1000).toFixed(0)}k
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent">
            <TrendingDown className="h-3 w-3" /> −7% vs current
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Predicted avg class
          </div>
          <div className="mt-1 text-xl font-extrabold text-accent">
            {portfolioKpis.predictedAvgClassNextYear}
          </div>
          <div className="mt-1 text-xs font-semibold text-muted-foreground">
            up from {portfolioKpis.avgClass}
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            CO₂ reduction potential
          </div>
          <div className="mt-1 text-xl font-extrabold text-accent">
            <Leaf className="mr-1 inline h-4 w-4" /> −48 t
          </div>
          <div className="mt-1 text-xs text-muted-foreground">with recommended retrofits</div>
        </div>
        <div className="surface-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            CO₂ tax savings
          </div>
          <div className="mt-1 text-xl font-extrabold">
            <Coins className="mr-1 inline h-4 w-4 text-warning" /> €19k
          </div>
          <div className="mt-1 text-xs text-muted-foreground">annual potential reduction</div>
        </div>
      </div>

      {/* Flagged buildings */}
      {flagged.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold">
            <AlertCircle className="mr-1 inline h-4 w-4 text-primary" />
            Buildings needing attention
          </h3>
          <div className="space-y-2">
            {flagged.map((b) => (
              <Link
                key={b.id}
                to={`/landlord/buildings/${b.id}`}
                className="surface-card flex items-center gap-3 p-3.5"
              >
                <EnergyClassBadge c={b.energyClass} />
                <div className="flex-1">
                  <div className="text-sm font-bold">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {b.city} • {b.alerts} alert{b.alerts > 1 ? "s" : ""} • forecast: {b.predictedClass}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Advisory insights */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Strategic advisory</h3>
        {landlordAdvisories.map((c) => {
          const tone =
            c.tone === "warn"
              ? { b: "border-l-primary", t: "text-primary" }
              : c.tone === "good"
              ? { b: "border-l-accent", t: "text-accent" }
              : { b: "border-l-charcoal", t: "text-charcoal" };
          return (
            <div key={c.tag} className={`surface-card border-l-4 ${tone.b} p-4`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${tone.t}`}>
                {c.tag}
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">{c.text}</p>
            </div>
          );
        })}
      </section>

      <div className="surface-card flex items-start gap-2 bg-secondary p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          All insights are AI-supported estimates. Not legal, tax, or financial advice.
        </p>
      </div>
    </div>
  );
};

export default LandlordInsights;
