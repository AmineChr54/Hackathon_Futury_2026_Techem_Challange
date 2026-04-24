import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, pingHealth } from "./api";
import type { Unit } from "./apiTypes";

type UnitContextValue = {
  units: Unit[];
  isLoading: boolean;
  isApiOnline: boolean;
  selectedPid: number;
  selectedUid: number;
  hasSelection: boolean;
  setSelected: (pid: number, uid: number) => void;
  selectedProperties: Unit[]; // units grouped to one per property
};

const UnitContext = createContext<UnitContextValue | null>(null);

const STORAGE_KEY = "techem.selectedUnit";

export const UnitProvider = ({ children }: { children: ReactNode }) => {
  const [selected, setSelectedState] = useState<{ pid: number; uid: number } | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  const healthQ = useQuery({
    queryKey: ["health"],
    queryFn: () => pingHealth(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unitsQ = useQuery({
    queryKey: ["units"],
    queryFn: () => apiFetch<Unit[]>("/units"),
    staleTime: 60_000,
    retry: 1,
    enabled: healthQ.data !== false,
  });

  const units = unitsQ.data ?? [];

  // Default selection = first unit when none picked yet, or when the
  // persisted selection is no longer in the live unit list.
  useEffect(() => {
    if (units.length === 0) return;
    const isValid =
      selected &&
      units.some((u) => u.property_id === selected.pid && u.unit_id === selected.uid);
    if (!isValid) {
      const first = units[0];
      setSelectedState({ pid: first.property_id, uid: first.unit_id });
    }
  }, [units, selected]);

  const setSelected = (pid: number, uid: number) => {
    setSelectedState({ pid, uid });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pid, uid }));
    } catch {
      /* ignore */
    }
  };

  // Pick one unit per property for landlord views.
  const selectedProperties = useMemo(() => {
    const seen = new Set<number>();
    const out: Unit[] = [];
    for (const u of units) {
      if (seen.has(u.property_id)) continue;
      seen.add(u.property_id);
      out.push(u);
    }
    return out;
  }, [units]);

  // NaN sentinels disable downstream queries until /units lands.
  const pid = selected?.pid ?? Number.NaN;
  const uid = selected?.uid ?? Number.NaN;

  const value: UnitContextValue = {
    units,
    isLoading: unitsQ.isLoading || healthQ.isLoading,
    isApiOnline: healthQ.data === true,
    selectedPid: pid,
    selectedUid: uid,
    hasSelection: selected !== null,
    setSelected,
    selectedProperties,
  };

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
};

export const useUnitContext = (): UnitContextValue => {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnitContext must be used inside <UnitProvider>");
  return ctx;
};
