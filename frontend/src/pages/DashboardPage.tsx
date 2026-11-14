import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  FileText,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Timer,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
  Bot,
  Activity,
} from "lucide-react";
import { flowpilotApi } from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatusBadge,
  RiskBadge,
  SkeletonCard,
  Button,
} from "../components/ui/Primitives";
import { formatShortDateBR, cn } from "../lib/utils";

const CHART_COLORS = [
  "#3B82F6",
  "#7C3AED",
  "#10B981",
  "#F59E0B",
  "#06B6D4",
  "#F43F5E",
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => flowpilotApi.getDashboard(),
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard className="h-80" />
          <SkeletonCard className="h-80" />
        </div>
      </div>
    );
  }

  const { metrics, attention_alerts, recent_agent_activity } = data;

  const dailyChartData = Object.entries(metrics.daily_evolution || {}).map(
    ([date, count]) => ({
      date: date.slice(5), // MM-DD
      Solicitacoes: count,
    })
  );

  const categoryChartData = Object.entries(metrics.category_distribution || {}).map(
    ([name, count]) => ({
      name: name.length > 22 ? `${name.slice(0, 20)}…` : name,
      fullName: name,
      Volume: count,
    })
  );

  const kpiCards = [
    {
      label: "Total de Solicitações",
      value: metrics.total_requests,
      sub: `${metrics.completion_rate_pct}% taxa de conclusão`,
      icon: FileText,
      color: "text-blue-400",
      border: "border-blue-500/20",
    },
    {
      label: "Solicitações Concluídas",
      value: metrics.completed_requests,
      sub: "Auditadas pelo Supervisor SQLite",
      icon: CheckCircle2,
      color: "text-emerald-400",
      border: "border-emerald-500/20",
    },
    {
      label: "Solicitações Pendentes",
      value: metrics.pending_requests,
      sub: `${metrics.awaiting_info} aguardando informações`,
      icon: Clock,
      color: "text-amber-400",
      border: "border-amber-500/20",
    },
    {
      label: "Aguardando Aprovação",
      value: metrics.awaiting_approval,
      sub: "Fila de governança humana",
      icon: ShieldAlert,
      color: "text-amber-300",
      border: "border-amber-500/30",
    },
    {
      label: "Tempo Médio de Execução",
      value: `${metrics.avg_processing_ms.toFixed(1)} ms`,
      sub: "Pipeline multiagente medido",
      icon: Timer,
      color: "text-violet-400",
      border: "border-violet-500/20",
    },
    {
      label: "Taxa de Automação",
      value: `${metrics.automation_rate_pct}%`,
      sub: `${metrics.estimated_saved_hours}h economizadas (est.)`,
      icon: Sparkles,
      color: "text-cyan-400",
      border: "border-cyan-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className={cn(
                "p-4 hover:border-slate-700 transition-colors",
                kpi.border
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {kpi.label}
                </span>
                <div className="rounded-lg bg-slate-900/90 p-2 border border-slate-800">
                  <Icon className={cn("h-4 w-4", kpi.color)} />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold tracking-tight text-white">
                {kpi.value}
              </div>
              <p className="mt-1 text-[11px] text-slate-400 truncate">
                {kpi.sub}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Volume por Período */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Solicitações por Período</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Evolução diária real registrada no banco SQLite
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/analytics")}
            >
              Ver Analytics <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis
                  dataKey="date"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0E1529",
                    borderColor: "#1E293B",
                    borderRadius: "10px",
                    fontSize: "12px",
                    color: "#F8FAFC",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Solicitacoes"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorReq)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por Categoria */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Distribuição por Categoria</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Classificação estruturada pelo Intake Agent
              </p>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryChartData}
                layout="vertical"
                margin={{ left: 10, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis
                  type="number"
                  stroke="#64748B"
                  fontSize={11}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#94A3B8"
                  fontSize={11}
                  width={135}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0E1529",
                    borderColor: "#1E293B",
                    borderRadius: "10px",
                    fontSize: "12px",
                    color: "#F8FAFC",
                  }}
                />
                <Bar dataKey="Volume" radius={[0, 6, 6, 0]}>
                  {categoryChartData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Attention Alerts & Recent Agent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Alertas de Atenção Operacional */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <div>
                <CardTitle>Alertas & Solicitações que Exigem Atenção</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aprovações executivas, pendências de informação e bloqueios de segurança
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/approvals")}
            >
              Ir para Aprovações
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention_alerts.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum alerta operacional pendente no momento.
              </p>
            ) : (
              attention_alerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.request_id}
                  onClick={() =>
                    navigate(
                      alert.alert_type.includes("APPROVAL")
                        ? "/approvals"
                        : `/requests?id=${alert.request_id}`
                    )
                  }
                  className={cn(
                    "cursor-pointer rounded-xl border p-3.5 transition-all hover:bg-slate-900/90",
                    alert.alert_type === "EXECUTIVE_APPROVAL"
                      ? "border-violet-500/40 bg-violet-500/5"
                      : alert.alert_type === "SECURITY_BLOCKED"
                      ? "border-rose-500/35 bg-rose-500/5"
                      : "border-slate-800 bg-[#0B1020]/70"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold text-blue-400 shrink-0">
                        {alert.request_id}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-100">
                        {alert.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <RiskBadge risk={alert.risk_level} />
                      <StatusBadge status={alert.status} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{alert.message}</span>
                    <span className="shrink-0 ml-2">
                      {alert.requester_name} • {alert.department}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Atividade Recente dos Agentes */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-400" />
              <div>
                <CardTitle>Atividade Recente dos Agentes</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Últimas etapas executadas e persistidas em processing_steps
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/monitor")}
            >
              Monitor de Execução
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent_agent_activity.slice(0, 6).map((step) => (
              <div
                key={step.step_id}
                onClick={() => navigate(`/monitor?request_id=${step.request_id}`)}
                className="cursor-pointer rounded-xl border border-slate-800/80 bg-[#0B1020]/70 p-3.5 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      {step.agent_name}
                    </span>
                    <span className="font-mono text-[11px] text-blue-400">
                      {step.request_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="font-mono">{step.duration_ms} ms</span>
                    <span>{formatShortDateBR(step.created_at)}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-300 line-clamp-1">
                  {step.decision_summary}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
