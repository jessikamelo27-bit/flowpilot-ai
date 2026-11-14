"""
AGENTE 5 — SUPERVISOR AGENT
Responsabilidade: Supervisionar o fluxo completo de ponta a ponta com AUDITORIA CRUZADA REAL no SQLite.
Não confia exclusivamente nos objetos recebidos em memória dos agentes anteriores:
consulta diretamente o repositório (`self.repo`) para verificar:
1. Se todas as etapas obrigatórias (`intake_agent`, `analyst_agent`, `policy_agent` e, quando aplicável, `action_agent`)
   foram efetivamente registradas na tabela `processing_steps` com status `SUCESSO`.
2. Se os resultados persistidos no banco correspondem aos resultados recebidos em memória.
3. Se existem divergências entre o estado atual da solicitação (`requests.status`) e o histórico de execução.
4. Se alguma ferramenta foi executada na tabela `actions_performed` antes ou sem aprovação humana obrigatória (`approvals`).
5. Se todas as ações executadas possuem chave de idempotência válida (`IDEMP-...`) e se existem ações duplicadas
   para o mesmo `(tool_name, action_type)`.
6. Se alertas críticos de segurança (`security_flags`) foram devidamente bloqueados (`REJEITADA`) e sem execução de ferramentas.
"""
from typing import Any, Dict, List, Optional, Tuple
from database.models import (
    ActionResult,
    AnalystResult,
    IntakeResult,
    OperationMode,
    PolicyResult,
    RequestState,
    SupervisorResult,
)
from database.repository import FlowPilotRepository
from services.llm_service import LLMCallMetadata, LLMService


