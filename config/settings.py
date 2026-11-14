"""
Configurações centralizadas da plataforma FlowPilot AI.

Por que usar uma classe de configuração centralizada?
- Evita valores "mágicos" (hardcoded) espalhados pelo código.
- Permite trocar facilmente entre banco de dados de produção/demonstração e banco de testes (em memória ou arquivo temporário).
- Separa claramente o modo de operação (LOCAL determinístico vs LLM via API) sem precisar reescrever os agentes.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    """Configurações globais e parâmetros operacionais do FlowPilot AI."""

    app_name: str = "FlowPilot AI"
    app_version: str = "1.0.0"
    app_subtitle: str = "Plataforma de Orquestração de Agentes Inteligentes para Operações Administrativas"

    # Modo de operação: "LOCAL" (determinístico em Python) ou "LLM" (integração API externa)
    operation_mode: str = field(
        default_factory=lambda: os.getenv("FLOWPILOT_MODE", "LOCAL").upper()
    )

    # Configurações do Provedor de LLM
    llm_provider: str = field(
        default_factory=lambda: os.getenv("LLM_PROVIDER", "openai").lower()
    )
    llm_api_key: str = field(
        default_factory=lambda: os.getenv("LLM_API_KEY", "")
    )
    llm_model: str = field(
        default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4o-mini")
    )
    llm_base_url: str = field(
        default_factory=lambda: os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    )
    llm_timeout_seconds: float = 20.0
    llm_max_retries: int = 2

    # Banco de Dados SQLite
    db_path: str = field(
        default_factory=lambda: os.getenv(
            "FLOWPILOT_DB_PATH", str(BASE_DIR / "data" / "flowpilot.db")
        )
    )

    # Estimativas padrão para Simulação de Impacto Empresarial (configuráveis na UI)
    default_manual_minutes_per_request: float = 18.0
    default_human_review_minutes: float = 4.5

    # Categorias suportadas pelo Intake Agent e Campos Obrigatórios por Categoria
    required_fields_by_category: Dict[str, List[str]] = field(
        default_factory=lambda: {
            "SOLICITACAO_COMPRA": ["item", "amount", "department", "justification"],
            "REEMBOLSO": ["expense_type", "amount", "receipt_id", "justification"],
            "CADASTRO_FORNECEDOR": ["supplier_name", "tax_id", "contact_email", "service_category"],
            "SOLICITACAO_DOCUMENTOS": ["document_type", "purpose", "requester_department"],
            "DUVIDAS_ADMINISTRATIVAS": ["question_topic"],
            "SOLICITACOES_GERAIS": ["subject", "description"],
        }
    )


_settings_instance: Settings | None = None


def get_settings() -> Settings:
    """Retorna a instância singleton de configurações."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance
