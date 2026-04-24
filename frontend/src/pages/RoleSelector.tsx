import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { Teco } from "@/components/Teco";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Button } from "@/components/ui/button";
import { Heart, Leaf, TrendingUp, Shield, ChevronRight, Home as HomeIcon, Building2 } from "lucide-react";

const values = [
  { icon: Heart, label: "Empathetic", desc: "Understands you. Supports you.", color: "text-primary" },
  { icon: Leaf, label: "Sustainable", desc: "For today. For tomorrow.", color: "text-accent" },
  { icon: TrendingUp, label: "Motivating", desc: "Celebrates progress.", color: "text-primary" },
  { icon: Shield, label: "Reliable", desc: "Secure data. Trustworthy.", color: "text-charcoal" },
];

const RoleSelector = () => {
  const nav = useNavigate();
  return (
    <PhoneFrame>
      <div className="relative px-5 pt-8 pb-10">
        <Logo size="md" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 flex items-end gap-3"
        >
          <Teco mood="happy" size={120} />
          <div className="pb-2">
            <h1 className="text-2xl font-extrabold leading-tight text-balance">
              Hey, I'm <span className="text-accent">Teco</span>.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your smart coach for sustainable living.
            </p>
          </div>
        </motion.div>

        <h2 className="mt-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Choose your experience
        </h2>

        <div className="mt-3 space-y-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => nav("/tenant")}
            className="group flex w-full items-center gap-4 rounded-3xl bg-gradient-eco p-5 text-left text-white shadow-glow-eco"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <HomeIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                I live here
              </div>
              <div className="text-lg font-extrabold">Tenant Mode</div>
              <div className="text-xs opacity-90">Personal coaching with Teco</div>
            </div>
            <ChevronRight className="h-5 w-5 opacity-80 transition group-hover:translate-x-1" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => nav("/landlord")}
            className="group flex w-full items-center gap-4 rounded-3xl bg-gradient-charcoal p-5 text-left text-charcoal-foreground shadow-pop"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                I manage buildings
              </div>
              <div className="text-lg font-extrabold">Landlord Mode</div>
              <div className="text-xs opacity-80">Retrofit Advisor & portfolio insights</div>
            </div>
            <ChevronRight className="h-5 w-5 opacity-70 transition group-hover:translate-x-1" />
          </motion.button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-2.5">
          {values.map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="surface-card p-3">
              <Icon className={`h-4 w-4 ${color}`} />
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-foreground">
                {label}
              </div>
              <div className="text-[11px] text-muted-foreground leading-snug">{desc}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Prototype • Sample data • Techem EcoCoach MVP
        </p>
      </div>
    </PhoneFrame>
  );
};

export default RoleSelector;
