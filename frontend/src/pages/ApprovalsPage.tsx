import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Crown,
  Activity,
  Clock,
} from "lucide-react";
import { flowpilotApi } from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  StatusBadge,
  RiskBadge,
  Modal,
  SkeletonCard,
} from "../components/ui/Primitives";
import { formatCurrencyBRL, formatDateTimeBR, cn } from "../lib/utils";
import type { ApprovalRecord } from "../types/api";

export function ApprovalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeSubmission, setActiveSubmission] = useState<{
    approval: ApprovalRecord;
    decision: "APROVADA" | "REJEITADA" | "SOLICITAR_INFO";
  } | null>(null);

  const [reviewerName, setReviewerName] = useState("Helena Vasconcelos (Diretoria)");
  const [justification, setJustification] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => flowpilotApi.listApprovals(),
  });

  const decideMutation = useMutation({
    mutationFn: ({
      approvalId,
      decision,
      reviewer_name,
      justification,
    }: {
      approvalId: string;
      decision: "APROVADA" | "REJEITADA" | "SOLICITAR_INFO";
      reviewer_name: string;
      justification: string;
    }) =>
      flowpilotApi.decideApproval(approvalId, {
        decision,
        reviewer_name,
        justification,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setActiveSubmission(null);
      setJustification("");
    },
  });

  const handleConfirmDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubmission) return;
    decideMutation.mutate({
      approvalId: activeSubmission.approval.approval_id,
      decision: activeSubmission.decision,
      reviewer_name: reviewerName.trim(),
      justification: justification.trim(),
    });
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border-amber-500/30">
          <span className="text-xs text-slate-400">Aprovações Pendentes</span>
          <div className="mt-2 text-2xl font-bold text-amber-300">
            {data.pending_count}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Aguardando deliberação humana para retomar o fluxo FSM
          </p>
        </Card>
        <Card className="p-4 border-violet-500/30">
          <span className="text-xs text-slate-400">
            Escalonamentos Executivos (&gt; R$ 25.000)
          </span>
          <div className="mt-2 text-2xl font-bold text-violet-300">
            {data.pending.filter((p) => p.is_executive_escalation).length}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Regra RULE_PURCHASE_CRITICAL_CAP acionada
          </p>
        </Card>
        <Card className="p-4 border-emerald-500/30">
          <span className="text-xs text-slate-400">Decisões Auditadas</span>
          <div className="mt-2 text-2xl font-bold text-emerald-300">
            {data.decided_count}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Histórico consolidado com justificativa obrigatória
          </p>
        </Card>
      </div>

      {/* Pending Approvals Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            <div>
              <CardTitle>
                Fila de Deliberação Humana ({data.pending.length})
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Nenhuma ferramenta do Action Agent é executada antes da confirmação explícita nesta central
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {data.pending.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Todas as solicitações pendentes já foram deliberadas.
            </div>
          ) : (
            data.pending.map((item) => (
              <div
                key={item.approval_id}
                className={cn(
                  "rounded-2xl border p-5 transition-all space-y-4",
                  item.is_executive_escalation
                    ? "border-violet-500/50 bg-gradient-to-r from-violet-950/25 via-[#0E1529] to-[#0E1529]"
                    : "border-slate-800 bg-[#0B1020]"
                )}
              >
                {/* Executive Escalation Highlight Banner */}
                {item.is_executive_escalation && (
                  <div className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3.5 py-2 text-xs font-medium text-violet-200">
                    <Crown className="h-4 w-4 text-violet-300 shrink-0" />
                    <span>
                      ESCALONAMENTO EXECUTIVO OBRIGATÓRIO (RULE_PURCHASE_CRITICAL_CAP): Solicitação de compra superior a R$ 25.000,00 exige aprovação explícita da Diretoria.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-blue-400">
                        {item.request_id}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        ({item.approval_id})
                      </span>
                      <h4 className="text-sm font-bold text-white">
                        {item.title}
                      </h4>
                      <RiskBadge risk={item.risk_level} />
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span>
                        Solicitante: <strong>{item.requester_name}</strong> ({item.requester_department})
                      </span>
                      <span>
                        Categoria: <strong>{item.category_label}</strong>
                      </span>
                      <span>
                        Valor:{" "}
                        <strong className="font-mono text-amber-300">
                          {formatCurrencyBRL(item.amount)}
                        </strong>
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 bg-[#11182E]/90 rounded-xl p-3 border border-slate-800/80 mt-2">
                      {item.raw_text}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] text-slate-400">
                        Regras Acionadas:
                      </span>
                      {item.rule_triggered.split(",").map((rule) => (
                        <span
                          key={rule}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {rule.trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
                    <Button
                      variant="success"
                      size="md"
                      onClick={() =>
                        setActiveSubmission({
                          approval: item,
                          decision: "APROVADA",
                        })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aprovar & Executar
                    </Button>
                    <Button
                      variant="amber"
                      size="md"
                      onClick={() =>
                        setActiveSubmission({
                          approval: item,
                          decision: "SOLICITAR_INFO",
                        })
                      }
                    >
                      <HelpCircle className="h-4 w-4" />
                      Solicitar Informações
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() =>
                        setActiveSubmission({
                          approval: item,
                          decision: "REJEITADA",
                        })
                      }
                    >
                      <XCircle className="h-4 w-4" />
                      Rejeitar Solicitação
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        navigate(`/monitor?request_id=${item.request_id}`)
                      }
                    >
                      <Activity className="h-3.5 w-3.5" />
                      Ver Linha do Tempo
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Decision History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <CardTitle>
              Histórico de Deliberações Humanas ({data.history.length})
            </CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B1020]/60 text-[11px] uppercase text-slate-400">
                <th className="py-3 px-4">Aprovação / Req</th>
                <th className="py-3 px-4">Título</th>
                <th className="py-3 px-4">Regra Acionada</th>
                <th className="py-3 px-4">Decisão</th>
                <th className="py-3 px-4">Revisor</th>
                <th className="py-3 px-4">Justificativa</th>
                <th className="py-3 px-4">Data Decisão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.history.map((h) => (
                <tr key={h.approval_id} className="hover:bg-slate-900/50">
                  <td className="py-3 px-4 font-mono text-blue-400">
                    {h.request_id}
                  </td>
                  <td className="py-3 px-4 text-slate-200">{h.title}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-amber-300">
                    {h.rule_triggered}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {h.reviewer_name || "—"}
                  </td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                    {h.decision_justification || "—"}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {formatDateTimeBR(h.decided_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirmation Modal */}
      <Modal
        open={Boolean(activeSubmission)}
        onClose={() => setActiveSubmission(null)}
        title={
          activeSubmission
            ? `Confirmar Decisão: ${activeSubmission.decision} (${activeSubmission.approval.request_id})`
            : ""
        }
        subtitle="A decisão será gravada de forma imutável no SQLite e retomará imediatamente a Máquina de Estados Finita (FSM)."
        maxWidth="max-w-lg"
      >
        {activeSubmission && (
          <form onSubmit={handleConfirmDecision} className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3.5 text-xs space-y-1">
              <div className="font-semibold text-white">
                {activeSubmission.approval.title}
              </div>
              <div className="text-slate-400">
                Solicitante: {activeSubmission.approval.requester_name} • Valor:{" "}
                <span className="font-mono text-amber-300">
                  {formatCurrencyBRL(activeSubmission.approval.amount)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome e Cargo do Aprovador *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Justificativa de Governança / Parecer *
              </label>
              <textarea
                required
                minLength={5}
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Informe a justificativa gerencial ou quais documentos/dados adicionais o solicitante deve fornecer..."
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] p-3 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveSubmission(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant={
                  activeSubmission.decision === "APROVADA"
                    ? "success"
                    : activeSubmission.decision === "REJEITADA"
                    ? "danger"
                    : "amber"
                }
                disabled={decideMutation.isPending}
              >
                {decideMutation.isPending
                  ? "Processando Retomada..."
                  : `Confirmar ${activeSubmission.decision}`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
