import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, BarChart3, Sparkles, Target, LayoutGrid, Settings, ArrowLeft, Bell } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Logo } from "@/components/Logo";
import { DemoModeBanner } from "@/components/DemoModeBanner";

const items = [
  { to: "/tenant", end: true, icon: Home, label: "Home" },
  { to: "/tenant/consumption", icon: BarChart3, label: "Use" },
  { to: "/tenant/coach", icon: Sparkles, label: "Teco" },
  { to: "/tenant/budget", icon: Target, label: "Goals" },
  { to: "/tenant/apartment", icon: LayoutGrid, label: "Apt" },
];

export const TenantLayout = () => {
  const nav = useNavigate();
  return (
    <PhoneFrame>
      <div className="flex h-screen flex-col md:h-[calc(100vh-3rem)]">
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
              to="/tenant/insights"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground hover:bg-muted transition"
              aria-label="Insights"
            >
              <Bell className="h-4 w-4" />
            </NavLink>
            <NavLink
              to="/tenant/settings"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground hover:bg-muted transition"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </NavLink>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-28">
          <Outlet />
        </main>

        <nav className="sticky bottom-0 z-30 mx-3 mb-3 rounded-3xl border border-border/60 bg-card/95 px-2 py-2 shadow-pop backdrop-blur-md">
          <ul className="flex items-center justify-between">
            {items.map(({ to, end, icon: Icon, label }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-semibold transition ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-glow-red"
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
