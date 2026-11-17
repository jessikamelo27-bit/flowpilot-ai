import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Filter,
  Eye,
  Send,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Activity,
  FilePlus2,
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
import { formatCurrencyBRL, formatDateTimeBR } from "../lib/utils";

const CATEGORIES = [
  { value: "TODAS", label: "Todas as Categorias" },
  { value: "SOLICITACAO_COMPRA", label: "Solicitação de Compra" },
  { value: "REEMBOLSO", label: "Reembolso de Despesas" },
  { value: "CADASTRO_FORNECEDOR", label: "Cadastro de Fornecedor" },
  { value: "SOLICITACAO_DOCUMENTOS", label: "Solicitação de Documentos" },
  { value: "DUVIDAS_ADMINISTRATIVAS", label: "Dúvidas Administrativas" },
  { value: "SOLICITACOES_GERAIS", label: "Solicitações Gerais" },
];

const STATUS_OPTIONS = [
  { value: "TODOS", label: "Todos os Estados" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "AGUARDANDO_APROVACAO", label: "Aguardando Aprovação" },
  { value: "AGUARDANDO_INFORMACOES", label: "Aguardando Informações" },
  { value: "REJEITADA", label: "Rejeitada" },
  { value: "ERRO", label: "Erro / Bloqueada" },
];

const RISK_OPTIONS = [
  { value: "TODOS", label: "Todos os Riscos" },
  { value: "BAIXO", label: "Baixo" },
  { value: "MEDIO", label: "Médio" },
  { value: "ALTO", label: "Alto" },
  { value: "CRITICO", label: "Crítico" },
];

