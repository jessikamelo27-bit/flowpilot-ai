import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Shield,
  Sliders,
  Database,
  Save,
  KeyRound,
  RefreshCw,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { flowpilotApi } from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  RiskBadge,
  SkeletonCard,
} from "../components/ui/Primitives";
import type { PolicyRuleRecord } from "../types/api";

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: flowpilotApi.getSettings,
  });

  const [mode, setMode] = useState<"LOCAL" | "LLM">("LOCAL");
  const [provider, setProvider] = useState<"openai" | "gemini" | "compatible">(
    "openai"
  );
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [ruleValues, setRuleValues] = useState<Record<string, number>>({});
  const [ruleActive, setRuleActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      setMode(data.operation_mode);
      setProvider(data.llm_provider);
      setModel(data.llm_model);

      const vals: Record<string, number> = {};
      const acts: Record<string, boolean> = {};
      data.policy_rules.forEach((r) => {
        vals[r.rule_code] = r.parameter_value;
        acts[r.rule_code] = Boolean(r.is_active);
      });
      setRuleValues(vals);
      setRuleActive(acts);
    }
  }, [data]);

  const updateLlmMutation = useMutation({
    mutationFn: flowpilotApi.updateLLMSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings"], updated);
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setApiKeyInput("");
      setSavedNotice("Configurações do motor de processamento atualizadas.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: ({
      ruleCode,
      value,
      active,
    }: {
      ruleCode: string;
      value: number;
      active: boolean;
    }) =>
      flowpilotApi.updatePolicy(ruleCode, {
        parameter_value: value,
        is_active: active,
        actor: "Administrador Operacional",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSavedNotice("Regra determinística de política atualizada no SQLite.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  const loadDemoMutation = useMutation({
    mutationFn: flowpilotApi.loadDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSavedNotice("22 solicitações de demonstração recarregadas.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: flowpilotApi.clearDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSavedNotice("Registros de demonstração removidos do SQLite.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-72" />
      </div>
    );
  }

  const handleSaveLLM = (e: React.FormEvent) => {
    e.preventDefault();
    updateLlmMutation.mutate({
      operation_mode: mode,
      llm_provider: provider,
      llm_model: model,
      api_key: apiKeyInput.trim() || undefined,
    });
  };

  return (
    <div className="space-y-5">
      {savedNotice && (
        <div className="flex items-center gap-2 rounded-md border border-[#24845A]/30 bg-[#24845A]/10 px-4 py-2.5 text-xs font-medium text-[#24845A]">
          <CheckCircle2 className="h-4 w-4" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Engine & LLM Configuration */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#2457C5]" />
              <div>
                <CardTitle>Configuração do Motor de Processamento & LLM</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Chaves de API são mantidas exclusivamente no servidor e nunca retornadas na resposta
                </p>
              </div>
            </div>
            <span className="rounded bg-[#EAF0FC] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#2457C5]">
              ATIVO: {data.effective_mode}
            </span>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSaveLLM} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#20242B] mb-1">
                    Modo de Execução
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "LOCAL" | "LLM")}
                    className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                  >
                    <option value="LOCAL">
                      LOCAL — Motor Determinístico (Padrão)
                    </option>
                    <option value="LLM">
                      LLM — Integração API Externa c/ Fallback
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#20242B] mb-1">
                    Provedor LLM
                  </label>
                  <select
                    value={provider}
                    onChange={(e) =>
                      setProvider(
                        e.target.value as "openai" | "gemini" | "compatible"
                      )
                    }
                    className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#20242B]"
                  >
                    <option value="openai">OpenAI REST API</option>
                    <option value="gemini">
                      Google Gemini API (x-goog-api-key)
                    </option>
                    <option value="compatible">OpenAI-Compatible Endpoint</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#20242B] mb-1">
                    Modelo Alvo
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o-mini ou gemini-2.5-flash"
                    className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 font-mono text-xs text-[#20242B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#20242B] mb-1">
                    Status da Credencial
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-[#E1E5EA] bg-[#F4F5F7] px-3 py-1.5 text-xs text-[#707783]">
                    <KeyRound className="h-3.5 w-3.5 text-[#B98220]" />
                    <span className="truncate">{data.api_key_masked}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20242B] mb-1">
                  Definir Nova Chave de API (Opcional)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-... ou AIza..."
                  className="w-full rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 font-mono text-xs text-[#20242B]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#E1E5EA]">
                {data.has_api_key_configured ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      updateLlmMutation.mutate({
                        operation_mode: "LOCAL",
                        llm_provider: provider,
                        llm_model: model,
                        clear_api_key: true,
                      })
                    }
                  >
                    Remover Chave da Memória
                  </Button>
                ) : (
                  <span />
                )}

                <Button
                  type="submit"
                  variant="primary"
                  disabled={updateLlmMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar Configuração
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security & Environment Panel */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#24845A]" />
              <div>
                <CardTitle>Segurança Operacional, RBAC & Ambiente</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Controles de integridade, idempotência e isolamento de dados
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded border border-[#E1E5EA] bg-[#F4F5F7] p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Detector Prompt Injection
                </span>
                <div className="mt-1 font-semibold text-[#24845A]">
                  {data.security_info.prompt_injection_patterns_count} Regras + Camada Contextual
                </div>
              </div>
              <div className="rounded border border-[#E1E5EA] bg-[#F4F5F7] p-2.5">
                <span className="text-[10px] font-semibold uppercase text-[#707783]">
                  Idempotência de Ações
                </span>
                <div className="mt-1 font-mono font-semibold text-[#2457C5]">
                  {data.security_info.idempotency_algorithm}
                </div>
              </div>
            </div>

            <div className="rounded border border-[#E1E5EA] bg-[#F4F5F7]/60 p-3 space-y-1">
              <div className="font-semibold text-[#20242B]">
                Escopo e Limitações Conhecidas:
              </div>
              <p className="text-[#707783] leading-relaxed text-[11px]">
                {data.security_info.known_limitations}
              </p>
            </div>

            <div className="rounded border border-[#E1E5EA] bg-[#FFFFFF] p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-[#20242B] flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-[#2457C5]" />
                  {data.environment_info.database_engine}
                </div>
                <p className="text-[11px] text-[#707783] mt-0.5 font-mono">
                  Arquivo: {data.environment_info.database_path}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadDemoMutation.mutate()}
                  disabled={loadDemoMutation.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Recarregar Demo
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => clearDemoMutation.mutate()}
                  disabled={clearDemoMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar Demo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deterministic Business Rules Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#2457C5]" />
            <div>
              <CardTitle>
                Tabela de Regras Determinísticas de Negócio (Policy Agent)
              </CardTitle>
              <p className="text-[11px] text-[#707783] mt-0.5">
                Parâmetros consultados pelo Policy Agent no SQLite antes de autorizar qualquer execução
              </p>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                <th className="py-2.5 px-3.5">Código & Descrição da Regra</th>
                <th className="py-2.5 px-3.5">Categoria</th>
                <th className="py-2.5 px-3.5">Ação</th>
                <th className="py-2.5 px-3.5">Risco</th>
                <th className="py-2.5 px-3.5">Valor / Limite</th>
                <th className="py-2.5 px-3.5">Ativa</th>
                <th className="py-2.5 px-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E5EA]">
              {data.policy_rules.map((rule: PolicyRuleRecord) => (
                <tr key={rule.rule_code} className="hover:bg-[#F4F5F7]/70">
                  <td className="py-3 px-3.5 max-w-md">
                    <div className="font-mono font-bold text-[#2457C5]">
                      {rule.rule_code}
                    </div>
                    <div className="font-medium text-[#20242B] mt-0.5">
                      {rule.rule_name}
                    </div>
                    <div className="text-[11px] text-[#707783] mt-0.5">
                      {rule.description}
                    </div>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-[#707783]">
                    {rule.category}
                  </td>
                  <td className="py-3 px-3.5 font-mono text-[#B98220] font-medium">
                    {rule.action_on_trigger}
                  </td>
                  <td className="py-3 px-3.5">
                    <RiskBadge risk={rule.risk_level} />
                  </td>
                  <td className="py-3 px-3.5">
                    <input
                      type="number"
                      step="50"
                      value={ruleValues[rule.rule_code] ?? rule.parameter_value}
                      onChange={(e) =>
                        setRuleValues({
                          ...ruleValues,
                          [rule.rule_code]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-28 rounded border border-[#E1E5EA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-xs text-[#20242B]"
                    />
                  </td>
                  <td className="py-3 px-3.5">
                    <input
                      type="checkbox"
                      checked={
                        ruleActive[rule.rule_code] ?? Boolean(rule.is_active)
                      }
                      onChange={(e) =>
                        setRuleActive({
                          ...ruleActive,
                          [rule.rule_code]: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-[#2457C5]"
                    />
                  </td>
                  <td className="py-3 px-3.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updatePolicyMutation.mutate({
                          ruleCode: rule.rule_code,
                          value:
                            ruleValues[rule.rule_code] ?? rule.parameter_value,
                          active:
                            ruleActive[rule.rule_code] ??
                            Boolean(rule.is_active),
                        })
                      }
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
