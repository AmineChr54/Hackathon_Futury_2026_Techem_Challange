// Realistic mock data for Techem EcoCoach prototype
// Includes historical actuals + predictive (forecast) outputs
// from the AI model layer (mocked for the MVP).

export const tenantToday = {
  consumptionKwh: 14.2,
  costEur: 4.85,
  co2Kg: 3.1,
  co2SavedKg: 0.8,
  outsideTempC: 15,
  weather: "Partly cloudy",
  streakDays: 4,
  monthlyTargetEur: 145,
  spentThisMonthEur: 86.4,
  // Predictions
  predictedTomorrowKwh: 13.1,
  predictedMonthCostEur: 138,
  predictedMonthCo2Kg: 92,
  predictedSavingPotentialEur: 12.4,
  anomalyRisk: "Low" as "Low" | "Medium" | "High",
};

// Daily series: 7 actual days + 3 predicted days
export const consumptionDaily = [
  { label: "Mon", consumption: 12.4, cost: 4.1, co2: 2.7, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Tue", consumption: 11.8, cost: 3.9, co2: 2.5, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Wed", consumption: 15.6, cost: 5.2, co2: 3.4, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Thu", consumption: 13.1, cost: 4.4, co2: 2.9, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Fri", consumption: 14.9, cost: 5.0, co2: 3.2, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Sat", consumption: 16.3, cost: 5.6, co2: 3.6, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  { label: "Sun", consumption: 14.2, cost: 4.85, co2: 3.1, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "actual" as const },
  // Forecast — predicted by the model (next 3 days)
  { label: "Mon+", consumption: 13.1, cost: 4.4, co2: 2.8, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "forecast" as const },
  { label: "Tue+", consumption: 12.4, cost: 4.2, co2: 2.7, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "forecast" as const },
  { label: "Wed+", consumption: 11.8, cost: 4.0, co2: 2.6, avgConsumption: 14.5, avgCost: 5, avgCo2: 3, kind: "forecast" as const },
];

// Monthly series: 6 actual + 2 forecast months
export const consumptionMonthly = [
  { label: "Nov", consumption: 412, cost: 138, co2: 92, avgConsumption: 460, avgCost: 150, avgCo2: 100, kind: "actual" as const },
  { label: "Dec", consumption: 498, cost: 168, co2: 110, avgConsumption: 510, avgCost: 160, avgCo2: 110, kind: "actual" as const },
  { label: "Jan", consumption: 521, cost: 176, co2: 118, avgConsumption: 540, avgCost: 170, avgCo2: 120, kind: "actual" as const },
  { label: "Feb", consumption: 467, cost: 158, co2: 104, avgConsumption: 490, avgCost: 160, avgCo2: 110, kind: "actual" as const },
  { label: "Mar", consumption: 389, cost: 132, co2: 86, avgConsumption: 420, avgCost: 140, avgCo2: 95, kind: "actual" as const },
  { label: "Apr", consumption: 286, cost: 96, co2: 64, avgConsumption: 320, avgCost: 120, avgCo2: 80, kind: "actual" as const },
  { label: "May*", consumption: 218, cost: 74, co2: 49, avgConsumption: 280, avgCost: 110, avgCo2: 70, kind: "forecast" as const },
  { label: "Jun*", consumption: 172, cost: 58, co2: 38, avgConsumption: 230, avgCost: 100, avgCo2: 60, kind: "forecast" as const },
];

// Yearly series: 4 actual + 1 forecast
export const consumptionYearly = [
  { label: "2022", consumption: 4820, cost: 1620, co2: 1080, avgConsumption: 5200, avgCost: 1700, avgCo2: 1150, kind: "actual" as const },
  { label: "2023", consumption: 4510, cost: 1580, co2: 1010, avgConsumption: 5050, avgCost: 1680, avgCo2: 1100, kind: "actual" as const },
  { label: "2024", consumption: 4180, cost: 1520, co2: 940, avgConsumption: 4900, avgCost: 1650, avgCo2: 1050, kind: "actual" as const },
  { label: "2025", consumption: 3920, cost: 1465, co2: 880, avgConsumption: 4750, avgCost: 1620, avgCo2: 1000, kind: "actual" as const },
  { label: "2026*", consumption: 3680, cost: 1380, co2: 820, avgConsumption: 4600, avgCost: 1600, avgCo2: 950, kind: "forecast" as const },
];

export const rooms = [
  { name: "Living Room", impact: 38, status: "Normal", hint: "Main shared space" },
  { name: "Bedroom", impact: 26, status: "High — possible leakage", hint: "Possible heat leakage near windows" },
  { name: "Kitchen", impact: 18, status: "Normal", hint: "Activity-driven usage" },
  { name: "Bathroom", impact: 12, status: "Normal", hint: "Short, frequent peaks" },
  { name: "Hallway", impact: 6, status: "Low", hint: "Heat passes through" },
];

export const suggestedPrompts = [
  "How can I reduce my energy use this week?",
  "Which room is costing me the most?",
  "How can I stay warm but spend less?",
  "Why was my cost higher this month?",
  "How can I reduce CO₂ emissions?",
  "Is my heating behavior efficient?",
  "What should I change first to save money?",
  "Could there be leakage in my apartment?",
];

export const coachingTips = [
  {
    title: "Today's win",
    body: "You saved €1.90 and avoided 0.8 kg of CO₂ today. Small habits, real impact.",
    tone: "success" as const,
  },
  {
    title: "Weather-smart heating",
    body: "It's 15°C outside tonight. Lowering the heater from 3 to 2 could trim today's cost by ~12%.",
    tone: "tip" as const,
  },
  {
    title: "Something looks unusual",
    body: "Your evening heating is a little above your normal pattern. Want Teco to take a closer look?",
    tone: "warning" as const,
  },
  {
    title: "Quick action",
    body: "Try closing your blinds after sunset — a cozy way to keep heat in.",
    tone: "tip" as const,
  },
];

// Friendly notification cards shown on the tenant home
export const tenantNotifications = [
  {
    id: "weather",
    title: "Tonight's smart setting",
    body: "Based on tonight's weather and your usage, I recommend setting your heater to 2 overnight and 4 in the evening — cozy and efficient.",
    tone: "tip" as const,
  },
  {
    id: "goal",
    title: "On track for your goal",
    body: "Great job — you're on track to hit your monthly goal. Your small habits are already making a difference.",
    tone: "success" as const,
  },
  {
    id: "savings",
    title: "Daily savings",
    body: "You saved €2.30 today compared with your weekly average. Nice one!",
    tone: "success" as const,
  },
  {
    id: "co2",
    title: "CO₂ avoided",
    body: "You avoided 1.1 kg of CO₂ today. Teco loves that. 🌱",
    tone: "success" as const,
  },
  {
    id: "anomaly",
    title: "Heads up — bedroom heating",
    body: "Your bedroom heating looks a little higher than usual. Would you like me to check what might be causing it?",
    tone: "warning" as const,
  },
];

export const badges = [
  {
    name: "First Saver",
    icon: "🌱",
    earned: true,
    description: "You completed your first day of saving energy. Every habit starts with a single step.",
  },
  {
    name: "4-Day Streak",
    icon: "🔥",
    earned: true,
    description: "Four days in a row staying below your average. You're building real momentum!",
  },
  {
    name: "CO₂ Hero",
    icon: "🌍",
    earned: true,
    description: "You've avoided more than 5 kg of CO₂ this month. The planet thanks you.",
  },
  {
    name: "Night Owl",
    icon: "🌙",
    earned: false,
    description: "Lower overnight heating for 5 nights to unlock this badge.",
  },
  {
    name: "Winter Warrior",
    icon: "❄️",
    earned: false,
    description: "Stay under your average for a full cold week to earn this badge.",
  },
  {
    name: "Concert Goal",
    icon: "🎫",
    earned: false,
    description: "Save €60 toward a personal reward to unlock this badge.",
  },
];

// Community / leaderboard
export const leaderboard = [
  { rank: 1, name: "You — Anna B.", apt: "4B", savings: 12.4, streak: 4, you: true },
  { rank: 2, name: "Markus L.", apt: "2A", savings: 11.6, streak: 6, you: false },
  { rank: 3, name: "Sofia R.", apt: "3C", savings: 9.8, streak: 3, you: false },
  { rank: 4, name: "Jonas K.", apt: "1B", savings: 7.5, streak: 2, you: false },
  { rank: 5, name: "Lina M.", apt: "5A", savings: 5.9, streak: 1, you: false },
];

export const communityChallenges = [
  {
    title: "Linden Hof — Cool Nights",
    body: "Building-wide goal: lower overnight heating for 5 nights this week.",
    participants: 18,
    progress: 0.6,
  },
  {
    title: "Neighborhood — 1 Ton Saved",
    body: "Together, our neighborhood is on track to save 1 ton of CO₂ this month.",
    participants: 142,
    progress: 0.42,
  },
];

// ----------------- Landlord -----------------

export const portfolioKpis = {
  buildings: 12,
  totalConsumptionMwh: 1840,
  totalCostEur: 612000,
  totalCo2Tons: 384,
  flagged: 3,
  avgClass: "E",
  // Predictions
  predictedNextYearCostEur: 568000,
  predictedRetrofitSavingsEur: 84000,
  predictedAvgClassNextYear: "D",
};

export type EnergyClass = "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export const buildings: Array<{
  id: string;
  name: string;
  city: string;
  units: number;
  energyClass: EnergyClass;
  consumptionMwh: number;
  costEur: number;
  co2Tons: number;
  alerts: number;
  efficiency: number;
  predictedClass: EnergyClass; // forecast after recommended retrofit
  predictedCostEur: number;    // predicted next-year cost
}> = [
  { id: "b1", name: "Linden Hof 12", city: "Berlin", units: 24, energyClass: "C", consumptionMwh: 142, costEur: 47800, co2Tons: 28, alerts: 0, efficiency: 82, predictedClass: "B", predictedCostEur: 44200 },
  { id: "b2", name: "Eichenweg 7", city: "Frankfurt", units: 18, energyClass: "F", consumptionMwh: 198, costEur: 66400, co2Tons: 41, alerts: 2, efficiency: 48, predictedClass: "D", predictedCostEur: 52100 },
  { id: "b3", name: "Rosenstraße 22", city: "Munich", units: 30, energyClass: "B", consumptionMwh: 156, costEur: 52100, co2Tons: 31, alerts: 0, efficiency: 88, predictedClass: "A", predictedCostEur: 48400 },
  { id: "b4", name: "Birkenallee 5", city: "Hamburg", units: 12, energyClass: "G", consumptionMwh: 174, costEur: 58300, co2Tons: 36, alerts: 3, efficiency: 38, predictedClass: "E", predictedCostEur: 41800 },
  { id: "b5", name: "Ahornpark 9", city: "Cologne", units: 22, energyClass: "D", consumptionMwh: 168, costEur: 56200, co2Tons: 34, alerts: 1, efficiency: 64, predictedClass: "C", predictedCostEur: 49600 },
  { id: "b6", name: "Tannenring 3", city: "Stuttgart", units: 16, energyClass: "E", consumptionMwh: 152, costEur: 50800, co2Tons: 32, alerts: 0, efficiency: 56, predictedClass: "D", predictedCostEur: 45200 },
  { id: "b7", name: "Buchenhof 14", city: "Düsseldorf", units: 28, energyClass: "A", consumptionMwh: 118, costEur: 39400, co2Tons: 22, alerts: 0, efficiency: 92, predictedClass: "A", predictedCostEur: 38100 },
];

