"""
Página 4: Monitor de Execução.
Apresenta uma linha do tempo visual e auditável do fluxo de cada solicitação:
- Qual agente recebeu a tarefa e sua responsabilidade
- Quais informações foram extraídas
- Quais validações foram realizadas
- Qual resultado foi produzido e qual a próxima etapa
- Se houve intervenção humana
Não apresenta raciocínio interno privado do LLM — apenas decisões operacionais, dados estruturados e evidências.
"""
import streamlit as st
from database.models import RequestCategory
from database.repository import FlowPilotRepository
from interface.styles import render_page_header, status_badge_html
from orchestrator.workflow import FlowPilotOrchestrator
from services.llm_service import LLMService


def render_execution_monitor_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Monitor de Execução Multiagente",
        subtitle="Linha do tempo visual, decisões operacionais verificáveis, ferramentas e trilha de auditoria",
        mode_badge=llm.get_active_mode_badge(),
    )

    requests_list = repo.list_requests(include_demo=True)
    if not requests_list:
        st.info(
            "Nenhuma solicitação disponível para monitoramento. Carregue o ambiente de demonstração na barra lateral "
            "ou envie uma nova solicitação."
        )
        return

    all_ids = [r["request_id"] for r in requests_list]
    default_idx = 0
    saved_id = st.session_state.get("selected_request_id")
    if saved_id in all_ids:
        default_idx = all_ids.index(saved_id)

    selected_id = st.selectbox(
        "🔎 Selecione a Solicitação para Inspecionar a Linha do Tempo:",
        all_ids,
        index=default_idx,
        format_func=lambda rid: (
            f"{rid} | {next((x['status'] for x in requests_list if x['request_id'] == rid), '')} — "
            f"{next((x['title'] for x in requests_list if x['request_id'] == rid), '')}"
        ),
    )
    st.session_state["selected_request_id"] = selected_id

    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)
    trace = orchestrator.get_full_request_trace(selected_id)
    req = trace["request"]
    steps = trace["steps"]
    actions = trace["actions"]
    approvals = trace["approvals"]
    audits = trace["audit_logs"]

    # Cabeçalho de Metadados da Solicitação
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.markdown(f"**Status Atual:**<br>{status_badge_html(req['status'])}", unsafe_allow_html=True)
    with m2:
        st.markdown(
            f"**Categoria:**<br>`{RequestCategory.label(req['category'])}` ({int(float(req['confidence'])*100)}%)",
            unsafe_allow_html=True,
        )
    with m3:
        human_flag = (
            "🧑‍⚖️ Sim (Intervenção / Revisão Humana)"
            if (req.get("human_intervention_occurred") or req.get("requires_human_approval"))
            else "⚡ Não (Fluxo 100% Automatizado)"
        )
        st.markdown(f"**Intervenção Humana:**<br>{human_flag}", unsafe_allow_html=True)
    with m4:
        st.markdown(
            f"**Tempo Total / Risco:**<br>`{float(req.get('total_processing_ms', 0.0)):.2f} ms` • Risco `{req['risk_level']}`",
            unsafe_allow_html=True,
        )

    st.markdown("---")
    st.subheader("⏱️ Linha do Tempo Visual do Pipeline Multiagente")

    for step in steps:
        border_color = "#4F46E5" if step["status"] == "SUCESSO" else "#DC2626"
        st.markdown(
            f"""
            <div class="fp-timeline-step" style="border-left-color: {border_color};">
                <div class="fp-timeline-header">
                    <div class="fp-timeline-agent">
                        Etapa {step['step_order']} — {step['agent_name']}
                        <span class="fp-badge fp-badge-CONCLUIDA" style="margin-left:8px;">{step['operation_mode']}</span>
                    </div>
                    <div class="fp-timeline-meta">
                        ⏱️ {step['duration_ms']:.2f} ms • 📅 {step['created_at'][:19].replace('T', ' ')}
                    </div>
                </div>
                <div style="font-size:0.84rem; color:#475569; margin-bottom:6px;">
                    <b>Responsabilidade:</b> {step['responsibility']}
                </div>
                <div style="font-size:0.90rem; color:#0F172A; margin-bottom:6px;">
                    <b>Resultado Operacional Produzido:</b> {step['decision_summary']}
                </div>
                <div style="font-size:0.83rem; color:#312E81; font-weight:600;">
                    ➡️ Próxima Etapa: {step['next_stage']}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        with st.expander(
            f"🔬 Evidências Verificáveis, Validações e JSON Estruturado — {step['agent_name']}"
        ):
            v_col, j_col = st.columns([1, 1.3])
            with v_col:
                st.markdown("**Validações Executadas:**")
                for val_item in step.get("validations", []):
                    st.markdown(f"- ✅ {val_item}")
            with j_col:
                st.markdown("**Contrato de Saída Estruturado (JSON):**")
                st.json(step.get("output", {}))

    if approvals:
        st.subheader("🧑‍⚖️ Registros de Governança e Aprovação Humana")
        for app in approvals:
            st.info(
                f"**ID Aprovação:** `{app['approval_id']}` | **Regra Disparada:** `{app['rule_triggered']}` | "
                f"**Status:** `{app['status']}` | **Revisor:** `{app.get('reviewer_name') or 'Aguardando revisor'}` | "
                f"**Justificativa:** {app.get('decision_justification') or 'Pendente de decisão na Central de Aprovações'}"
            )

    if actions:
        st.subheader("🛠️ Ferramentas Internas Executadas (Com Controle de Idempotência)")
        for act in actions:
            st.markdown(
                f"- **`{act['tool_name']}`** (`{act['action_id']}` • Chave Idempotente: `{act['idempotency_key']}`): "
                f"{act['output_summary']}"
            )

    with st.expander("🛡️ Trilha de Auditoria Completa (Audit Log Imutável da Solicitação)"):
        for log in audits:
            st.markdown(
                f"- `{log['created_at'][:19].replace('T', ' ')}` | **[{log['severity']}] {log['event_type']}** "
                f"(Ator: `{log['actor']}`): {log['description']}"
            )
