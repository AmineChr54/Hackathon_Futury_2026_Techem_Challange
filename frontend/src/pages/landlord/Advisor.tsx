import { useState } from "react";
import {
  retrofitScenarios,
  landlordAdvisories,
} from "@/lib/mockData";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { useUnitContext } from "@/lib/unitContext";
import { useChatMutation, useLandlordRoi } from "@/hooks/useApi";
import { EnergyClassBadge } from "@/components/EnergyClassBadge";
import { Teco } from "@/components/Teco";
import {
  Wrench,
  ChevronRight,
  TrendingUp,
  Clock,
  Coins,
  ShieldCheck,
  Sparkles,
  Info,
  Send,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type LandlordMsg = {
  role: "teco" | "user";
  text: string;
};

const landlordPrompts = [
  "Which building should I renovate first?",
  "What would help move Birkenallee 5 from G to D?",
  "Which retrofit has the best ROI?",
  "How does energy class affect my costs?",
  "Which building has the highest CO₂ burden?",
  "Which building has the strongest upgrade potential?",
];

const landlordResponses: Record<string, string> = {
  "Which building should I renovate first?":
    "Based on ROI analysis, Birkenallee 5 (Class G) offers the highest upgrade potential. A combined insulation + window retrofit could move it to Class E with €16.8k annual savings and a 10–13 year payback.",
  "What would help move Birkenallee 5 from G to D?":
    "To reach D, I recommend: 1) Façade insulation (biggest impact at ~30% energy reduction), 2) Window replacement (double to triple glazing), 3) Hydraulic balancing for even heat distribution. Estimated investment: €180k–€250k with ~12 year payback.",
  "Which retrofit has the best ROI?":
    "Quick wins like controls and hydraulic balancing across your Class F–G buildings offer the best short-term ROI: 5–7 year payback at €18k–€32k investment per building. For long-term ROI, the full retrofit + heat pump scenario offers 14% value uplift.",
  "How does energy class affect my costs?":
    "Class F–H buildings carry ~74% of your portfolio's CO₂ tax burden (€31.4k of €42.3k total). They also face brown discount risk in valuations. Improving to D–E can significantly reduce both tax exposure and operating costs.",
  "Which building has the highest CO₂ burden?":
    "Eichenweg 7 (Class F, Frankfurt) at 41 tons CO₂/year, followed closely by Birkenallee 5 (Class G, Hamburg) at 36 tons. Together they represent ~20% of your portfolio emissions. Both are strong retrofit candidates.",
  "Which building has the strongest upgrade potential?":
    "Birkenallee 5 has the highest improvement delta — from G to potentially E with full retrofit. Eichenweg 7 (F → D) is a close second. Both have strong financing potential via KfW programs for energy-efficient renovation.",
  default:
    "Based on your portfolio data, I'd recommend focusing on the 3 lowest-class buildings first. A phased approach starting with quick wins (controls + balancing) can generate early savings while planning larger insulation projects. Would you like me to detail specific scenarios?",
};

const Advisor = () => {
  const { buildings } = useLandlordPortfolio();
  const fallbackId =
    buildings.find((b) => b.energyClass === "G")?.id ?? buildings[0]?.id ?? "p1";
  const [selectedId, setSelectedId] = useState<string>(fallbackId);
  const b = buildings.find((x) => x.id === selectedId) ?? buildings[0];
  const roiQ = useLandlordRoi(b?.property_id ?? NaN);

  // Reuse the tenant /chat endpoint with the first unit of the property.
  const { units } = useUnitContext();
  const firstUnit = units.find((u) => u.property_id === b?.property_id);
  const chatMut = useChatMutation(
    b?.property_id ?? NaN,
    firstUnit?.unit_id ?? NaN,
  );

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<LandlordMsg[]>([
    {
      role: "teco",
      text: "Hello Daniel. I'm Teco for Landlords — your strategic retrofit advisor. Ask me about building upgrades, ROI scenarios, or CO₂ optimization across your portfolio.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const sendChat = (text: string) => {
    if (!text.trim()) return;
    setChatMessages((m) => [...m, { role: "user", text }]);
    setChatInput("");

    const history = chatMessages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [m.text],
    }));

    chatMut.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          setChatMessages((m) => [...m, { role: "teco", text: data.reply }]);
        },
        onError: () => {
          const reply = landlordResponses[text] ?? landlordResponses.default;
          setChatMessages((m) => [...m, { role: "teco", text: reply }]);
        },
      },
    );
  };

  if (!b) return null;

  return (
    <div className="space-y-5 pt-2">
      {/* Hero with Teco for Landlords */}
      <header className="surface-card overflow-hidden bg-gradient-charcoal p-5 text-charcoal-foreground">
        <div className="flex items-start gap-3">
          <Teco mood="happy" size={64} float={false} />
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Techem Retrofit Advisor
            </div>
            <h1 className="mt-1 text-xl font-extrabold">Strategic upgrade scenarios</h1>
            <p className="mt-1 text-xs opacity-90">
              Predictive, AI-supported analysis. Indicative cost-benefit — not an offer
              or warranty.
            </p>
          </div>
        </div>
      </header>

      {/* Chat with Teco toggle */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setShowChat(!showChat)}
        className="surface-card flex w-full items-center gap-3 border-2 border-accent/30 p-4 text-left hover:border-accent/60 transition"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-eco text-white">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-extrabold">Chat with Teco</div>
          <p className="text-[11px] text-muted-foreground">
            Ask strategic questions about your portfolio, retrofits, and ROI scenarios
          </p>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition ${showChat ? "rotate-90" : ""}`} />
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {showChat && (
          <motion.section
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="surface-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border/60 bg-charcoal px-4 py-3 text-charcoal-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-bold">Teco for Landlords</span>
              </div>

              <div className="max-h-64 space-y-3 overflow-y-auto p-4">
                {chatMessages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "teco" && <Teco mood="happy" size={28} float={false} />}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        m.role === "teco"
                          ? "bg-secondary text-foreground rounded-bl-md"
                          : "bg-gradient-charcoal text-charcoal-foreground rounded-br-md shadow-pop"
                      }`}
                    >
                      {m.text}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto px-4 pb-3 scroll-hide">
                {landlordPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendChat(p)}
                    className="chip whitespace-nowrap border border-border bg-card text-foreground hover:border-charcoal hover:text-charcoal transition active:scale-95"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat(chatInput);
                }}
                className="flex items-center gap-2 border-t border-border/60 bg-card p-3"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask Teco about your portfolio..."
                  className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-charcoal/20"
                />
                <button
                  type="submit"
                  className="grid h-10 w-10 place-items-center rounded-full bg-charcoal text-charcoal-foreground shadow-pop transition active:scale-95"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Building picker */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scroll-hide">
        {buildings.map((bx) => (
          <button
            key={bx.id}
            onClick={() => setSelectedId(bx.id)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl border p-2.5 transition active:scale-95 ${
              selectedId === bx.id
                ? "border-charcoal bg-charcoal text-charcoal-foreground"
                : "border-border bg-card"
            }`}
          >
            <EnergyClassBadge c={bx.energyClass} size="sm" />
            <span className="text-xs font-bold">{bx.name}</span>
          </button>
        ))}
      </div>

      {/* Selected analysis */}
      <section className="surface-card p-4">
        <div className="flex items-center gap-3">
          <EnergyClassBadge c={b.energyClass} size="lg" />
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Current analysis
            </div>
            <div className="text-base font-extrabold">{b.name}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Forecast class
            </div>
            <div className="text-lg font-extrabold text-accent">
              {b.predictedClass}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground">
          This building is currently in class <strong>{b.energyClass}</strong>. The biggest
          improvement opportunity is{" "}
          <strong>façade insulation and window replacement</strong>. A combined controls +
          envelope upgrade may move it toward class{" "}
          <strong>{b.predictedClass}</strong>, with a predicted annual cost of{" "}
          <strong>€{(b.predictedCostEur / 1000).toFixed(1)}k</strong> (vs €
          {(b.costEur / 1000).toFixed(1)}k today).
        </p>
        {roiQ.data && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-secondary p-2">
              <div className="font-bold text-muted-foreground">CO₂ tax now</div>
              <div className="text-sm font-extrabold">
                €{Math.round(roiQ.data.current_carbon_tax_eur).toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-accent-soft p-2">
              <div className="font-bold text-accent">Tax savings potential</div>
              <div className="text-sm font-extrabold text-accent">
                €{Math.round(roiQ.data.potential_carbon_tax_savings_eur).toLocaleString()}
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-primary-soft p-2">
              <div className="font-bold text-primary">Property value uplift</div>
              <div className="text-sm font-extrabold text-primary">
                +€{Math.round(roiQ.data.potential_property_value_increase_eur).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Scenarios */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Upgrade scenarios</h3>
        <div className="space-y-3">
          {retrofitScenarios.map((s, i) => (
            <div key={s.title} className="surface-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-secondary text-foreground">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Scenario {i + 1}
                    </div>
                    <div className="text-sm font-extrabold">{s.title}</div>
                  </div>
                </div>
                <span className="chip bg-accent-soft text-accent">{s.impact}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-secondary p-3">
                  <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Investment
                  </div>
                  <div className="text-sm font-extrabold">{s.cost}</div>
                </div>
                <div className="rounded-2xl bg-accent-soft p-3">
                  <TrendingUp className="h-3.5 w-3.5 text-accent" />
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                    Annual saving
                  </div>
                  <div className="text-sm font-extrabold text-accent">
                    {s.annualSaving}
                  </div>
                </div>
                <div className="rounded-2xl bg-secondary p-3">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Payback
                  </div>
                  <div className="text-sm font-extrabold">{s.payback}</div>
                </div>
                <div className="rounded-2xl bg-primary-soft p-3">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Value uplift
                  </div>
                  <div className="text-sm font-extrabold text-primary">
                    {s.valueUplift}
                  </div>
                </div>
              </div>
              <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-charcoal active:scale-95 transition">
                Plan this scenario <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* German market context */}
      <section className="surface-card p-4">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">German market context</h3>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <strong className="text-foreground">A+ to C:</strong> highly efficient — likely
            <span className="text-accent font-bold"> green premium</span> potential.
          </li>
          <li>
            <strong className="text-foreground">D to E:</strong> average — current stock
            average sits here.
          </li>
          <li>
            <strong className="text-foreground">F to H:</strong> inefficient — likely
            <span className="text-primary font-bold"> brown discount</span>, higher
            landlord CO₂ tax share.
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Scenario-based estimates from your portfolio data and German benchmarks. Not
          legal, tax, or financial advice.
        </p>
      </section>

      {/* Advisory cards */}
      <section className="space-y-2">
        {landlordAdvisories.map((c) => {
          const tone =
            c.tone === "warn"
              ? { b: "border-l-primary", t: "text-primary" }
              : c.tone === "good"
              ? { b: "border-l-accent", t: "text-accent" }
              : { b: "border-l-charcoal", t: "text-charcoal" };
          return (
            <div
              key={c.tag}
              className={`surface-card border-l-4 ${tone.b} p-4`}
            >
              <div className={`text-[11px] font-bold uppercase tracking-wider ${tone.t}`}>
                {c.tag}
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">{c.text}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default Advisor;
