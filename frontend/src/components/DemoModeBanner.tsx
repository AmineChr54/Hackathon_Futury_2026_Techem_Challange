import { useUnitContext } from "@/lib/unitContext";
import { WifiOff } from "lucide-react";

export const DemoModeBanner = () => {
  const { isApiOnline, isLoading } = useUnitContext();
  if (isLoading || isApiOnline) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-1.5 bg-warning/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-warning">
      <WifiOff className="h-3 w-3" />
      Demo data — backend offline
    </div>
  );
};
