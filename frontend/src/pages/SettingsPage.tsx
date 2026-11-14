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
  const [provider, setProvider] = useState<"openai" | "gemini" | "compatible">("openai");
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
      setSavedNotice("Configurações do Motor de IA salvas com segurança!");
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
        actor: "Administrador SaaS",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSavedNotice("Regra determinística de negócio atualizada no SQLite!");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  const loadDemoMutation = useMutation({
    mutationFn: flowpilotApi.loadDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSavedNotice("22 casos de demonstração recarregados com sucesso.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: flowpilotApi.clearDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSavedNotice("Dados de demonstração removidos do banco SQLite.");
      setTimeout(() => setSavedNotice(null), 4000);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-80" />
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
    <div className="space-y-6">
      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-xs font-medium text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LLM Provider Configuration (Safe API Key Handling) */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-400" />
              <div>
                <CardTitle>Configuração do Provedor de IA & Modo de Operação</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chaves de API jamais são retornadas ou exibidas em texto aberto
                </p>
              </div>
            </div>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
              Efetivo: {data.effective_mode}
            </span>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSaveLLM} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Modo de Execução
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "LOCAL" | "LLM")}
                    className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                  >
                    <option value="LOCAL">
                      LOCAL — Motor Determinístico (Offline/Auditável)
                    </option>
                    <option value="LLM">
                      LLM — Integração API Externa c/ Fallback Seguro
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Provedor LLM
                  </label>
                  <select
                    value={provider}
                    onChange={(e) =>
                      setProvider(
                        e.target.value as "openai" | "gemini" | "compatible"
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3 py-2 text-xs text-white"
                  >
                    <option value="openai">OpenAI REST API</option>
                    <option value="gemini">
                      Google Gemini API (Header x-goog-api-key)
                    </option>
                    <option value="compatible">OpenAI-Compatible Endpoint</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Modelo Alvo
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o-mini ou gemini-2.5-flash"
                    className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Status da Chave de API
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0B1020] px-3.5 py-2 text-xs text-slate-300">
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    <span className="truncate">{data.api_key_masked}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Atualizar Chave de API (Opcional — armazenada apenas em memória segura no servidor)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Insira sk-... ou AIza... para substituir a chave atual"
                  className="w-full rounded-xl border border-slate-700 bg-[#0B1020] px-3.5 py-2 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
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
                  Salvar Configuração de IA
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security & Environment Information */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <div>
                <CardTitle>Segurança em Camadas, RBAC & Ambiente</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Proteções ativas contra Prompt Injection, vazamento de credenciais e duplicidade
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-slate-400">Detector Prompt Injection</span>
                <div className="mt-1 font-semibold text-emerald-400">
                  {data.security_info.prompt_injection_patterns_count} Padrões + Heurística Contextual
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
                <span className="text-slate-400">Idempotência de Ferramentas</span>
                <div className="mt-1 font-mono font-semibold text-blue-400">
                  {data.security_info.idempotency_algorithm}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3.5 space-y-1.5">
              <div className="font-semibold text-slate-200">
                Nota Arquitetural de Segurança:
              </div>
              <p className="text-slate-400 leading-relaxed">
                {data.security_info.known_limitations}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-blue-400" />
                  {data.environment_info.database_engine}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate max-w-xs">
                  {data.environment_info.database_path}
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

      {/* Deterministic Business Rules Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-violet-400" />
            <div>
              <CardTitle>
                Regras Determinísticas de Negócio & Limites de Aprovação (Policy Agent)
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Toda decisão financeira e operacional é validada por estas regras no backend Python antes do Action Agent
              </p>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B1020]/60 text-[11px] uppercase text-slate-400">
                <th className="py-3.5 px-4">Código / Regra</th>
                <th className="py-3.5 px-4">Categoria</th>
                <th className="py-3.5 px-4">Ação ao Acionar</th>
                <th className="py-3.5 px-4">Risco</th>
                <th className="py-3.5 px-4">Parâmetro (Limite R$ / Flag)</th>
                <th className="py-3.5 px-4">Ativa</th>
                <th className="py-3.5 px-4 text-right">Salvar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.policy_rules.map((rule: PolicyRuleRecord) => (
                <tr key={rule.rule_code} className="hover:bg-slate-900/50">
                  <td className="py-3.5 px-4 max-w-md">
                    <div className="font-mono font-bold text-blue-400">
                      {rule.rule_code}
                    </div>
                    <div className="font-medium text-slate-100 mt-0.5">
                      {rule.rule_name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {rule.description}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    {rule.category}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-amber-300">
                    {rule.action_on_trigger}
                  </td>
                  <td className="py-3.5 px-4">
                    <RiskBadge risk={rule.risk_level} />
                  </td>
                  <td className="py-3.5 px-4">
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
                      className="w-32 rounded-lg border border-slate-700 bg-[#0B1020] px-2.5 py-1.5 font-mono text-xs text-white"
                    />
                  </td>
                  <td className="py-3.5 px-4">
                    <input
                      type="checkbox"
                      checked={ruleActive[rule.rule_code] ?? Boolean(rule.is_active)}
                      onChange={(e) =>
                        setRuleActive({
                          ...ruleActive,
                          [rule.rule_code]: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-blue-500"
                    />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updatePolicyMutation.mutate({
                          ruleCode: rule.rule_code,
                          value:
                            ruleValues[rule.rule_code] ?? rule.parameter_value,
                          active:
                            ruleActive[rule.rule_code] ?? Boolean(rule.is_active),
                        })
                      }
                    >
                      <Save className="h-3.5 w-3.5" />
                      Atualizar
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
