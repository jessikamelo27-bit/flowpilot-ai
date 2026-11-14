"""
Ferramentas internas para criação de tarefas e organização de pendências operacionais.

Explicação didática:
Nenhuma ferramenta executa ações sem:
1. Verificar permissão do agente (`check_tool_permission`).
2. Gerar uma chave de idempotência (`compute_idempotency_key`) garantindo que, se o fluxo
   for reexecutado ou retomado, a mesma tarefa não seja duplicada no banco.
3. Simular integrações externas de forma segura (sem enviar e-mails reais ou realizar pagamentos).
"""
from typing import Any, Dict, List, Tuple
from database.models import ExecutedToolAction, RequestCategory
from database.repository import FlowPilotRepository
from services.security_service import check_tool_permission, compute_idempotency_key


def create_internal_task(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    category: RequestCategory,
    title: str,
    department: str,
    extracted_data: Dict[str, Any],
) -> ExecutedToolAction:
    tool_name = "create_internal_task"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    action_type = f"TASK_{category.value}"
    idemp_key = compute_idempotency_key(request_id, tool_name, action_type)

    queue_map = {
        RequestCategory.SOLICITACAO_COMPRA: "Fila de Suprimentos & Compras (Simulada)",
        RequestCategory.REEMBOLSO: "Fila Financeira - Contas a Pagar (Simulada)",
        RequestCategory.CADASTRO_FORNECEDOR: "Fila de Homologação e Compliance (Simulada)",
        RequestCategory.SOLICITACAO_DOCUMENTOS: "Fila de Secretaria / RH (Simulada)",
        RequestCategory.DUVIDAS_ADMINISTRATIVAS: "Central de Atendimento Interno",
        RequestCategory.SOLICITACOES_GERAIS: "Fila de Facilities & Operações",
    }
    target_queue = queue_map.get(category, "Fila Geral Administrativa")
    summary = (
        f"Tarefa operacional criada na '{target_queue}' para '{title}' "
        f"(Depto: {department}) [Execução Simulada e Rastreável]."
    )
    payload = {
        "target_queue": target_queue,
        "department": department,
        "extracted_data": extracted_data,
        "external_side_effects": "SIMULATED_SAFE",
    }

    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type=action_type,
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=summary,
        payload=payload,
    )
    return ExecutedToolAction(**rec)


def organize_pending_items(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    category: RequestCategory,
    extracted_data: Dict[str, Any],
) -> Tuple[ExecutedToolAction, List[str]]:
    tool_name = "organize_pending_items"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    checklist_map = {
        RequestCategory.SOLICITACAO_COMPRA: [
            "Ordem de compra interna gerada (modo simulação)",
            "Reserva orçamentária do centro de custo vinculada",
            "Acompanhamento de entrega registrado no painel",
        ],
        RequestCategory.REEMBOLSO: [
            "Comprovante fiscal validado e arquivado no dossiê",
            "Agendamento simulado para próximo lote de reembolso",
        ],
        RequestCategory.CADASTRO_FORNECEDOR: [
            "Dados cadastrais e CNPJ verificados",
            "Fornecedor habilitado na base homologada (simulação)",
        ],
        RequestCategory.SOLICITACAO_DOCUMENTOS: [
            "Minuta do documento solicitada ao setor responsável",
            "Protocolo de entrega disponibilizado ao colaborador",
        ],
    }
    items = checklist_map.get(
        category,
        [
            "Atendimento administrativo registrado no histórico",
            "orientações operacionais consolidadas para o solicitante",
        ],
    )
    idemp_key = compute_idempotency_key(request_id, tool_name, "ORGANIZE_CHECKLIST")
    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type="ORGANIZE_CHECKLIST",
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=f"Checklist operacional organizado ({len(items)} itens estruturados).",
        payload={"checklist": items, "category": category.value},
    )
    return ExecutedToolAction(**rec), items
