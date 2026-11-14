"""
Camada REST API (FastAPI) do FlowPilot AI (`api/main.py`).

Explicação arquitetural:
Esta camada disponibiliza todos os recursos do FlowPilot AI para o novo frontend SaaS em React + TypeScript
SEM replicar nenhuma regra de negócio. Toda classificação, análise, verificação de políticas determinísticas,
execução idempotente de ferramentas, auditoria cruzada do Supervisor, simulação de impacto e avaliação de
qualidade continuam sendo executadas pelos módulos Python originais (`agents/`, `orchestrator/`, `services/`,
`tools/`, `database/`).

Segurança da API:
- CORS restrito às origens locais de desenvolvimento/produção configuradas.
- NUNCA expõe `llm_api_key` em nenhum endpoint GET/PUT (retorna apenas `has_api_key_configured: bool`).
- Valida todas as entradas com contratos Pydantic v2.
- Protege endpoints de decisão humana exigindo nome de revisor e justificativa auditável.
"""
from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from config.settings import get_settings
from data.demo_seed import load_demo_environment
from database.models import RequestCategory, RequestState, RequestSubmission
from database.repository import FlowPilotRepository
from orchestrator.workflow import FlowPilotOrchestrator
from services.analytics_service import AnalyticsService
from services.evaluation_service import EvaluationService, get_benchmark_test_suite
from services.llm_service import LLMService
from services.security_service import AGENT_TOOL_PERMISSIONS, PROMPT_INJECTION_PATTERNS
from tools.report_tools import export_analytics_to_pdf, export_requests_to_csv


# =====================================================================
# ESTADO DE CONFIGURAÇÃO EM MEMÓRIA DO SERVIDOR API (SEM EXPOR CHAVES)
# =====================================================================
class RuntimeConfigState:
    def __init__(self) -> None:
        s = get_settings()
        self.operation_mode: str = s.operation_mode
        self.llm_provider: str = s.llm_provider
        self.llm_model: str = s.llm_model
        self.llm_api_key: str = s.llm_api_key
        self.llm_base_url: str = s.llm_base_url
        self.manual_minutes_per_request: float = s.default_manual_minutes_per_request
        self.human_review_minutes: float = s.default_human_review_minutes
        self.evaluation_history: List[Dict[str, Any]] = []
        self.latest_evaluation: Optional[Dict[str, Any]] = None
        self.db_path: Optional[str] = None

    def build_llm_service(self) -> LLMService:
        return LLMService(
            mode=self.operation_mode,
            provider=self.llm_provider,
            api_key=self.llm_api_key,
            model=self.llm_model,
            base_url=self.llm_base_url,
        )

    def build_repository(self) -> FlowPilotRepository:
        return FlowPilotRepository(db_path=self.db_path)


runtime_state = RuntimeConfigState()


