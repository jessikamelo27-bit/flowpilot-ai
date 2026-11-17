import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Play,
  Download,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Timer,
  Grid,
  History,
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

export function EvaluationLabPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["evaluation"],
    queryFn: flowpilotApi.getEvaluation,
  });

  const runMutation = useMutation({
    mutationFn: flowpilotApi.runEvaluation,
    onSuccess: (res) => {
      queryClient.setQueryData(["evaluation"], res);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard className="h-80" />
      </div>
    );
  }

  const { latest, history } = data;
  const matrixStates =
    latest.state_labels || Object.keys(latest.state_confusion_matrix || {});

  const correctClassCount = latest.case_results.filter(
    (c) => c.category_match
  ).length;
  const correctExtCount = latest.case_results.filter(
    (c) => c.extraction_match
  ).length;
  const correctPolCount = latest.case_results.filter(
    (c) => c.state_match
  ).length;

  return (
    <div className="space-y-5">
      {/* Technical Benchmark Header */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ClipboardCheck className="h-5 w-5 text-[#2457C5] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-[#20242B]">
                Evaluation Lab — Ferramenta Técnica de Verificação dos Agentes
              </h2>
              <p className="text-xs text-[#707783] mt-0.5">
                Suíte de {latest.total_cases} casos de teste preparada para verificar classificação, extração, políticas determinísticas e Prompt Injection. Os indicadores abaixo são calculados a partir dos testes efetivamente executados.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={flowpilotApi.getEvaluationCsvUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E1E5EA] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#20242B] hover:bg-[#F4F5F7] transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-[#2457C5]" />
              Exportar CSV
            </a>
            <Button
              variant="primary"
              size="md"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              {runMutation.isPending
                ? "Executando Suíte..."
                : "Executar Suíte de Testes (32 Casos)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Benchmark KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Precisão Classificação
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#24845A]">
            {latest.classification_accuracy_pct}%
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            {correctClassCount}/{latest.total_cases} aprovados
          </p>
        </Card>

        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Precisão Extração
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#2457C5]">
            {latest.extraction_accuracy_pct}%
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            {correctExtCount}/{latest.total_cases} exatos
          </p>
        </Card>

        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Conformidade Política
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#24845A]">
            {latest.policy_compliance_pct}%
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            {correctPolCount}/{latest.total_cases} conformes
          </p>
        </Card>

        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Falsos Positivos
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#20242B]">
            {latest.false_positives}
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            Aprovações indevidas
          </p>
        </Card>

        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Falsos Negativos
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#20242B]">
            {latest.false_negatives}
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783]">
            Bloqueios indevidos
          </p>
        </Card>

        <Card className="p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
            Latência Média / Caso
          </span>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#20242B]">
            {latest.avg_processing_ms} ms
          </div>
          <p className="mt-0.5 text-[11px] text-[#707783] flex items-center gap-1">
            <Timer className="h-3 w-3" /> Modo {latest.mode_used}
          </p>
        </Card>
      </div>

      {/* Confusion Matrix & Execution Comparison */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4 text-[#2457C5]" />
              <div>
                <CardTitle>Matriz de Confusão por Estado Final (Esperado vs. Obtido)</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Diagonal principal em verde indica correspondência exata do estado final da FSM
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[#707783]">
                  <th className="p-2 text-left font-semibold">
                    Esperado \ Obtido
                  </th>
                  {matrixStates.map((col) => (
                    <th key={col} className="p-2 text-center font-mono">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E5EA]">
                {matrixStates.map((rowState) => (
                  <tr key={rowState}>
                    <td className="p-2 font-mono font-semibold text-[#20242B]">
                      {rowState}
                    </td>
                    {matrixStates.map((colState) => {
                      const val =
                        latest.state_confusion_matrix?.[rowState]?.[colState] ||
                        0;
                      const isDiag = rowState === colState;
                      return (
                        <td
                          key={colState}
                          className={cn(
                            "p-2 text-center font-mono border border-[#E1E5EA]/60",
                            val > 0 && isDiag
                              ? "bg-[#24845A]/15 text-[#24845A] font-bold"
                              : val > 0 && !isDiag
                              ? "bg-[#C44F4F]/15 text-[#C44F4F] font-bold"
                              : "text-[#707783]"
                          )}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#2457C5]" />
              <div>
                <CardTitle>Histórico de Execuções do Benchmark</CardTitle>
                <p className="text-[11px] text-[#707783] mt-0.5">
                  Comparação entre baterias de avaliação executadas na sessão
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h) => (
              <div
                key={h.run_id}
                className="flex items-center justify-between rounded border border-[#E1E5EA] bg-[#F4F5F7]/60 p-2.5 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#2457C5]">
                      {h.run_id}
                    </span>
                    <span className="rounded border border-[#E1E5EA] bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[10px] text-[#20242B]">
                      {h.mode_used}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#707783]">
                    {formatDateTimeBR(h.executed_at)}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[#24845A] font-bold">
                    Class: {h.classification_accuracy_pct}% | Pol:{" "}
                    {h.policy_compliance_pct}%
                  </div>
                  <div className="text-[10px] text-[#707783]">
                    FP: {h.false_positives} • FN: {h.false_negatives} •{" "}
                    {h.avg_processing_ms} ms
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Detailed 32 Test Cases Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Relatório Individual dos Casos de Teste ({latest.case_results.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E1E5EA] bg-[#F4F5F7] text-[10px] font-semibold uppercase tracking-wider text-[#707783]">
                <th className="py-2.5 px-3.5">Caso</th>
                <th className="py-2.5 px-3.5">Grupo</th>
                <th className="py-2.5 px-3.5">Cenário de Teste</th>
                <th className="py-2.5 px-3.5">Cat. Esperada</th>
                <th className="py-2.5 px-3.5">Cat. Obtida</th>
                <th className="py-2.5 px-3.5">Extração</th>
                <th className="py-2.5 px-3.5">Estado Esperado → Obtido</th>
                <th className="py-2.5 px-3.5 text-right">Tempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E5EA]">
              {latest.case_results.map((c) => (
                <tr key={c.case_id} className="hover:bg-[#F4F5F7]/70">
                  <td className="py-2.5 px-3.5 font-mono font-semibold text-[#2457C5]">
                    {c.case_id}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium",
                        c.scenario_group === "PROMPT_INJECTION"
                          ? "border-[#C44F4F]/30 bg-[#C44F4F]/10 text-[#C44F4F]"
                          : "border-[#E1E5EA] bg-[#F4F5F7] text-[#707783]"
                      )}
                    >
                      {c.scenario_group}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-[#20242B] font-medium max-w-xs truncate">
                    {c.title}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#707783]">
                    {c.expected_category}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px]">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium",
                        c.category_match ? "text-[#24845A]" : "text-[#C44F4F]"
                      )}
                    >
                      {c.category_match ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {c.obtained_category}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px]">
                    {c.extraction_match ? (
                      <span className="text-[#24845A] font-semibold">PASS</span>
                    ) : (
                      <span className="text-[#C44F4F] font-semibold">FAIL</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-[11px]">
                    <span
                      className={cn(
                        "font-medium",
                        c.state_match ? "text-[#24845A]" : "text-[#C44F4F]"
                      )}
                    >
                      {c.expected_state} → {c.obtained_state}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-[#707783]">
                    {c.duration_ms} ms
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
