import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  ArrowRight,
  CheckCircle2,
  Clock,
  Wrench,
  Code2,
  ShieldCheck,
  Activity,
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
      <div className="space-y-6">
        <SkeletonCard className="h-36" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const agents = data.agents;
  const activeAgent: AgentTelemetry =
    agents.find((a) => a.agent_id === selectedAgentId) || agents[0];

  return (
    <div className="space-y-6">
      {/* Connected Multi-Agent Pipeline Visualizer */}
      <Card className="overflow-hidden border-blue-500/25 bg-gradient-to-r from-[#11182E] via-[#131C38] to-[#11182E]">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-blue-400" />
              Pipeline de Orquestração Multiagente (FSM Determinística)
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Fluxo conectado com contratos estruturados, RBAC por ferramenta e auditoria cruzada no SQLite pelo Supervisor Agent
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            5/5 Agentes Operacionais
          </span>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
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
                      "flex-1 cursor-pointer rounded-xl border p-4 transition-all duration-200",
                      isSelected
                        ? "border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-950/50"
                        : "border-slate-800 bg-[#0B1020]/90 hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-300">
                        ETAPA 0{ag.pipeline_order}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {ag.status}
                      </span>
                    </div>

                    <h4 className="mt-2.5 text-sm font-bold text-white">
                      {ag.name}
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                      {ag.responsibility}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-300">
                      <span>{ag.total_executions} execuções</span>
                      <span className="font-mono text-violet-300">
                        {ag.avg_duration_ms.toFixed(1)} ms
                      </span>
                    </div>
                  </div>

                  {index < agents.length - 1 && (
                    <div className="hidden lg:flex items-center justify-center text-slate-600">
                      <ArrowRight className="h-5 w-5 text-blue-400/70" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Agent Telemetry & Structured JSON Inspection */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Agent Profile, RBAC Permissions & Recent Executions */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle className="text-base">
                {activeAgent.pipeline_order}. {activeAgent.name} — Telemetria & Histórico
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeAgent.responsibility}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Telemetry Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-[11px] text-slate-400">Total Execuções</span>
                <div className="mt-1 text-lg font-bold text-white">
                  {activeAgent.total_executions}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-[11px] text-slate-400">Latência Média</span>
                <div className="mt-1 font-mono text-lg font-bold text-violet-400">
                  {activeAgent.avg_duration_ms.toFixed(2)} ms
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-[11px] text-slate-400">Erros Registrados</span>
                <div className="mt-1 text-lg font-bold text-emerald-400">
                  {activeAgent.total_errors}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-[11px] text-slate-400">Última Solicitação</span>
                <div className="mt-1 font-mono text-sm font-bold text-blue-400">
                  {activeAgent.last_request_id || "—"}
                </div>
              </div>
            </div>

            {/* RBAC Allowed Tools */}
            <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Wrench className="h-3.5 w-3.5 text-blue-400" />
                Permissões RBAC de Ferramentas (Least Privilege)
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {activeAgent.allowed_tools.length === 0 ? (
                  <span className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                    Nenhuma ferramenta externa permitida (Agente de Análise/Decisão Pura)
                  </span>
                ) : (
                  activeAgent.allowed_tools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-mono text-xs text-blue-300"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                      {tool}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Recent Steps List */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-300">
                Últimas Execuções Persistidas (Clique para inspecionar o JSON)
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {activeAgent.recent_history.map((step) => (
                  <div
                    key={step.step_id}
                    onClick={() => setSelectedStepJson(step.output_json)}
                    className="cursor-pointer rounded-xl border border-slate-800 bg-[#0B1020] p-3 hover:border-blue-500/50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="font-mono text-xs font-semibold text-blue-400">
                          {step.request_id}
                        </span>
                        <span className="text-xs font-medium text-slate-200 truncate max-w-[220px]">
                          {step.request_title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          {step.duration_ms} ms
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/monitor?request_id=${step.request_id}`);
                          }}
                        >
                          <Activity className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">
                      {step.decision_summary}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Modo: {step.operation_mode}</span>
                      <span>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {formatDateTimeBR(step.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Structured JSON Output Inspector */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-violet-400" />
              <div>
                <CardTitle>Inspetor de Contrato JSON Estruturado</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saída real validada por schema Pydantic v2 do {activeAgent.name}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-xl border border-slate-800 bg-[#070B16] p-4 font-mono text-xs text-blue-300 leading-relaxed">
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
