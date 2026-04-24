import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UnitProvider } from "@/lib/unitContext";
import RoleSelector from "./pages/RoleSelector";
import NotFound from "./pages/NotFound.tsx";

import { TenantLayout } from "./components/tenant/TenantLayout";
import TenantHome from "./pages/tenant/TenantHome";
import Consumption from "./pages/tenant/Consumption";
import AICoach from "./pages/tenant/AICoach";
import Budget from "./pages/tenant/Budget";
import Apartment from "./pages/tenant/Apartment";
import Insights from "./pages/tenant/Insights";
import TenantSettings from "./pages/tenant/Settings";

import { LandlordLayout } from "./components/landlord/LandlordLayout";
import Portfolio from "./pages/landlord/Portfolio";
import BuildingsPage from "./pages/landlord/Buildings";
import BuildingDetail from "./pages/landlord/BuildingDetail";
import EnergyClasses from "./pages/landlord/EnergyClasses";
import Costs from "./pages/landlord/Costs";
import Advisor from "./pages/landlord/Advisor";
import Reports from "./pages/landlord/Reports";
import LandlordInsights from "./pages/landlord/Insights";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UnitProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoleSelector />} />

          <Route path="/tenant" element={<TenantLayout />}>
            <Route index element={<TenantHome />} />
            <Route path="consumption" element={<Consumption />} />
            <Route path="coach" element={<AICoach />} />
            <Route path="budget" element={<Budget />} />
            <Route path="apartment" element={<Apartment />} />
            <Route path="insights" element={<Insights />} />
            <Route path="settings" element={<TenantSettings />} />
          </Route>

          <Route path="/landlord" element={<LandlordLayout />}>
            <Route index element={<Portfolio />} />
            <Route path="buildings" element={<BuildingsPage />} />
            <Route path="buildings/:id" element={<BuildingDetail />} />
            <Route path="classes" element={<EnergyClasses />} />
            <Route path="costs" element={<Costs />} />
            <Route path="advisor" element={<Advisor />} />
            <Route path="reports" element={<Reports />} />
            <Route path="insights" element={<LandlordInsights />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </UnitProvider>
  </QueryClientProvider>
);

export default App;
