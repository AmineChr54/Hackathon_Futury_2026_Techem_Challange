import { useState, useCallback, useEffect, useRef } from "react";
import { Teco } from "@/components/Teco";
import { tenantToday as mockTenantToday, badges } from "@/lib/mockData";
import { useUnitContext } from "@/lib/unitContext";
import { useTargetMutation, useToday, useForecast, useHistory } from "@/hooks/useApi";
import { todayToView } from "@/lib/adapters";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Trophy, Flame, Plus, Minus, Sparkles, Leaf, Target, Gift, Bike, Shirt, UtensilsCrossed, Palmtree, Pencil, ChevronRight, Star, Loader2 } from "lucide-react";
import { AchievementModal } from "@/components/AchievementModal";
import { Leaderboard } from "@/components/Leaderboard";

type Mode = "Comfort" | "Balanced" | "Saver";
const modes: { name: Mode; desc: string; icon: string }[] = [
  { name: "Comfort", desc: "Keep comfort high, optimize gently.", icon: "🛋️" },
  { name: "Balanced", desc: "Mix comfort and savings.", icon: "⚖️" },
  { name: "Saver", desc: "Strongest energy-saving tips.", icon: "🌱" },
];

const planByMode: Record<Mode, string[]> = {
  Comfort: [
    "Keep daytime heater at 3 for full comfort",
    "Trim only night-time heating slightly (2 → 1.5)",
    "Use blinds after sunset to retain heat",
    "Light tip: ventilate in short bursts",
  ],
  Balanced: [
    "Lower heater to 2 overnight",
    "Reduce heating in unused rooms (setting 1)",
    "Inspect possible leakage near bedroom windows",
    "Close blinds after sunset to retain heat",
  ],
  Saver: [
    "Heater 1.5 overnight, 3 in evenings",
    "Turn unused rooms to setting 1 all day",
    "Short bursts of ventilation only",
    "Inspect window seals and curtain coverage",
    "Consider lower hot-water boiler temperature",
  ],
};

type GoalPreset = {
  id: string;
  name: string;
  amount: number;
  icon: React.ReactNode;
  emoji: string;
};

const goalPresets: GoalPreset[] = [
  { id: "tshirt", name: "Premium T-Shirt", amount: 30, icon: <Shirt className="h-6 w-6" />, emoji: "👕" },
  { id: "tapas", name: "Tapas Night with Friends", amount: 80, icon: <UtensilsCrossed className="h-6 w-6" />, emoji: "🍽️" },
  { id: "scooter", name: "New E-Scooter Fund", amount: 250, icon: <Bike className="h-6 w-6" />, emoji: "🛴" },
  { id: "bali", name: "Bali Vacation Fund", amount: 1000, icon: <Palmtree className="h-6 w-6" />, emoji: "🏝️" },
];

// Confetti component
const Confetti = ({ active }: { active: boolean }) => {
  if (!active) return null;
  const colors = ["#22c55e", "#ef4444", "#eab308", "#3b82f6", "#a855f7", "#f97316"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="animate-confetti absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 40}px`,
            width: `${6 + Math.random() * 8}px`,
            height: `${6 + Math.random() * 8}px`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: `${Math.random() * 0.8}s`,
            animationDuration: `${1.5 + Math.random() * 1.5}s`,
          }}
        />
      ))}
    </div>
  );
};

