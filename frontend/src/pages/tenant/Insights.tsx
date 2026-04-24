import { useMemo } from "react";
import { Teco } from "@/components/Teco";
import { Bell, AlertTriangle, Award, Leaf, Flame, CloudMoon } from "lucide-react";
import { useUnitContext } from "@/lib/unitContext";
import { useLeaks, useRecommendations } from "@/hooks/useApi";

const fallbackNotifications = [
  {
    icon: CloudMoon,
    tone: "primary",
    title: "Weather-smart coaching",
    body: "Good evening! Based on today's weather and your usage, set heater to 2 overnight and 4 in the evening for better comfort and savings.",
    mood: "happy" as const,
  },
  {
    icon: Award,
    tone: "eco",
    title: "On track!",
    body: "Nice work — you're already on track to hit your monthly target. Keep going, your small habits are adding up.",
    mood: "celebrating" as const,
  },
  {
    icon: Leaf,
    tone: "eco",
    title: "CO₂ encouragement",
    body: "You avoided 1.1 kg of CO₂ today. Teco loves that. 🌱",
    mood: "excited" as const,
  },
  {
    icon: AlertTriangle,
    tone: "warning",
    title: "Anomaly alert",
    body: "Heads up — your bedroom heating seems higher than usual. Want Teco to help you investigate?",
    mood: "happy" as const,
  },
  {
    icon: Flame,
    tone: "primary",
    title: "Saving streak",
    body: "Saving streak: 4 days in a row! 🔥",
    mood: "celebrating" as const,
  },
];

const toneClasses: Record<string, string> = {
  primary: "border-l-primary bg-primary-soft text-primary",
  eco: "border-l-accent bg-accent-soft text-accent",
  warning: "border-l-warning bg-warning/10 text-warning",
};

const Insights = () => {
  const { selectedPid, selectedUid } = useUnitContext();
  const leaksQ = useLeaks(selectedPid, selectedUid);
  const recsQ = useRecommendations(selectedPid, selectedUid);

  const notifications = useMemo(() => {
    const live: typeof fallbackNotifications = [];
    const sigs = leaksQ.data?.raw_signals ?? [];
    for (const sig of sigs.slice(0, 2)) {
      live.push({
        icon: AlertTriangle,
        tone: "warning",
        title: ((sig.type as string) ?? "Anomaly detected").toString(),
        body:
          (sig.description as string) ??
          leaksQ.data?.narrative ??
          "Your usage pattern looks unusual. Want Teco to investigate?",
        mood: "happy" as const,
      });
    }
    const recItems = recsQ.data?.items ?? [];
    for (const it of recItems.slice(0, 3)) {
      live.push({
        icon: Award,
        tone: "eco",
        title: ((it.title as string) ?? "Personalised tip").toString(),
        body:
          (it.description as string) ??
          recsQ.data?.narrative ??
          "Tailored saving suggestion ready.",
        mood: "celebrating" as const,
      });
    }
    return live.length ? live : fallbackNotifications;
  }, [leaksQ.data, recsQ.data]);

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Insights & Notifications</h1>
        <p className="text-sm text-muted-foreground">Smart updates from Teco.</p>
      </header>

      <div className="space-y-3">
        {notifications.map((n) => {
          const Icon = n.icon;
          const tones = toneClasses[n.tone].split(" ");
          return (
            <div
              key={n.title}
              className={`surface-card border-l-4 ${tones[0]} overflow-hidden`}
            >
              <div className="flex items-start gap-3 p-4">
                <Teco mood={n.mood} size={48} float={false} />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${tones[2]}`} />
                    <span className={`text-xs font-bold ${tones[2]}`}>{n.title}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">
                    {n.body}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button className="chip bg-foreground text-background">Got it</button>
                    <button className="chip border border-border bg-card text-muted-foreground">Snooze</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="surface-card flex items-start gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="text-sm">
          <div className="font-bold">Notification preferences</div>
          <p className="text-muted-foreground">
            Adjust frequency and tone in Settings. Teco respects quiet hours.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Insights;
