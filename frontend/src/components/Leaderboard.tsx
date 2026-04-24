import { Trophy, Flame, Users } from "lucide-react";
import { leaderboard, communityChallenges } from "@/lib/mockData";

export const Leaderboard = () => {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-bold">Community & leaderboard</h3>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/50 px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Linden Hof 12 — this week
          </span>
          <span className="chip bg-accent-soft text-accent">
            <Trophy className="h-3 w-3" /> Savings
          </span>
        </div>
        <ul className="divide-y divide-border/60">
          {leaderboard.map((row) => (
            <li
              key={row.rank}
              className={`flex items-center gap-3 px-4 py-3 ${
                row.you ? "bg-accent-soft/40" : ""
              }`}
            >
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  row.rank === 1
                    ? "bg-warning/20 text-warning"
                    : row.you
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-foreground"
                }`}
              >
                {row.rank}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">
                  {row.name}{" "}
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    · Apt {row.apt}
                  </span>
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <Flame className="h-3 w-3 text-warning" /> {row.streak}-day streak
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-extrabold">€{row.savings.toFixed(1)}</div>
                <div className="text-[10px] font-semibold text-muted-foreground">saved</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        {communityChallenges.map((c) => (
          <div key={c.title} className="surface-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
                  Community challenge
                </div>
                <div className="text-sm font-extrabold">{c.title}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.body}</p>
              </div>
              <span className="chip bg-secondary text-muted-foreground">
                {c.participants} joined
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-eco"
                style={{ width: `${c.progress * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
