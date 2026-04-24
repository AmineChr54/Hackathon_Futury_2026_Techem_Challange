import { useState } from "react";
import { Link } from "react-router-dom";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { Search, ChevronRight, Filter } from "lucide-react";

const Buildings = () => {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged" | "efficient">("all");

  const { buildings } = useLandlordPortfolio();

  const filtered = buildings.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "flagged") return ["F", "G", "H"].includes(b.energyClass);
    if (filter === "efficient") return ["A+", "A", "B", "C"].includes(b.energyClass);
    return true;
  });

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Buildings</h1>
        <p className="text-sm text-muted-foreground">{buildings.length} properties in your portfolio.</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search buildings..."
          className="w-full rounded-2xl bg-card border border-border pl-10 pr-3 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
        />
      </div>

      <div className="flex gap-2">
        {([
          ["all", "All"],
          ["flagged", "Flagged"],
          ["efficient", "Efficient"],
        ] as [typeof filter, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`chip border ${
              filter === k
                ? "border-foreground/15 bg-foreground text-background"
                : "border-border bg-card text-foreground"
            }`}
          >
            <Filter className="h-3 w-3" /> {l}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {filtered.map((b) => (
          <Link
            to={`/landlord/buildings/${b.id}`}
            key={b.id}
            className="surface-card flex items-center gap-3 p-4"
          >
            <EnergyClassBadge c={b.energyClass} size="lg" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold">{b.name}</span>
                {b.alerts > 0 && (
                  <span className="chip bg-primary-soft text-primary text-[10px]">
                    {b.alerts} alert{b.alerts > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">{b.city} • {b.units} units</div>
              <div className="mt-2 flex gap-3 text-[11px]">
                <span className="font-semibold text-foreground">{b.consumptionMwh} MWh</span>
                <span className="font-semibold text-muted-foreground">€{(b.costEur / 1000).toFixed(0)}k</span>
                <span className="font-semibold text-muted-foreground">{b.co2Tons} t CO₂</span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-eco"
                  style={{ width: `${b.efficiency}%` }}
                />
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Buildings;
