import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
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
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  const { latest, history } = data;
  const matrixCategories = Object.keys(latest.confusion_matrix || {});

  return (
    <div className="space-y-6">
      {/* Header Control Bar */}
      <Card className="border-blue-500/30 bg-gradient-to-r from-[#11182E] to-[#151E3F]">
        <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/20 p-2.5 border border-blue-500/30">
              <FlaskConical className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Agent Evaluation Lab — Benchmark de Qualidade & Segurança
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Suíte automatizada de {latest.total_cases} casos sintéticos preparada para validar o projeto (classificação, extração, políticas, ambiguidade e Prompt Injection). Nota: Os resultados são calculados sobre os testes executados e não representam comprovação empírica em produção real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={flowpilotApi.getEvaluationCsvUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
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
                ? "Executando 32 Casos..."
                : "Executar Bateria de Testes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="p-4 border-emerald-500/25">
          <span className="text-xs text-slate-400">Taxa de Classificação</span>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            {latest.classification_accuracy_pct}%
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {latest.correct_classifications}/{latest.total_cases} casos corretos
          </p>
        </Card>

        <Card className="p-4 border-blue-500/25">
          <span className="text-xs text-slate-400">Extração de Campos</span>
          <div className="mt-2 text-2xl font-bold text-blue-400">
            {latest.extraction_accuracy_pct}%
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {latest.correct_extractions}/{latest.total_cases} casos exatos
          </p>
        </Card>

        <Card className="p-4 border-violet-500/25">
          <span className="text-xs text-slate-400">Decisão de Política</span>
          <div className="mt-2 text-2xl font-bold text-violet-400">
            {latest.policy_compliance_pct}%
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {latest.correct_policy_decisions}/{latest.total_cases} conformes
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-400">Falsos Positivos</span>
          <div className="mt-2 text-2xl font-bold text-white">
            {latest.false_positives}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Aprovações indevidas bloqueadas
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-400">Falsos Negativos</span>
          <div className="mt-2 text-2xl font-bold text-white">
            {latest.false_negatives}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Bloqueios indevidos em casos válidos
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-400">Tempo Médio / Caso</span>
          <div className="mt-2 font-mono text-2xl font-bold text-cyan-400">
            {latest.avg_processing_ms} ms
          </div>
          <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
            <Timer className="h-3 w-3" /> Modo {latest.mode_used}
          </p>
        </Card>
      </div>

      {/* Confusion Matrix & Evaluation History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Confusion Matrix */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4 text-blue-400" />
              <div>
                <CardTitle>Matriz de Confusão (Esperado vs Previsto)</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Diagonal principal em azul/verde representa acertos exatos do Intake Agent
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="p-2 text-left">Esperado \ Previsto</th>
                  {matrixCategories.map((col) => (
                    <th key={col} className="p-2 text-center font-mono">
                      {col.slice(0, 10)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {matrixCategories.map((rowCat) => (
                  <tr key={rowCat}>
                    <td className="p-2 font-mono font-semibold text-slate-300">
                      {rowCat}
                    </td>
                    {matrixCategories.map((colCat) => {
                      const val =
                        latest.confusion_matrix?.[rowCat]?.[colCat] || 0;
                      const isDiag = rowCat === colCat;
                      return (
                        <td
                          key={colCat}
                          className={cn(
                            "p-2 text-center font-mono rounded",
                            val > 0 && isDiag
                              ? "bg-emerald-500/20 text-emerald-300 font-bold"
                              : val > 0 && !isDiag
                              ? "bg-rose-500/25 text-rose-300 font-bold"
                              : "text-slate-600"
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

        {/* Evaluation Run History */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-violet-400" />
              <div>
                <CardTitle>Histórico de Avaliações Executadas</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registro comparativo das execuções do Evaluation Lab
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {history.map((h) => (
              <div
                key={h.run_id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0B1020] p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-400">
                      {h.run_id}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                      {h.mode_used}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {formatDateTimeBR(h.executed_at)}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-emerald-400 font-bold">
                    Class: {h.classification_accuracy_pct}% | Pol:{" "}
                    {h.policy_compliance_pct}%
                  </div>
                  <div className="text-[11px] text-slate-400">
                    FP: {h.false_positives} • FN: {h.false_negatives} •{" "}
                    {h.avg_processing_ms} ms
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Detailed 32 Cases Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Resultados Detalhados por Caso de Teste ({latest.case_results.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B1020]/60 text-[11px] uppercase text-slate-400">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Cenário Avaliado</th>
                <th className="py-3 px-4">Cat. Esperada</th>
                <th className="py-3 px-4">Cat. Prevista</th>
                <th className="py-3 px-4">Extração</th>
                <th className="py-3 px-4">Política Esperada / Prevista</th>
                <th className="py-3 px-4">Segurança</th>
                <th className="py-3 px-4 text-right">Latência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {latest.case_results.map((c) => (
                <tr key={c.case_id} className="hover:bg-slate-900/50">
                  <td className="py-3 px-4 font-mono font-semibold text-blue-400">
                    {c.case_id}
                  </td>
                  <td className="py-3 px-4 text-slate-200 max-w-xs">
                    {c.description}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                    {c.expected_category}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        c.category_correct ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {c.category_correct ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {c.predicted_category}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {c.extraction_correct ? (
                      <span className="text-emerald-400 font-medium">✓ OK</span>
                    ) : (
                      <span className="text-rose-400 font-medium">✗ Divergente</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span
                      className={
                        c.policy_correct ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {c.expected_policy_action} → {c.predicted_policy_action}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {c.prompt_injection_flag ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                        <ShieldAlert className="h-3 w-3" /> Injection Detectado
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Limpo</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    {c.processing_ms} ms
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
