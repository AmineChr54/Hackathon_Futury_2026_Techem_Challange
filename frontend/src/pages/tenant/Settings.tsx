import { useState } from "react";
import {
  User,
  Bell,
  Globe,
  Shield,
  HelpCircle,
  ChevronRight,
  Moon,
  Sliders,
  Home as HomeIcon,
} from "lucide-react";
import { Teco } from "@/components/Teco";
import { useUnitContext } from "@/lib/unitContext";
import { usePeers } from "@/hooks/useApi";

type Mode = "Comfort" | "Balanced" | "Saver";

const modes: { name: Mode; desc: string; icon: string }[] = [
  { name: "Comfort", desc: "Keep comfort high, optimize gently.", icon: "🛋️" },
  { name: "Balanced", desc: "Mix comfort and savings.", icon: "⚖️" },
  { name: "Saver", desc: "Strongest energy-saving tips.", icon: "🌱" },
];

const Settings = () => {
  const [notif, setNotif] = useState(true);
  const [dark, setDark] = useState(false);
  const [mode, setMode] = useState<Mode>("Balanced");

  const { units, selectedPid, selectedUid, setSelected } = useUnitContext();
  const peersQ = usePeers(selectedPid, selectedUid);

  const Toggle = ({
    value,
    onChange,
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition ${
        value ? "bg-accent" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-soft transition ${
          value ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground">Make EcoCoach feel like home.</p>
      </header>

      <section className="surface-card flex items-center gap-3 p-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-eco">
          <Teco mood="happy" size={48} float={false} />
        </div>
        <div className="flex-1">
          <div className="text-base font-extrabold">Anna Becker</div>
          <div className="text-xs text-muted-foreground">
            Unit {selectedUid} • Property {selectedPid}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </section>

      {/* Unit picker (live) */}
      {units.length > 0 && (
        <section className="surface-card p-4">
          <div className="flex items-center gap-2">
            <HomeIcon className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-bold">Switch unit</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick which unit's data to show across the app.
          </p>
          <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto">
            {units.slice(0, 30).map((u) => {
              const active = u.property_id === selectedPid && u.unit_id === selectedUid;
              return (
                <button
                  key={`${u.property_id}-${u.unit_id}`}
                  onClick={() => setSelected(u.property_id, u.unit_id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                    active ? "border-accent bg-accent-soft" : "border-border bg-card"
                  }`}
                >
                  <span className="font-bold">
                    P{u.property_id} · U{u.unit_id}
                  </span>
                  <span className="text-muted-foreground">
                    {u.city} · {u.source}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Peer comparison */}
      {peersQ.data && (
        <section className="surface-card p-4">
          <h3 className="text-sm font-bold">Peer comparison</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {peersQ.data.badge ? `${peersQ.data.badge} — ` : ""}better than{" "}
            <strong className="text-accent">
              {Math.round((peersQ.data.percentile_rank_better_than ?? 0) * 100)}%
            </strong>{" "}
            of peers in your cohort ({peersQ.data.cohort_size} units).
          </p>
        </section>
      )}

      {/* Lifestyle mode */}
      <section className="surface-card p-4">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-bold">Lifestyle mode</h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Teco adapts coaching tone and recommendations to your preference.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button
              key={m.name}
              onClick={() => setMode(m.name)}
              className={`rounded-2xl border p-3 text-left transition ${
                mode === m.name
                  ? "border-accent bg-accent-soft shadow-soft"
                  : "border-border bg-card"
              }`}
            >
              <div className="text-xl">{m.icon}</div>
              <div className="mt-1 text-sm font-bold">{m.name}</div>
              <div className="text-[11px] leading-snug text-muted-foreground">
                {m.desc}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card divide-y divide-border/60">
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Smart notifications</div>
            <div className="text-xs text-muted-foreground">Tips from Teco</div>
          </div>
          <Toggle value={notif} onChange={setNotif} />
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">
            <Moon className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Dark mode</div>
            <div className="text-xs text-muted-foreground">
              Easier on the eyes at night
            </div>
          </div>
          <Toggle
            value={dark}
            onChange={(v) => {
              setDark(v);
              document.documentElement.classList.toggle("dark", v);
            }}
          />
        </div>
      </section>

      <section className="surface-card divide-y divide-border/60">
        {[
          { icon: User, label: "Account & apartment" },
          { icon: Globe, label: "Language: English" },
          { icon: Shield, label: "Privacy & data" },
          { icon: HelpCircle, label: "Help & support" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} className="flex w-full items-center gap-3 p-4 text-left">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">
              <Icon className="h-4 w-4" />
            </div>
            <span className="flex-1 text-sm font-bold">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </section>

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        Techem EcoCoach v0.9 • Small habits, bigger savings.
      </p>
    </div>
  );
};

export default Settings;
