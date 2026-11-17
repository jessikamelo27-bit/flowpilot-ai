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
    <div className="space-y-4">
      {/* Selector Bar */}
      <Card>
        <CardContent className="p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <FileSearch className="h-4 w-4 text-[#2457C5]" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#20242B]">
                Monitor de Observabilidade & Rastreabilidade de Workflow
              </h2>
              <p className="text-[11px] text-[#707783]">
                Inspeção técnica de transições de estado, etapas processadas, validações e trilha de auditoria SQLite
              </p>
            </div>
          </div>

          <select
            value={selectedRequestId}
            onChange={(e) => {
              setSelectedRequestId(e.target.value);
              setSearchParams({ request_id: e.target.value });
            }}
            className="min-w-[320px] rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none font-medium"
          >
            {requestsList?.items.map((r) => (
              <option key={r.request_id} value={r.request_id}>
                {r.request_id} — {r.title} [{r.status}]
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {isLoading || !trace ? (
        <div className="space-y-4">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-80" />
        </div>
      ) : (
        <>
          {/* Request Context Summary Bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#2457C5]">
                      {trace.request.request_id}
                    </span>
                    <h3 className="text-sm font-semibold text-[#20242B]">
                      {trace.request.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#707783]">
                    Solicitante: <strong className="text-[#20242B]">{trace.request.requester_name}</strong> ({trace.request.requester_department}) • Categoria: <strong className="text-[#20242B]">{trace.request.category_label}</strong> • Valor: <strong className="text-[#2457C5] font-mono">{formatCurrencyBRL(trace.request.extracted_data?.amount)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase text-[#707783]">
                      Tempo Medido
                    </div>
                    <div className="font-mono text-xs font-bold text-[#20242B]">
                      {trace.request.total_processing_ms} ms
                    </div>
                  </div>
                  <RiskBadge risk={trace.request.risk_level} />
                  <StatusBadge status={trace.request.status} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left: Vertical Execution Timeline */}
            <Card className="lg:col-span-7">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#2457C5]" />
                  <div>
                    <CardTitle>
                      Timeline de Execução ({trace.steps.length} Eventos Registrados)
                    </CardTitle>
                    <p className="text-[11px] text-[#707783] mt-0.5">
                      Sequência cronológica persistida na tabela processing_steps
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="relative border-l-2 border-[#E1E5EA] ml-3 space-y-4 pl-5 py-1">
                  {trace.steps.map((step) => (
                    <div key={step.step_id} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-[#FFFFFF]",
                          step.status === "ERRO"
                            ? "border-[#C44F4F] text-[#C44F4F]"
                            : "border-[#2457C5] text-[#2457C5]"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      </span>

                      <div className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E5EA] pb-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-[#EAF0FC] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#2457C5]">
                              STEP #{step.step_order}
                            </span>
                            <span className="text-xs font-bold text-[#20242B]">
                              {step.agent_name}
                            </span>
                            <span className="rounded border border-[#E1E5EA] bg-[#F4F5F7] px-1.5 py-0.5 font-mono text-[10px] text-[#707783]">
                              {step.operation_mode}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-[#707783]">
                            <span className="font-semibold text-[#20242B]">
                              {step.duration_ms} ms
                            </span>
                            <span>•</span>
                            <span>{formatDateTimeBR(step.created_at)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-[#20242B] leading-relaxed">
                          {step.decision_summary}
                        </p>

                        {step.input_summary && (
                          <div className="rounded border border-[#E1E5EA] bg-[#F4F5F7] px-2.5 py-1.5 text-[11px] text-[#707783]">
                            <span className="font-semibold text-[#20242B]">
                              Entrada recebida:{" "}
                            </span>
                            {step.input_summary}
                          </div>
                        )}

                        {step.validations && step.validations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {step.validations.map((val, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded border border-[#E1E5EA] bg-[#F4F5F7] px-2 py-0.5 text-[10px] text-[#20242B]"
                              >
                                <CheckCircle2 className="h-3 w-3 text-[#24845A]" />
                                {val}
                              </span>
                            ))}
                          </div>
                        )}

                        <details className="group pt-1">
                          <summary className="cursor-pointer text-[11px] font-medium text-[#2457C5] hover:underline flex items-center gap-1">
                            <Code2 className="h-3.5 w-3.5" />
                            Inspecionar Payload JSON da Etapa
                          </summary>
                          <pre className="mt-2 max-h-52 overflow-auto rounded border border-[#E1E5EA] bg-[#F4F5F7] p-2.5 font-mono text-[11px] text-[#20242B]">
                            {JSON.stringify(step.output || {}, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Right: Context Panels (Supervisor Cross-Audit, Policy, Tools, Audit Log) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Supervisor SQLite Cross-Audit */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-[#24845A]" />
                    <div>
                      <CardTitle>Auditoria Cruzada SQLite (Supervisor Agent)</CardTitle>
                      <p className="text-[11px] text-[#707783] mt-0.5">
                        Verificação de integridade entre memória e tabelas persistidas
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  {supervisorStep?.output ? (
                    <>
                      <div className="flex items-center justify-between rounded border border-[#E1E5EA] bg-[#F4F5F7] p-2.5">
                        <span className="text-[#707783] font-medium">
                          Status da Auditoria
                        </span>
                        <span
                          className={cn(
                            "font-mono font-semibold",
                            supervisorStep.output.approved_for_completion
                              ? "text-[#24845A]"
                              : "text-[#B98220]"
                          )}
                        >
                          {supervisorStep.output.approved_for_completion
                            ? "ÍNTEGRA / CONCLUÍDA"
                            : "PAUSADA / AGUARDANDO AÇÃO"}
                        </span>
                      </div>
                      <div className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-2.5">
                        <div className="text-[11px] text-[#707783] mb-1.5 font-medium">
                          Estágios Verificados no SQLite:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(supervisorStep.output.stages_verified || []).map(
                            (st: string) => (
                              <span
                                key={st}
                                className="rounded border border-[#24845A]/30 bg-[#24845A]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#24845A]"
                              >
                                ✓ {st}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <p className="text-[#707783] text-[11px] leading-relaxed">
                        {supervisorStep.output.audit_explanation}
                      </p>
                    </>
                  ) : (
                    <p className="text-[#707783]">Sem dados de supervisão.</p>
                  )}
                </CardContent>
              </Card>

              {/* Policy Agent Evaluation */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#2457C5]" />
                    <CardTitle>Regras Aplicadas (Policy Agent)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {policyStep?.output ? (
                    <>
                      <div className="flex items-center justify-between text-[#20242B]">
                        <span className="text-[#707783]">Conformidade Direta:</span>
                        <span className="font-mono font-semibold">
                          {policyStep.output.policy_satisfied
                            ? "SIM"
                            : "REQUER GOVERNANÇA"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(policyStep.output.triggered_rules || []).length === 0 ? (
                          <span className="text-[#24845A] text-[11px] font-medium">
                            Nenhuma regra restritiva acionada (dentro da alçada automática).
                          </span>
                        ) : (
                          (policyStep.output.triggered_rules || []).map((r: string) => (
                            <span
                              key={r}
                              className="rounded border border-[#B98220]/30 bg-[#B98220]/10 px-2 py-0.5 font-mono text-[10px] text-[#B98220] font-medium"
                            >
                              <AlertTriangle className="inline h-3 w-3 mr-1" />
                              {r}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="text-[11px] text-[#707783] pt-1">
                        {policyStep.output.policy_explanation}
                      </p>
                    </>
                  ) : (
                    <p className="text-[#707783]">Nenhuma avaliação registrada.</p>
                  )}
                </CardContent>
              </Card>

              {/* Idempotent Tools */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-[#2457C5]" />
                    <CardTitle>
                      Ações Registradas & Idempotência ({trace.actions.length})
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {trace.actions.length === 0 ? (
                    <p className="text-xs text-[#707783]">
                      Nenhuma ferramenta executada (aguardando autorização ou bloqueada por política).
                    </p>
                  ) : (
                    trace.actions.map((act) => (
                      <div
                        key={act.action_id}
                        className="rounded border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-[#2457C5]">
                            {act.tool_name}
                          </span>
                          <span className="rounded bg-[#24845A]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#24845A]">
                            {act.status}
                          </span>
                        </div>
                        <p className="text-[#20242B] text-[11px]">
                          {act.output_summary}
                        </p>
                        <div className="font-mono text-[10px] text-[#707783] truncate">
                          IDEMP Key: {act.idempotency_key}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Audit Trail */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#707783]" />
                    <CardTitle>
                      Histórico de Auditoria ({trace.audit_logs.length})
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {trace.audit_logs.map((log) => (
                    <div
                      key={log.audit_id}
                      className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-2.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between text-[#707783]">
                        <span className="font-mono font-semibold text-[#20242B]">
                          {log.event_type}
                        </span>
                        <span className="font-mono">
                          {formatDateTimeBR(log.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-[#707783]">{log.description}</p>
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
