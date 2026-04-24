import happy from "@/assets/teco-happy.png";
import celebrating from "@/assets/teco-celebrating.png";
import excited from "@/assets/teco-excited.png";
import { motion } from "framer-motion";

type Mood = "happy" | "celebrating" | "excited";
const map: Record<Mood, string> = { happy, celebrating, excited };

export const Teco = ({
  mood = "happy",
  size = 64,
  float = true,
  className = "",
}: {
  mood?: Mood;
  size?: number;
  float?: boolean;
  className?: string;
}) => {
  return (
    <motion.img
      src={map[mood]}
      alt={`Teco ${mood}`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`select-none object-contain ${float ? "animate-float" : ""} ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      loading="lazy"
    />
  );
};
