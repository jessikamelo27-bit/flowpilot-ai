"""
Orquestrador Central de Agentes do FlowPilot AI (`FlowPilotOrchestrator`).

Explicação didática:
O Orquestrador é o "maestro" do sistema. Ele não é apenas um loop que chama 5 funções:
1. Controla a sequência exata:
   - Recebimento (`RECEBIDA` -> `EM_PROCESSAMENTO`)
   - Agente 1: `IntakeAgent` (Classificação + Extração JSON)
   - Agente 2: `AnalystAgent` (Consistência + Duplicidade + Campos)
   - Agente 3: `PolicyAgent` (Motor Determinístico de Regras)
   - Se exigir aprovação humana -> pausa em `AGUARDANDO_APROVACAO` e cria registro na Central de Aprovações.
   - Se faltar informação obrigatória -> pausa em `AGUARDANDO_INFORMACOES`.
   - Se violar política -> transiciona para `REJEITADA`.
   - Se conforme (ou após aprovação humana) -> transiciona para `APROVADA`, executa o `ActionAgent` (`EXECUTADA`)
     e aciona o `SupervisorAgent` (`CONCLUIDA`).
2. Permite retomada segura (`resume_after_human_decision` e `resume_after_additional_info`) sem duplicar
   etapas já concluídas nem reexecutar ferramentas já rodadas (idempotência).
"""
import time
from typing import Any, Dict, Optional
from agents.action_agent import ActionAgent
from agents.analyst_agent import AnalystAgent
from agents.intake_agent import IntakeAgent
from agents.policy_agent import PolicyAgent
from agents.supervisor_agent import SupervisorAgent
from database.models import (
    ActionResult,
    AnalystResult,
    IntakeResult,
    PolicyResult,
    RequestState,
    RequestSubmission,
)
from database.repository import FlowPilotRepository
from orchestrator.state_manager import StateManager
from services.llm_service import LLMService


