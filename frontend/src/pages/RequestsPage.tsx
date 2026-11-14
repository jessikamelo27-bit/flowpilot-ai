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

  // Form state for New Request
  const [newTitle, setNewTitle] = useState("");
  const [newRequester, setNewRequester] = useState("");
  const [newDepartment, setNewDepartment] = useState("Operações");
  const [newRawText, setNewRawText] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newReceipt, setNewReceipt] = useState("");

  // Form state for Complement Missing Info
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
    if (compJustification.trim()) extraForm.justification = compJustification.trim();

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
    <div className="space-y-6">
      {/* Top Action & Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID, solicitante, título ou texto..."
                className="w-full rounded-xl border border-slate-700/80 bg-[#0B1020] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Filters & New Request Button */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Filter className="h-3.5 w-3.5" />
                <span>Filtros:</span>
              </div>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-slate-700/80 bg-[#0B1020] px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
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
                className="rounded-xl border border-slate-700/80 bg-[#0B1020] px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
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
                className="rounded-xl border border-slate-700/80 bg-[#0B1020] px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
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
                className="rounded-xl border border-slate-700/80 bg-[#0B1020] px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
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
                <Plus className="h-4 w-4" />
                Nova Solicitação
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              Solicitações Registradas ({data?.total ?? 0})
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Clique em qualquer solicitação para inspecionar o histórico completo, JSON extraído e pendências
            </p>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <SkeletonCard className="h-14" />
              <SkeletonCard className="h-14" />
              <SkeletonCard className="h-14" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              Nenhuma solicitação encontrada para os filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0B1020]/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">Título & Solicitante</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Valor</th>
                  <th className="py-3.5 px-4">Risco</th>
                  <th className="py-3.5 px-4">Estado (FSM)</th>
                  <th className="py-3.5 px-4">Confiança</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {data.items.map((req) => {
                  const amount = req.extracted_data?.amount;
                  return (
                    <tr
                      key={req.request_id}
                      onClick={() => {
                        setSelectedId(req.request_id);
                        setSearchParams({ id: req.request_id });
                      }}
                      className="cursor-pointer hover:bg-slate-900/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-blue-400 whitespace-nowrap">
                        {req.request_id}
                        {Boolean(req.prompt_injection_detected) && (
                          <span
                            title="Alerta de Segurança / Prompt Injection"
                            className="ml-1.5 inline-block text-rose-400"
                          >
                            🛡️
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-100 truncate">
                          {req.title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {req.requester_name} • {req.requester_department}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        {req.category_label}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-200 whitespace-nowrap">
                        {formatCurrencyBRL(amount)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <RiskBadge risk={req.risk_level} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {(req.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
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
                          Detalhes
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
        title="Nova Solicitação Operacional"
        subtitle="O fluxo passará automaticamente pelos 5 agentes especializados (Intake → Analyst → Policy → Action → Supervisor)."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Título da Solicitação *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Compra de 3 monitores Dell 27 polegadas"
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome do Solicitante *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={newRequester}
                onChange={(e) => setNewRequester(e.target.value)}
                placeholder="Ex: Mariana Prado"
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Departamento
              </label>
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Valor Estimado R$ (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Ex: 1450.00"
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                NF / Comprovante (opcional)
              </label>
              <input
                type="text"
                value={newReceipt}
                onChange={(e) => setNewReceipt(e.target.value)}
                placeholder="Ex: NF-44910"
                className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Descrição Completa da Solicitação *
            </label>
            <textarea
              required
              minLength={10}
              rows={4}
              value={newRawText}
              onChange={(e) => setNewRawText(e.target.value)}
              placeholder="Descreva os itens, valores, justificativa operacional, fornecedor ou documento solicitado..."
              className="w-full rounded-xl border border-slate-700 bg-[#0B1020] p-3.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {createMutation.isError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {(createMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
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
                ? "Processando nos 5 Agentes..."
                : "Enviar e Processar"}
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
          <div className="space-y-4">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-48" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Status & Quick Links */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0B1020] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={detailData.request.status} />
                <RiskBadge risk={detailData.request.risk_level} />
                <span className="text-xs text-slate-300 font-medium">
                  {detailData.request.category_label}
                </span>
                <span className="font-mono text-xs text-blue-400">
                  {formatCurrencyBRL(detailData.request.extracted_data?.amount)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/monitor?request_id=${detailData.request.request_id}`)
                  }
                >
                  <Activity className="h-3.5 w-3.5 text-violet-400" />
                  Abrir no Monitor de Execução
                </Button>
                {detailData.request.status === "AGUARDANDO_APROVACAO" && (
                  <Button
                    variant="amber"
                    size="sm"
                    onClick={() => navigate("/approvals")}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Decidir na Central de Aprovações
                  </Button>
                )}
              </div>
            </div>

            {/* Complement Missing Information Form (when AGUARDANDO_INFORMACOES) */}
            {detailData.request.status === "AGUARDANDO_INFORMACOES" && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-200">
                      Solicitação Pausada: Informações Obrigatórias Pendentes
                    </h4>
                    <p className="text-xs text-amber-300/90 mt-1">
                      Campos ausentes detectados pelo Intake/Analyst Agent:{" "}
                      <span className="font-mono font-semibold">
                        {detailData.request.missing_fields.join(", ") ||
                          "Informações complementares solicitadas pelo revisor"}
                      </span>
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleComplementSubmit}
                  className="space-y-3 border-t border-amber-500/20 pt-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="number"
                      step="0.01"
                      value={compAmount}
                      onChange={(e) => setCompAmount(e.target.value)}
                      placeholder="Valor R$ (se pendente)"
                      className="rounded-lg border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={compReceipt}
                      onChange={(e) => setCompReceipt(e.target.value)}
                      placeholder="Nº Recibo / NF (se pendente)"
                      className="rounded-lg border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={compTaxId}
                      onChange={(e) => setCompTaxId(e.target.value)}
                      placeholder="CNPJ / Documento (se pendente)"
                      className="rounded-lg border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="email"
                      value={compEmail}
                      onChange={(e) => setCompEmail(e.target.value)}
                      placeholder="E-mail de contato (se pendente)"
                      className="rounded-lg border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={compJustification}
                      onChange={(e) => setCompJustification(e.target.value)}
                      placeholder="Justificativa detalhada"
                      className="rounded-lg border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={compText}
                    onChange={(e) => setCompText(e.target.value)}
                    placeholder="Informe os dados complementares no texto para retomar o processamento..."
                    className="w-full rounded-lg border border-slate-700 bg-[#0B1020] p-3 text-xs text-white"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="amber"
                      disabled={complementMutation.isPending}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      {complementMutation.isPending
                        ? "Retomando Fluxo..."
                        : "Complementar Dados e Retomar Processamento"}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Original Text & Final Response */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Texto Original Enviado
                </div>
                <p className="mt-2 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {detailData.request.raw_text}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Parecer Consolidado / Resposta Final
                </div>
                <p className="mt-2 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {detailData.request.final_response ||
                    detailData.request.executive_summary ||
                    "Processamento em andamento."}
                </p>
              </div>
            </div>

            {/* Extracted Structured JSON & Steps Summary */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0B1020] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Entidades Extraídas (JSON)
                </div>
                <pre className="overflow-x-auto rounded-lg bg-[#070B16] p-3 font-mono text-[11px] text-blue-300 border border-slate-800/80">
                  {JSON.stringify(detailData.request.extracted_data, null, 2)}
                </pre>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0B1020] p-4 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Histórico de Etapas Executadas ({detailData.steps.length})
                </div>
                {detailData.steps.map((st) => (
                  <div
                    key={st.step_id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/90 bg-[#11182E]/70 p-2.5 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="font-semibold text-white">
                          {st.step_order}. {st.agent_name}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          {st.operation_mode}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300 text-[11px]">
                        {st.decision_summary}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {st.duration_ms} ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
