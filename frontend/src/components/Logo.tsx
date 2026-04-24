import tecoIcon from "@/assets/teco-happy.png";

export const Logo = ({
  size = "md",
  showMotto = false,
}: {
  size?: "sm" | "md" | "lg";
  showMotto?: boolean;
}) => {
  const wordSize =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  const iconSize = size === "lg" ? 44 : size === "sm" ? 26 : 32;
  const mottoSize = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <div className="inline-flex items-center gap-2">
      <img
        src={tecoIcon}
        alt="Techem EcoCoach"
        width={iconSize}
        height={iconSize}
        className="shrink-0 select-none object-contain drop-shadow-sm"
        style={{ width: iconSize, height: iconSize }}
      />
      <div className="leading-none">
        <div className={`${wordSize} font-extrabold tracking-tight`}>
          <span className="text-primary">Techem</span>
          <span className="text-foreground">&nbsp;</span>
          <span className="text-accent">Eco</span>
          <span className="text-charcoal">Coach</span>
        </div>
        {showMotto && (
          <div className={`${mottoSize} mt-1 font-semibold text-muted-foreground`}>
            Small habits, bigger savings.
          </div>
        )}
      </div>
    </div>
  );
};
