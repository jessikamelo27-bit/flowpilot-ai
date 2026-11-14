import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { RequestsPage } from "./pages/RequestsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ExecutionMonitorPage } from "./pages/ExecutionMonitorPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { EvaluationLabPage } from "./pages/EvaluationLabPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/monitor" element={<ExecutionMonitorPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/evaluation" element={<EvaluationLabPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
export default App;