class FlowPilotOrchestrator:
    """Coordenador central do pipeline multiagente com persistência de estado e idempotência."""

    def __init__(
        self,
        repository: Optional[FlowPilotRepository] = None,
        llm_service: Optional[LLMService] = None,
    ) -> None:
        self.repo = repository or FlowPilotRepository()
        self.llm = llm_service or LLMService()
        self.state_manager = StateManager(self.repo)

        self.intake_agent = IntakeAgent(self.llm)
        self.analyst_agent = AnalystAgent(self.repo, self.llm)
        self.policy_agent = PolicyAgent(self.repo, self.llm)
        self.action_agent = ActionAgent(self.repo, self.llm)
        self.supervisor_agent = SupervisorAgent(self.repo, self.llm)

    def submit_and_process(
        self,
        submission: RequestSubmission,
        request_id: Optional[str] = None,
        created_at_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Cria uma nova solicitação e executa o fluxo multiagente até o próximo ponto de parada ou conclusão."""
        req_id = self.repo.create_request(
            submission=submission,
            request_id=request_id,
            created_at_override=created_at_override,
        )
        return self.process_request(req_id)

    def process_request(self, request_id: str) -> Dict[str, Any]:
        """Executa o pipeline completo para uma solicitação em estado RECEBIDA, AGUARDANDO_INFORMACOES ou ERRO."""
        req = self.repo.get_request(request_id)
        if not req:
            raise ValueError(f"Solicitação {request_id} não encontrada.")

        current_state = RequestState(req["status"])
        # Idempotência de fluxo: se já está CONCLUIDA ou REJEITADA, não reprocessa
        if current_state in (RequestState.CONCLUIDA, RequestState.REJEITADA):
            return self.get_full_request_trace(request_id)

        submission = RequestSubmission(
            title=req["title"],
            requester_name=req["requester_name"],
            requester_department=req["requester_department"],
            raw_text=req["raw_text"],
            form_data=req.get("form_data", {}),
            source=req.get("source", "PORTAL_WEB"),
            is_demo=bool(req.get("is_demo", 0)),
        )

        active_mode = "LLM" if self.llm.is_llm_configured() else "LOCAL"
        exec_id = self.repo.start_execution(request_id, active_mode)
        pipeline_start = time.perf_counter()

        try:
            # 1. Transição RECEBIDA / ERRO / AGUARDANDO_INFORMACOES -> EM_PROCESSAMENTO
            self.state_manager.transition(
                request_id,
                RequestState.EM_PROCESSAMENTO,
                actor="Orquestrador",
                reason="Início do pipeline multiagente",
            )

            # 2. ETAPA 1 — INTAKE AGENT
            t0 = time.perf_counter()
            intake_res, intake_meta = self.intake_agent.process(submission)
            intake_ms = (time.perf_counter() - t0) * 1000.0
            self.repo.record_processing_step(
                execution_id=exec_id,
                request_id=request_id,
                step_order=1,
                agent_id=self.intake_agent.agent_id,
                agent_name=self.intake_agent.agent_name,
                responsibility=self.intake_agent.responsibility,
                status="SUCESSO",
                operation_mode=intake_res.execution_mode.value,
                input_summary=f"Título: {submission.title} | Fonte: {submission.source}",
                output_data=intake_res.model_dump(),
                validations=[
                    f"Categoria: {intake_res.category.value} (Confiança: {intake_res.confidence:.2f})",
                    f"Campos extraídos: {len(intake_res.extracted_data)}",
                    f"Campos obrigatórios ausentes: {len(intake_res.missing_mandatory_fields)}",
                    f"Flags de segurança: {intake_res.security_flags or 'Nenhuma'}",
                ],
                decision_summary=intake_res.intent_summary,
                next_stage="Analyst Agent",
                duration_ms=intake_ms,
            )
            self.repo.update_request_fields(
                request_id,
                category=intake_res.category.value,
                confidence=intake_res.confidence,
                operation_mode=intake_res.execution_mode.value,
                extracted_data=intake_res.extracted_data,
                missing_fields=intake_res.missing_mandatory_fields,
            )

            # 3. ETAPA 2 — ANALYST AGENT
            t1 = time.perf_counter()
            analyst_res, analyst_meta = self.analyst_agent.process(
                request_id=request_id,
                submission=submission,
                intake_result=intake_res,
            )
            analyst_ms = (time.perf_counter() - t1) * 1000.0
            self.repo.record_processing_step(
                execution_id=exec_id,
                request_id=request_id,
                step_order=2,
                agent_id=self.analyst_agent.agent_id,
                agent_name=self.analyst_agent.agent_name,
                responsibility=self.analyst_agent.responsibility,
                status="SUCESSO",
                operation_mode=analyst_res.execution_mode.value,
                input_summary=f"Dados extraídos do Intake Agent ({intake_res.category.value})",
                output_data=analyst_res.model_dump(),
                validations=[
                    f"Completude: {'Completa' if analyst_res.is_complete else 'Incompleta'}",
                    f"Inconsistências: {len(analyst_res.inconsistencies)}",
                    f"Contradições: {len(analyst_res.contradictions)}",
                    f"Duplicidade: {'Sim (' + str(analyst_res.duplicate_of_request_id) + ')' if analyst_res.is_duplicate else 'Não'}",
                ],
                decision_summary=analyst_res.executive_summary,
                next_stage="Policy Agent",
                duration_ms=analyst_ms,
            )
            self.repo.update_request_fields(
                request_id,
                missing_fields=analyst_res.missing_fields,
                final_summary=analyst_res.executive_summary,
            )

            # 4. ETAPA 3 — POLICY AGENT (Motor Determinístico)
            t2 = time.perf_counter()
            policy_res, policy_meta = self.policy_agent.process(
                intake_result=intake_res,
                analyst_result=analyst_res,
            )
            policy_ms = (time.perf_counter() - t2) * 1000.0

            next_after_policy = "Action Agent"
            if policy_res.should_reject:
                next_after_policy = "Supervisor Agent (Rejeição)"
            elif policy_res.requires_more_info:
                next_after_policy = "Supervisor Agent (Aguardar Informações)"
            elif policy_res.requires_human_approval:
                next_after_policy = "Central de Aprovações Humanas"

            self.repo.record_processing_step(
                execution_id=exec_id,
                request_id=request_id,
                step_order=3,
                agent_id=self.policy_agent.agent_id,
                agent_name=self.policy_agent.agent_name,
                responsibility=self.policy_agent.responsibility,
                status="SUCESSO",
                operation_mode=policy_res.execution_mode.value,
                input_summary=f"Avaliação de {len(policy_res.evaluated_rules)} regras determinísticas",
                output_data=policy_res.model_dump(),
                validations=[
                    f"[{r.rule_code}] {r.rule_name}: {'PASSOU' if r.passed else 'ACIONADA (' + r.action_required + ')'}"
                    for r in policy_res.evaluated_rules
                ],
                decision_summary=policy_res.policy_explanation,
                next_stage=next_after_policy,
                duration_ms=policy_ms,
            )
            self.repo.update_request_fields(
                request_id,
                risk_level=policy_res.risk_level.value,
                requires_human_approval=1 if policy_res.requires_human_approval else 0,
            )

            # 5. RAMIFICAÇÃO DE GOVERNANÇA E EXECUÇÃO
            action_res: Optional[ActionResult] = None

            if policy_res.should_reject:
                self.state_manager.transition(
                    request_id,
                    RequestState.REJEITADA,
                    actor="Policy Agent",
                    reason=policy_res.policy_explanation,
                )
                self.repo.update_request_fields(
                    request_id,
                    rejection_reason=policy_res.policy_explanation,
                    formal_response=(
                        f"Prezado(a) {submission.requester_name},\n\n"
                        f"Sua solicitação '{submission.title}' [{request_id}] não pôde ser aprovada.\n"
                        f"Motivo: {policy_res.policy_explanation}\n\n"
                        f"Central Inteligente de Operações — FlowPilot AI"
                    ),
                )

            elif policy_res.requires_more_info:
                self.state_manager.transition(
                    request_id,
                    RequestState.AGUARDANDO_INFORMACOES,
                    actor="Policy Agent",
                    reason=analyst_res.clarification_message or policy_res.policy_explanation,
                )
                self.repo.update_request_fields(
                    request_id,
                    formal_response=analyst_res.clarification_message or policy_res.policy_explanation,
                )

            elif policy_res.requires_human_approval:
                triggered_rules = [
                    r.rule_code for r in policy_res.evaluated_rules if not r.passed
                ]
                rule_str = ", ".join(triggered_rules) if triggered_rules else "RULE_HIGH_RISK"
                self.repo.create_approval_request(
                    request_id=request_id,
                    rule_triggered=rule_str,
                    risk_level=policy_res.risk_level.value,
                )
                self.state_manager.transition(
                    request_id,
                    RequestState.AGUARDANDO_APROVACAO,
                    actor="Policy Agent",
                    reason=policy_res.policy_explanation,
                )

            else:
                # Solicitação 100% conforme e dentro da alçada automática
                self.state_manager.transition(
                    request_id,
                    RequestState.APROVADA,
                    actor="Policy Agent",
                    reason="Aprovação automática dentro das regras determinísticas",
                )
                t3 = time.perf_counter()
                action_res, _ = self.action_agent.process(
                    request_id=request_id,
                    submission=submission,
                    intake_result=intake_res,
                    analyst_result=analyst_res,
                    policy_result=policy_res,
                    human_approved=False,
                )
                action_ms = (time.perf_counter() - t3) * 1000.0
                self.repo.record_processing_step(
                    execution_id=exec_id,
                    request_id=request_id,
                    step_order=4,
                    agent_id=self.action_agent.agent_id,
                    agent_name=self.action_agent.agent_name,
                    responsibility=self.action_agent.responsibility,
                    status="SUCESSO",
                    operation_mode=action_res.execution_mode.value,
                    input_summary=f"Execução de ferramentas para {request_id}",
                    output_data=action_res.model_dump(),
                    validations=[
                        f"{act.tool_name}: {act.status}" for act in action_res.actions_taken
                    ],
                    decision_summary=f"{len(action_res.actions_taken)} ferramentas executadas com controle de idempotência.",
                    next_stage="Supervisor Agent",
                    duration_ms=action_ms,
                )
                self.state_manager.transition(
                    request_id,
                    RequestState.EXECUTADA,
                    actor="Action Agent",
                    reason="Ferramentas operacionais concluídas",
                )
                self.repo.update_request_fields(
                    request_id,
                    formal_response=action_res.formal_response,
                )

            # 6. ETAPA 5 — SUPERVISOR AGENT
            t4 = time.perf_counter()
            sup_res, _ = self.supervisor_agent.process(
                request_id=request_id,
                intake_result=intake_res,
                analyst_result=analyst_res,
                policy_result=policy_res,
                action_result=action_res,
                human_decision=None,
            )
            sup_ms = (time.perf_counter() - t4) * 1000.0
            self.repo.record_processing_step(
                execution_id=exec_id,
                request_id=request_id,
                step_order=5,
                agent_id=self.supervisor_agent.agent_id,
                agent_name=self.supervisor_agent.agent_name,
                responsibility=self.supervisor_agent.responsibility,
                status="SUCESSO" if not sup_res.detected_anomalies else "ERRO",
                operation_mode=sup_res.execution_mode.value,
                input_summary=f"Auditoria cruzada de {len(sup_res.stages_verified)} etapas",
                output_data=sup_res.model_dump(),
                validations=[
                    f"Etapa verificada: {st}" for st in sup_res.stages_verified
                ]
                + [f"Anomalia: {an}" for an in sup_res.detected_anomalies],
                decision_summary=sup_res.audit_explanation,
                next_stage=sup_res.recommended_final_state.value,
                duration_ms=sup_ms,
            )

            # Se foi executada e validada pelo Supervisor, avança para CONCLUIDA
            if sup_res.recommended_final_state == RequestState.CONCLUIDA:
                self.state_manager.transition(
                    request_id,
                    RequestState.CONCLUIDA,
                    actor="Supervisor Agent",
                    reason=sup_res.audit_explanation,
                )
            elif sup_res.recommended_final_state == RequestState.ERRO:
                self.state_manager.transition(
                    request_id,
                    RequestState.ERRO,
                    actor="Supervisor Agent",
                    reason=sup_res.audit_explanation,
                )

            total_ms = (time.perf_counter() - pipeline_start) * 1000.0
            prev_ms = float(req.get("total_processing_ms", 0.0))
            self.repo.update_request_fields(
                request_id,
                total_processing_ms=round(prev_ms + total_ms, 2),
                final_summary=f"{analyst_res.executive_summary} | {sup_res.audit_explanation}",
            )
            self.repo.finish_execution(exec_id, "CONCLUIDO", total_ms)
            return self.get_full_request_trace(request_id)

        except Exception as exc:
            total_ms = (time.perf_counter() - pipeline_start) * 1000.0
            self.repo.finish_execution(exec_id, "ERRO", total_ms, str(exc))
            try:
                self.state_manager.transition(
                    request_id,
                    RequestState.ERRO,
                    actor="Orquestrador",
                    reason=f"Exceção capturada: {str(exc)}",
                )
            except Exception:
                pass
            raise

    def resume_after_human_decision(
        self,
        approval_id: str,
        decision: str,  # "APROVADA", "REJEITADA", "SOLICITAR_INFO"
        reviewer_name: str,
        justification: str,
    ) -> Dict[str, Any]:
        """
        Retoma uma solicitação que estava pausada em `AGUARDANDO_APROVACAO` sem repetir
        Intake, Analyst ou Policy, e garantindo idempotência nas ferramentas do Action Agent.
        """
        request_id = self.repo.decide_approval(
            approval_id=approval_id,
            decision=decision,
            reviewer_name=reviewer_name,
            justification=justification,
        )
        if not request_id:
            raise ValueError(f"Aprovação '{approval_id}' não encontrada.")

        req = self.repo.get_request(request_id)
        if not req:
            raise ValueError(f"Solicitação '{request_id}' não encontrada.")

        self.repo.update_request_fields(request_id, human_intervention_occurred=1)
        active_mode = "LLM" if self.llm.is_llm_configured() else "LOCAL"
        exec_id = self.repo.start_execution(request_id, active_mode)
        start_t = time.perf_counter()

        # Reconstrói os contratos das 3 primeiras etapas já salvas no banco
        intake_res, analyst_res, policy_res = self._reconstruct_prior_results(request_id)
        submission = RequestSubmission(
            title=req["title"],
            requester_name=req["requester_name"],
            requester_department=req["requester_department"],
            raw_text=req["raw_text"],
            form_data=req.get("form_data", {}),
            source=req.get("source", "PORTAL_WEB"),
            is_demo=bool(req.get("is_demo", 0)),
        )

        action_res: Optional[ActionResult] = None

        if decision == "APROVADA":
            self.state_manager.transition(
                request_id,
                RequestState.APROVADA,
                actor=reviewer_name,
                reason=f"Aprovação humana concedida: {justification}",
            )
            t_act = time.perf_counter()
            action_res, _ = self.action_agent.process(
                request_id=request_id,
                submission=submission,
                intake_result=intake_res,
                analyst_result=analyst_res,
                policy_result=policy_res,
                human_approved=True,
            )
            act_ms = (time.perf_counter() - t_act) * 1000.0
            self.repo.record_processing_step(
                execution_id=exec_id,
                request_id=request_id,
                step_order=6,
                agent_id=self.action_agent.agent_id,
                agent_name=self.action_agent.agent_name,
                responsibility=self.action_agent.responsibility,
                status="SUCESSO",
                operation_mode=action_res.execution_mode.value,
                input_summary=f"Retomada pós-aprovação humana por {reviewer_name}",
                output_data=action_res.model_dump(),
                validations=[f"{a.tool_name}: {a.status}" for a in action_res.actions_taken],
                decision_summary=f"Ações executadas após autorização de {reviewer_name}.",
                next_stage="Supervisor Agent",
                duration_ms=act_ms,
            )
            self.state_manager.transition(
                request_id,
                RequestState.EXECUTADA,
                actor="Action Agent",
                reason="Ações executadas após aprovação humana",
            )
            self.repo.update_request_fields(
                request_id,
                formal_response=action_res.formal_response,
            )

        elif decision == "REJEITADA":
            self.state_manager.transition(
                request_id,
                RequestState.REJEITADA,
                actor=reviewer_name,
                reason=f"Rejeitada na Central de Aprovações: {justification}",
            )
            self.repo.update_request_fields(
                request_id,
                rejection_reason=f"Rejeitada por {reviewer_name}: {justification}",
                formal_response=(
                    f"Prezado(a) {submission.requester_name},\n\n"
                    f"Sua solicitação '{submission.title}' [{request_id}] foi analisada na Central de Aprovações "
                    f"e não foi autorizada.\nJustificativa do revisor ({reviewer_name}): {justification}\n\n"
                    f"Central Inteligente de Operações — FlowPilot AI"
                ),
            )

        elif decision == "SOLICITAR_INFO":
            self.state_manager.transition(
                request_id,
                RequestState.AGUARDANDO_INFORMACOES,
                actor=reviewer_name,
                reason=f"Informações adicionais solicitadas por {reviewer_name}: {justification}",
            )
            self.repo.update_request_fields(
                request_id,
                formal_response=(
                    f"Complementação solicitada pelo revisor {reviewer_name}: {justification}"
                ),
            )

        # Supervisor audita a retomada
        t_sup = time.perf_counter()
        sup_res, _ = self.supervisor_agent.process(
            request_id=request_id,
            intake_result=intake_res,
            analyst_result=analyst_res,
            policy_result=policy_res,
            action_result=action_res,
            human_decision=decision,
        )
        sup_ms = (time.perf_counter() - t_sup) * 1000.0
        self.repo.record_processing_step(
            execution_id=exec_id,
            request_id=request_id,
            step_order=7,
            agent_id=self.supervisor_agent.agent_id,
            agent_name=self.supervisor_agent.agent_name,
            responsibility=self.supervisor_agent.responsibility,
            status="SUCESSO",
            operation_mode=sup_res.execution_mode.value,
            input_summary=f"Revisão final pós-decisão humana ({decision})",
            output_data=sup_res.model_dump(),
            validations=[f"Etapa verificada: {st}" for st in sup_res.stages_verified],
            decision_summary=sup_res.audit_explanation,
            next_stage=sup_res.recommended_final_state.value,
            duration_ms=sup_ms,
        )

        if sup_res.recommended_final_state == RequestState.CONCLUIDA:
            self.state_manager.transition(
                request_id,
                RequestState.CONCLUIDA,
                actor="Supervisor Agent",
                reason=sup_res.audit_explanation,
            )
        elif sup_res.recommended_final_state == RequestState.ERRO:
            self.state_manager.transition(
                request_id,
                RequestState.ERRO,
                actor="Supervisor Agent",
                reason=sup_res.audit_explanation,
            )

        elapsed = (time.perf_counter() - start_t) * 1000.0
        prev_ms = float(req.get("total_processing_ms", 0.0))
        self.repo.update_request_fields(
            request_id,
            total_processing_ms=round(prev_ms + elapsed, 2),
            final_summary=f"{analyst_res.executive_summary} | {sup_res.audit_explanation}",
        )
        self.repo.finish_execution(exec_id, "CONCLUIDO", elapsed)
        return self.get_full_request_trace(request_id)

    def resume_with_additional_info(
        self,
        request_id: str,
        additional_text: str,
        additional_form_data: Optional[Dict[str, Any]] = None,
        actor: str = "Solicitante",
    ) -> Dict[str, Any]:
        """Permite complementar uma solicitação em AGUARDANDO_INFORMACOES ou ERRO e reprocessá-la."""
        req = self.repo.get_request(request_id)
        if not req:
            raise ValueError(f"Solicitação {request_id} não encontrada.")

        merged_text = req["raw_text"]
        if additional_text and additional_text.strip():
            merged_text = f"{merged_text}\n[COMPLEMENTO DO SOLICITANTE]: {additional_text.strip()}"

        merged_form = dict(req.get("form_data", {}))
        if additional_form_data:
            for k, v in additional_form_data.items():
                if v not in (None, ""):
                    merged_form[k] = v

        self.repo.update_request_fields(
            request_id,
            raw_text=merged_text,
            form_data=merged_form,
            human_intervention_occurred=1,
        )
        self.repo.log_audit(
            request_id=request_id,
            actor=actor,
            event_type="ADDITIONAL_INFO_PROVIDED",
            severity="INFO",
            description="Informações complementares anexadas para retomada do processamento.",
            metadata={"updated_keys": list((additional_form_data or {}).keys())},
        )
        return self.process_request(request_id)

    def _reconstruct_prior_results(
        self, request_id: str
    ) -> tuple[IntakeResult, AnalystResult, PolicyResult]:
        steps = self.repo.get_steps_for_request(request_id)
        intake_dict = None
        analyst_dict = None
        policy_dict = None
        for st in steps:
            if st["agent_id"] == "intake_agent":
                intake_dict = st["output"]
            elif st["agent_id"] == "analyst_agent":
                analyst_dict = st["output"]
            elif st["agent_id"] == "policy_agent":
                policy_dict = st["output"]

        if not (intake_dict and analyst_dict and policy_dict):
            raise RuntimeError(
                f"Não foi possível reconstruir as etapas anteriores da solicitação {request_id}."
            )
        return (
            IntakeResult.model_validate(intake_dict),
            AnalystResult.model_validate(analyst_dict),
            PolicyResult.model_validate(policy_dict),
        )

    def get_full_request_trace(self, request_id: str) -> Dict[str, Any]:
        """Retorna a solicitação completa com suas etapas, ações, aprovações e trilha de auditoria."""
        req = self.repo.get_request(request_id)
        if not req:
            raise ValueError(f"Solicitação {request_id} não encontrada.")
        return {
            "request": req,
            "steps": self.repo.get_steps_for_request(request_id),
            "actions": self.repo.list_actions_for_request(request_id),
            "approvals": self.repo.get_approvals_for_request(request_id),
            "audit_logs": self.repo.list_audit_logs(request_id=request_id),
        }
