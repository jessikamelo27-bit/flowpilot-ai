import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
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
  AlertOctagon,
  ArrowRight,
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

const STATE_COLORS: Record<string, string> = {
  CONCLUIDA: "#24845A",
  APROVADA: "#24845A",
  AGUARDANDO_APROVACAO: "#B98220",
  AGUARDANDO_INFORMACOES: "#B98220",
  REJEITADA: "#C44F4F",
  ERRO: "#C44F4F",
  EM_PROCESSAMENTO: "#2457C5",
  EXECUTADA: "#2457C5",
  RECEBIDA: "#707783",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => flowpilotApi.getDashboard(),
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    );
  }

  const { metrics, attention_alerts, recent_agent_activity } = data;

  const inProcessingOrPendingInfo =
    metrics.pending_requests - metrics.awaiting_approval;
  const errorOrRejectedCount =
    metrics.error_requests + metrics.rejected_requests;

  const statusChartData = Object.entries(metrics.status_distribution || {}).map(
    ([state, count]) => ({
      state,
      Quantidade: count,
      color: STATE_COLORS[state] || "#2457C5",
    })
  );

  const categoryChartData = Object.entries(
    metrics.category_distribution || {}
  ).map(([name, count]) => ({
    name: name.length > 24 ? `${name.slice(0, 22)}…` : name,
    Volume: count,
  }));

  const kpiItems = [
    {
      label: "Total de Solicitações",
      value: metrics.total_requests,
      sub: "Registros auditáveis no SQLite",
      icon: FileText,
      accent: "text-[#2457C5]",
    },
    {
      label: "Em Processamento / Info",
      value: inProcessingOrPendingInfo,
      sub: `${metrics.awaiting_info} aguardando complemento`,
      icon: Clock,
      accent: "text-[#2457C5]",
    },
    {
      label: "Aguardando Aprovação",
      value: metrics.awaiting_approval,
      sub: "Bloqueadas para revisão humana",
      icon: ShieldAlert,
      accent: "text-[#B98220]",
    },
    {
      label: "Solicitações Concluídas",
      value: metrics.completed_requests,
      sub: `${metrics.completion_rate_pct}% do volume total`,
      icon: CheckCircle2,
      accent: "text-[#24845A]",
    },
    {
      label: "Erros / Rejeitadas",
      value: errorOrRejectedCount,
      sub: `${metrics.error_requests} erros • ${metrics.rejected_requests} rejeitadas`,
      icon: AlertOctagon,
      accent: "text-[#C44F4F]",
    },
    {
      label: "Tempo Médio Medido",
      value:
        metrics.avg_processing_ms > 0
          ? `${metrics.avg_processing_ms.toFixed(1)} ms`
          : "—",
      sub: "Latência real medida no banco",
      icon: Timer,
      accent: "text-[#20242B]",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Compact Enterprise KPI Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiItems.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#707783]">
                  {kpi.label}
                </span>
                <Icon className={cn("h-4 w-4", kpi.accent)} />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#20242B]">
                {kpi.value}
              </div>
              <p className="mt-1 text-[11px] text-[#707783] truncate">
                {kpi.sub}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Distribution by State & Category */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader>
            <div>
              <CardTitle>Distribuição Operacional por Estado (FSM)</CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Contagem real de solicitações por estado da máquina de estados
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/requests")}
            >
              Ver Solicitações <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1E5EA" />
                <XAxis
                  dataKey="state"
                  stroke="#707783"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  stroke="#707783"
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E1E5EA",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#20242B",
                  }}
                />
                <Bar dataKey="Quantidade" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {statusChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <div>
              <CardTitle>Volume por Categoria Administrativa</CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Classificação estruturada pelo Intake Agent
              </p>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryChartData}
                layout="vertical"
                margin={{ left: 10, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E1E5EA" />
                <XAxis
                  type="number"
                  stroke="#707783"
                  fontSize={11}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#20242B"
                  fontSize={11}
                  width={145}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E1E5EA",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#20242B",
                  }}
                />
                <Bar dataKey="Volume" fill="#2457C5" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Tables: Operational Attention Queue & Recent Agent Execution Log */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Pendências e Alertas de Governança */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div>
              <CardTitle>Fila de Atenção Operacional & Pendências</CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Solicitações aguardando aprovação humana, informações ausentes ou bloqueadas
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/approvals")}
            >
              Central de Aprovações
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            {attention_alerts.length === 0 ? (
              <p className="text-xs text-[#707783] py-8 text-center">
                Nenhuma pendência operacional no momento.
              </p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">Solicitação / Motivo</th>
                    <th className="py-2.5 px-3">Risco</th>
                    <th className="py-2.5 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1E5EA]">
                  {attention_alerts.slice(0, 7).map((alert) => (
                    <tr
                      key={alert.request_id}
                      onClick={() =>
                        navigate(
                          alert.alert_type.includes("APPROVAL")
                            ? "/approvals"
                            : `/requests?id=${alert.request_id}`
                        )
                      }
                      className="cursor-pointer hover:bg-[#F4F5F7]/80 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#2457C5] whitespace-nowrap">
                        {alert.request_id}
                      </td>
                      <td className="py-2.5 px-3 max-w-[240px]">
                        <div className="font-medium text-[#20242B] truncate">
                          {alert.title}
                        </div>
                        <div className="text-[11px] text-[#707783] truncate">
                          {alert.message}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <RiskBadge risk={alert.risk_level} />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <StatusBadge status={alert.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Log Recente de Execução dos Agentes */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div>
              <CardTitle>Atividade Operacional Recente dos Agentes</CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Últimas etapas processadas e persistidas em processing_steps
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/monitor")}
            >
              Monitor de Execução
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                  <th className="py-2.5 px-3">Agente</th>
                  <th className="py-2.5 px-3">Req ID</th>
                  <th className="py-2.5 px-3">Resultado Operacional</th>
                  <th className="py-2.5 px-3 text-right">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E5EA]">
                {recent_agent_activity.slice(0, 7).map((step) => (
                  <tr
                    key={step.step_id}
                    onClick={() =>
                      navigate(`/monitor?request_id=${step.request_id}`)
                    }
                    className="cursor-pointer hover:bg-[#F4F5F7]/80 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-[#20242B] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-[#2457C5]" />
                        {step.agent_name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#2457C5] whitespace-nowrap">
                      {step.request_id}
                    </td>
                    <td className="py-2.5 px-3 text-[#707783] max-w-[240px] truncate">
                      {step.decision_summary}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[11px] text-[#707783] whitespace-nowrap">
                      {step.duration_ms} ms • {formatShortDateBR(step.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
