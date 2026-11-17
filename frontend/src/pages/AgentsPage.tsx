import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Wrench,
  Code2,
  ShieldCheck,
  Activity,
  Network,
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
import { formatDateTimeBR, cn } from "../lib/utils";
import type { AgentTelemetry } from "../types/api";

export function AgentsPage() {
  const navigate = useNavigate();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("intake_agent");
  const [selectedStepJson, setSelectedStepJson] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: flowpilotApi.listAgents,
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <SkeletonCard className="h-32" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  const agents = data.agents;
  const activeAgent: AgentTelemetry =
    agents.find((a) => a.agent_id === selectedAgentId) || agents[0];

  return (
    <div className="space-y-5">
      {/* Technical Workflow Architecture Diagram */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-[#2457C5]" />
            <div>
              <CardTitle>
                Pipeline Técnico de Orquestração Multiagente (FSM Determinística)
              </CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Selecione qualquer estágio da cadeia para inspecionar responsabilidades, estado de execução, permissões RBAC e histórico persistido
              </p>
            </div>
          </div>
          <span className="rounded border border-[#24845A]/30 bg-[#24845A]/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#24845A]">
            5 / 5 MÓDULOS ATIVOS
          </span>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-stretch justify-between gap-2.5 lg:flex-row lg:items-center">
            {agents.map((ag, index) => {
              const isSelected = ag.agent_id === activeAgent.agent_id;
              return (
                <React.Fragment key={ag.agent_id}>
                  <div
                    onClick={() => {
                      setSelectedAgentId(ag.agent_id);
                      setSelectedStepJson(null);
                    }}
                    className={cn(
                      "flex-1 cursor-pointer rounded-md border p-3.5 transition-colors duration-150",
                      isSelected
                        ? "border-[#2457C5] bg-[#EAF0FC]/60"
                        : "border-[#E1E5EA] bg-[#FFFFFF] hover:bg-[#F4F5F7]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-[#F4F5F7] border border-[#E1E5EA] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#2457C5]">
                        STAGE 0{ag.pipeline_order}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#24845A]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#24845A]" />
                        {ag.status}
                      </span>
                    </div>

                    <h4 className="mt-2 text-xs font-bold text-[#20242B]">
                      {ag.name}
                    </h4>
                    <p className="mt-1 text-[11px] text-[#707783] line-clamp-2">
                      {ag.responsibility}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-[#E1E5EA] pt-2 font-mono text-[10px] text-[#707783]">
                      <span>{ag.total_executions} etapas</span>
                      <span className="text-[#20242B] font-semibold">
                        {ag.avg_duration_ms.toFixed(1)} ms
                      </span>
                    </div>
                  </div>

                  {index < agents.length - 1 && (
                    <div className="hidden lg:flex items-center justify-center text-[#707783]">
                      <ArrowRight className="h-4 w-4 text-[#2457C5]" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Agent Details & Contract Inspector */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Telemetry, RBAC & Execution History Table */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>
                Estágio 0{activeAgent.pipeline_order}: {activeAgent.name} — Telemetria & Histórico Operacional
              </CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                {activeAgent.responsibility}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Compact Metrics Row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Etapas Processadas
                </span>
                <div className="mt-1 font-mono text-base font-bold text-[#20242B]">
                  {activeAgent.total_executions}
                </div>
              </div>
              <div className="rounded-md border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Latência Média
                </span>
                <div className="mt-1 font-mono text-base font-bold text-[#2457C5]">
                  {activeAgent.avg_duration_ms.toFixed(2)} ms
                </div>
              </div>
              <div className="rounded-md border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Erros Registrados
                </span>
                <div className="mt-1 font-mono text-base font-bold text-[#24845A]">
                  {activeAgent.total_errors}
                </div>
              </div>
              <div className="rounded-md border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Última Solicitação
                </span>
                <div className="mt-1 font-mono text-xs font-bold text-[#2457C5]">
                  {activeAgent.last_request_id || "—"}
                </div>
              </div>
            </div>

            {/* RBAC Tool Permissions */}
            <div className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#20242B]">
                <Wrench className="h-3.5 w-3.5 text-[#2457C5]" />
                Escopo de Ferramentas Autorizadas (RBAC)
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeAgent.allowed_tools.length === 0 ? (
                  <span className="rounded border border-[#E1E5EA] bg-[#F4F5F7] px-2.5 py-1 text-[11px] text-[#707783]">
                    Sem invocação direta de ferramentas (Módulo de Análise / Validação Determinística)
                  </span>
                ) : (
                  activeAgent.allowed_tools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1 rounded border border-[#2457C5]/30 bg-[#EAF0FC] px-2 py-0.5 font-mono text-[11px] text-[#2457C5]"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {tool}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Historical Executions Table */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#707783] mb-2">
                Histórico de Atividades do Agente (Clique para inspecionar saída JSON)
              </div>
              <div className="max-h-72 overflow-y-auto border border-[#E1E5EA] rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase text-[#707783]">
                      <th className="py-2 px-3">Req ID</th>
                      <th className="py-2 px-3">Resultado Operacional</th>
                      <th className="py-2 px-3">Tempo</th>
                      <th className="py-2 px-3 text-right">Monitor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E1E5EA]">
                    {activeAgent.recent_history.map((step) => (
                      <tr
                        key={step.step_id}
                        onClick={() => setSelectedStepJson(step.output_json)}
                        className="cursor-pointer hover:bg-[#F4F5F7] transition-colors"
                      >
                        <td className="py-2 px-3 font-mono font-semibold text-[#2457C5] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-[#24845A]" />
                            {step.request_id}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#20242B] max-w-[260px] truncate">
                          {step.decision_summary}
                          <div className="text-[10px] text-[#707783]">
                            {formatDateTimeBR(step.created_at)} • Modo {step.operation_mode}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[#707783] whitespace-nowrap">
                          {step.duration_ms} ms
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/monitor?request_id=${step.request_id}`);
                            }}
                          >
                            <Activity className="h-3.5 w-3.5 text-[#2457C5]" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Structured JSON Contract Inspector */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-[#2457C5]" />
              <div>
                <CardTitle>Inspetor de Contrato Estruturado (Pydantic v2 JSON)</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Payload de saída persistido para {activeAgent.name}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[480px] overflow-auto rounded-md border border-[#E1E5EA] bg-[#F4F5F7] p-3.5 font-mono text-[11px] text-[#20242B] leading-relaxed">
              {(() => {
                const rawJson =
                  selectedStepJson ||
                  activeAgent.recent_history[0]?.output_json ||
                  "{}";
                try {
                  return JSON.stringify(JSON.parse(rawJson), null, 2);
                } catch {
                  return rawJson;
                }
              })()}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
