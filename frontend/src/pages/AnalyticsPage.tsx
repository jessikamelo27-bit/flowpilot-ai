import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  BarChart3,
  Download,
  FileText,
  Calculator,
  Info,
  TrendingUp,
  Building2,
  Sliders,
} from "lucide-react";
import { flowpilotApi } from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  SkeletonCard,
} from "../components/ui/Primitives";

const COLORS = [
  "#3B82F6",
  "#7C3AED",
  "#10B981",
  "#F59E0B",
  "#06B6D4",
  "#F43F5E",
];

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [manualMin, setManualMin] = useState<number>(18);
  const [reviewMin, setReviewMin] = useState<number>(4.5);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => flowpilotApi.getDashboard(),
  });

  useEffect(() => {
    if (data?.metrics?.impact_simulation) {
      setManualMin(data.metrics.impact_simulation.manual_minutes_per_request);
      setReviewMin(data.metrics.impact_simulation.human_review_minutes_each);
    }
  }, [data]);

  const impactMutation = useMutation({
    mutationFn: flowpilotApi.updateImpactParams,
    onSuccess: (updated) => {
      queryClient.setQueryData(["dashboard"], updated);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard className="h-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard className="h-80" />
          <SkeletonCard className="h-80" />
        </div>
      </div>
    );
  }

  const { metrics, department_distribution } = data;
  const sim = metrics.impact_simulation;

  const statusData = Object.entries(metrics.status_distribution || {}).map(
    ([name, value]) => ({ name, value })
  );

  const agentPerfData = metrics.agent_volume.map((a) => ({
    name: a.name.replace(" Agent", ""),
    Execucoes: a.executions,
    LatenciaMs: a.avg_duration_ms,
  }));

  return (
    <div className="space-y-6">
      {/* Top Export Header */}
      <Card>
        <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-500/20 p-2.5 border border-violet-500/30">
              <BarChart3 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Analytics Operacional, Simulador de Impacto & Relatórios Executivos
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Separação transparente entre métricas reais medidas no SQLite e estimativas configuráveis de economia de tempo manual
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href={flowpilotApi.getExportCsvUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-blue-400" />
              Exportar Solicitações (CSV)
            </a>
            <a
              href={flowpilotApi.getExportPdfUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors shadow-sm"
            >
              <FileText className="h-3.5 w-3.5" />
              Relatório Executivo (PDF)
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Business Impact Simulator */}
      <Card className="border-blue-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-400" />
            <div>
              <CardTitle>
                Simulador Configurável de Impacto Empresarial (ROI Operacional)
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Fórmula auditável: Economia Estimada = (Solicitações × Tempo Manual Estimado) − (Execução Automatizada Medida + Revisões Humanas × Tempo Médio de Revisão)
              </p>
            </div>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            Estimativa Configurável vs Tempo Real Medido
          </span>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Disclaimer Banner */}
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3.5 text-xs text-slate-300">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <span>{sim.disclaimer}</span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Simulator Controls */}
            <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0B1020] p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Sliders className="h-3.5 w-3.5 text-blue-400" />
                Parâmetros de Simulação (Ajustáveis)
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">
                    Tempo Manual Estimado por Solicitação (min)
                  </span>
                  <span className="font-mono font-bold text-blue-400">
                    {manualMin} min
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={60}
                  step={1}
                  value={manualMin}
                  onChange={(e) => setManualMin(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">
                    Tempo Médio por Revisão Humana (min)
                  </span>
                  <span className="font-mono font-bold text-violet-400">
                    {reviewMin} min
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={0.5}
                  value={reviewMin}
                  onChange={(e) => setReviewMin(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() =>
                  impactMutation.mutate({
                    manual_minutes_per_request: manualMin,
                    human_review_minutes: reviewMin,
                  })
                }
                disabled={impactMutation.isPending}
              >
                Recalcular Simulação no Servidor Python
              </Button>
            </div>

            {/* Simulator Results Comparison */}
            <div className="lg:col-span-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4">
                <span className="text-[11px] uppercase text-amber-400 font-semibold">
                  Esforço Manual (Estimado)
                </span>
                <div className="mt-2 text-2xl font-bold text-white">
                  {sim.estimated_manual_hours} h
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {sim.estimated_manual_minutes} min totais ({sim.request_count} solicitações × {sim.manual_minutes_per_request}m)
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4">
                <span className="text-[11px] uppercase text-blue-400 font-semibold">
                  Tempo Total c/ FlowPilot
                </span>
                <div className="mt-2 text-2xl font-bold text-white">
                  {sim.total_automated_hours} h
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  IA medida: {(metrics.total_processing_ms / 1000).toFixed(2)}s + {sim.human_review_count} revisões ({sim.human_review_total_minutes}m)
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <span className="text-[11px] uppercase text-emerald-300 font-semibold flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Economia Projetada
                </span>
                <div className="mt-2 text-2xl font-bold text-emerald-300">
                  {sim.estimated_saved_hours} h ({sim.time_reduction_pct}%)
                </div>
                <p className="mt-1 text-xs text-emerald-200/80">
                  {sim.estimated_saved_minutes} minutos poupados na operação
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row: Department Distribution & Status Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Distribuição por Departamento */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              <div>
                <CardTitle>Distribuição por Departamento Solicitante</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Demanda administrativa real agrupada por área de negócio
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={department_distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="department" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0E1529",
                    borderColor: "#1E293B",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" name="Solicitações" radius={[6, 6, 0, 0]}>
                  {department_distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por Estado FSM */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>Distribuição por Estado da Máquina de Estados (FSM)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0E1529",
                    borderColor: "#1E293B",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Agent Volume & Rejection Reasons */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Desempenho e Volume de Execuções por Agente</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0E1529",
                    borderColor: "#1E293B",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="Execucoes"
                  name="Total Execuções"
                  fill="#3B82F6"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Principais Motivos de Bloqueio / Rejeição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(metrics.rejection_reasons || {}).length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma rejeição registrada.</p>
            ) : (
              Object.entries(metrics.rejection_reasons).map(([reason, count]) => (
                <div
                  key={reason}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0B1020] p-3 text-xs"
                >
                  <span className="text-slate-200 truncate pr-3">{reason}</span>
                  <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 font-mono font-bold text-rose-300 border border-rose-500/30">
                    {count}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