# =====================================================================
# SCHEMAS DE ENTRADA DA API (PYDANTIC V2)
# =====================================================================
class CreateRequestPayload(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    requester_name: str = Field(..., min_length=2, max_length=120)
    requester_department: str = Field(default="Geral", max_length=100)
    raw_text: str = Field(..., min_length=5, max_length=5000)
    form_data: Dict[str, Any] = Field(default_factory=dict)
    source: str = Field(default="PORTAL_WEB")


class ComplementRequestPayload(BaseModel):
    additional_text: str = Field(default="", max_length=3000)
    additional_form_data: Dict[str, Any] = Field(default_factory=dict)
    actor: str = Field(default="Solicitante", min_length=2, max_length=120)


class ApprovalDecisionPayload(BaseModel):
    decision: str = Field(..., pattern="^(APROVADA|REJEITADA|SOLICITAR_INFO)$")
    reviewer_name: str = Field(..., min_length=2, max_length=120)
    justification: str = Field(..., min_length=5, max_length=2000)


class UpdatePolicyRulePayload(BaseModel):
    parameter_value: float
    is_active: bool = True
    actor: str = Field(default="Administrador SaaS", min_length=2, max_length=120)


class UpdateLLMConfigPayload(BaseModel):
    operation_mode: str = Field(..., pattern="^(LOCAL|LLM)$")
    llm_provider: str = Field(default="openai", pattern="^(openai|gemini|compatible)$")
    llm_model: str = Field(default="gpt-4o-mini", min_length=2, max_length=100)
    api_key: Optional[str] = Field(
        default=None,
        description="Opcional. Se enviado vazio ou None, mantém a chave existente a menos que clear_api_key=True.",
    )
    clear_api_key: bool = Field(default=False)


class UpdateImpactParamsPayload(BaseModel):
    manual_minutes_per_request: float = Field(..., ge=1.0, le=480.0)
    human_review_minutes: float = Field(..., ge=0.5, le=240.0)


# =====================================================================
# INICIALIZAÇÃO DO FASTAPI E CORS
# =====================================================================
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    repo = runtime_state.build_repository()
    existing = repo.list_requests(include_demo=True)
    if len(existing) == 0:
        load_demo_environment(repository=repo)
    yield


app = FastAPI(
    title="FlowPilot AI — Enterprise Multi-Agent API",
    description="API REST oficial da plataforma de orquestração multiagente FlowPilot AI.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# ENDPOINTS REST
# =====================================================================
@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    reqs = repo.list_requests(include_demo=True)
    demo_count = sum(1 for r in reqs if r.get("is_demo"))
    pending_approvals = len(repo.list_approvals(status_filter="PENDENTE"))
    return {
        "status": "ok",
        "app_name": "FlowPilot AI",
        "version": "2.0.0",
        "operation_mode": runtime_state.operation_mode,
        "effective_mode": "LLM" if llm.is_llm_configured() else "LOCAL",
        "mode_badge": llm.get_active_mode_badge(),
        "llm_provider": runtime_state.llm_provider,
        "llm_model": runtime_state.llm_model,
        "has_api_key_configured": llm.is_llm_configured(),
        "total_requests": len(reqs),
        "demo_requests": demo_count,
        "real_requests": len(reqs) - demo_count,
        "pending_approvals": pending_approvals,
    }


@app.get("/api/dashboard")
def get_dashboard(
    manual_minutes: Optional[float] = Query(default=None, ge=1.0, le=480.0),
    review_minutes: Optional[float] = Query(default=None, ge=0.5, le=240.0),
) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    analytics = AnalyticsService(repo)

    m_min = (
        manual_minutes
        if manual_minutes is not None
        else runtime_state.manual_minutes_per_request
    )
    r_min = (
        review_minutes
        if review_minutes is not None
        else runtime_state.human_review_minutes
    )

    metrics = analytics.compute_dashboard_metrics(
        manual_minutes_per_req=m_min,
        human_review_minutes=r_min,
    )
    requests = repo.list_requests(include_demo=True)

    # Distribuição por departamento real
    dept_counts = Counter(str(r.get("requester_department", "Geral")) for r in requests)
    department_distribution = [
        {"department": k, "count": v}
        for k, v in sorted(dept_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Alertas operacionais que exigem atenção imediata (pendentes de aprovação, risco crítico, erros ou bloqueios)
    attention_alerts: List[Dict[str, Any]] = []
    for r in requests:
        if r["status"] == RequestState.AGUARDANDO_APROVACAO.value:
            is_exec = float(r.get("extracted_data", {}).get("amount") or 0.0) > 25000.0
            attention_alerts.append(
                {
                    "request_id": r["request_id"],
                    "title": r["title"],
                    "requester_name": r["requester_name"],
                    "department": r["requester_department"],
                    "status": r["status"],
                    "risk_level": r["risk_level"],
                    "alert_type": "EXECUTIVE_APPROVAL" if is_exec else "HUMAN_APPROVAL",
                    "message": (
                        "Exige Aprovação Executiva Explícita (> R$ 25.000,00)"
                        if is_exec
                        else "Aguardando decisão na Central de Aprovações"
                    ),
                    "created_at": r["created_at"],
                }
            )
        elif r["status"] in (RequestState.ERRO.value, RequestState.AGUARDANDO_INFORMACOES.value):
            attention_alerts.append(
                {
                    "request_id": r["request_id"],
                    "title": r["title"],
                    "requester_name": r["requester_name"],
                    "department": r["requester_department"],
                    "status": r["status"],
                    "risk_level": r["risk_level"],
                    "alert_type": "ERROR" if r["status"] == RequestState.ERRO.value else "MISSING_INFO",
                    "message": (
                        f"Campos pendentes: {', '.join(r.get('missing_fields', []))}"
                        if r.get("missing_fields")
                        else "Requer revisão ou complementação de dados"
                    ),
                    "created_at": r["created_at"],
                }
            )
        elif r["risk_level"] == "CRITICO" and r["status"] == RequestState.REJEITADA.value:
            attention_alerts.append(
                {
                    "request_id": r["request_id"],
                    "title": r["title"],
                    "requester_name": r["requester_name"],
                    "department": r["requester_department"],
                    "status": r["status"],
                    "risk_level": r["risk_level"],
                    "alert_type": "SECURITY_BLOCKED",
                    "message": r.get("rejection_reason") or "Bloqueio crítico de segurança/política",
                    "created_at": r["created_at"],
                }
            )

    # Atividade recente real dos agentes (últimas 12 etapas registradas no banco)
    recent_steps: List[Dict[str, Any]] = []
    for ag in repo.list_agents():
        steps_ag = repo.get_steps_for_agent(ag["agent_id"], limit=4)
        recent_steps.extend(steps_ag)
    recent_steps.sort(key=lambda s: str(s.get("created_at", "")), reverse=True)

    return {
        "metrics": metrics,
        "department_distribution": department_distribution,
        "attention_alerts": attention_alerts[:10],
        "recent_agent_activity": recent_steps[:10],
        "mode_badge": llm.get_active_mode_badge(),
    }


@app.put("/api/dashboard/impact-params")
def update_impact_params(payload: UpdateImpactParamsPayload) -> Dict[str, Any]:
    runtime_state.manual_minutes_per_request = payload.manual_minutes_per_request
    runtime_state.human_review_minutes = payload.human_review_minutes
    return get_dashboard(
        manual_minutes=payload.manual_minutes_per_request,
        review_minutes=payload.human_review_minutes,
    )


@app.get("/api/requests")
def list_requests(
    category: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    risk_level: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    period_days: Optional[int] = Query(default=None),
    include_demo: bool = Query(default=True),
) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    items = repo.list_requests(
        category=category,
        status=status,
        search_query=search,
        include_demo=include_demo,
    )
    if risk_level and risk_level != "TODOS":
        items = [r for r in items if r.get("risk_level") == risk_level]

    if period_days and period_days > 0:
        now = datetime.now(timezone.utc)
        filtered = []
        for r in items:
            try:
                dt = datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00"))
                if (now - dt).days <= period_days:
                    filtered.append(r)
            except Exception:
                filtered.append(r)
        items = filtered

    for r in items:
        r["category_label"] = RequestCategory.label(str(r.get("category", "")))

    return {"total": len(items), "items": items}


@app.post("/api/requests")
def create_and_process_request(payload: CreateRequestPayload) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)

    submission = RequestSubmission(
        title=payload.title,
        requester_name=payload.requester_name,
        requester_department=payload.requester_department,
        raw_text=payload.raw_text,
        form_data=payload.form_data,
        source=payload.source,
        is_demo=False,
    )
    trace = orchestrator.submit_and_process(submission)
    trace["request"]["category_label"] = RequestCategory.label(
        str(trace["request"].get("category", ""))
    )
    return trace


@app.get("/api/requests/{request_id}")
def get_request_detail(request_id: str) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)
    try:
        trace = orchestrator.get_full_request_trace(request_id)
        trace["request"]["category_label"] = RequestCategory.label(
            str(trace["request"].get("category", ""))
        )
        return trace
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/requests/{request_id}/complement")
def complement_and_resume_request(
    request_id: str, payload: ComplementRequestPayload
) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)
    try:
        trace = orchestrator.resume_with_additional_info(
            request_id=request_id,
            additional_text=payload.additional_text,
            additional_form_data=payload.additional_form_data,
            actor=payload.actor,
        )
        trace["request"]["category_label"] = RequestCategory.label(
            str(trace["request"].get("category", ""))
        )
        return trace
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/agents")
def list_agents_with_telemetry() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    agents = repo.list_agents()
    enriched = []
    for idx, ag in enumerate(agents, start=1):
        history = repo.get_steps_for_agent(ag["agent_id"], limit=15)
        last_step = history[0] if history else None
        enriched.append(
            {
                **ag,
                "pipeline_order": idx,
                "allowed_tools": AGENT_TOOL_PERMISSIONS.get(ag["agent_id"], []),
                "last_result_summary": last_step["decision_summary"] if last_step else "Nenhuma execução registrada",
                "last_request_id": last_step["request_id"] if last_step else None,
                "last_step_status": last_step["status"] if last_step else None,
                "recent_history": history,
            }
        )
    return {"agents": enriched}


@app.get("/api/agents/{agent_id}/history")
def get_agent_history(agent_id: str, limit: int = Query(default=50, ge=1, le=200)) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    history = repo.get_steps_for_agent(agent_id, limit=limit)
    return {"agent_id": agent_id, "history": history}


@app.get("/api/approvals")
def list_approvals(status: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    rules_map = {r["rule_code"]: r for r in repo.list_policy_rules()}
    items = repo.list_approvals(status_filter=status)
    for item in items:
        item["category_label"] = RequestCategory.label(str(item.get("category", "")))
        extracted = item.get("extracted_data", {})
        amount = extracted.get("amount")
        item["amount"] = float(amount) if amount is not None else None
        triggered_codes = [
            c.strip() for c in str(item.get("rule_triggered", "")).split(",") if c.strip()
        ]
        item["is_executive_escalation"] = "RULE_PURCHASE_CRITICAL_CAP" in triggered_codes
        item["triggered_rules_details"] = [
            rules_map[c] for c in triggered_codes if c in rules_map
        ]

    pending = [i for i in items if i["status"] == "PENDENTE"]
    decided = [i for i in items if i["status"] != "PENDENTE"]
    return {
        "total": len(items),
        "pending_count": len(pending),
        "decided_count": len(decided),
        "pending": pending,
        "history": decided,
    }


@app.post("/api/approvals/{approval_id}/decide")
def decide_approval(approval_id: str, payload: ApprovalDecisionPayload) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)
    try:
        trace = orchestrator.resume_after_human_decision(
            approval_id=approval_id,
            decision=payload.decision,
            reviewer_name=payload.reviewer_name,
            justification=payload.justification,
        )
        trace["request"]["category_label"] = RequestCategory.label(
            str(trace["request"].get("category", ""))
        )
        return trace
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/policies")
def list_policies() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    return {"rules": repo.list_policy_rules(active_only=False)}


@app.put("/api/policies/{rule_code}")
def update_policy(rule_code: str, payload: UpdatePolicyRulePayload) -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    existing = {r["rule_code"]: r for r in repo.list_policy_rules(active_only=False)}
    if rule_code not in existing:
        raise HTTPException(status_code=404, detail=f"Regra '{rule_code}' não encontrada.")
    repo.update_policy_rule(
        rule_code=rule_code,
        parameter_value=payload.parameter_value,
        is_active=payload.is_active,
        actor=payload.actor,
    )
    return {"updated": True, "rules": repo.list_policy_rules(active_only=False)}


@app.get("/api/evaluation")
def get_evaluation_status() -> Dict[str, Any]:
    llm = runtime_state.build_llm_service()
    if runtime_state.latest_evaluation is None:
        # Executa uma primeira aferição real na inicialização sob demanda para apresentar dados verídicos
        eval_service = EvaluationService(llm_service=llm)
        res = eval_service.run_evaluation_suite()
        res["executed_at"] = datetime.now(timezone.utc).isoformat()
        res["mode_used"] = "LLM" if llm.is_llm_configured() else "LOCAL"
        runtime_state.latest_evaluation = res
        runtime_state.evaluation_history.insert(
            0,
            {
                "run_id": f"EVALRUN-{len(runtime_state.evaluation_history) + 1:03d}",
                "executed_at": res["executed_at"],
                "mode_used": res["mode_used"],
                "total_cases": res["total_cases"],
                "classification_accuracy_pct": res["classification_accuracy_pct"],
                "extraction_accuracy_pct": res["extraction_accuracy_pct"],
                "policy_compliance_pct": res["policy_compliance_pct"],
                "false_positives": res["false_positives"],
                "false_negatives": res["false_negatives"],
                "avg_processing_ms": res["avg_processing_ms"],
            },
        )
    return {
        "latest": runtime_state.latest_evaluation,
        "history": runtime_state.evaluation_history,
        "benchmark_suite_size": len(get_benchmark_test_suite()),
    }


@app.post("/api/evaluation/run")
def run_evaluation_benchmark() -> Dict[str, Any]:
    llm = runtime_state.build_llm_service()
    eval_service = EvaluationService(llm_service=llm)
    res = eval_service.run_evaluation_suite()
    res["executed_at"] = datetime.now(timezone.utc).isoformat()
    res["mode_used"] = "LLM" if llm.is_llm_configured() else "LOCAL"
    runtime_state.latest_evaluation = res
    runtime_state.evaluation_history.insert(
        0,
        {
            "run_id": f"EVALRUN-{len(runtime_state.evaluation_history) + 1:03d}",
            "executed_at": res["executed_at"],
            "mode_used": res["mode_used"],
            "total_cases": res["total_cases"],
            "classification_accuracy_pct": res["classification_accuracy_pct"],
            "extraction_accuracy_pct": res["extraction_accuracy_pct"],
            "policy_compliance_pct": res["policy_compliance_pct"],
            "false_positives": res["false_positives"],
            "false_negatives": res["false_negatives"],
            "avg_processing_ms": res["avg_processing_ms"],
        },
    )
    return {
        "latest": runtime_state.latest_evaluation,
        "history": runtime_state.evaluation_history,
    }


@app.get("/api/evaluation/export-csv")
def export_evaluation_csv() -> Response:
    if runtime_state.latest_evaluation is None:
        get_evaluation_status()
    cases = (runtime_state.latest_evaluation or {}).get("case_results", [])
    df = pd.DataFrame(cases)
    csv_bytes = df.to_csv(index=False).encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="flowpilot_agent_evaluation_benchmark.csv"'
        },
    )


