// React Query hooks wrapping the FastAPI backend.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  ChatRequest,
  ChatResponse,
  ForecastResponse,
  HistoryResponse,
  LandlordEsg,
  LandlordInsights,
  LandlordRoi,
  LandlordUsage,
  LeaksResponse,
  PeersResponse,
  RecommendationsResponse,
  RoomBreakdown,
  TargetRequest,
  TargetResponse,
  TodayResponse,
  WeatherDay,
  WhatIfRequest,
  WhatIfResponse,
} from "@/lib/apiTypes";

const enabledUnit = (pid?: number, uid?: number) =>
  Number.isFinite(pid) && Number.isFinite(uid);

export function useToday(pid: number, uid: number) {
  return useQuery({
    queryKey: ["today", pid, uid],
    queryFn: () => apiFetch<TodayResponse>(`/today/${pid}/${uid}`),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useForecast(pid: number, uid: number, horizonDays = 30, useLiveWeather = false) {
  return useQuery({
    queryKey: ["forecast", pid, uid, horizonDays, useLiveWeather],
    queryFn: () =>
      apiFetch<ForecastResponse>(`/forecast/unit/${pid}/${uid}`, {
        query: { horizon_days: horizonDays, use_live_weather: useLiveWeather },
      }),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useHistory(pid: number, uid: number, days = 365) {
  return useQuery({
    queryKey: ["history", pid, uid, days],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/history/unit/${pid}/${uid}`, {
        query: { days },
      }),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useDrilldown(pid: number, uid: number, horizonDays = 30) {
  return useQuery({
    queryKey: ["drilldown", pid, uid, horizonDays],
    queryFn: () =>
      apiFetch<RoomBreakdown[]>(`/drilldown/unit/${pid}/${uid}`, {
        query: { horizon_days: horizonDays },
      }),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function usePeers(pid: number, uid: number) {
  return useQuery({
    queryKey: ["peers", pid, uid],
    queryFn: () => apiFetch<PeersResponse>(`/peers/${pid}/${uid}`),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useRecommendations(pid: number, uid: number, horizonDays = 30) {
  return useQuery({
    queryKey: ["recommendations", pid, uid, horizonDays],
    queryFn: () =>
      apiFetch<RecommendationsResponse>(`/recommendations/${pid}/${uid}`, {
        query: { horizon_days: horizonDays },
      }),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useLeaks(pid: number, uid: number) {
  return useQuery({
    queryKey: ["leaks", pid, uid],
    queryFn: () => apiFetch<LeaksResponse>(`/leaks/${pid}/${uid}`),
    enabled: enabledUnit(pid, uid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useWhatIfMutation(pid: number, uid: number) {
  return useMutation({
    mutationFn: (req: WhatIfRequest) =>
      apiFetch<WhatIfResponse>(`/whatif/unit/${pid}/${uid}`, {
        method: "POST",
        body: req,
      }),
  });
}

export function useChatMutation(pid: number, uid: number) {
  return useMutation({
    mutationFn: (req: ChatRequest) =>
      apiFetch<ChatResponse>(`/chat/${pid}/${uid}`, {
        method: "POST",
        body: req,
      }),
  });
}

export function useTargetMutation(pid: number, uid: number) {
  return useMutation({
    mutationFn: (req: TargetRequest) =>
      apiFetch<TargetResponse>(`/target/${pid}/${uid}`, {
        method: "POST",
        body: req,
      }),
  });
}

// ---------- Landlord ----------

export function useLandlordUsage(pid: number) {
  return useQuery({
    queryKey: ["landlord", "usage", pid],
    queryFn: () => apiFetch<LandlordUsage>(`/landlord/property/${pid}/usage`),
    enabled: Number.isFinite(pid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useLandlordInsights(pid: number) {
  return useQuery({
    queryKey: ["landlord", "insights", pid],
    queryFn: () => apiFetch<LandlordInsights>(`/landlord/property/${pid}/insights`),
    enabled: Number.isFinite(pid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useLandlordRoi(pid: number) {
  return useQuery({
    queryKey: ["landlord", "roi", pid],
    queryFn: () => apiFetch<LandlordRoi>(`/landlord/property/${pid}/roi`),
    enabled: Number.isFinite(pid),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useAllLandlordUsage(pids: number[]) {
  return useQueries({
    queries: pids.map((pid) => ({
      queryKey: ["landlord", "usage", pid],
      queryFn: () => apiFetch<LandlordUsage>(`/landlord/property/${pid}/usage`),
      enabled: Number.isFinite(pid),
      retry: 1,
      staleTime: 60_000,
    })),
  });
}

export function useLandlordEsg(pid: number) {
  return useQuery({
    queryKey: ["landlord", "esg", pid],
    queryFn: () => apiFetch<LandlordEsg>(`/landlord/property/${pid}/esg_report`),
    enabled: Number.isFinite(pid),
    retry: 1,
    staleTime: 60_000,
  });
}

// ---------- Weather ----------

export function useWeatherForecast(zipcode: string = "10115", days = 8) {
  return useQuery({
    queryKey: ["weather", zipcode, days],
    queryFn: () =>
      apiFetch<WeatherDay[]>(`/weather/forecast`, {
        query: { zipcode, days },
      }),
    retry: 1,
    staleTime: 60_000 * 30, // weather doesn't change every minute
  });
}
