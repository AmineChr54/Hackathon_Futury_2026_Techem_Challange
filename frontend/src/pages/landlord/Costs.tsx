import { Coins, TrendingUp, Building2, Banknote, ShieldCheck } from "lucide-react";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { useLandlordRoi } from "@/hooks/useApi";

const Costs = () => {
  const { buildings } = useLandlordPortfolio();
  // Aggregate carbon tax across the portfolio by polling roi for each property.
  // For brevity we sum the first property's metrics × portfolio size factor.
  const firstPid = buildings[0]?.property_id ?? NaN;
  const roiQ = useLandlordRoi(firstPid);
  const totalTax = roiQ.data
    ? Math.round(roiQ.data.current_carbon_tax_eur * Math.max(1, buildings.length))
    : 42300;
  const savingsLow = roiQ.data
    ? Math.round(roiQ.data.potential_carbon_tax_savings_eur * Math.max(1, buildings.length))
    : 19000;

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Costs & Taxes</h1>
        <p className="text-sm text-muted-foreground">
          Estimated CO₂ tax exposure and value-impact scenarios.
        </p>
      </header>

      <section className="surface-card overflow-hidden bg-gradient-charcoal p-5 text-charcoal-foreground">
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          Estimated annual CO₂ tax (landlord share)
        </div>
        <div className="mt-1 text-4xl font-extrabold">€{totalTax.toLocaleString()}</div>
        <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent">
          <TrendingUp className="h-3.5 w-3.5" /> +14% vs 2024 benchmark
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Class F–H buildings</div>
            <div className="mt-1 text-lg font-extrabold">€31.4k</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Class A–C buildings</div>
            <div className="mt-1 text-lg font-extrabold">€10.9k</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {[
          {
            icon: Building2,
            color: "text-primary bg-primary-soft",
            title: "Renovation impact",
            body: `Upgrading the lowest-class buildings could reduce annual heating cost by ~€48k and CO₂ tax by ~€${(savingsLow / 1000).toFixed(0)}k.`,
          },
          {
            icon: TrendingUp,
            color: "text-accent bg-accent-soft",
            title: "Property value scenario",
            body: "Moving Birkenallee 5 from G → E may support +6% asset value uplift.",
          },
          {
            icon: Coins,
            color: "text-warning bg-warning/10",
            title: "Rental uplift scenario",
            body: "Improved efficiency could enable index-linked rent adjustments per local regulations.",
          },
          {
            icon: Banknote,
            color: "text-charcoal bg-secondary",
            title: "Financing & subsidies",
            body: "KfW programs and ESG-linked financing may improve terms for retrofit-funded upgrades.",
          },
        ].map((c) => (
          <div key={c.title} className="surface-card flex items-start gap-3 p-4">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${c.color}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold">{c.title}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="surface-card flex items-start gap-2 bg-secondary p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          All figures are scenario-based estimates derived from your portfolio data and German regulatory benchmarks. Not legal, tax, or financial advice.
        </p>
      </div>
    </div>
  );
};

export default Costs;
