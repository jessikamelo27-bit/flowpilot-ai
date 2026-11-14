import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Wrench,
  FileSearch,
  Database,
  Code2,
  AlertTriangle,
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
} from "../components/ui/Primitives";
import { formatDateTimeBR, formatCurrencyBRL, cn } from "../lib/utils";

export function ExecutionMonitorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRequestId, setSelectedRequestId] = useState<string>(
    searchParams.get("request_id") || ""
  );

  const { data: requestsList } = useQuery({
    queryKey: ["requests-monitor-list"],
    queryFn: () => flowpilotApi.listRequests(),
  });

  useEffect(() => {
    const paramId = searchParams.get("request_id");
    if (paramId) {
      setSelectedRequestId(paramId);
    } else if (!selectedRequestId && requestsList?.items?.length) {
      setSelectedRequestId(requestsList.items[0].request_id);
    }
  }, [searchParams, requestsList, selectedRequestId]);

  const { data: trace, isLoading } = useQuery({
    queryKey: ["execution-trace", selectedRequestId],
    queryFn: () => flowpilotApi.getRequestDetail(selectedRequestId),
    enabled: Boolean(selectedRequestId),
  });

  const supervisorStep = trace?.steps
    ?.slice()
    .reverse()
    .find((s) => s.agent_id === "supervisor_agent");

  const policyStep = trace?.steps
    ?.slice()
    .reverse()
    .find((s) => s.agent_id === "policy_agent");

  return (
    <div className="space-y-6">
      {/* Selector Header */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <FileSearch className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Inspeção de Rastreabilidade & Linha do Tempo de Execução
              </h2>
              <p className="text-xs text-slate-400">
                Selecione uma solicitação para inspecionar cada etapa, validações, regras aplicadas, chaves de idempotência e auditoria SQLite
              </p>
            </div>
          </div>

          <select
            value={selectedRequestId}
            onChange={(e) => {
              setSelectedRequestId(e.target.value);
              setSearchParams({ request_id: e.target.value });
            }}
            className="min-w-[320px] rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
          >
            {requestsList?.items.map((r) => (
              <option key={r.request_id} value={r.request_id}>
                {r.request_id} — {r.title} ({r.status})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {isLoading || !trace ? (
        <div className="space-y-4">
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-96" />
        </div>
      ) : (
        <>
          {/* Request Summary Strip */}
          <Card className="border-slate-800">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-blue-400">
                      {trace.request.request_id}
                    </span>
                    <h3 className="text-base font-semibold text-white">
                      {trace.request.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Solicitante: <strong className="text-slate-200">{trace.request.requester_name}</strong> ({trace.request.requester_department}) • Categoria: <strong className="text-slate-200">{trace.request.category_label}</strong> • Valor: <strong className="text-blue-300 font-mono">{formatCurrencyBRL(trace.request.extracted_data?.amount)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-slate-400">
                      Tempo Total Medido
                    </div>
                    <div className="font-mono text-sm font-bold text-violet-300">
                      {trace.request.total_processing_ms} ms
                    </div>
                  </div>
                  <RiskBadge risk={trace.request.risk_level} />
                  <StatusBadge status={trace.request.status} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Visual Step-by-Step Timeline */}
            <Card className="lg:col-span-7">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <div>
                    <CardTitle>
                      Linha do Tempo de Execução ({trace.steps.length} Etapas Registradas)
                    </CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Histórico cronológico persistido na tabela processing_steps
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="relative border-l-2 border-slate-800 ml-3 space-y-6 pl-6 py-2">
                  {trace.steps.map((step) => (
                    <div key={step.step_id} className="relative">
                      {/* Node Circle */}
                      <span
                        className={cn(
                          "absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-[#0B1020]",
                          step.status === "ERRO"
                            ? "border-rose-500 text-rose-400"
                            : "border-blue-500 text-blue-400"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      </span>

                      <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-300">
                              #{step.step_order}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {step.agent_name}
                            </span>
                            <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                              {step.operation_mode}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-violet-300">
                              {step.duration_ms} ms
                            </span>
                            <span>•</span>
                            <span>{formatDateTimeBR(step.created_at)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-200 leading-relaxed">
                          {step.decision_summary}
                        </p>

                        {step.input_summary && (
                          <div className="rounded-lg border border-slate-800/80 bg-[#11182E]/50 px-3 py-2 text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-300">Entrada recebida: </span>
                            {step.input_summary}
                          </div>
                        )}

                        {/* Validations Pills */}
                        {step.validations && step.validations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {step.validations.map((val, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-[#11182E] px-2 py-0.5 text-[10px] text-slate-300"
                              >
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                {val}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Collapsible JSON Output */}
                        <details className="group pt-1">
                          <summary className="cursor-pointer text-[11px] font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1">
                            <Code2 className="h-3.5 w-3.5" />
                            Ver Payload JSON produzido pela etapa
                          </summary>
                          <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-800 bg-[#070B16] p-3 font-mono text-[11px] text-blue-300">
                            {JSON.stringify(step.output || {}, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Supervisor Cross-Audit, Policy Decisions, Idempotent Actions & Audit Log */}
            <div className="lg:col-span-5 space-y-6">
              {/* Supervisor SQLite Cross-Audit Card */}
              <Card className="border-emerald-500/25">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <div>
                      <CardTitle>Auditoria Cruzada SQLite (Supervisor Agent)</CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Conferência direta entre memória e tabelas persistidas
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {supervisorStep?.output ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B1020] p-3">
                        <span className="text-slate-400">Aprovado para Conclusão</span>
                        <span
                          className={cn(
                            "font-semibold",
                            supervisorStep.output.approved_for_completion
                              ? "text-emerald-400"
                              : "text-amber-400"
                          )}
                        >
                          {supervisorStep.output.approved_for_completion
                            ? "SIM (Integridade Confirmada)"
                            : "EM PAUSA / BLOQUEADO"}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-[#0B1020] p-3">
                        <div className="text-slate-400 mb-1.5">
                          Etapas Verificadas no Banco SQLite:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(supervisorStep.output.stages_verified || []).map(
                            (st: string) => (
                              <span
                                key={st}
                                className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-300 border border-emerald-500/30"
                              >
                                ✓ {st}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {supervisorStep.output.audit_explanation}
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-400">Sem dados de supervisão.</p>
                  )}
                </CardContent>
              </Card>

              {/* Policy Rules Triggered */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-violet-400" />
                    <CardTitle>Decisões do Policy Agent</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  {policyStep?.output ? (
                    <>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Política Satisfeita Automaticamente:</span>
                        <span className="font-mono font-semibold">
                          {policyStep.output.policy_satisfied ? "SIM" : "NÃO (Exige Ação)"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(policyStep.output.triggered_rules || []).length === 0 ? (
                          <span className="text-emerald-400 text-[11px]">
                            Nenhuma regra restritiva acionada (fluxo dentro da alçada direta).
                          </span>
                        ) : (
                          (policyStep.output.triggered_rules || []).map((r: string) => (
                            <span
                              key={r}
                              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                            >
                              <AlertTriangle className="inline h-3 w-3 mr-1" />
                              {r}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 pt-1">
                        {policyStep.output.policy_explanation}
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-400">Nenhuma avaliação de política registrada.</p>
                  )}
                </CardContent>
              </Card>

              {/* Idempotent Tool Actions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-blue-400" />
                    <CardTitle>
                      Ferramentas Executadas & Chaves de Idempotência ({trace.actions.length})
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {trace.actions.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Nenhuma ferramenta executada até o momento (respeitando bloqueio de governança/política).
                    </p>
                  ) : (
                    trace.actions.map((act) => (
                      <div
                        key={act.action_id}
                        className="rounded-xl border border-slate-800 bg-[#0B1020] p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-blue-400">
                            {act.tool_name}
                          </span>
                          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            {act.status}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px]">
                          {act.output_summary}
                        </p>
                        <div className="font-mono text-[10px] text-slate-500 truncate">
                          Chave SHA-256: {act.idempotency_key}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Immutable Audit Log */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <CardTitle>Trilha de Auditoria Imutável ({trace.audit_logs.length})</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {trace.audit_logs.map((log) => (
                    <div
                      key={log.audit_id}
                      className="rounded-lg border border-slate-800/80 bg-[#0B1020] p-2.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-mono font-semibold text-slate-200">
                          {log.event_type}
                        </span>
                        <span>{formatDateTimeBR(log.created_at)}</span>
                      </div>
                      <p className="mt-1 text-slate-300">{log.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
