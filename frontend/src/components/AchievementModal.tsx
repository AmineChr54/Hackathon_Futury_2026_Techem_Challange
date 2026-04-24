import { motion, AnimatePresence } from "framer-motion";
import { Teco } from "@/components/Teco";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Badge = { name: string; icon: string; earned: boolean; description: string };

const encouragements = [
  "Amazing work! You unlocked this by building better energy habits.",
  "Teco is celebrating with you! Keep up the great progress.",
  "You're making real progress — every small habit counts.",
];

const ConfettiParticles = () => {
  const colors = ["#22c55e", "#ef4444", "#eab308", "#3b82f6", "#a855f7", "#f97316", "#ec4899"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="animate-confetti absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 20}px`,
            width: `${5 + Math.random() * 7}px`,
            height: `${5 + Math.random() * 7}px`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: `${Math.random() * 0.6}s`,
            animationDuration: `${1.5 + Math.random() * 1}s`,
          }}
        />
      ))}
    </div>
  );
};

export const AchievementModal = ({
  badge,
  onClose,
}: {
  badge: Badge | null;
  onClose: () => void;
}) => {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (badge?.earned) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [badge]);

  useEffect(() => {
    if (badge) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [badge, onClose]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 grid place-items-center bg-charcoal/60 p-5 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-card p-6 text-center shadow-pop"
          >
            {showConfetti && <ConfettiParticles />}

            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto grid h-24 w-24 place-items-center">
              <Teco
                mood={badge.earned ? "celebrating" : "happy"}
                size={96}
                float={false}
              />
            </div>

            <motion.div
              className="mt-3 text-4xl"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {badge.icon}
            </motion.div>
            <h2 className="mt-1 text-lg font-extrabold">{badge.name}</h2>

            {badge.earned ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-1 text-[11px] font-bold uppercase tracking-wider text-accent"
                >
                  🎉 Achievement unlocked
                </motion.div>
                <p className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm font-semibold text-foreground">
                  {encouragements[Math.floor(Math.random() * encouragements.length)]}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{badge.description}</p>
              </>
            ) : (
              <>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Keep going
                </div>
                <p className="mt-3 rounded-2xl bg-secondary p-3 text-sm font-semibold text-foreground">
                  You're closer than you think — Teco believes in you.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{badge.description}</p>
              </>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="mt-4 w-full rounded-2xl bg-gradient-eco py-3 text-sm font-extrabold text-white shadow-glow-eco"
            >
              {badge.earned ? "Keep saving 🌱" : "Show me how"}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
