"""
Serviço de Analytics Operacional e Simulador de Impacto Empresarial do FlowPilot AI.

Explicação didática:
Todas as métricas exibidas no Dashboard e nos Relatórios são calculadas dinamicamente a partir das
tabelas reais do SQLite (`requests`, `processing_steps`, `agents`, `approvals`).
No módulo de Simulação de Impacto Empresarial:
- `Tempo Manual Estimado = Quantidade de Solicitações × Tempo Manual Estimado por Solicitação`
- `Tempo Total Automatizado = Tempo Real de Execução Automatizada + (Intervenções Humanas × Tempo Médio de Revisão)`
- `Economia Estimada = Tempo Manual Estimado - Tempo Total Automatizado`
Deixamos 100% explícito que o tempo manual é uma estimativa configurável e não um resultado comprovado.
"""
from collections import Counter
from typing import Any, Dict, List, Optional
from config.settings import get_settings
from database.models import RequestCategory, RequestState
from database.repository import FlowPilotRepository


class AnalyticsService:
    """Calcula indicadores operacionais reais e projeções configuráveis de economia de tempo."""

    def __init__(self, repository: Optional[FlowPilotRepository] = None) -> None:
        self.repo = repository or FlowPilotRepository()
        self.settings = get_settings()

    def compute_dashboard_metrics(
        self,
        manual_minutes_per_req: Optional[float] = None,
        human_review_minutes: Optional[float] = None,
    ) -> Dict[str, Any]:
        requests = self.repo.list_requests(include_demo=True)
        agents = self.repo.list_agents()

        manual_min = (
            manual_minutes_per_req
            if manual_minutes_per_req is not None
            else self.settings.default_manual_minutes_per_request
        )
        review_min = (
            human_review_minutes
            if human_review_minutes is not None
            else self.settings.default_human_review_minutes
        )

        total = len(requests)
        completed = sum(1 for r in requests if r["status"] == RequestState.CONCLUIDA.value)
        rejected = sum(1 for r in requests if r["status"] == RequestState.REJEITADA.value)
        awaiting_approval = sum(
            1 for r in requests if r["status"] == RequestState.AGUARDANDO_APROVACAO.value
        )
        awaiting_info = sum(
            1 for r in requests if r["status"] == RequestState.AGUARDANDO_INFORMACOES.value
        )
        in_progress = sum(
            1
            for r in requests
            if r["status"]
            in (
                RequestState.RECEBIDA.value,
                RequestState.EM_PROCESSAMENTO.value,
                RequestState.APROVADA.value,
                RequestState.EXECUTADA.value,
            )
        )
        errors = sum(1 for r in requests if r["status"] == RequestState.ERRO.value)
        pending_total = awaiting_approval + awaiting_info + in_progress

        human_interventions = sum(
            1
            for r in requests
            if r.get("human_intervention_occurred") or r.get("requires_human_approval")
        )
        auto_resolved = sum(
            1
            for r in requests
            if r["status"] in (RequestState.CONCLUIDA.value, RequestState.REJEITADA.value)
            and not r.get("human_intervention_occurred")
            and not r.get("requires_human_approval")
        )

        completion_rate = (completed / total * 100.0) if total > 0 else 0.0
        automation_rate = (auto_resolved / total * 100.0) if total > 0 else 0.0

        total_proc_ms = sum(float(r.get("total_processing_ms", 0.0)) for r in requests)
        avg_proc_ms = (total_proc_ms / total) if total > 0 else 0.0

        # Distribuição por Categoria
        cat_counts: Dict[str, int] = Counter(
            RequestCategory.label(str(r.get("category", "NAO_CLASSIFICADA"))) for r in requests
        )

        # Distribuição por Status
        status_counts: Dict[str, int] = Counter(str(r.get("status", "RECEBIDA")) for r in requests)

        # Evolução Diária e Mensal a partir de `created_at`
        daily_counts: Dict[str, int] = Counter()
        monthly_counts: Dict[str, int] = Counter()
        for r in requests:
            c_at = str(r.get("created_at", ""))
            if len(c_at) >= 10:
                daily_counts[c_at[:10]] += 1
            if len(c_at) >= 7:
                monthly_counts[c_at[:7]] += 1

        # Principais motivos de rejeição
        rejection_reasons: Counter[str] = Counter()
        for r in requests:
            if r["status"] == RequestState.REJEITADA.value:
                reason = str(r.get("rejection_reason") or "Violação de Política")
                short_r = reason.split(":")[0] if ":" in reason else reason[:60]
                rejection_reasons[short_r] += 1

        # Volume de solicitações/execuções e erros por agente
        agent_volume = [
            {
                "agent_id": a["agent_id"],
                "name": a["name"],
                "executions": int(a["total_executions"]),
                "errors": int(a["total_errors"]),
                "avg_duration_ms": float(a["avg_duration_ms"]),
            }
            for a in agents
        ]

        # Cálculo da Simulação de Impacto Empresarial
        impact = self.calculate_business_impact(
            request_count=total,
            manual_minutes_per_request=manual_min,
            automated_total_execution_ms=total_proc_ms,
            human_review_count=human_interventions,
            human_review_minutes_each=review_min,
        )

        return {
            "total_requests": total,
            "completed_requests": completed,
            "rejected_requests": rejected,
            "pending_requests": pending_total,
            "awaiting_approval": awaiting_approval,
            "awaiting_info": awaiting_info,
            "error_requests": errors,
            "completion_rate_pct": round(completion_rate, 1),
            "automation_rate_pct": round(automation_rate, 1),
            "human_interventions": human_interventions,
            "avg_processing_ms": round(avg_proc_ms, 2),
            "total_processing_ms": round(total_proc_ms, 2),
            "category_distribution": dict(cat_counts),
            "status_distribution": dict(status_counts),
            "daily_evolution": dict(sorted(daily_counts.items())),
            "monthly_evolution": dict(sorted(monthly_counts.items())),
            "rejection_reasons": dict(rejection_reasons),
            "agent_volume": agent_volume,
            "estimated_saved_minutes": impact["estimated_saved_minutes"],
            "estimated_saved_hours": impact["estimated_saved_hours"],
            "impact_simulation": impact,
        }

    @staticmethod
    def calculate_business_impact(
        request_count: int,
        manual_minutes_per_request: float,
        automated_total_execution_ms: float,
        human_review_count: int,
        human_review_minutes_each: float,
    ) -> Dict[str, Any]:
        """
        Implementa exatamente as fórmulas exigidas na Seção 9:
        - Tempo manual estimado = quantidade de solicitações × tempo manual por solicitação.
        - Tempo total automatizado = tempo de execução automatizada + tempo de revisão humana.
        - Economia estimada = tempo manual estimado - tempo total automatizado.
        """
        qty = max(0, int(request_count))
        manual_per_req = max(0.0, float(manual_minutes_per_request))
        auto_exec_minutes = max(0.0, float(automated_total_execution_ms)) / 60000.0
        human_review_total_minutes = max(0, int(human_review_count)) * max(
            0.0, float(human_review_minutes_each)
        )

        estimated_manual_minutes = qty * manual_per_req
        total_automated_minutes = auto_exec_minutes + human_review_total_minutes
        estimated_saved_minutes = estimated_manual_minutes - total_automated_minutes

        reduction_pct = (
            (estimated_saved_minutes / estimated_manual_minutes * 100.0)
            if estimated_manual_minutes > 0
            else 0.0
        )

        return {
            "is_configurable_estimate": True,
            "disclaimer": (
                "NOTA METODOLÓGICA: O tempo de processamento manual é uma estimativa configurável "
                "para simulação de cenário e não representa um dado empírico auditado."
            ),
            "request_count": qty,
            "manual_minutes_per_request": round(manual_per_req, 2),
            "estimated_manual_minutes": round(estimated_manual_minutes, 2),
            "estimated_manual_hours": round(estimated_manual_minutes / 60.0, 2),
            "automated_execution_minutes": round(auto_exec_minutes, 4),
            "human_review_count": human_review_count,
            "human_review_minutes_each": round(float(human_review_minutes_each), 2),
            "human_review_total_minutes": round(human_review_total_minutes, 2),
            "total_automated_minutes": round(total_automated_minutes, 2),
            "total_automated_hours": round(total_automated_minutes / 60.0, 2),
            "estimated_saved_minutes": round(estimated_saved_minutes, 2),
            "estimated_saved_hours": round(estimated_saved_minutes / 60.0, 2),
            "time_reduction_pct": round(reduction_pct, 1),
        }
