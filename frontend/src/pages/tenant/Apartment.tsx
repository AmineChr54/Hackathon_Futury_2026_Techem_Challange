import { useMemo } from "react";
import { Teco } from "@/components/Teco";
import { Info, Wind, Sparkles } from "lucide-react";
import apartmentDiagram from "@/assets/apartment-diagram.png";
import { useUnitContext } from "@/lib/unitContext";
import { useDrilldown } from "@/hooks/useApi";
import { drilldownToRooms } from "@/lib/adapters";

// Conceptual apartment diagram — clearly marked as estimated.
// Tiles never display measured room temperatures — only AI-estimated impact.
const layout = [
  { name: "Bedroom", row: 1, col: 1, w: 1, h: 1 },
  { name: "Bathroom", row: 1, col: 2, w: 1, h: 1 },
  { name: "Hallway", row: 2, col: 1, w: 2, h: 1 },
  { name: "Living Room", row: 3, col: 1, w: 2, h: 2 },
  { name: "Kitchen", row: 5, col: 1, w: 2, h: 1 },
];

const impactBand = (impact: number) => {
  if (impact >= 30)
    return {
      label: "High",
      bar: "bg-primary",
      tile: "from-primary/30 to-primary/10 border-primary/40",
      text: "text-primary",
    };
  if (impact >= 15)
    return {
      label: "Medium",
      bar: "bg-warning",
      tile: "from-warning/25 to-warning/5 border-warning/40",
      text: "text-warning",
    };
  return {
    label: "Low",
    bar: "bg-accent",
    tile: "from-accent/20 to-accent/5 border-accent/30",
    text: "text-accent",
  };
};

const Apartment = () => {
  const { selectedPid, selectedUid } = useUnitContext();
  const drillQ = useDrilldown(selectedPid, selectedUid, 30);
  const rooms = useMemo(() => drilldownToRooms(drillQ.data), [drillQ.data]);

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Apartment Overview</h1>
        <p className="text-sm text-muted-foreground">
          A conceptual view of where your energy goes — AI-estimated, not measured per room.
        </p>
      </header>

      <div className="surface-card flex items-start gap-2 bg-primary-soft p-3 text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs leading-relaxed">
          Room-level insights are <strong>AI-estimated</strong> from your meter data,
          heater settings, and weather — not direct room measurements.
        </p>
      </div>

      {/* Apartment Illustration */}
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h3 className="text-sm font-bold">Estimated Apartment Overview</h3>
          <span className="chip bg-secondary text-muted-foreground">AI-Estimated</span>
        </div>
        <div className="relative mt-3 px-4 pb-4">
          <img
            src={apartmentDiagram}
            alt="Apartment floor plan illustration showing room layout"
            className="w-full rounded-2xl border border-border/40 bg-secondary/30"
            loading="lazy"
          />
          <div className="absolute bottom-6 left-6 rounded-xl bg-card/90 px-3 py-1.5 text-[10px] font-bold text-muted-foreground shadow-soft backdrop-blur-sm">
            Home Energy Map
          </div>
        </div>
      </section>

      {/* Home energy map — interactive grid */}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">AI-estimated Room Impact</h3>
          <span className="chip bg-secondary text-muted-foreground">Estimated</span>
        </div>
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: "repeat(2, 1fr)", gridAutoRows: "70px" }}
        >
          {layout.map((cell) => {
            const room = rooms.find((r) => r.name === cell.name)!;
            const band = impactBand(room.impact);
            return (
              <div
                key={cell.name}
                style={{
                  gridColumn: `span ${cell.w}`,
                  gridRow: `span ${cell.h}`,
                }}
                className={`relative flex flex-col justify-between rounded-2xl border bg-gradient-to-br p-3 ${band.tile}`}
              >
                <div>
                  <div className="text-xs font-bold">{cell.name}</div>
                  <div className={`text-[10px] font-semibold ${band.text}`}>
                    {band.label} impact
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    est.
                  </span>
                  <span className="text-sm font-extrabold">{room.impact}%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Low
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Medium
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> High
          </span>
        </div>
      </section>

      {/* Hotspot insight */}
      <section className="surface-card flex items-start gap-3 border-l-4 border-l-warning p-4">
        <Teco mood="happy" size={56} />
        <div className="flex-1">
          <div className="text-xs font-bold text-warning">Heating hotspot</div>
          <p className="mt-0.5 text-sm font-semibold">
            Bedroom usage suggests possible heat leakage near the windows. A quick seal check
            could save €3–€6/month — want me to flag it for your landlord?
          </p>
        </div>
      </section>

      {/* Estimated room insights — no exact temps */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Estimated room insights</h3>
        <div className="space-y-2">
          {rooms.map((r) => {
            const band = impactBand(r.impact);
            return (
              <div key={r.name} className="surface-card p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{r.name}</span>
                  <span className="text-sm font-extrabold">{r.impact}%</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`chip text-[10px] ${band.bar.replace("bg-", "bg-")}/15 ${band.text}`}>
                    {band.label} impact
                  </span>
                  <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${band.bar}`}
                    style={{ width: `${Math.min(r.impact * 2, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface-card flex items-start gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Wind className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <div className="font-bold">Quick action</div>
          <p className="text-muted-foreground">
            Try airing rooms in short bursts (about 5 min) instead of leaving windows tilted —
            it keeps heat in the walls.
          </p>
        </div>
      </section>

      <section className="surface-card flex items-start gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <div className="font-bold">How Teco estimates this</div>
          <p className="text-muted-foreground">
            Teco combines your meter data, heater settings, runtime, weather, and apartment
            characteristics to estimate where your energy is most likely going.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Apartment;
