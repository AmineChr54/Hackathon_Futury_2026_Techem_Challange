import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Building2, LayoutDashboard, Gauge, Coins, Wrench, FileBarChart, ArrowLeft, Sparkles, Lightbulb } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Logo } from "@/components/Logo";
import { DemoModeBanner } from "@/components/DemoModeBanner";

const items = [
  { to: "/landlord", end: true, icon: LayoutDashboard, label: "Portfolio" },
  { to: "/landlord/buildings", icon: Building2, label: "Buildings" },
  { to: "/landlord/classes", icon: Gauge, label: "Classes" },
  { to: "/landlord/costs", icon: Coins, label: "Costs" },
  { to: "/landlord/advisor", icon: Wrench, label: "Advisor" },
  { to: "/landlord/reports", icon: FileBarChart, label: "Reports" },
];

export const LandlordLayout = () => {
  const nav = useNavigate();
  return (
    <PhoneFrame>
      <div className="flex min-h-screen flex-col md:min-h-[calc(100vh-3rem)]">
        <DemoModeBanner />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-background/80 px-4 pt-4 pb-3 backdrop-blur-md">
          <button
            onClick={() => nav("/")}
            className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground hover:bg-muted transition active:scale-95"
            aria-label="Switch role"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Logo size="sm" />
          <div className="flex items-center gap-1.5">
            <NavLink
              to="/landlord/insights"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground hover:bg-muted transition"
              aria-label="Insights"
            >
              <Lightbulb className="h-4 w-4" />
            </NavLink>
            <span className="chip bg-charcoal text-charcoal-foreground">
              <Sparkles className="h-3 w-3 text-accent" /> Landlord
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-28">
          <Outlet />
        </main>

        <nav className="sticky bottom-0 z-30 mx-3 mb-3 rounded-3xl border border-border/60 bg-card/95 px-1.5 py-2 shadow-pop backdrop-blur-md">
          <ul className="flex items-center justify-between">
            {items.map(({ to, end, icon: Icon, label }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition ${
                      isActive
                        ? "bg-charcoal text-charcoal-foreground shadow-pop"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </PhoneFrame>
  );
};
