import { EnergyClass, classColor } from "@/lib/mockData";

export const EnergyClassBadge = ({ c, size = "md" }: { c: EnergyClass; size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: "h-7 w-9 text-xs",
    md: "h-9 w-12 text-sm",
    lg: "h-12 w-16 text-lg",
  };
  return (
    <span
      className={`inline-grid place-items-center rounded-lg font-extrabold text-white shadow-soft ${classColor(c)} ${sizes[size]}`}
    >
      {c}
    </span>
  );
};