class SupervisorAgent:
    """Agente 5: Auditoria Cruzada Persistida, Controle de Integridade e Explicação Final Rastreável."""

    agent_id = "supervisor_agent"
    agent_name = "Supervisor Agent"
    responsibility = (
        "Verificar no banco SQLite se os agentes anteriores concluíram suas etapas, "
        "conferir consistência entre memória e registros persistidos, impedir operações "
        "não autorizadas ou duplicadas e consolidar a explicação auditável final."
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
        intake_result: Optional[IntakeResult],
        analyst_result: Optional[AnalystResult],
        policy_result: Optional[PolicyResult],
        action_result: Optional[ActionResult],
        human_decision: Optional[str] = None,  # "APROVADA", "REJEITADA", "SOLICITAR_INFO" ou None
    ) -> Tuple[SupervisorResult, LLMCallMetadata]:
        stages_verified: List[str] = []
        anomalies: List[str] = []

        # =====================================================================
        # 1. CONSULTA DIRETA AO REPOSITÓRIO SQLITE (FONTE DE VERDADE PERSISTIDA)
        # =====================================================================
        db_request = self.repo.get_request(request_id)
        db_steps = self.repo.get_steps_for_request(request_id)
        db_actions = self.repo.list_actions_for_request(request_id)
        db_approvals = self.repo.get_approvals_for_request(request_id)

        if not db_request:
            anomalies.append(
                f"Solicitação '{request_id}' não encontrada na tabela 'requests' do SQLite."
            )

        # Indexa a última etapa bem-sucedida de cada agente persistida no banco
        persisted_steps_by_agent: Dict[str, Dict[str, Any]] = {}
        for st in db_steps:
            ag_id = str(st.get("agent_id", ""))
            if st.get("status") == "SUCESSO":
                persisted_steps_by_agent[ag_id] = st
            else:
                anomalies.append(
                    f"Etapa persistida do agente '{ag_id}' registrou status '{st.get('status')}' != SUCESSO."
                )

        # =====================================================================
        # 2. VERIFICAÇÃO DE ETAPAS OBRIGATÓRIAS E CORRESPONDÊNCIA MEMÓRIA vs. SQLITE
        # =====================================================================
        # 2.1 Intake Agent
        if intake_result is not None and "intake_agent" in persisted_steps_by_agent:
            db_intake_out = persisted_steps_by_agent["intake_agent"].get("output", {})
            if db_intake_out.get("category") != intake_result.category.value:
                anomalies.append(
                    f"Divergência no Intake Agent: categoria em memória ({intake_result.category.value}) "
                    f"difere da persistida no SQLite ({db_intake_out.get('category')})."
                )
            elif db_request and db_request.get("category") != intake_result.category.value:
                anomalies.append(
                    f"Divergência na tabela 'requests': categoria ({db_request.get('category')}) "
                    f"difere do resultado do Intake Agent ({intake_result.category.value})."
                )
            else:
                stages_verified.append("intake_agent")
        else:
            anomalies.append(
                "Etapa obrigatória 'intake_agent' ausente em memória ou não registrada na tabela 'processing_steps'."
            )

        # 2.2 Analyst Agent
        if analyst_result is not None and "analyst_agent" in persisted_steps_by_agent:
            db_analyst_out = persisted_steps_by_agent["analyst_agent"].get("output", {})
            if bool(db_analyst_out.get("is_complete")) != bool(analyst_result.is_complete) or bool(
                db_analyst_out.get("is_duplicate")
            ) != bool(analyst_result.is_duplicate):
                anomalies.append(
                    "Divergência no Analyst Agent: resultado em memória difere do JSON persistido em 'processing_steps'."
                )
            else:
                stages_verified.append("analyst_agent")
        else:
            anomalies.append(
                "Etapa obrigatória 'analyst_agent' ausente em memória ou não registrada na tabela 'processing_steps'."
            )

        # 2.3 Policy Agent
        if policy_result is not None and "policy_agent" in persisted_steps_by_agent:
            db_policy_out = persisted_steps_by_agent["policy_agent"].get("output", {})
            if not policy_result.deterministic_engine_verified or not db_policy_out.get(
                "deterministic_engine_verified"
            ):
                anomalies.append("Validação determinística do Policy Agent não comprovada.")
            elif (
                bool(db_policy_out.get("should_reject")) != bool(policy_result.should_reject)
                or bool(db_policy_out.get("requires_human_approval"))
                != bool(policy_result.requires_human_approval)
                or bool(db_policy_out.get("requires_more_info"))
                != bool(policy_result.requires_more_info)
            ):
                anomalies.append(
                    "Divergência crítica no Policy Agent: decisão de conformidade em memória difere do registro persistido no SQLite."
                )
            else:
                stages_verified.append("policy_agent")
        else:
            anomalies.append(
                "Etapa obrigatória 'policy_agent' ausente em memória ou não registrada na tabela 'processing_steps'."
            )

        # =====================================================================
        # 3. AUDITORIA DE SEGURANÇA, APROVAÇÕES HUMANAS E AÇÕES NO BANCO
        # =====================================================================
        persisted_sec_flags = []
        if "intake_agent" in persisted_steps_by_agent:
            persisted_sec_flags = (
                persisted_steps_by_agent["intake_agent"]
                .get("output", {})
                .get("security_flags", [])
            )
        all_sec_flags = set((intake_result.security_flags if intake_result else []) + persisted_sec_flags)

        if all_sec_flags:
            if not (policy_result and policy_result.should_reject):
                anomalies.append(
                    f"Falha crítica de contenção: alertas de segurança ({', '.join(sorted(all_sec_flags))}) "
                    "presentes, mas a solicitação não foi marcada para rejeição pelo Policy Agent."
                )
            if len(db_actions) > 0:
                anomalies.append(
                    "Violação crítica de segurança: ferramentas foram executadas em uma solicitação com alerta de Prompt Injection."
                )

        # Verifica se houve execução de ferramentas sem autorização humana quando exigida
        requires_human = bool(policy_result and policy_result.requires_human_approval) or bool(
            db_request and db_request.get("requires_human_approval")
        )
        approved_records = [a for a in db_approvals if a.get("status") == "APROVADA"]

        if requires_human:
            if len(db_actions) > 0 and (human_decision != "APROVADA" or len(approved_records) == 0):
                anomalies.append(
                    "Violação de governança detectada no SQLite: existem ações registradas em 'actions_performed' "
                    "sem aprovação humana 'APROVADA' correspondente na tabela 'approvals'."
                )
            if (
                not (policy_result and policy_result.should_reject)
                and not (policy_result and policy_result.requires_more_info)
                and len(db_approvals) == 0
            ):
                anomalies.append(
                    "Inconsistência de governança: solicitação exige aprovação humana, mas nenhum registro foi criado na tabela 'approvals'."
                )

        # Verifica se ferramentas foram executadas em solicitações rejeitadas ou incompletas
        if (policy_result and (policy_result.should_reject or policy_result.requires_more_info)) and len(
            db_actions
        ) > 0:
            anomalies.append(
                "Violação operacional: ferramentas registradas em 'actions_performed' para solicitação rejeitada ou incompleta."
            )

        # =====================================================================
        # 4. AUDITORIA DE IDEMPOTÊNCIA E DUPLICIDADE DE AÇÕES PERSISTIDAS
        # =====================================================================
        seen_tool_types = set()
        for act in db_actions:
            idemp_key = str(act.get("idempotency_key") or "").strip()
            if not idemp_key or not idemp_key.startswith("IDEMP-"):
                anomalies.append(
                    f"Ação '{act.get('action_id')}' ({act.get('tool_name')}) registrada sem chave de idempotência válida."
                )
            pair = (str(act.get("tool_name")), str(act.get("action_type")))
            if pair in seen_tool_types:
                anomalies.append(
                    f"Ação duplicada detectada no banco para a ferramenta '{pair[0]}' ({pair[1]})."
                )
            seen_tool_types.add(pair)

        # Verifica correspondência do Action Agent quando houve execução
        if (action_result and action_result.executed) or len(db_actions) > 0:
            if "action_agent" not in persisted_steps_by_agent:
                anomalies.append(
                    "Inconsistência de rastreabilidade: ações constam em 'actions_performed', mas etapa 'action_agent' não consta em 'processing_steps'."
                )
            elif len(db_actions) == 0:
                anomalies.append(
                    "Action Agent reportou execução em memória, mas nenhuma ferramenta foi persistida na tabela 'actions_performed'."
                )
            elif action_result and len(action_result.actions_taken) != len(db_actions):
                anomalies.append(
                    f"Divergência na contagem de ações: Action Agent reportou {len(action_result.actions_taken)} "
                    f"ações em memória, mas existem {len(db_actions)} persistidas no SQLite."
                )
            else:
                stages_verified.append("action_agent")

        # =====================================================================
        # 5. VERIFICAÇÃO DE COERÊNCIA DO ESTADO ATUAL NO BANCO (`requests.status`)
        # =====================================================================
        if db_request:
            current_db_status = str(db_request.get("status", ""))
            if (policy_result and policy_result.should_reject) or human_decision == "REJEITADA":
                if current_db_status != RequestState.REJEITADA.value:
                    anomalies.append(
                        f"Divergência de estado no banco: esperado '{RequestState.REJEITADA.value}', "
                        f"mas 'requests.status' está em '{current_db_status}'."
                    )
            elif (policy_result and policy_result.requires_more_info) or human_decision == "SOLICITAR_INFO":
                if current_db_status != RequestState.AGUARDANDO_INFORMACOES.value:
                    anomalies.append(
                        f"Divergência de estado no banco: esperado '{RequestState.AGUARDANDO_INFORMACOES.value}', "
                        f"mas 'requests.status' está em '{current_db_status}'."
                    )
            elif requires_human and human_decision is None:
                if current_db_status != RequestState.AGUARDANDO_APROVACAO.value:
                    anomalies.append(
                        f"Divergência de estado no banco: esperado '{RequestState.AGUARDANDO_APROVACAO.value}', "
                        f"mas 'requests.status' está em '{current_db_status}'."
                    )
            elif action_result and action_result.executed:
                if current_db_status not in (
                    RequestState.EXECUTADA.value,
                    RequestState.CONCLUIDA.value,
                ):
                    anomalies.append(
                        f"Divergência de estado no banco após execução de ferramentas: esperado 'EXECUTADA', "
                        f"mas 'requests.status' está em '{current_db_status}'."
                    )

        meta = LLMCallMetadata(
            mode_used=OperationMode.LOCAL,
            provider="supervisor_sqlite_cross_auditor",
            model="audit-v2-persisted",
            attempts=1,
            latency_ms=1.1,
        )

        # =====================================================================
        # 6. DECISÃO FINAL DO SUPERVISOR
        # =====================================================================
        if anomalies:
            return (
                SupervisorResult(
                    approved_for_completion=False,
                    recommended_final_state=RequestState.ERRO,
                    stages_verified=stages_verified,
                    detected_anomalies=anomalies,
                    escalate_to_human=True,
                    audit_explanation=(
                        "AUDITORIA BLOQUEADA PELO SUPERVISOR: Inconsistências detectadas na verificação cruzada com o SQLite: "
                        + " | ".join(anomalies)
                    ),
                    execution_mode=OperationMode.LOCAL,
                ),
                meta,
            )

        # Caso rejeitado por política ou por revisor humano
        if (policy_result and policy_result.should_reject) or human_decision == "REJEITADA":
            reason_txt = (
                "Rejeitada em revisão humana."
                if human_decision == "REJEITADA"
                else (policy_result.policy_explanation if policy_result else "Violação de política.")
            )
            return (
                SupervisorResult(
                    approved_for_completion=True,
                    recommended_final_state=RequestState.REJEITADA,
                    stages_verified=stages_verified,
                    detected_anomalies=[],
                    escalate_to_human=False,
                    audit_explanation=(
                        f"SUPERVISÃO CONCLUÍDA (REJEIÇÃO VALIDADA NO SQLITE): Etapas verificadas ({', '.join(stages_verified)}). "
                        f"0 ferramentas executadas. Motivo: {reason_txt}"
                    ),
                    execution_mode=OperationMode.LOCAL,
                ),
                meta,
            )

        # Caso pausado aguardando complementação de informações
        if (policy_result and policy_result.requires_more_info) or human_decision == "SOLICITAR_INFO":
            return (
                SupervisorResult(
                    approved_for_completion=False,
                    recommended_final_state=RequestState.AGUARDANDO_INFORMACOES,
                    stages_verified=stages_verified,
                    detected_anomalies=[],
                    escalate_to_human=False,
                    audit_explanation=(
                        f"SUPERVISÃO EM PAUSA (AGUARDANDO INFORMAÇÕES): Etapas verificadas no banco ({', '.join(stages_verified)}). "
                        f"Campos obrigatórios pendentes: {', '.join(analyst_result.missing_fields if analyst_result else [])}."
                    ),
                    execution_mode=OperationMode.LOCAL,
                ),
                meta,
            )

        # Caso pausado aguardando aprovação humana
        if requires_human and human_decision != "APROVADA":
            return (
                SupervisorResult(
                    approved_for_completion=False,
                    recommended_final_state=RequestState.AGUARDANDO_APROVACAO,
                    stages_verified=stages_verified,
                    detected_anomalies=[],
                    escalate_to_human=True,
                    audit_explanation=(
                        f"SUPERVISÃO EM PAUSA (REVISÃO HUMANA OBRIGATÓRIA): Risco {policy_result.risk_level.value if policy_result else 'ALTO'}. "
                        f"{policy_result.policy_explanation if policy_result else ''}"
                    ),
                    execution_mode=OperationMode.LOCAL,
                ),
                meta,
            )

        # Caso executado com sucesso pelo Action Agent -> CONCLUIDA
        if action_result and action_result.executed and len(db_actions) > 0:
            tools_count = len(db_actions)
            approval_note = (
                "mediante autorização humana verificada na tabela 'approvals'"
                if human_decision == "APROVADA"
                else "dentro da alçada de automação direta"
            )
            return (
                SupervisorResult(
                    approved_for_completion=True,
                    recommended_final_state=RequestState.CONCLUIDA,
                    stages_verified=stages_verified,
                    detected_anomalies=[],
                    escalate_to_human=False,
                    audit_explanation=(
                        f"SUPERVISÃO APROVADA E CONCLUÍDA: Auditoria cruzada SQLite íntegra ({', '.join(stages_verified)}). "
                        f"{tools_count} ações idempotentes verificadas {approval_note}."
                    ),
                    execution_mode=OperationMode.LOCAL,
                ),
                meta,
            )

        return (
            SupervisorResult(
                approved_for_completion=False,
                recommended_final_state=RequestState.ERRO,
                stages_verified=stages_verified,
                detected_anomalies=["Fluxo chegou ao Supervisor sem decisão terminal nem execução de ações persistidas."],
                escalate_to_human=True,
                audit_explanation="Estado inconclusivo detectado pelo Supervisor Agent.",
                execution_mode=OperationMode.LOCAL,
            ),
            meta,
        )