const Budget = () => {
  const [budget, setBudget] = useState(40);
  const [mode, setMode] = useState<Mode>("Balanced");
  const [co2Goal, setCo2Goal] = useState(0);
  const [openBadge, setOpenBadge] = useState<(typeof badges)[number] | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Goal & reward state
  const [selectedGoal, setSelectedGoal] = useState<GoalPreset | null>(null);
  const [customGoalName, setCustomGoalName] = useState("");
  const [customGoalAmount, setCustomGoalAmount] = useState(50);
  const [showCustom, setShowCustom] = useState(false);
  const [stamps, setStamps] = useState<boolean[]>(Array(10).fill(false));
  const [totalSaved, setTotalSaved] = useState(12);
  const [totalStamps, setTotalStamps] = useState(4);
  const [showConfetti, setShowConfetti] = useState(false);
  const [justStamped, setJustStamped] = useState<number | null>(null);

  const { selectedPid, selectedUid } = useUnitContext();
  const todayQ = useToday(selectedPid, selectedUid);
  const forecastQ = useForecast(selectedPid, selectedUid, 30);
  const historyQ = useHistory(selectedPid, selectedUid, 90);
  const targetMut = useTargetMutation(selectedPid, selectedUid);
  const tenantToday = todayToView(todayQ.data, forecastQ.data, mockTenantToday);
  const predicted = tenantToday.predictedMonthCostEur || 100;

  // Last complete calendar month cost from history series.
  const lastMonthCost = (() => {
    const series = historyQ.data?.series;
    if (!series || !series.length) return null;
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const prevY = m === 0 ? y - 1 : y;
    const prevM = m === 0 ? 11 : m - 1;
    let sum = 0;
    let count = 0;
    for (const p of series) {
      const d = new Date(p.date);
      if (d.getUTCFullYear() === prevY && d.getUTCMonth() === prevM) {
        sum += p.cost_eur;
        count++;
      }
    }
    return count > 0 ? Math.round(sum) : null;
  })();

  // Dynamic slider bounds from predicted cost, rounded to nearest 5.
  const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
  const sliderMin = roundTo5(predicted * 0.5);
  const sliderMax = roundTo5(predicted * 1.5);
  const sliderMid = roundTo5(predicted);

  const plan = planByMode[mode];
  // Server-driven feasibility once a target is set; fallback to a heuristic.
  const achievable = targetMut.data ? targetMut.data.feasible : budget >= 32;
  const livePlanNarrative = targetMut.data?.plan_narrative;

  // Re-evaluate feasibility when the user releases the slider.
  const evalTarget = (value: number, currentMode: Mode) => {
    if (!Number.isFinite(selectedPid) || !Number.isFinite(selectedUid)) return;
    targetMut.mutate({ target_value: value, target_unit: "EUR", horizon_days: 30, mode: currentMode });
  };

  const handleBudgetChange = (val: number) => {
    setBudget(val);
    setCo2Goal(Math.max(0, Math.min(100, Math.round(((predicted - val) / predicted) * 100))));
  };

  const handleCo2Change = (val: number) => {
    setCo2Goal(val);
    setBudget(Math.max(0, Math.round(predicted * (1 - val / 100))));
  };

  // Re-evaluate when mode changes
  useEffect(() => {
    evalTarget(budget, mode);
  }, [mode]);

  useEffect(() => {
    if (!hasInitialized && forecastQ.data) {
      const p = tenantToday.predictedMonthCostEur || 100;
      setBudget(p);
      setCo2Goal(0);
      setHasInitialized(true);
    }
  }, [hasInitialized, forecastQ.data, tenantToday.predictedMonthCostEur]);

  const handleSelectGoal = (goal: GoalPreset) => {
    setSelectedGoal(goal);
    setStamps(Array(10).fill(false));
    setTotalSaved(12);
    setTotalStamps(4);
    // pre-fill some stamps
    setStamps([true, true, true, true, false, false, false, false, false, false]);
  };

  const handleCustomGoal = () => {
    if (!customGoalName.trim()) return;
    const custom: GoalPreset = {
      id: "custom",
      name: customGoalName,
      amount: customGoalAmount,
      icon: <Star className="h-6 w-6" />,
      emoji: "⭐",
    };
    handleSelectGoal(custom);
    setShowCustom(false);
  };

  const simulateGoodDay = () => {
    const nextEmpty = stamps.findIndex((s) => !s);
    if (nextEmpty === -1) {
      // Card is full — reset card but keep progress
      setStamps(Array(10).fill(false));
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      return;
    }
    const newStamps = [...stamps];
    newStamps[nextEmpty] = true;
    setStamps(newStamps);
    setTotalSaved((v) => v + 3);
    setTotalStamps((v) => v + 1);
    setJustStamped(nextEmpty);
    setTimeout(() => setJustStamped(null), 600);

    // Check if card is now complete
    if (newStamps.every((s) => s)) {
      setTimeout(() => {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }, 500);
    }
  };

  const progress = selectedGoal ? Math.min((totalSaved / selectedGoal.amount) * 100, 100) : 0;

  return (
    <div className="space-y-5 pt-2">
      <Confetti active={showConfetti} />

      <header>
        <h1 className="text-2xl font-extrabold">Budget & Goals</h1>
        <p className="text-sm text-muted-foreground">Set a target. Teco builds your plan.</p>
      </header>

      {/* Budget input */}
      <section className="surface-card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Next month target
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => handleBudgetChange(Math.max(sliderMin, budget - 5))}
            className="grid h-10 w-10 place-items-center rounded-full bg-secondary active:scale-95 transition"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-4xl font-extrabold tracking-tight">€{budget}</div>
            <div className="text-xs text-muted-foreground">heating + hot water</div>
          </div>
          <button
            onClick={() => handleBudgetChange(Math.min(sliderMax, budget + 5))}
            className="grid h-10 w-10 place-items-center rounded-full bg-secondary active:scale-95 transition"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={5}
          value={budget}
          onChange={(e) => handleBudgetChange(Number(e.target.value))}
          onMouseUp={(e) => evalTarget(Number((e.target as HTMLInputElement).value), mode)}
          onTouchEnd={(e) => evalTarget(Number((e.target as HTMLInputElement).value), mode)}
          className="mt-4 w-full accent-[hsl(var(--accent))]"
        />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span>€{sliderMin}</span>
          <span>€{sliderMid}</span>
          <span>€{sliderMax}</span>
        </div>
        {lastMonthCost !== null && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-xs">
            <span className="font-semibold text-muted-foreground">Last month's cost</span>
            <span className="font-extrabold">€{lastMonthCost}</span>
          </div>
        )}
      </section>

      {/* Plan — adapts to lifestyle mode */}
      <section className="surface-card overflow-hidden bg-gradient-charcoal p-4 text-charcoal-foreground">
        <div className="flex items-start gap-3">
          <Teco mood={achievable ? "celebrating" : "happy"} size={64} />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-80">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Teco's plan • {mode}
            </div>
            <div className="mt-2 text-sm leading-relaxed prose prose-sm max-w-none prose-p:text-current prose-headings:text-white prose-strong:text-white prose-li:text-current prose-ul:text-current prose-ol:text-current text-white">
              {targetMut.isPending ? (
                <div className="flex flex-col gap-2.5 opacity-70 text-white">
                  <div className="flex items-center gap-2 text-xs font-bold text-accent mb-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Teco is reasoning a custom plan...
                  </div>
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-white/20"></div>
                  <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-white/20"></div>
                  <div className="h-2.5 w-4/6 animate-pulse rounded-full bg-white/20"></div>
                </div>
              ) : livePlanNarrative ? (
                <ReactMarkdown>{livePlanNarrative}</ReactMarkdown>
              ) : (
                <p>
                  {achievable
                    ? `€${budget} looks achievable in ${mode} mode! Here's how to get there:`
                    : `€${budget} is ambitious — possible with stronger habits in ${mode} mode:`}
                </p>
              )}
            </div>
          </div>
        </div>
        {!livePlanNarrative && !targetMut.isPending && (
          <ul className="mt-3 space-y-2">
            {plan.map((p, i) => (
              <motion.li
                key={p}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <span className="mt-0.5 text-accent">●</span>
                <span>{p}</span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      {/* CO2 goal */}
      <section className="surface-card p-4">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold">CO₂ reduction goal</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold">{co2Goal}</span>
          <span className="text-sm font-semibold text-muted-foreground">% less CO₂</span>
        </div>
        <input
          type="range"
          min={5}
          max={40}
          value={co2Goal}
          onChange={(e) => handleCo2Change(Number(e.target.value))}
          onMouseUp={() => evalTarget(budget, mode)}
          onTouchEnd={() => evalTarget(budget, mode)}
          className="mt-3 w-full accent-[hsl(var(--accent))]"
        />
      </section>

      {/* Lifestyle mode */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Lifestyle mode</h3>
        <div className="grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button
              key={m.name}
              onClick={() => setMode(m.name)}
              className={`rounded-2xl border p-3 text-left transition active:scale-95 ${mode === m.name
                ? "border-accent bg-accent-soft shadow-soft"
                : "border-border bg-card"
                }`}
            >
              <div className="text-xl">{m.icon}</div>
              <div className="mt-1 text-sm font-bold">{m.name}</div>
              <div className="text-[11px] text-muted-foreground leading-snug">{m.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* ========== GOAL SETUP ========== */}
      <section className="surface-card p-5">
        <div className="text-center">
          <h3 className="text-lg font-extrabold">What are we saving for? 🎯</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a goal. We'll turn your daily heating savings into real rewards.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {goalPresets.map((goal) => (
            <motion.button
              key={goal.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelectGoal(goal)}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${selectedGoal?.id === goal.id
                ? "border-accent bg-accent-soft shadow-glow-eco animate-glow-pulse"
                : "border-border bg-card hover:border-accent/40"
                }`}
            >
              <div className="text-3xl">{goal.emoji}</div>
              <div className="text-xs font-bold">{goal.name}</div>
              <div className="text-[11px] text-muted-foreground">~€{goal.amount}</div>
            </motion.button>
          ))}
        </div>

        {/* Custom goal */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCustom(!showCustom)}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-accent/40 p-3 text-left transition hover:bg-accent-soft/30"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <Pencil className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Create Your Own Goal</div>
            <div className="text-[11px] text-muted-foreground">Concert ticket, weekend trip, new headphones...</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </motion.button>

        <AnimatePresence>
          {showCustom && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 rounded-2xl bg-secondary p-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Goal name
                  </label>
                  <input
                    value={customGoalName}
                    onChange={(e) => setCustomGoalName(e.target.value)}
                    placeholder="e.g. Concert ticket, Weekend trip..."
                    className="mt-1 w-full rounded-xl bg-card border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Target amount: €{customGoalAmount}
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={500}
                    step={10}
                    value={customGoalAmount}
                    onChange={(e) => setCustomGoalAmount(Number(e.target.value))}
                    className="mt-1 w-full accent-[hsl(var(--accent))]"
                  />
                </div>
                <button
                  onClick={handleCustomGoal}
                  className="w-full rounded-xl bg-gradient-eco py-2.5 text-sm font-bold text-white shadow-glow-eco active:scale-[0.98] transition"
                >
                  Start My Journey 🚀
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ========== REWARD DASHBOARD ========== */}
      {selectedGoal && (
        <section className="surface-card overflow-hidden p-5">
          {/* Goal header */}
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-2xl">
              {selectedGoal.emoji}
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold">{selectedGoal.name}</div>
              <div className="text-xs text-muted-foreground">
                €{totalSaved} / €{selectedGoal.amount} saved
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-accent">{progress.toFixed(0)}%</div>
            </div>
          </div>

          {/* Animated progress bar */}
          <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="relative h-full rounded-full bg-gradient-eco overflow-hidden"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <div className="animate-shimmer absolute inset-0" />
            </motion.div>
          </div>

          {/* Digital stamp card */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Digital Stamp Card
              </h4>
              <span className="chip bg-accent-soft text-accent">
                <Gift className="h-3 w-3" /> {totalStamps} total stamps
              </span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2.5">
              {stamps.map((filled, i) => (
                <motion.div
                  key={i}
                  className={`relative grid aspect-square place-items-center rounded-2xl border-2 transition ${filled
                    ? "border-accent bg-accent-soft"
                    : "border-dashed border-border bg-secondary/50"
                    }`}
                  animate={justStamped === i ? { scale: [1, 1.3, 0.9, 1] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  {filled ? (
                    <motion.div
                      initial={justStamped === i ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="text-lg"
                    >
                      🌿
                    </motion.div>
                  ) : (
                    <div className="text-[10px] font-bold text-muted-foreground">{i + 1}</div>
                  )}
                </motion.div>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Each stamp ≈ €3 in savings
            </p>
          </div>

          {/* Simulate button */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={simulateGoodDay}
            className="mt-4 w-full rounded-2xl bg-gradient-eco py-3.5 text-sm font-extrabold text-white shadow-glow-eco transition"
          >
            Simulate Good Energy Day 🌿
          </motion.button>
        </section>
      )}

      {/* Streak + Reward */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-card p-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-warning/15 text-warning">
            <Flame className="h-5 w-5" />
          </div>
          <div className="mt-2 text-2xl font-extrabold">{tenantToday.streakDays}</div>
          <div className="text-xs font-semibold text-muted-foreground">day saving streak</div>
        </div>
        <div className="surface-card p-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Target className="h-5 w-5" />
          </div>
          <div className="mt-2 text-sm font-extrabold">{selectedGoal?.name ?? "Pick a goal"}</div>
          <div className="text-xs text-muted-foreground">
            {selectedGoal ? `€${totalSaved} of €${selectedGoal.amount}` : "See above"}
          </div>
          {selectedGoal && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-eco transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Achievements (clickable) */}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Achievements</h3>
          <span className="chip bg-accent-soft text-accent">3 / 6</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {badges.map((b) => (
            <motion.button
              key={b.name}
              whileTap={{ scale: 0.94 }}
              onClick={() => setOpenBadge(b)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-center transition ${b.earned
                ? "bg-secondary hover:bg-accent-soft"
                : "bg-muted/50 opacity-60 hover:opacity-90"
                }`}
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-card text-2xl shadow-soft">
                {b.icon}
              </div>
              <div className="text-[11px] font-bold">{b.name}</div>
              <div className="text-[10px] font-semibold text-muted-foreground">
                {b.earned ? "Earned" : "Locked"}
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Community + Leaderboard */}
      <Leaderboard />

      {/* Challenge of week */}
      <section className="surface-card overflow-hidden bg-gradient-eco p-4 text-white shadow-glow-eco">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-90">
          <Trophy className="h-3.5 w-3.5" /> Challenge of the week
        </div>
        <h3 className="mt-1 text-lg font-extrabold">Cozy & lean</h3>
        <p className="mt-1 text-sm opacity-95">
          Keep evenings under 5 kWh for 5 nights. Reward: +50 EcoPoints + new badge.
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full w-2/5 rounded-full bg-white" />
        </div>
        <div className="mt-1 text-[11px] font-semibold opacity-90">2 of 5 nights</div>
      </section>

      <AchievementModal badge={openBadge} onClose={() => setOpenBadge(null)} />
    </div>
  );
};

export default Budget;
