"""
AGENTE 4 — ACTION AGENT
Responsabilidade: Transformar solicitações aprovadas em ações administrativas rastreáveis.
Executa exclusivamente através das ferramentas internas autorizadas (`task_tools`, `document_tools`, `report_tools`),
garantindo idempotência (nunca executa duas vezes a mesma tarefa para a mesma solicitação) e
bloqueando qualquer execução caso a solicitação exija aprovação humana ainda não concedida.
"""
from typing import Optional, Tuple
from database.models import (
    ActionResult,
    AnalystResult,
    IntakeResult,
    OperationMode,
    PolicyResult,
    RequestSubmission,
)
from database.repository import FlowPilotRepository
from services.llm_service import LLMCallMetadata, LLMService
from tools.document_tools import (
    generate_formal_response,
    generate_summary_document,
    prepare_notification_draft,
)
from tools.report_tools import generate_processing_report
from tools.task_tools import create_internal_task, organize_pending_items


class ActionAgent:
    """Agente 4: Execução Operacional Idempotente com Ferramentas Internas."""

    agent_id = "action_agent"
    agent_name = "Action Agent"
    responsibility = (
        "Transformar solicitações aprovadas em tarefas internas, respostas formais, "
        "notificações simuladas, documentos de resumo e relatórios de processamento."
    )

    def __init__(
        self,
        repository: FlowPilotRepository,
        llm_service: Optional[LLMService] = None,
    ) -> None:
        self.repo = repository
        self.llm = llm_service or LLMService()

    def process(
        self,
        request_id: str,
        submission: RequestSubmission,
        intake_result: IntakeResult,
        analyst_result: AnalystResult,
        policy_result: PolicyResult,
        human_approved: bool = False,
    ) -> Tuple[ActionResult, LLMCallMetadata]:
        # Guardrail de Segurança Inegociável:
        # Jamais executa ferramentas se a política rejeitou, se faltam dados ou se exige aprovação humana ainda não concedida
        if policy_result.should_reject:
            raise PermissionError(
                "Bloqueio de Segurança: Action Agent não pode executar solicitações rejeitadas pelo Policy Agent."
            )
        if policy_result.requires_more_info:
            raise PermissionError(
                "Bloqueio de Segurança: Action Agent não pode executar solicitações com informações obrigatórias pendentes."
            )
        if policy_result.requires_human_approval and not human_approved:
            raise PermissionError(
                "Bloqueio de Segurança: Solicitação sensível exige aprovação humana registrada antes do Action Agent."
            )

        actions_taken = []

        # 1. Criar tarefa interna na fila do departamento correspondente
        task_action = create_internal_task(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            category=intake_result.category,
            title=submission.title,
            department=submission.requester_department,
            extracted_data=intake_result.extracted_data,
        )
        actions_taken.append(task_action)

        # 2. Organizar checklist de pendências operacionais
        checklist_action, pending_items = organize_pending_items(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            category=intake_result.category,
            extracted_data=intake_result.extracted_data,
        )
        actions_taken.append(checklist_action)

        # 3. Gerar documento interno de resumo (Dossiê)
        doc_action, doc_summary = generate_summary_document(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            title=submission.title,
            category=intake_result.category,
            executive_summary=analyst_result.executive_summary,
            policy_explanation=policy_result.policy_explanation,
        )
        actions_taken.append(doc_action)

        # 4. Gerar resposta formal ao solicitante
        resp_action, formal_response = generate_formal_response(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            requester_name=submission.requester_name,
            category=intake_result.category,
            title=submission.title,
            extracted_data=intake_result.extracted_data,
        )
        actions_taken.append(resp_action)

        # 5. Preparar minuta de notificação (simulada)
        notif_action = prepare_notification_draft(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            requester_name=submission.requester_name,
            department=submission.requester_department,
            status_label="EXECUTADA",
        )
        actions_taken.append(notif_action)

        # 6. Emitir relatório de processamento
        rep_action = generate_processing_report(
            repo=self.repo,
            request_id=request_id,
            agent_id=self.agent_id,
            category=intake_result.category,
            risk_level=policy_result.risk_level.value,
            human_approved=human_approved,
        )
        actions_taken.append(rep_action)

        meta = LLMCallMetadata(
            mode_used=OperationMode.LOCAL,
            provider="internal_tool_executor",
            model="idempotent-tools-v1",
            attempts=1,
            latency_ms=1.2,
        )

        return (
            ActionResult(
                executed=True,
                actions_taken=actions_taken,
                formal_response=formal_response,
                generated_document_summary=doc_summary,
                pending_items_organized=pending_items,
                execution_mode=OperationMode.LOCAL,
            ),
            meta,
        )
