// Aggregates /units + /landlord/property/{pid}/usage into a portfolio view.
import { useMemo } from "react";
import { useUnitContext } from "@/lib/unitContext";
import { useAllLandlordUsage } from "@/hooks/useApi";
import {
  landlordUsageToBuilding,
  energyScoreToClass,
  type BuildingRow,
} from "@/lib/adapters";
import {
  buildings as mockBuildingsRaw,
  portfolioKpis as mockKpis,
  type EnergyClass,
} from "@/lib/mockData";

// Synthesise a property_id field for mock buildings so they fit BuildingRow.
const mockBuildings: BuildingRow[] = mockBuildingsRaw.map((b, i) => ({
  ...b,
  property_id: i + 1,
}));

const CLASS_ORDER: EnergyClass[] = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];

function avgClass(buildings: BuildingRow[]): EnergyClass {
  if (!buildings.length) return "E";
  const idx = buildings.reduce((s, b) => s + CLASS_ORDER.indexOf(b.energyClass), 0);
  return CLASS_ORDER[Math.round(idx / buildings.length)] ?? "E";
}

export function useLandlordPortfolio() {
  const { selectedProperties, isApiOnline } = useUnitContext();
  const pids = selectedProperties.map((p) => p.property_id);
  const usageQueries = useAllLandlordUsage(pids);

  const buildings = useMemo<BuildingRow[]>(() => {
    const live: BuildingRow[] = [];
    selectedProperties.forEach((meta, i) => {
      const usage = usageQueries[i]?.data;
      const row = landlordUsageToBuilding(usage, {
        property_id: meta.property_id,
        city: meta.city,
        name: `Property ${meta.property_id}`,
      });
      if (row) live.push(row);
    });
    return live.length ? live : mockBuildings;
  }, [selectedProperties, usageQueries]);

  const kpis = useMemo(() => {
    if (!buildings.length || buildings === mockBuildings) return mockKpis;
    const totalConsumptionMwh = Math.round(buildings.reduce((s, b) => s + b.consumptionMwh, 0));
    const totalCostEur = Math.round(buildings.reduce((s, b) => s + b.costEur, 0));
    const totalCo2Tons = Math.round(buildings.reduce((s, b) => s + b.co2Tons, 0));
    const flagged = buildings.filter((b) =>
      ["F", "G", "H"].includes(b.energyClass),
    ).length;
    const avg = avgClass(buildings);
    return {
      buildings: buildings.length,
      totalConsumptionMwh,
      totalCostEur,
      totalCo2Tons,
      flagged,
      avgClass: avg,
      predictedNextYearCostEur: Math.round(totalCostEur * 0.92),
      predictedRetrofitSavingsEur: Math.round(totalCostEur * 0.14),
      predictedAvgClassNextYear:
        CLASS_ORDER[Math.max(0, CLASS_ORDER.indexOf(avg) - 1)] ?? avg,
    };
  }, [buildings]);

  const isLoading = usageQueries.some((q) => q.isLoading);

  return { buildings, kpis, isLoading, isApiOnline };
}

export { energyScoreToClass };
