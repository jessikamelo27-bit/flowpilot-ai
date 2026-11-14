"""
Página 5: Central de Aprovações Humanas (Human-in-the-Loop Governance).
Permite revisar solicitações sensíveis ou ambíguas retidas em `AGUARDANDO_APROVACAO`:
- Aprovar (retoma o Action Agent e Supervisor Agent automaticamente)
- Rejeitar
- Solicitar informações adicionais
- Registrar justificativa obrigatória
- Consultar regras aplicáveis e histórico antes de decidir.
"""
import streamlit as st
from database.models import RequestCategory
from database.repository import FlowPilotRepository
from interface.styles import render_page_header, status_badge_html
from orchestrator.workflow import FlowPilotOrchestrator
from services.llm_service import LLMService


def render_approvals_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Central de Aprovações Humanas (Human-in-the-Loop)",
        subtitle="Revisão e autorização de operações acima da alçada, cadastros sensíveis e casos incertos",
        mode_badge=llm.get_active_mode_badge(),
    )

    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)
    rules_map = {r["rule_code"]: r for r in repo.list_policy_rules()}

    tab_pending, tab_history = st.tabs(
        ["⏳ Aprovações Pendentes", "📜 Histórico de Decisões Humanas"]
    )

    with tab_pending:
        pending_list = repo.list_approvals(status_filter="PENDENTE")
        if not pending_list:
            st.success("🎉 Não há solicitações pendentes de aprovação humana no momento!")
        else:
            st.warning(
                f"Existem **{len(pending_list)}** solicitações retidas pelo Policy Agent aguardando autorização humana. "
                "Nenhuma ferramenta operacional é executada sem a sua decisão abaixo."
            )
            for item in pending_list:
                req_id = item["request_id"]
                app_id = item["approval_id"]
                with st.container():
                    st.markdown(
                        f"""
                        <div class="fp-timeline-step" style="border-left-color: #6366F1;">
                            <div class="fp-timeline-header">
                                <div class="fp-timeline-agent">
                                    {req_id} — {item['title']}
                                    <span class="fp-badge fp-badge-AGUARDANDO_APROVACAO" style="margin-left:8px;">
                                        RISCO {item['risk_level']}
                                    </span>
                                </div>
                                <div class="fp-timeline-meta">
                                    Aprovação ID: {app_id} • Solicitado em {item['requested_at'][:19].replace('T', ' ')}
                                </div>
                            </div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                    c_info, c_form = st.columns([1.4, 1])
                    with c_info:
                        st.write(
                            f"**Solicitante:** {item['requester_name']} ({item['requester_department']}) | "
                            f"**Categoria:** `{RequestCategory.label(item['category'])}`"
                        )
                        st.write(f"**Texto da Solicitação:** {item['raw_text']}")
                        st.markdown("**Regra(s) Administrativa(s) Aplicável(is):**")
                        for r_code in [x.strip() for x in item["rule_triggered"].split(",") if x.strip()]:
                            r_obj = rules_map.get(r_code)
                            if r_obj:
                                st.info(
                                    f"⚖️ **[{r_code}] {r_obj['rule_name']}**: {r_obj['description']} "
                                    f"(Parâmetro configurado: `{r_obj['parameter_value']}`)"
                                )
                            else:
                                st.info(f"⚖️ **[{r_code}]**: Regra de governança / revisão humana.")

                        with st.expander("🔍 Consultar Dados Extraídos e Histórico Antes de Decidir"):
                            st.json(item.get("extracted_data", {}))
                            steps = repo.get_steps_for_request(req_id)
                            for stp in steps:
                                st.markdown(
                                    f"- **{stp['agent_name']}**: {stp['decision_summary']}"
                                )

                    with c_form:
                        is_exec_escalation = "RULE_PURCHASE_CRITICAL_CAP" in item["rule_triggered"]
                        default_reviewer = (
                            "Diretoria Executiva / CFO"
                            if is_exec_escalation
                            else "Gestor de Operações"
                        )
                        with st.form(f"form_decide_{app_id}"):
                            st.markdown(
                                "##### 🏛️ Tomar Decisão de Aprovação Executiva"
                                if is_exec_escalation
                                else "##### Tomar Decisão de Governança"
                            )
                            if is_exec_escalation:
                                st.caption(
                                    "⚠️ Compra acima do limite de escalonamento crítico (R$ 25.000,00): exige autorização executiva explícita."
                                )
                            reviewer = st.text_input(
                                "Nome / Cargo do Aprovador *",
                                value=default_reviewer,
                                key=f"rev_{app_id}",
                            )
                            decision = st.radio(
                                "Decisão *",
                                ["APROVADA", "REJEITADA", "SOLICITAR_INFO"],
                                format_func=lambda d: {
                                    "APROVADA": "✅ Aprovar e Executar Ações (Action Agent)",
                                    "REJEITADA": "❌ Rejeitar Solicitação",
                                    "SOLICITAR_INFO": "📝 Solicitar Informações Adicionais",
                                }[d],
                                key=f"dec_{app_id}",
                            )
                            justification = st.text_area(
                                "Justificativa da Decisão (Obrigatória para Auditoria) *",
                                placeholder="Registre o embasamento técnico/orçamentário da decisão...",
                                height=85,
                                key=f"just_{app_id}",
                            )
                            if st.form_submit_button("⚖️ Confirmar e Registrar Decisão", use_container_width=True):
                                if len(reviewer.strip()) < 2 or len(justification.strip()) < 5:
                                    st.error(
                                        "Informe o nome do aprovador e uma justificativa com pelo menos 5 caracteres."
                                    )
                                else:
                                    orchestrator.resume_after_human_decision(
                                        approval_id=app_id,
                                        decision=decision,
                                        reviewer_name=reviewer,
                                        justification=justification,
                                    )
                                    st.session_state["selected_request_id"] = req_id
                                    st.success(
                                        f"Decisão **{decision}** registrada para `{req_id}`! "
                                        "Fluxo retomado e auditado pelo Supervisor Agent."
                                    )
                                    st.rerun()
                    st.markdown("---")

    with tab_history:
        all_approvals = repo.list_approvals(status_filter="TODOS")
        decided = [a for a in all_approvals if a["status"] != "PENDENTE"]
        if decided:
            for d in decided:
                st.markdown(
                    f"- **`{d['approval_id']}`** | Solicitação `{d['request_id']}` ({d['title']}) — "
                    f"{status_badge_html(d['status'])} por **{d.get('reviewer_name')}** em "
                    f"`{str(d.get('decided_at', ''))[:19].replace('T', ' ')}`: *{d.get('decision_justification')}*",
                    unsafe_allow_html=True,
                )
        else:
            st.info("Nenhuma decisão humana finalizada no histórico ainda.")
