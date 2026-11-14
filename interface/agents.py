"""
Página 3: Central de Agentes e Configuração do Motor de Regras Determinísticas.
Exibe os 5 agentes com métricas reais (execuções, erros, última execução, tempo médio),
permite consultar o histórico individual de cada agente e configurar as políticas determinísticas.
"""
import pandas as pd
import streamlit as st
from database.repository import FlowPilotRepository
from interface.styles import render_page_header
from services.llm_service import LLMService


def render_agents_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Central de Agentes & Políticas Determinísticas",
        subtitle="Telemetria individual dos 5 agentes especializados e configuração de regras de negócio",
        mode_badge=llm.get_active_mode_badge(),
    )

    tab_agents, tab_policies = st.tabs(
        ["🤖 Os 5 Agentes Especializados", "⚖️ Regras Administrativas (Motor Determinístico)"]
    )

    with tab_agents:
        agents = repo.list_agents()
        cols = st.columns(len(agents))
        for idx, ag in enumerate(agents):
            with cols[idx]:
                last_dt = ag.get("last_execution_at")
                last_str = last_dt[:19].replace("T", " ") if last_dt else "Sem execuções"
                st.markdown(
                    f"""
                    <div class="fp-kpi-card" style="border-top-color: #4F46E5;">
                        <div class="fp-kpi-label">{ag['agent_id']}</div>
                        <div style="font-size:1.15rem; font-weight:700; color:#0F172A; margin-bottom:6px;">
                            {ag['name']}
                        </div>
                        <div class="fp-badge fp-badge-CONCLUIDA" style="margin-bottom:8px;">{ag['status']}</div>
                        <p style="font-size:0.80rem; color:#475569; min-height:68px;">{ag['role_description']}</p>
                        <hr style="margin:8px 0; border-color:#E2E8F0;">
                        <div style="font-size:0.80rem; color:#0F172A;">
                            <b>Execuções:</b> {ag['total_executions']}<br>
                            <b>Erros:</b> {ag['total_errors']}<br>
                            <b>Tempo Médio:</b> {float(ag['avg_duration_ms']):.2f} ms<br>
                            <b>Última Execução:</b><br><span style="font-size:0.73rem; color:#64748B;">{last_str}</span>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

        st.markdown("<div style='height: 22px'></div>", unsafe_allow_html=True)
        st.subheader("🔍 Consultar Histórico de Execução por Agente")
        selected_agent = st.selectbox(
            "Selecione um Agente para inspecionar suas execuções registradas:",
            agents,
            format_func=lambda a: f"{a['name']} ({a['total_executions']} execuções)",
        )
        history = repo.get_steps_for_agent(selected_agent["agent_id"], limit=60)
        if history:
            df_h = pd.DataFrame(
                [
                    {
                        "Data/Hora": h["created_at"][:19].replace("T", " "),
                        "Solicitação": h["request_id"],
                        "Título": h.get("request_title", ""),
                        "Status": h["status"],
                        "Modo": h["operation_mode"],
                        "Decisão / Resultado": h["decision_summary"],
                        "Próxima Etapa": h["next_stage"],
                        "Duração (ms)": h["duration_ms"],
                    }
                    for h in history
                ]
            )
            st.dataframe(df_h, use_container_width=True, hide_index=True)
        else:
            st.info(f"Nenhuma execução registrada ainda para {selected_agent['name']}.")

    with tab_policies:
        st.subheader("Configuração de Regras Administrativas (Motor Determinístico)")
        st.caption(
            "O Policy Agent aplica estas regras de forma 100% determinística em Python/SQLite. "
            "Um modelo de linguagem jamais pode inventar, alterar ou ignorar estas políticas."
        )
        rules = repo.list_policy_rules(active_only=False)
        for rule in rules:
            with st.expander(
                f"🛡️ [{rule['rule_code']}] {rule['rule_name']} — Risco: {rule['risk_level']} "
                f"({'ATIVA' if rule['is_active'] else 'INATIVA'})",
                expanded=rule["rule_code"] in ("RULE_PURCHASE_LIMIT", "RULE_REIMBURSEMENT_LIMIT"),
            ):
                st.write(f"**Descrição:** {rule['description']}")
                st.write(
                    f"**Categoria Alvo:** `{rule['category']}` | **Ação ao Disparar:** `{rule['action_on_trigger']}`"
                )
                with st.form(f"form_rule_{rule['rule_code']}"):
                    rc1, rc2, rc3 = st.columns([2, 1, 1])
                    with rc1:
                        new_val = st.number_input(
                            f"Parâmetro ({rule['parameter_key']})",
                            value=float(rule["parameter_value"] or 0.0),
                            step=100.0 if "amount" in str(rule["parameter_key"]) else 1.0,
                        )
                    with rc2:
                        new_active = st.checkbox(
                            "Regra Ativa", value=bool(rule["is_active"])
                        )
                    with rc3:
                        if st.form_submit_button("💾 Salvar Regra"):
                            repo.update_policy_rule(
                                rule_code=rule["rule_code"],
                                parameter_value=float(new_val),
                                is_active=new_active,
                                actor="Administrador UI",
                            )
                            st.success(f"Regra {rule['rule_code']} atualizada com sucesso!")
                            st.rerun()
