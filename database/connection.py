"""
Gerenciador de conexão SQLite e inicialização de esquema relacional do FlowPilot AI.

Explicação didática:
Usamos SQLite com `PRAGMA foreign_keys = ON` e `PRAGMA journal_mode = WAL` (Write-Ahead Logging).
O modo WAL permite leituras e escritas concorrentes sem travar o arquivo do banco na interface Streamlit,
enquanto as chaves estrangeiras garantem que etapas, aprovações e ações sempre pertençam a uma solicitação real.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional
from config.settings import get_settings


SCHEMA_SQL = """
-- 1. Tabela de Agentes Especializados
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    total_executions INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms REAL NOT NULL DEFAULT 0.0,
    last_execution_at TEXT
);

-- 2. Tabela de Regras Administrativas (Motor Determinístico)
CREATE TABLE IF NOT EXISTS policy_rules (
    rule_code TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    parameter_key TEXT,
    parameter_value REAL,
    action_on_trigger TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'MEDIO',
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

-- 3. Tabela Principal de Solicitações Administrativas
CREATE TABLE IF NOT EXISTS requests (
    request_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_department TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    form_data_json TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'PORTAL_WEB',
    category TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADA',
    status TEXT NOT NULL DEFAULT 'RECEBIDA',
    confidence REAL NOT NULL DEFAULT 0.0,
    risk_level TEXT NOT NULL DEFAULT 'BAIXO',
    requires_human_approval INTEGER NOT NULL DEFAULT 0,
    human_intervention_occurred INTEGER NOT NULL DEFAULT 0,
    operation_mode TEXT NOT NULL DEFAULT 'LOCAL',
    extracted_data_json TEXT NOT NULL DEFAULT '{}',
    missing_fields_json TEXT NOT NULL DEFAULT '[]',
    final_summary TEXT,
    formal_response TEXT,
    rejection_reason TEXT,
    total_processing_ms REAL NOT NULL DEFAULT 0.0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 4. Tabela de Execuções (Runs do Orquestrador por Solicitação)
CREATE TABLE IF NOT EXISTS executions (
    execution_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    operation_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    total_duration_ms REAL NOT NULL DEFAULT 0.0,
    error_message TEXT,
    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
);

-- 5. Tabela de Etapas do Processamento (Rastreabilidade por Agente)
CREATE TABLE IF NOT EXISTS processing_steps (
    step_id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    responsibility TEXT NOT NULL,
    status TEXT NOT NULL,
    operation_mode TEXT NOT NULL,
    input_summary TEXT NOT NULL,
    output_json TEXT NOT NULL,
    validations_json TEXT NOT NULL DEFAULT '[]',
    decision_summary TEXT NOT NULL,
    next_stage TEXT NOT NULL,
    duration_ms REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(execution_id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

-- 6. Tabela de Aprovações Humanas
CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    rule_triggered TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    reviewer_name TEXT,
    decision_justification TEXT,
    requested_at TEXT NOT NULL,
    decided_at TEXT,
    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
);

-- 7. Tabela de Ações Realizadas pelas Ferramentas (com Chave de Idempotência)
CREATE TABLE IF NOT EXISTS actions_performed (
    action_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    output_summary TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
);

-- 8. Tabela de Registros de Auditoria (Audit Log Imutável)
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id TEXT PRIMARY KEY,
    request_id TEXT,
    actor TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_is_demo ON requests(is_demo);
CREATE INDEX IF NOT EXISTS idx_steps_request ON processing_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_request ON approvals(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);
"""


DEFAULT_AGENTS = [
    (
        "intake_agent",
        "Intake Agent",
        "Receber, sanitizar, classificar solicitações administrativas e extrair entidades estruturadas em JSON.",
    ),
    (
        "analyst_agent",
        "Analyst Agent",
        "Conferir campos obrigatórios, detectar inconsistências, contradições, duplicidades e gerar resumo objetivo.",
    ),
    (
        "policy_agent",
        "Policy Agent",
        "Verificar conformidade com as políticas e regras administrativas determinísticas, alçadas e riscos.",
    ),
    (
        "action_agent",
        "Action Agent",
        "Executar ferramentas internas idempotentes (tarefas, documentos, notificações simuladas e relatórios).",
    ),
    (
        "supervisor_agent",
        "Supervisor Agent",
        "Supervisionar o fluxo completo, auditar consistência entre etapas, impedir ações não autorizadas e consolidar decisão.",
    ),
]


DEFAULT_POLICY_RULES = [
    (
        "RULE_PURCHASE_LIMIT",
        "Limite de Alçada para Compras Diretas",
        "SOLICITACAO_COMPRA",
        "Solicitações de compra com valor acima do limite exigem aprovação humana obrigatória.",
        "max_auto_purchase_amount",
        2500.0,
        "REQUIRE_APPROVAL",
        "ALTO",
        1,
    ),
    (
        "RULE_PURCHASE_CRITICAL_CAP",
        "Limite de Escalonamento para Aprovação Executiva",
        "SOLICITACAO_COMPRA",
        "Solicitações de compra acima deste limite exigem escalonamento para aprovação executiva explícita (não é um bloqueio absoluto).",
        "critical_purchase_cap",
        25000.0,
        "REQUIRE_APPROVAL",
        "CRITICO",
        1,
    ),
    (
        "RULE_REIMBURSEMENT_RECEIPT",
        "Exigência de Comprovante e Justificativa em Reembolsos",
        "REEMBOLSO",
        "Todo pedido de reembolso exige código/número de comprovante fiscal e justificativa válida.",
        "require_receipt",
        1.0,
        "HOLD_FOR_INFO",
        "MEDIO",
        1,
    ),
    (
        "RULE_REIMBURSEMENT_LIMIT",
        "Limite de Reembolso Automático",
        "REEMBOLSO",
        "Reembolsos com valor superior ao teto automático exigem revisão e aprovação humana.",
        "max_auto_reimbursement_amount",
        800.0,
        "REQUIRE_APPROVAL",
        "ALTO",
        1,
    ),
    (
        "RULE_SUPPLIER_MANDATORY_KYC",
        "Validação Cadastral e CNPJ de Fornecedor",
        "CADASTRO_FORNECEDOR",
        "Cadastro de fornecedor exige CNPJ/documento fiscal válido, e-mail corporativo e aprovação de compliance.",
        "require_supplier_approval",
        1.0,
        "REQUIRE_APPROVAL",
        "ALTO",
        1,
    ),
    (
        "RULE_INCOMPLETE_BLOCK",
        "Bloqueio de Solicitações Incompletas",
        "GLOBAL",
        "Solicitações com campos obrigatórios ausentes não podem ser aprovadas automaticamente.",
        "block_incomplete",
        1.0,
        "HOLD_FOR_INFO",
        "MEDIO",
        1,
    ),
    (
        "RULE_CONTRADICTION_OR_DUPLICATE_REJECT",
        "Bloqueio por Contradição Grave ou Duplicidade",
        "GLOBAL",
        "Solicitações com valores contraditórios ou duplicadas de pedidos ativos devem ser rejeitadas.",
        "reject_contradiction_or_duplicate",
        1.0,
        "REJECT",
        "ALTO",
        1,
    ),
    (
        "RULE_SECURITY_PROMPT_INJECTION",
        "Bloqueio Imediato de Tentativa de Manipulação / Prompt Injection",
        "GLOBAL",
        "Qualquer tentativa de ignorar instruções, alterar políticas ou burlar aprovações é rejeitada imediatamente.",
        "block_prompt_injection",
        1.0,
        "REJECT",
        "CRITICO",
        1,
    ),
]


def resolve_db_path(custom_db_path: Optional[str] = None) -> str:
    """Resolve o caminho do banco SQLite e garante que o diretório pai exista."""
    db_path = custom_db_path or get_settings().db_path
    if db_path != ":memory:":
        path_obj = Path(db_path)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        return str(path_obj)
    return db_path


@contextmanager
def get_db_connection(custom_db_path: Optional[str] = None) -> Generator[sqlite3.Connection, None, None]:
    """Context manager seguro para conexão SQLite com commit/rollback automático."""
    target_path = resolve_db_path(custom_db_path)
    conn = sqlite3.connect(target_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    if target_path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database(custom_db_path: Optional[str] = None) -> None:
    """Inicializa todas as tabelas e popula os agentes e políticas padrão de forma idempotente."""
    from datetime import datetime, timezone

    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(custom_db_path) as conn:
        conn.executescript(SCHEMA_SQL)

        for agent_id, name, role_desc in DEFAULT_AGENTS:
            conn.execute(
                """
                INSERT INTO agents (agent_id, name, role_description, status)
                VALUES (?, ?, ?, 'ATIVO')
                ON CONFLICT(agent_id) DO NOTHING
                """,
                (agent_id, name, role_desc),
            )

        for (
            code,
            name,
            category,
            desc,
            param_key,
            param_val,
            action,
            risk,
            active,
        ) in DEFAULT_POLICY_RULES:
            conn.execute(
                """
                INSERT INTO policy_rules (
                    rule_code, rule_name, category, description,
                    parameter_key, parameter_value, action_on_trigger,
                    risk_level, is_active, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(rule_code) DO UPDATE SET
                    rule_name = excluded.rule_name,
                    description = excluded.description
                """,
                (code, name, category, desc, param_key, param_val, action, risk, active, now_iso),
            )
