"""
Modelos de dados e contratos estruturados (Pydantic v2) do FlowPilot AI.

Explicação didática:
Em engenharia de IA corporativa, o maior erro ao trabalhar com LLMs ou agentes é trafegar dicionários
soltos ou textos livres entre etapas. Quando usamos Pydantic:
1. Garantimos que o Intake Agent SEMPRE entregue um `IntakeResult` válido antes de o Analyst Agent rodar.
2. Impedimos que um LLM invente estados inexistentes (usamos `Enum` estritos).
3. Facilitamos a serialização e desserialização segura em JSON para salvar no SQLite.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class RequestState(str, Enum):
    """Estados explícitos exigidos pelo orquestrador central."""
    RECEBIDA = "RECEBIDA"
    EM_PROCESSAMENTO = "EM_PROCESSAMENTO"
    AGUARDANDO_INFORMACOES = "AGUARDANDO_INFORMACOES"
    AGUARDANDO_APROVACAO = "AGUARDANDO_APROVACAO"
    APROVADA = "APROVADA"
    REJEITADA = "REJEITADA"
    EXECUTADA = "EXECUTADA"
    ERRO = "ERRO"
    CONCLUIDA = "CONCLUIDA"


class RequestCategory(str, Enum):
    """Categorias oficiais de solicitações administrativas."""
    SOLICITACAO_COMPRA = "SOLICITACAO_COMPRA"
    REEMBOLSO = "REEMBOLSO"
    CADASTRO_FORNECEDOR = "CADASTRO_FORNECEDOR"
    SOLICITACAO_DOCUMENTOS = "SOLICITACAO_DOCUMENTOS"
    DUVIDAS_ADMINISTRATIVAS = "DUVIDAS_ADMINISTRATIVAS"
    SOLICITACOES_GERAIS = "SOLICITACOES_GERAIS"
    NAO_CLASSIFICADA = "NAO_CLASSIFICADA"

    @classmethod
    def label(cls, value: str) -> str:
        labels = {
            "SOLICITACAO_COMPRA": "Solicitação de Compra",
            "REEMBOLSO": "Reembolso de Despesas",
            "CADASTRO_FORNECEDOR": "Cadastro de Fornecedor",
            "SOLICITACAO_DOCUMENTOS": "Solicitação de Documentos",
            "DUVIDAS_ADMINISTRATIVAS": "Dúvidas Administrativas",
            "SOLICITACOES_GERAIS": "Solicitações Gerais",
            "NAO_CLASSIFICADA": "Não Classificada / Ambígua",
        }
        return labels.get(value, value)


class RiskLevel(str, Enum):
    """Nível de risco operacional da solicitação."""
    BAIXO = "BAIXO"
    MEDIO = "MEDIO"
    ALTO = "ALTO"
    CRITICO = "CRITICO"


class OperationMode(str, Enum):
    """Modo de execução ativo para total transparência."""
    LOCAL = "LOCAL"
    LLM = "LLM"


# =====================================================================
# CONTRATOS DE SAÍDA DOS 5 AGENTES ESPECIALIZADOS
# =====================================================================

class IntakeResult(BaseModel):
    """Saída estruturada do Agente 1 — Intake Agent."""
    category: RequestCategory = Field(description="Categoria identificada da solicitação")
    intent_summary: str = Field(description="Resumo objetivo da intenção do solicitante")
    confidence: float = Field(ge=0.0, le=1.0, description="Nível de confiança entre 0.0 e 1.0")
    classification_uncertain: bool = Field(
        default=False, description="Indica se o agente não conseguiu classificar com segurança"
    )
    extracted_data: Dict[str, Any] = Field(
        default_factory=dict, description="Entidades e campos extraídos sem invenção"
    )
    missing_mandatory_fields: List[str] = Field(
        default_factory=list, description="Campos obrigatórios ausentes para esta categoria"
    )
    urgency: str = Field(default="NORMAL", description="BAIXA, NORMAL, ALTA")
    security_flags: List[str] = Field(
        default_factory=list, description="Alertas de segurança detectados na entrada"
    )
    execution_mode: OperationMode = Field(default=OperationMode.LOCAL)


class AnalystResult(BaseModel):
    """Saída estruturada do Agente 2 — Analyst Agent."""
    is_complete: bool = Field(description="Todos os campos obrigatórios estão presentes e válidos?")
    missing_fields: List[str] = Field(default_factory=list)
    inconsistencies: List[str] = Field(
        default_factory=list, description="Inconsistências lógicas ou valores inválidos"
    )
    contradictions: List[str] = Field(
        default_factory=list, description="Informações contraditórias entre texto e formulário"
    )
    is_duplicate: bool = Field(default=False, description="Solicitação duplicada detectada?")
    duplicate_of_request_id: Optional[str] = Field(default=None)
    requires_clarification: bool = Field(
        default=False, description="Deve pausar e solicitar complementação ao usuário?"
    )
    clarification_message: Optional[str] = Field(default=None)
    executive_summary: str = Field(description="Resumo analítico objetivo sem dados inventados")
    execution_mode: OperationMode = Field(default=OperationMode.LOCAL)


class PolicyRuleViolation(BaseModel):
    """Representa uma regra administrativa avaliada pelo motor determinístico."""
    rule_code: str
    rule_name: str
    passed: bool
    action_required: str  # "ALLOW", "REQUIRE_APPROVAL", "REJECT", "HOLD_FOR_INFO"
    reason: str


class PolicyResult(BaseModel):
    """Saída estruturada do Agente 3 — Policy Agent."""
    compliant: bool = Field(description="A solicitação respeita as políticas determinísticas?")
    requires_human_approval: bool = Field(
        default=False, description="Exige aprovação humana antes do Action Agent?"
    )
    should_reject: bool = Field(
        default=False, description="Viola política inegociável e deve ser rejeitada?"
    )
    requires_more_info: bool = Field(
        default=False, description="Bloqueada por dados obrigatórios incompletos?"
    )
    risk_level: RiskLevel = Field(default=RiskLevel.BAIXO)
    evaluated_rules: List[PolicyRuleViolation] = Field(default_factory=list)
    policy_explanation: str = Field(description="Explicação clara da decisão de conformidade")
    deterministic_engine_verified: bool = Field(
        default=True, description="Garante que a decisão veio do motor determinístico"
    )
    execution_mode: OperationMode = Field(default=OperationMode.LOCAL)


class ExecutedToolAction(BaseModel):
    """Representa uma ação executada por uma ferramenta interna."""
    action_id: str
    tool_name: str
    action_type: str
    idempotency_key: str
    status: str  # "EXECUTED", "SKIPPED_IDEMPOTENT", "BLOCKED"
    output_summary: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class ActionResult(BaseModel):
    """Saída estruturada do Agente 4 — Action Agent."""
    executed: bool
    actions_taken: List[ExecutedToolAction] = Field(default_factory=list)
    formal_response: str = Field(description="Resposta formal preparada para o solicitante")
    generated_document_summary: str = Field(description="Documento interno de resumo operacional")
    pending_items_organized: List[str] = Field(default_factory=list)
    execution_mode: OperationMode = Field(default=OperationMode.LOCAL)


class SupervisorResult(BaseModel):
    """Saída estruturada do Agente 5 — Supervisor Agent."""
    approved_for_completion: bool = Field(
        description="O fluxo cumpriu todas as etapas e regras sem contradições?"
    )
    recommended_final_state: RequestState = Field(
        description="Estado final validado pelo Supervisor"
    )
    stages_verified: List[str] = Field(default_factory=list)
    detected_anomalies: List[str] = Field(default_factory=list)
    escalate_to_human: bool = Field(default=False)
    audit_explanation: str = Field(
        description="Explicação auditável das decisões tomadas ao longo do fluxo"
    )
    execution_mode: OperationMode = Field(default=OperationMode.LOCAL)


# =====================================================================
# MODELO DE ENTRADA DE SOLICITAÇÃO
# =====================================================================

class RequestSubmission(BaseModel):
    """Dados de entrada para criação de uma nova solicitação administrativa."""
    title: str = Field(..., min_length=3, max_length=200)
    requester_name: str = Field(..., min_length=2, max_length=120)
    requester_department: str = Field(default="Geral", max_length=100)
    raw_text: str = Field(..., min_length=5, max_length=5000)
    form_data: Dict[str, Any] = Field(default_factory=dict)
    source: str = Field(default="PORTAL_WEB")  # PORTAL_WEB, FORMULARIO, EMAIL_SIMULADO, DEMO
    is_demo: bool = Field(default=False)

    @field_validator("title", "requester_name", "raw_text")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()