@app.get("/api/reports/export-csv")
def download_requests_csv() -> Response:
    repo = runtime_state.build_repository()
    reqs = repo.list_requests(include_demo=True)
    csv_bytes = export_requests_to_csv(reqs)
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="flowpilot_relatorio_solicitacoes.csv"'
        },
    )


@app.get("/api/reports/export-pdf")
def download_executive_pdf() -> Response:
    repo = runtime_state.build_repository()
    analytics = AnalyticsService(repo)
    metrics = analytics.compute_dashboard_metrics(
        manual_minutes_per_req=runtime_state.manual_minutes_per_request,
        human_review_minutes=runtime_state.human_review_minutes,
    )
    reqs = repo.list_requests(include_demo=True)
    pdf_bytes = export_analytics_to_pdf(metrics, reqs)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="flowpilot_relatorio_executivo.pdf"'
        },
    )


@app.get("/api/settings")
def get_system_settings() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    llm = runtime_state.build_llm_service()
    s = get_settings()
    raw_db_path = Path(str(runtime_state.db_path or s.db_path))
    safe_db_label = f"data/{raw_db_path.name}"
    return {
        "app_name": s.app_name,
        "app_version": "2.0.0",
        "operation_mode": runtime_state.operation_mode,
        "effective_mode": "LLM" if llm.is_llm_configured() else "LOCAL",
        "mode_badge": llm.get_active_mode_badge(),
        "llm_provider": runtime_state.llm_provider,
        "llm_model": runtime_state.llm_model,
        "has_api_key_configured": llm.is_llm_configured(),
        "api_key_masked": "[CONFIGURADA • OCULTA POR SEGURANÇA]" if llm.is_llm_configured() else "Não configurada",
        "security_info": {
            "prompt_injection_patterns_count": len(PROMPT_INJECTION_PATTERNS),
            "rbac_permissions": AGENT_TOOL_PERMISSIONS,
            "idempotency_algorithm": "SHA-256 (IDEMP-<hash>)",
            "audit_redaction_active": True,
            "known_limitations": (
                "A detecção de Prompt Injection é baseada em padrões sintáticos em camadas e isolamento de dados; "
                "a proteção financeira final reside no motor determinístico do Policy Agent, que não pode ser alterado por texto do usuário. "
                "Como este projeto é uma demonstração de portfólio técnico, não há autenticação OAuth2/SSO para identificar aprovadores humanos "
                "(o nome do revisor é informado na Central de Aprovações) e efeitos colaterais externos (e-mail/ERP) são simulados com segurança."
            ),
        },
        "environment_info": {
            "database_engine": "SQLite 3 (WAL Mode + Foreign Keys ON)",
            "database_path": safe_db_label,
            "required_fields_by_category": s.required_fields_by_category,
            "manual_minutes_per_request": runtime_state.manual_minutes_per_request,
            "human_review_minutes": runtime_state.human_review_minutes,
        },
        "policy_rules": repo.list_policy_rules(active_only=False),
        "audit_logs": repo.list_audit_logs(limit=40),
    }


