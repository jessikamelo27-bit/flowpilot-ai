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
} from "recharts";
import {
  BarChart2,
  Download,
  FileText,
  Calculator,
  Info,
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
      <div className="space-y-4">
        <SkeletonCard className="h-40" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    );
  }

  const { metrics, department_distribution } = data;
  const sim = metrics.impact_simulation;

  const statusData = Object.entries(metrics.status_distribution || {}).map(
    ([name, count]) => ({ name, Quantidade: count })
  );

  const agentPerfData = metrics.agent_volume.map((a) => ({
    name: a.name.replace(" Agent", ""),
    Execucoes: a.executions,
    LatenciaMs: a.avg_duration_ms,
  }));

  return (
    <div className="space-y-5">
      {/* Header & Exports */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <BarChart2 className="h-5 w-5 text-[#2457C5] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-[#20242B]">
                Analytics Operacional & Exportação de Relatórios
              </h2>
              <p className="text-xs text-[#707783] mt-0.5">
                Indicadores extraídos das tabelas SQLite e simulador configurável de cenário operacional
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={flowpilotApi.getExportCsvUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#20242B] hover:bg-[#F4F5F7] transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-[#2457C5]" />
              Exportar Solicitações (CSV)
            </a>
            <a
              href={flowpilotApi.getExportPdfUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2457C5] bg-[#2457C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D48A6] transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Relatório Executivo (PDF)
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Department & FSM Distribution Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#2457C5]" />
              <div>
                <CardTitle>Demanda por Departamento Solicitante</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Contagem real agrupada por área organizacional
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={department_distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1E5EA" />
                <XAxis dataKey="department" stroke="#707783" fontSize={11} />
                <YAxis stroke="#707783" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E1E5EA",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#20242B",
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Solicitações"
                  fill="#2457C5"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>Distribuição por Estado da Máquina de Estados (FSM)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1E5EA" />
                <XAxis dataKey="name" stroke="#707783" fontSize={10} />
                <YAxis stroke="#707783" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E1E5EA",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#20242B",
                  }}
                />
                <Bar
                  dataKey="Quantidade"
                  fill="#24845A"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Agent Volume & Rejection Reasons */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Volume de Etapas Processadas por Agente</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1E5EA" />
                <XAxis dataKey="name" stroke="#707783" fontSize={11} />
                <YAxis stroke="#707783" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E1E5EA",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#20242B",
                  }}
                />
                <Bar
                  dataKey="Execucoes"
                  name="Total Execuções"
                  fill="#2457C5"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Principais Motivos de Bloqueio / Rejeição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(metrics.rejection_reasons || {}).length === 0 ? (
              <p className="text-xs text-[#707783]">
                Nenhuma rejeição registrada.
              </p>
            ) : (
              Object.entries(metrics.rejection_reasons).map(
                ([reason, count]) => (
                  <div
                    key={reason}
                    className="flex items-center justify-between rounded border border-[#E1E5EA] bg-[#F4F5F7] p-2.5 text-xs"
                  >
                    <span className="text-[#20242B] truncate pr-3">
                      {reason}
                    </span>
                    <span className="rounded border border-[#C44F4F]/30 bg-[#C44F4F]/10 px-2 py-0.5 font-mono font-bold text-[#C44F4F]">
                      {count}
                    </span>
                  </div>
                )
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configurable Operational Scenario Simulator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-[#2457C5]" />
            <div>
              <CardTitle>
                Simulador Configurável de Cenário Operacional (Estimativa vs. Tempo Medido)
              </CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Compara o tempo real de execução medido no SQLite contra parâmetros configuráveis de triagem manual
              </p>
            </div>
          </div>
          <span className="rounded border border-[#B98220]/30 bg-[#B98220]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-[#B98220]">
            Simulação Configurável
          </span>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded border border-[#E1E5EA] bg-[#F4F5F7] p-3 text-xs text-[#707783]">
            <Info className="h-4 w-4 text-[#2457C5] shrink-0 mt-0.5" />
            <span>{sim.disclaimer}</span>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded border border-[#E1E5EA] bg-[#F4F5F7]/60 p-3.5 space-y-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#20242B]">
                <Sliders className="h-3.5 w-3.5 text-[#2457C5]" />
                Parâmetros Hipotéticos de Triagem Manual
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#707783]">
                    Tempo Manual Estimado / Solicitação
                  </span>
                  <span className="font-mono font-bold text-[#20242B]">
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
                  className="w-full accent-[#2457C5]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#707783]">
                    Tempo Estimado / Revisão Humana
                  </span>
                  <span className="font-mono font-bold text-[#20242B]">
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
                  className="w-full accent-[#2457C5]"
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
                Atualizar Parâmetros de Simulação
              </Button>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <span className="text-[10px] uppercase text-[#707783] font-semibold">
                  Execução Automatizada (Medida)
                </span>
                <div className="mt-1.5 font-mono text-xl font-bold text-[#2457C5]">
                  {(metrics.total_processing_ms / 1000).toFixed(2)} s
                </div>
                <p className="mt-1 text-[11px] text-[#707783]">
                  Tempo real acumulado dos 5 agentes no SQLite
                </p>
              </div>

              <div className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <span className="text-[10px] uppercase text-[#707783] font-semibold">
                  Cenário Manual (Estimado)
                </span>
                <div className="mt-1.5 font-mono text-xl font-bold text-[#20242B]">
                  {sim.estimated_manual_hours} h
                </div>
                <p className="mt-1 text-[11px] text-[#707783]">
                  {sim.request_count} solicitações × {sim.manual_minutes_per_request}m
                </p>
              </div>

              <div className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <span className="text-[10px] uppercase text-[#707783] font-semibold">
                  Cenário Híbrido (Simulado)
                </span>
                <div className="mt-1.5 font-mono text-xl font-bold text-[#24845A]">
                  {sim.total_automated_hours} h
                </div>
                <p className="mt-1 text-[11px] text-[#707783]">
                  Inclui {sim.human_review_count} intervenções humanas ({sim.human_review_total_minutes}m)
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
