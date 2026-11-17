import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
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

  const [reviewerName, setReviewerName] = useState(
    "Helena Vasconcelos (Diretoria)"
  );
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
      <div className="space-y-4">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-60" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Compact Governance KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#707783]">
            Solicitações Aguardando Aprovação
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#B98220]">
            {data.pending_count}
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            Execução bloqueada até deliberação humana formal
          </p>
        </Card>
        <Card className="p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#707783]">
            Escalonamentos Executivos (&gt; R$ 25.000)
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#C44F4F]">
            {data.pending.filter((p) => p.is_executive_escalation).length}
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            Regra RULE_PURCHASE_CRITICAL_CAP acionada
          </p>
        </Card>
        <Card className="p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#707783]">
            Deliberações Registradas
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#24845A]">
            {data.decided_count}
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            Histórico auditado com justificativa e revisor
          </p>
        </Card>
      </div>

      {/* Pending Approvals Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#B98220]" />
            <div>
              <CardTitle>
                Fila de Aprovação Humana ({data.pending.length})
              </CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Nenhuma ação do Action Agent pode ser executada antes da aprovação registrada nesta central
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5">
          {data.pending.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#707783]">
              Todas as solicitações pendentes já foram deliberadas.
            </div>
          ) : (
            data.pending.map((item) => (
              <div
                key={item.approval_id}
                className={cn(
                  "rounded-md border p-4 space-y-3",
                  item.is_executive_escalation
                    ? "border-[#C44F4F]/40 bg-[#C44F4F]/[0.02]"
                    : "border-[#E1E5EA] bg-[#FFFFFF]"
                )}
              >
                {item.is_executive_escalation && (
                  <div className="flex items-center gap-2 rounded border border-[#C44F4F]/30 bg-[#C44F4F]/10 px-3 py-1.5 text-xs font-medium text-[#C44F4F]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      ESCALONAMENTO EXECUTIVO OBRIGATÓRIO (RULE_PURCHASE_CRITICAL_CAP): Valor superior a R$ 25.000,00 exige autorização explícita da Diretoria.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#2457C5]">
                        {item.request_id}
                      </span>
                      <span className="font-mono text-[11px] text-[#707783]">
                        ({item.approval_id})
                      </span>
                      <h4 className="text-sm font-semibold text-[#20242B]">
                        {item.title}
                      </h4>
                      <RiskBadge risk={item.risk_level} />
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#707783]">
                      <span>
                        Solicitante:{" "}
                        <strong className="text-[#20242B]">
                          {item.requester_name}
                        </strong>{" "}
                        ({item.requester_department})
                      </span>
                      <span>
                        Categoria:{" "}
                        <strong className="text-[#20242B]">
                          {item.category_label}
                        </strong>
                      </span>
                      <span>
                        Valor:{" "}
                        <strong className="font-mono text-[#20242B]">
                          {formatCurrencyBRL(item.amount)}
                        </strong>
                      </span>
                    </div>

                    <p className="text-xs text-[#20242B] bg-[#F4F5F7] rounded border border-[#E1E5EA] p-3">
                      {item.raw_text}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] text-[#707783] font-medium">
                        Política Acionada:
                      </span>
                      {item.rule_triggered.split(",").map((rule) => (
                        <span
                          key={rule}
                          className="inline-flex items-center gap-1 rounded border border-[#B98220]/30 bg-[#B98220]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#B98220]"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {rule.trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Decision Actions */}
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
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Aprovar Solicitação
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
                      <HelpCircle className="h-3.5 w-3.5" />
                      Solicitar Complemento
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
                      <XCircle className="h-3.5 w-3.5" />
                      Rejeitar Solicitação
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`/monitor?request_id=${item.request_id}`)
                      }
                    >
                      <Activity className="h-3.5 w-3.5 text-[#2457C5]" />
                      Monitor de Execução
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
            <Clock className="h-4 w-4 text-[#707783]" />
            <CardTitle>
              Histórico de Deliberações ({data.history.length})
            </CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                <th className="py-2.5 px-3.5">Req ID</th>
                <th className="py-2.5 px-3.5">Solicitação</th>
                <th className="py-2.5 px-3.5">Regra Acionada</th>
                <th className="py-2.5 px-3.5">Decisão</th>
                <th className="py-2.5 px-3.5">Revisor</th>
                <th className="py-2.5 px-3.5">Justificativa</th>
                <th className="py-2.5 px-3.5">Horário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E5EA]">
              {data.history.map((h) => (
                <tr key={h.approval_id} className="hover:bg-[#F4F5F7]/70">
                  <td className="py-2.5 px-3.5 font-mono font-semibold text-[#2457C5]">
                    {h.request_id}
                  </td>
                  <td className="py-2.5 px-3.5 text-[#20242B] font-medium">
                    {h.title}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#B98220]">
                    {h.rule_triggered}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="py-2.5 px-3.5 text-[#20242B]">
                    {h.reviewer_name || "—"}
                  </td>
                  <td className="py-2.5 px-3.5 text-[#707783] max-w-xs truncate">
                    {h.decision_justification || "—"}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#707783]">
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
            ? `Confirmar Deliberação: ${activeSubmission.decision} (${activeSubmission.approval.request_id})`
            : ""
        }
        subtitle="A decisão será registrada no SQLite e retomará a Máquina de Estados Finita (FSM)."
        maxWidth="max-w-lg"
      >
        {activeSubmission && (
          <form onSubmit={handleConfirmDecision} className="space-y-4">
            <div className="rounded border border-[#E1E5EA] bg-[#F4F5F7] p-3 text-xs space-y-1">
              <div className="font-semibold text-[#20242B]">
                {activeSubmission.approval.title}
              </div>
              <div className="text-[#707783]">
                Solicitante: {activeSubmission.approval.requester_name} • Valor:{" "}
                <span className="font-mono font-semibold text-[#20242B]">
                  {formatCurrencyBRL(activeSubmission.approval.amount)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Identificação do Aprovador *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Justificativa Formal *
              </label>
              <textarea
                required
                minLength={5}
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Informe a justificativa da decisão ou os dados complementares exigidos..."
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-2.5 text-xs text-[#20242B]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E5EA]">
              <Button
                type="button"
                variant="outline"
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
                  ? "Processando..."
                  : `Confirmar ${activeSubmission.decision}`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
