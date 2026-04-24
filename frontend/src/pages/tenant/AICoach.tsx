import { useState } from "react";
import { Teco } from "@/components/Teco";
import { coachingTips, suggestedPrompts } from "@/lib/mockData";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useUnitContext } from "@/lib/unitContext";
import { useChatMutation } from "@/hooks/useApi";

type Msg = {
  role: "teco" | "user";
  text: string;
  mood?: "happy" | "celebrating" | "excited";
};

const initial: Msg[] = [
  {
    role: "teco",
    mood: "happy",
    text: "Hi Anna! 👋 You saved €1.90 today and avoided 0.8 kg of CO₂. Want a tip for tonight?",
  },
];

const responses: Record<string, { text: string; mood?: Msg["mood"] }> = {
  default: {
    text: "Great question! Looking at your last 7 days, lowering bedroom heating from 3 to 2 overnight could save around €1.20 a day with no comfort loss.",
    mood: "happy",
  },
  "Which room is costing me the most?": {
    text: "Living Room is your biggest contributor — about 38% of today's heating. Bedroom is unusually high too, which often points to heat leakage near windows.",
  },
  "How can I reduce my energy use this week?": {
    text: "Three quick wins: 1) Heater 2 overnight, 2) Close blinds after sunset, 3) Reduce unused-room heating to setting 1. Estimated saving: €6–€9 this week.",
    mood: "celebrating",
  },
  "Could there be leakage in my apartment?": {
    text: "Your bedroom warms slowly even with high heater settings — that's a typical leakage signature. Check window seals and curtain coverage. I can flag it for your landlord if you'd like.",
  },
  "How can I stay warm but spend less?": {
    text: "Great question! Layer up with a warm sweater, close blinds at sunset, and set your heater to 2 in rooms you're actively using. Estimated saving: €1.50/day without losing comfort.",
    mood: "happy",
  },
  "Why was my cost higher this month?": {
    text: "April saw a cold snap mid-month that pushed heating usage up by ~14%. Your evening patterns also shifted slightly higher. The good news: your overall trend is still improving vs last year.",
    mood: "happy",
  },
  "How can I reduce CO₂ emissions?": {
    text: "Your biggest lever is reducing overnight heating — it accounts for ~35% of your emissions. Also, short burst ventilation (5 min) instead of tilting windows keeps heat in the walls and reduces reheating energy.",
    mood: "excited",
  },
  "Is my heating behavior efficient?": {
    text: "Overall, yes! You're in the top 25% of your building. Your morning warm-up is efficient, but evening usage creeps up slightly. Lowering by 1 setting after 10 PM could save another €0.80/day.",
    mood: "celebrating",
  },
  "What should I change first to save money?": {
    text: "The single biggest change: lower your bedroom heater from 3 to 2 overnight. It's the lowest effort for the highest return — about €1.20/day saved with minimal comfort impact.",
    mood: "happy",
  },
};

const toneMeta = {
  success: {
    icon: CheckCircle2,
    color: "text-accent",
    bg: "bg-accent-soft",
    border: "border-accent",
  },
  tip: {
    icon: Lightbulb,
    color: "text-primary",
    bg: "bg-primary-soft",
    border: "border-primary",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning",
  },
} as const;

const AICoach = () => {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const { selectedPid, selectedUid } = useUnitContext();
  const chat = useChatMutation(selectedPid, selectedUid);

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");

    const history = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [m.text],
    }));

    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          setMessages((m) => [...m, { role: "teco", text: data.reply, mood: "happy" }]);
        },
        onError: () => {
          // Fallback to canned responses when LLM/backend unavailable.
          const reply = responses[text] ?? responses.default;
          setMessages((m) => [
            ...m,
            { role: "teco", text: reply.text, mood: reply.mood ?? "happy" },
          ]);
        },
      },
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center gap-3">
        <Teco mood="happy" size={56} />
        <div>
          <h1 className="text-2xl font-extrabold">Teco the Coach</h1>
          <p className="text-xs text-muted-foreground">
            Your friendly energy coach — powered by AI
          </p>
        </div>
      </header>

      {/* Tip cards — friendlier copy */}
      <div className="space-y-2">
        {coachingTips.map((tip, i) => {
          const meta = toneMeta[tip.tone];
          const Icon = meta.icon;
          return (
            <motion.div
              key={tip.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`surface-card border-l-4 ${meta.border} p-4`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-xl ${meta.bg} ${meta.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className={`text-xs font-bold ${meta.color}`}>{tip.title}</div>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {tip.body}
                  </p>
                  {tip.tone === "warning" && (
                    <button
                      onClick={() =>
                        send("Could there be leakage in my apartment?")
                      }
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-3 py-1 text-[11px] font-bold text-warning active:scale-95 transition"
                    >
                      Yes, take a closer look
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Conversation */}
      <section className="surface-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-4 py-3">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-bold">Chat with Teco</span>
        </div>

        <div className="max-h-72 space-y-3 overflow-y-auto p-4">
          <AnimatePresence>

            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-end gap-2 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "teco" && (
                  <Teco mood={m.mood ?? "happy"} size={32} float={false} />
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === "teco"
                      ? "bg-secondary text-foreground rounded-bl-md"
                      : "bg-gradient-eco text-white rounded-br-md shadow-glow-eco"
                  }`}
                >
                  {m.text}
                </div>
              </motion.div>
            ))}
            {chat.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-end gap-2 justify-start"
              >
                <Teco mood="happy" size={32} float={false} />
                <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-secondary text-foreground rounded-bl-md flex flex-col gap-2.5 min-w-[160px]">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> Reasoning...
                  </div>
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-foreground/10"></div>
                  <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-foreground/10"></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Suggested prompts */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scroll-hide">
          {suggestedPrompts.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="chip whitespace-nowrap border border-border bg-card text-foreground hover:border-accent hover:text-accent transition active:scale-95"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border/60 bg-card p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Teco anything..."
            className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground shadow-glow-eco transition active:scale-95"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </div>
  );
};

export default AICoach;
