import { energyClasses } from "@/lib/mockData";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { TrendingDown, TrendingUp, Coins, Home as HomeIcon } from "lucide-react";

const EnergyClasses = () => {
  const { buildings } = useLandlordPortfolio();
  const counts = energyClasses.map((e) => ({
    ...e,
    count: buildings.filter((b) => b.energyClass === e.c).length,
  }));

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Energy Classes</h1>
        <p className="text-sm text-muted-foreground">
          German efficiency rating (A+ to H) and what it means for your portfolio.
        </p>
      </header>

      {/* Scale */}
      <section className="surface-card p-4">
        <h3 className="text-sm font-bold">Efficiency scale</h3>
        <div className="mt-3 space-y-1.5">
          {counts.map((e) => (
            <div key={e.c} className="flex items-center gap-3">
              <EnergyClassBadge c={e.c} />
              <div className="flex-1">
                <div className="text-xs font-bold">{e.band}</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${e.color}`} style={{ width: `${(e.count / 12) * 100}%` }} />
                </div>
              </div>
              <span className="w-6 text-right text-xs font-extrabold">{e.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Business context */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Why class matters</h3>
        <div className="grid gap-2.5">
          {[
            { icon: Coins, color: "text-primary bg-primary-soft", title: "CO₂ tax burden", body: "Lower-class buildings increase landlord share of CO₂ tax." },
            { icon: TrendingUp, color: "text-accent bg-accent-soft", title: "Green premium", body: "High-efficiency buildings may command higher rents and asset value." },
            { icon: TrendingDown, color: "text-warning bg-warning/10", title: "Brown discount", body: "Class F–H assets risk valuation discount and tougher financing." },
            { icon: HomeIcon, color: "text-charcoal bg-secondary", title: "Tenant attractiveness", body: "Efficient buildings reduce tenant operating costs and turnover." },
          ].map((c) => (
            <div key={c.title} className="surface-card flex items-start gap-3 p-4">
              <div className={`grid h-9 w-9 place-items-center rounded-xl ${c.color}`}>
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold">{c.title}</div>
                <p className="text-xs text-muted-foreground">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Indicative scenarios only. Not legal, tax, or financial advice.
      </p>
    </div>
  );
};

export default EnergyClasses;