// Building trend with actuals + 2 forecast months
export const buildingTrend = [
  { month: "Nov", consumption: 142, cost: 47, co2: 28, kind: "actual" as const },
  { month: "Dec", consumption: 178, cost: 59, co2: 35, kind: "actual" as const },
  { month: "Jan", consumption: 192, cost: 64, co2: 38, kind: "actual" as const },
  { month: "Feb", consumption: 168, cost: 56, co2: 33, kind: "actual" as const },
  { month: "Mar", consumption: 145, cost: 49, co2: 29, kind: "actual" as const },
  { month: "Apr", consumption: 112, cost: 38, co2: 22, kind: "actual" as const },
  { month: "May*", consumption: 96, cost: 32, co2: 18, kind: "forecast" as const },
  { month: "Jun*", consumption: 82, cost: 28, co2: 16, kind: "forecast" as const },
];

export const retrofitScenarios = [
  {
    title: "Quick wins (controls + balancing)",
    impact: "G → F",
    cost: "€18k–€32k",
    annualSaving: "€4.2k",
    payback: "5–7 years",
    valueUplift: "+1.5%",
    classFromPct: 0.18,
  },
  {
    title: "Insulation + windows",
    impact: "G → E",
    cost: "€140k–€210k",
    annualSaving: "€16.8k",
    payback: "10–13 years",
    valueUplift: "+6%",
    classFromPct: 0.42,
  },
  {
    title: "Full retrofit + heat pump",
    impact: "G → C",
    cost: "€420k–€560k",
    annualSaving: "€38.5k",
    payback: "12–15 years",
    valueUplift: "+14%",
    classFromPct: 0.78,
  },
];