const PERIOD_OPTIONS = [
  { value: 0, label: "Todo o Período" },
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

export function RequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [status, setStatus] = useState("TODOS");
  const [riskLevel, setRiskLevel] = useState("TODOS");
  const [periodDays, setPeriodDays] = useState<number>(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("id")
  );

  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam) setSelectedId(idParam);
  }, [searchParams]);

  const [newTitle, setNewTitle] = useState("");
  const [newRequester, setNewRequester] = useState("");
  const [newDepartment, setNewDepartment] = useState("Operações");
  const [newRawText, setNewRawText] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newReceipt, setNewReceipt] = useState("");

  const [compText, setCompText] = useState("");
  const [compAmount, setCompAmount] = useState("");
  const [compReceipt, setCompReceipt] = useState("");
  const [compTaxId, setCompTaxId] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compJustification, setCompJustification] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["requests", category, status, riskLevel, search, periodDays],
    queryFn: () =>
      flowpilotApi.listRequests({
        category,
        status,
        risk_level: riskLevel,
        search,
        period_days: periodDays || undefined,
      }),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["request-detail", selectedId],
    queryFn: () => flowpilotApi.getRequestDetail(selectedId!),
    enabled: Boolean(selectedId),
  });

  const createMutation = useMutation({
    mutationFn: flowpilotApi.createRequest,
    onSuccess: (trace) => {
      queryClient.invalidateQueries();
      setCreateOpen(false);
      setNewTitle("");
      setNewRequester("");
      setNewRawText("");
      setNewAmount("");
      setNewSupplier("");
      setNewReceipt("");
      setSelectedId(trace.request.request_id);
    },
  });

  const complementMutation = useMutation({
    mutationFn: ({
      reqId,
      payload,
    }: {
      reqId: string;
      payload: {
        additional_text: string;
        additional_form_data: Record<string, any>;
        actor: string;
      };
    }) => flowpilotApi.complementRequest(reqId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setCompText("");
      setCompAmount("");
      setCompReceipt("");
      setCompTaxId("");
      setCompEmail("");
      setCompJustification("");
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData: Record<string, any> = {};
    if (newAmount.trim()) formData.amount = parseFloat(newAmount);
    if (newSupplier.trim()) formData.supplier_name = newSupplier.trim();
    if (newReceipt.trim()) formData.receipt_id = newReceipt.trim();

    createMutation.mutate({
      title: newTitle.trim(),
      requester_name: newRequester.trim(),
      requester_department: newDepartment,
      raw_text: newRawText.trim(),
      form_data: formData,
      source: "PORTAL_WEB",
    });
  };

  const handleComplementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const extraForm: Record<string, any> = {};
    if (compAmount.trim()) extraForm.amount = parseFloat(compAmount);
    if (compReceipt.trim()) extraForm.receipt_id = compReceipt.trim();
    if (compTaxId.trim()) extraForm.tax_id = compTaxId.trim();
    if (compEmail.trim()) extraForm.contact_email = compEmail.trim();
    if (compJustification.trim())
      extraForm.justification = compJustification.trim();

    complementMutation.mutate({
      reqId: selectedId,
      payload: {
        additional_text: compText.trim(),
        additional_form_data: extraForm,
        actor: detailData?.request.requester_name || "Solicitante",
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter & Action Toolbar */}
      <Card>
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2 h-4 w-4 text-[#707783]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID, solicitante, departamento ou descrição..."
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] pl-9 pr-3 py-1.5 text-xs text-[#20242B] placeholder-[#707783] focus:border-[#2457C5] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-[#707783]">
                <Filter className="h-3.5 w-3.5" />
                Filtros:
              </span>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              >
                {RISK_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <select
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>

              <Button
                variant="primary"
                size="md"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Solicitação
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Requests Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              Registro Operacional de Solicitações ({data?.total ?? 0})
            </CardTitle>
            <p className="text-[11px] text-[#707783] mt-0.5">
              Clique em uma linha para inspecionar os dados estruturados, etapas processadas e pendências
            </p>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <SkeletonCard className="h-12" />
              <SkeletonCard className="h-12" />
              <SkeletonCard className="h-12" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#707783]">
              Nenhuma solicitação encontrada para os filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                  <th className="py-2.5 px-3.5">ID</th>
                  <th className="py-2.5 px-3.5">Solicitação & Solicitante</th>
                  <th className="py-2.5 px-3.5">Departamento</th>
                  <th className="py-2.5 px-3.5">Categoria</th>
                  <th className="py-2.5 px-3.5">Valor</th>
                  <th className="py-2.5 px-3.5">Risco</th>
                  <th className="py-2.5 px-3.5">Estado (FSM)</th>
                  <th className="py-2.5 px-3.5">Confiança</th>
                  <th className="py-2.5 px-3.5 text-right">Inspeção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E5EA] text-xs">
                {data.items.map((req) => {
                  const amount = req.extracted_data?.amount;
                  return (
                    <tr
                      key={req.request_id}
                      onClick={() => {
                        setSelectedId(req.request_id);
                        setSearchParams({ id: req.request_id });
                      }}
                      className="cursor-pointer hover:bg-[#F4F5F7]/80 transition-colors"
                    >
                      <td className="py-2.5 px-3.5 font-mono font-semibold text-[#2457C5] whitespace-nowrap">
                        {req.request_id}
                        {Boolean(req.prompt_injection_detected) && (
                          <span
                            title="Alerta de Segurança / Prompt Injection"
                            className="ml-1.5 inline-block rounded bg-[#C44F4F]/15 px-1 py-0.5 text-[9px] font-bold text-[#C44F4F]"
                          >
                            SEC
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 max-w-xs">
                        <div className="font-medium text-[#20242B] truncate">
                          {req.title}
                        </div>
                        <div className="text-[11px] text-[#707783]">
                          {req.requester_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-[#707783] whitespace-nowrap">
                        {req.requester_department}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#20242B] whitespace-nowrap">
                        {req.category_label}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-[#20242B] whitespace-nowrap">
                        {formatCurrencyBRL(amount)}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <RiskBadge risk={req.risk_level} />
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-[#707783] whitespace-nowrap">
                        {(req.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(req.request_id);
                            setSearchParams({ id: req.request_id });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Modal: Create New Request */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Registrar Nova Solicitação Operacional"
        subtitle="A solicitação será submetida ao pipeline de 5 agentes (Intake → Analyst → Policy → Action → Supervisor)."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Título da Solicitação *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Compra de 3 monitores Dell 27 polegadas"
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Nome do Solicitante *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={newRequester}
                onChange={(e) => setNewRequester(e.target.value)}
                placeholder="Ex: Mariana Prado"
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Departamento
              </label>
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              >
                <option value="Operações">Operações</option>
                <option value="TI & Engenharia">TI & Engenharia</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Comercial">Comercial</option>
                <option value="RH & Pessoas">RH & Pessoas</option>
                <option value="Jurídico & Compliance">Jurídico & Compliance</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                Valor Estimado R$ (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Ex: 1450.00"
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20242B] mb-1">
                NF / Comprovante (opcional)
              </label>
              <input
                type="text"
                value={newReceipt}
                onChange={(e) => setNewReceipt(e.target.value)}
                placeholder="Ex: NF-44910"
                className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#20242B] mb-1">
              Descrição Completa da Solicitação *
            </label>
            <textarea
              required
              minLength={10}
              rows={4}
              value={newRawText}
              onChange={(e) => setNewRawText(e.target.value)}
              placeholder="Descreva os itens, valores, justificativa operacional, fornecedor ou documento solicitado..."
              className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3 text-xs text-[#20242B] focus:border-[#2457C5] focus:outline-none"
            />
          </div>

          {createMutation.isError && (
            <div className="rounded-md border border-[#C44F4F]/30 bg-[#C44F4F]/10 p-3 text-xs text-[#C44F4F]">
              {(createMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E1E5EA]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              {createMutation.isPending
                ? "Processando..."
                : "Submeter Solicitação"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Request Full Details & Complement Missing Info */}
      <Modal
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null);
          setSearchParams({});
        }}
        title={
          detailData
            ? `${detailData.request.request_id} — ${detailData.request.title}`
            : "Carregando Solicitação..."
        }
        subtitle={
          detailData
            ? `Solicitante: ${detailData.request.requester_name} (${detailData.request.requester_department}) • Criada em ${formatDateTimeBR(detailData.request.created_at)}`
            : undefined
        }
        maxWidth="max-w-4xl"
      >
        {detailLoading || !detailData ? (
          <div className="space-y-3">
            <SkeletonCard className="h-20" />
            <SkeletonCard className="h-44" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Context Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E1E5EA] bg-[#F4F5F7] p-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge status={detailData.request.status} />
                <RiskBadge risk={detailData.request.risk_level} />
                <span className="text-xs font-medium text-[#20242B]">
                  {detailData.request.category_label}
                </span>
                <span className="font-mono text-xs font-semibold text-[#2457C5]">
                  {formatCurrencyBRL(detailData.request.extracted_data?.amount)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/monitor?request_id=${detailData.request.request_id}`
                    )
                  }
                >
                  <Activity className="h-3.5 w-3.5 text-[#2457C5]" />
                  Inspecionar no Monitor de Execução
                </Button>
                {detailData.request.status === "AGUARDANDO_APROVACAO" && (
                  <Button
                    variant="amber"
                    size="sm"
                    onClick={() => navigate("/approvals")}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Deliberar na Central de Aprovações
                  </Button>
                )}
              </div>
            </div>

            {/* Complement Missing Information Form */}
            {detailData.request.status === "AGUARDANDO_INFORMACOES" && (
              <div className="rounded-md border border-[#B98220]/40 bg-[#B98220]/5 p-4 space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-[#B98220] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-[#20242B]">
                      Solicitação Pausada: Informações Obrigatórias Pendentes
                    </h4>
                    <p className="text-xs text-[#707783] mt-0.5">
                      Campos exigidos pela política:{" "}
                      <span className="font-mono font-semibold text-[#B98220]">
                        {detailData.request.missing_fields.join(", ") ||
                          "Complementação solicitada pelo revisor"}
                      </span>
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleComplementSubmit}
                  className="space-y-3 border-t border-[#E1E5EA] pt-3"
                >
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <input
                      type="number"
                      step="0.01"
                      value={compAmount}
                      onChange={(e) => setCompAmount(e.target.value)}
                      placeholder="Valor R$ (se pendente)"
                      className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                    />
                    <input
                      type="text"
                      value={compReceipt}
                      onChange={(e) => setCompReceipt(e.target.value)}
                      placeholder="Nº Recibo / NF (se pendente)"
                      className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                    />
                    <input
                      type="text"
                      value={compTaxId}
                      onChange={(e) => setCompTaxId(e.target.value)}
                      placeholder="CNPJ / Documento (se pendente)"
                      className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="email"
                      value={compEmail}
                      onChange={(e) => setCompEmail(e.target.value)}
                      placeholder="E-mail de contato (se pendente)"
                      className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                    />
                    <input
                      type="text"
                      value={compJustification}
                      onChange={(e) => setCompJustification(e.target.value)}
                      placeholder="Justificativa operacional"
                      className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                    />
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={compText}
                    onChange={(e) => setCompText(e.target.value)}
                    placeholder="Informe os dados complementares para retomar o workflow..."
                    className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-2.5 text-xs text-[#20242B]"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="amber"
                      disabled={complementMutation.isPending}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      {complementMutation.isPending
                        ? "Retomando..."
                        : "Enviar Complemento e Retomar Fluxo"}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Text & Consolidated Response */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                  Descrição Original Submetida
                </div>
                <p className="mt-1.5 text-xs text-[#20242B] whitespace-pre-wrap leading-relaxed">
                  {detailData.request.raw_text}
                </p>
              </div>

              <div className="rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                  Parecer Consolidado / Resposta Operacional
                </div>
                <p className="mt-1.5 text-xs text-[#20242B] whitespace-pre-wrap leading-relaxed">
                  {detailData.request.final_response ||
                    detailData.request.executive_summary ||
                    "Em processamento."}
                </p>
              </div>
            </div>

            {/* Structured JSON & Steps Table */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5 rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#707783] mb-2">
                  Dados Estruturados Extraídos (JSON)
                </div>
                <pre className="overflow-x-auto rounded border border-[#E1E5EA] bg-[#F4F5F7] p-3 font-mono text-[11px] text-[#20242B]">
                  {JSON.stringify(detailData.request.extracted_data, null, 2)}
                </pre>
              </div>

              <div className="lg:col-span-7 rounded-md border border-[#E1E5EA] bg-[#FFFFFF] p-3.5 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                  Etapas Processadas pelos Agentes ({detailData.steps.length})
                </div>
                <div className="divide-y divide-[#E1E5EA] border border-[#E1E5EA] rounded">
                  {detailData.steps.map((st) => (
                    <div
                      key={st.step_id}
                      className="flex items-start justify-between gap-3 p-2.5 text-xs bg-[#FFFFFF]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#24845A] shrink-0" />
                          <span className="font-semibold text-[#20242B]">
                            {st.step_order}. {st.agent_name}
                          </span>
                          <span className="rounded bg-[#F4F5F7] border border-[#E1E5EA] px-1.5 py-0.5 font-mono text-[10px] text-[#707783]">
                            {st.operation_mode}
                          </span>
                        </div>
                        <p className="mt-1 text-[#707783] text-[11px]">
                          {st.decision_summary}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-[#707783] shrink-0">
                        {st.duration_ms} ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
