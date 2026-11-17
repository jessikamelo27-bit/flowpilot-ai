import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  Network,
  Activity,
  ShieldCheck,
  ClipboardCheck,
  BarChart2,
  Settings,
  Database,
  RefreshCw,
  Trash2,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Layers,
} from "lucide-react";
import { flowpilotApi } from "../../services/api";
import { Button } from "../ui/Primitives";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard Operacional",
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
    icon: Network,
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
    icon: ClipboardCheck,
    badgeKey: null,
  },
  {
    to: "/analytics",
    label: "Analytics & Relatórios",
    icon: BarChart2,
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
        `Dados operacionais de demonstração recarregados (${res.loaded_count ?? 22} solicitações).`
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: flowpilotApi.clearDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      setFeedbackBanner(
        `${res.removed_count} solicitações de demonstração removidas. Registros reais mantidos.`
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    },
  });

  const currentPage =
    NAV_ITEMS.find((i) =>
      i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to)
    ) || NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] text-[#20242B]">
      {/* Compact Enterprise Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#E1E5EA] bg-[#FFFFFF] transition-transform duration-150 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#E1E5EA] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#2457C5] text-white">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-[#20242B]">
                  FlowPilot
                </span>
                <span className="rounded bg-[#EAF0FC] px-1.5 py-0.5 text-[10px] font-semibold text-[#2457C5]">
                  OPS
                </span>
              </div>
              <p className="text-[10px] text-[#707783] leading-none">
                Workflow & Governance
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded p-1 text-[#707783] hover:bg-[#F4F5F7] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Módulos Operacionais
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
                    "group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors duration-150",
                    isActive
                      ? "bg-[#EAF0FC] text-[#2457C5] font-semibold"
                      : "text-[#707783] hover:bg-[#F4F5F7] hover:text-[#20242B]"
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
                      "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      item.badgeKey === "pending_approvals"
                        ? "bg-[#B98220]/15 text-[#B98220]"
                        : "bg-[#F4F5F7] text-[#20242B] border border-[#E1E5EA]"
                    )}
                  >
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Environment & Database Status Footer */}
        <div className="border-t border-[#E1E5EA] p-3 space-y-2.5 bg-[#F4F5F7]/50">
          <div className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#707783] flex items-center gap-1.5 font-medium">
                <Database className="h-3.5 w-3.5 text-[#2457C5]" />
                Motor de Execução
              </span>
              <span className="rounded bg-[#EAF0FC] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#2457C5]">
                {health?.effective_mode === "LLM" ? "LLM API" : "LOCAL"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-[#E1E5EA] pt-1.5 text-[10px] text-[#707783] font-mono">
              <span>Demo: {health?.demo_requests ?? 0}</span>
              <span>Reais: {health?.real_requests ?? 0}</span>
              <span className="text-[#24845A] font-semibold">SQLite WAL</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDemoMutation.mutate()}
              disabled={loadDemoMutation.isPending}
              title="Recarregar solicitações de demonstração"
            >
              <RefreshCw
                className={cn("h-3 w-3", loadDemoMutation.isPending && "animate-spin")}
              />
              Carregar Demo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearDemoMutation.mutate()}
              disabled={clearDemoMutation.isPending}
              title="Remover dados de demonstração"
            >
              <Trash2 className="h-3 w-3 text-[#C44F4F]" />
              Limpar Demo
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Enterprise Header with Environment Identification */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E1E5EA] bg-[#FFFFFF] px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded p-1.5 text-[#707783] hover:bg-[#F4F5F7] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-[#20242B]">
                {currentPage.label}
              </h1>
              <span className="hidden md:inline-block text-[#E1E5EA]">|</span>
              <span className="hidden md:inline-block text-xs text-[#707783]">
                Orquestração de Processos Administrativos & Governança Operacional
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {health?.pending_approvals ? (
              <NavLink
                to="/approvals"
                className="hidden sm:inline-flex items-center gap-1.5 rounded border border-[#B98220]/30 bg-[#B98220]/10 px-2.5 py-1 text-xs font-medium text-[#B98220] hover:bg-[#B98220]/15 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {health.pending_approvals} Aprovações Pendentes
              </NavLink>
            ) : null}

            <div className="flex items-center gap-2 rounded border border-[#E1E5EA] bg-[#F4F5F7] px-2.5 py-1 text-xs text-[#20242B]">
              <span className="h-2 w-2 rounded-full bg-[#24845A]" />
              <span className="font-mono text-[11px] font-medium">
                ENV: {health?.effective_mode === "LLM" ? "EXT-LLM" : "DETERMINISTIC-LOCAL"}
              </span>
            </div>
          </div>
        </header>

        {/* Feedback Banner */}
        {feedbackBanner && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-md border border-[#24845A]/30 bg-[#24845A]/10 px-4 py-2 text-xs text-[#24845A]">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>{feedbackBanner}</span>
            </div>
            <button
              onClick={() => setFeedbackBanner(null)}
              className="hover:opacity-75"
            >
              ✕
            </button>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