@app.put("/api/settings/llm")
def update_llm_settings(payload: UpdateLLMConfigPayload) -> Dict[str, Any]:
    runtime_state.operation_mode = payload.operation_mode.upper()
    runtime_state.llm_provider = payload.llm_provider.lower()
    runtime_state.llm_model = payload.llm_model.strip()

    if payload.clear_api_key:
        runtime_state.llm_api_key = ""
    elif payload.api_key is not None and payload.api_key.strip():
        runtime_state.llm_api_key = payload.api_key.strip()

    repo = runtime_state.build_repository()
    repo.log_audit(
        request_id=None,
        actor="Administrador SaaS",
        event_type="LLM_SETTINGS_UPDATED",
        severity="INFO",
        description=(
            f"Configuração de IA atualizada: modo={runtime_state.operation_mode}, "
            f"provedor={runtime_state.llm_provider}, modelo={runtime_state.llm_model}."
        ),
        metadata={
            "operation_mode": runtime_state.operation_mode,
            "provider": runtime_state.llm_provider,
            "model": runtime_state.llm_model,
            "has_api_key": bool(runtime_state.llm_api_key),
        },
    )
    return get_system_settings()


@app.post("/api/demo/load")
def load_demo_data() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    res = load_demo_environment(repository=repo)
    return {"status": "loaded", **res}


@app.post("/api/demo/clear")
def clear_demo_data() -> Dict[str, Any]:
    repo = runtime_state.build_repository()
    removed = repo.clear_demo_data()
    return {"status": "cleared", "removed_count": removed}


# =====================================================================
# SERVIDOR UNIFICADO DE PRODUÇÃO / DEMONSTRAÇÃO (FRONTEND REACT DIST)
# =====================================================================
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if (FRONTEND_DIST_DIR / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST_DIR / "assets")),
        name="frontend_assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_react_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Endpoint da API não encontrado.")
        candidate = FRONTEND_DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST_DIR / "index.html"))