export const energyClasses: { c: EnergyClass; band: string; color: string }[] = [
  { c: "A+", band: "Highly efficient", color: "bg-emerald-500" },
  { c: "A", band: "Highly efficient", color: "bg-emerald-500" },
  { c: "B", band: "Highly efficient", color: "bg-green-500" },
  { c: "C", band: "Efficient", color: "bg-lime-500" },
  { c: "D", band: "Average", color: "bg-yellow-500" },
  { c: "E", band: "Average", color: "bg-amber-500" },
  { c: "F", band: "Inefficient", color: "bg-orange-500" },
  { c: "G", band: "Very inefficient", color: "bg-red-500" },
  { c: "H", band: "Critical", color: "bg-red-700" },
];

export function classColor(c: EnergyClass): string {
  return energyClasses.find((e) => e.c === c)?.color ?? "bg-muted";
}

// Landlord advisory cards (Teco for Landlords / Retrofit Advisor)
export const landlordAdvisories = [
  {
    tag: "Retrofit priority",
    text: "Birkenallee 5 is currently rated G. Window replacement and façade insulation could significantly improve performance.",
    tone: "warn" as const,
  },
  {
    tag: "Class improvement scenario",
    text: "A retrofit package may help move this property from H toward E or C.",
    tone: "info" as const,
  },
  {
    tag: "Asset attractiveness",
    text: "Improving energy efficiency may reduce operating cost exposure and improve long-term asset attractiveness.",
    tone: "info" as const,
  },
  {
    tag: "CO₂ tax exposure",
    text: "Low efficiency may be increasing your CO₂ tax burden. Retrofit planning is recommended.",
    tone: "warn" as const,
  },
  {
    tag: "Green premium candidate",
    text: "Buchenhof 14 is performing above portfolio average — a strong candidate for a green premium.",
    tone: "good" as const,
  },
];
