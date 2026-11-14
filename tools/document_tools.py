"""
Ferramentas internas para geração de documentos de resumo, respostas formais e minutas de notificação.
"""
from typing import Any, Dict, Tuple
from database.models import ExecutedToolAction, RequestCategory
from database.repository import FlowPilotRepository
from services.security_service import check_tool_permission, compute_idempotency_key


def generate_formal_response(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    requester_name: str,
    category: RequestCategory,
    title: str,
    extracted_data: Dict[str, Any],
) -> Tuple[ExecutedToolAction, str]:
    tool_name = "generate_formal_response"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    cat_label = RequestCategory.label(category.value)
    amount = extracted_data.get("amount")
    amount_str = f" (Valor validado: R$ {float(amount):,.2f})" if amount is not None else ""

    formal_text = (
        f"Prezado(a) {requester_name},\n\n"
        f"Informamos que sua solicitação '{title}' [{request_id}], classificada como "
        f"'{cat_label}'{amount_str}, foi processada, validada conforme as políticas "
        f"administrativas vigentes e teve suas etapas operacionais concluídas no FlowPilot AI.\n\n"
        f"Atenciosamente,\nCentral Inteligente de Operações — FlowPilot AI"
    )

    idemp_key = compute_idempotency_key(request_id, tool_name, "FORMAL_RESPONSE")
    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type="FORMAL_RESPONSE",
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=f"Resposta formal padronizada gerada para {requester_name}.",
        payload={"formal_response": formal_text, "delivery_mode": "SIMULATED_INTERNAL_PORTAL"},
    )
    return ExecutedToolAction(**rec), formal_text


def prepare_notification_draft(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    requester_name: str,
    department: str,
    status_label: str,
) -> ExecutedToolAction:
    tool_name = "prepare_notification_draft"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    idemp_key = compute_idempotency_key(request_id, tool_name, "NOTIFICATION_DRAFT")
    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type="NOTIFICATION_DRAFT",
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=(
            f"Notificação interna preparada para {requester_name} ({department}) — "
            f"Status: {status_label} [Envio externo simulado]."
        ),
        payload={
            "recipient": requester_name,
            "department": department,
            "status_label": status_label,
            "simulated_dispatch": True,
        },
    )
    return ExecutedToolAction(**rec)


def generate_summary_document(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    title: str,
    category: RequestCategory,
    executive_summary: str,
    policy_explanation: str,
) -> Tuple[ExecutedToolAction, str]:
    tool_name = "generate_summary_document"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    doc_content = (
        f"DOSSIÊ OPERACIONAL #{request_id}\n"
        f"Título: {title}\n"
        f"Categoria: {RequestCategory.label(category.value)}\n"
        f"Síntese Analítica: {executive_summary}\n"
        f"Parecer de Conformidade: {policy_explanation}"
    )
    idemp_key = compute_idempotency_key(request_id, tool_name, "SUMMARY_DOCUMENT")
    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type="SUMMARY_DOCUMENT",
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=f"Documento de resumo operacional #{request_id} consolidado.",
        payload={"document_content": doc_content},
    )
    return ExecutedToolAction(**rec), doc_content
