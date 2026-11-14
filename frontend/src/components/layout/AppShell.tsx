import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  Bot,
  Activity,
  ShieldCheck,
  FlaskConical,
  BarChart3,
  Settings,
  Cpu,
  Database,
  RefreshCw,
  Trash2,
  Menu,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { flowpilotApi } from "../../services/api";
import { Button } from "../ui/Primitives";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard Executivo",
    icon: LayoutDashboard,
    badgeKey: null,
  },
  {
    to: "/requests",
    label: "Central de Solicitações",
    icon: FileText,
    badgeKey: "total_requests",
  },
  {
    to: "/agents",
    label: "Central de Agentes",
    icon: Bot,
    badgeKey: null,
  },
  {
    to: "/monitor",
    label: "Monitor de Execução",
    icon: Activity,
    badgeKey: null,
  },
  {
    to: "/approvals",
    label: "Central de Aprovações",
    icon: ShieldCheck,
    badgeKey: "pending_approvals",
  },
  {
    to: "/evaluation",
    label: "Evaluation Lab",
    icon: FlaskConical,
    badgeKey: null,
  },
  {
    to: "/analytics",
    label: "Analytics & Relatórios",
    icon: BarChart3,
    badgeKey: null,
  },
  {
    to: "/settings",
    label: "Configurações & Políticas",
    icon: Settings,
    badgeKey: null,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: flowpilotApi.getHealth,
    refetchInterval: 15000,
  });

  const loadDemoMutation = useMutation({
    mutationFn: flowpilotApi.loadDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      setFeedbackBanner(
        `Ambiente de demonstração recarregado (${res.loaded_count ?? 22} solicitações ativas).`
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: flowpilotApi.clearDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      setFeedbackBanner(
        `${res.removed_count} registros de demonstração removidos. Solicitações reais preservadas.`
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    },
  });

  const currentPage =
    NAV_ITEMS.find((i) =>
      i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to)
    ) || NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-[#0B1020] text-slate-100">
      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800/80 bg-[#070B16] transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-md shadow-blue-950/60">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white">
                  FlowPilot
                </span>
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Agentic Operations Suite
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Plataforma Operacional
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const badgeCount =
              item.badgeKey === "pending_approvals"
                ? health?.pending_approvals
                : item.badgeKey === "total_requests"
                ? health?.total_requests
                : null;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-150",
                    isActive
                      ? "bg-gradient-to-r from-blue-600/20 to-violet-600/10 text-blue-300 border border-blue-500/30 shadow-sm"
                      : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-200 border border-transparent"
                  )
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {badgeCount !== null && badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      item.badgeKey === "pending_approvals"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-slate-800 text-slate-300"
                    )}
                  >
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer Telemetry & Demo Controls */}
        <div className="border-t border-slate-800/80 p-4 space-y-3">
          <div className="rounded-xl border border-slate-800/90 bg-[#0B1020] p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-blue-400" />
                Motor IA Ativo
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  health?.effective_mode === "LLM"
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                )}
              >
                {health?.effective_mode === "LLM" ? "MODO LLM" : "MODO LOCAL"}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[11px] font-mono text-slate-400">
              {health?.mode_badge || "Motor Determinístico Local"}
            </p>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-400">
              <span>Demo: {health?.demo_requests ?? 0}</span>
              <span>Reais: {health?.real_requests ?? 0}</span>
              <span className="text-emerald-400">SQLite WAL</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDemoMutation.mutate()}
              disabled={loadDemoMutation.isPending}
              title="Recarregar as 22 solicitações de demonstração"
            >
              <RefreshCw
                className={cn("h-3 w-3", loadDemoMutation.isPending && "animate-spin")}
              />
              Demo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearDemoMutation.mutate()}
              disabled={clearDemoMutation.isPending}
              title="Limpar apenas dados de demonstração"
            >
              <Trash2 className="h-3 w-3 text-rose-400" />
              Limpar
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800/80 bg-[#0B1020]/90 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white">
                {currentPage.label}
              </h1>
              <p className="hidden text-xs text-slate-400 sm:block">
                Orquestração Multiagente com Máquina de Estados Finita (FSM) & Auditoria Cruzada SQLite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {health?.pending_approvals ? (
              <NavLink
                to="/approvals"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                {health.pending_approvals} Aprovações Pendentes
              </NavLink>
            ) : null}

            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-[#11182E] px-3 py-1.5 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">5 Agentes Online</span>
            </div>
          </div>
        </header>

        {/* Feedback Toast Banner */}
        {feedbackBanner && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{feedbackBanner}</span>
            </div>
            <button
              onClick={() => setFeedbackBanner(null)}
              className="text-emerald-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
