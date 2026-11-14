"""
FLOWPILOT AI — Aplicação Principal (Entrypoint Streamlit)
Plataforma de Orquestração de Agentes Inteligentes para Operações Administrativas.
"""
import streamlit as st
from config.settings import get_settings
from data.demo_seed import load_demo_environment
from database.repository import FlowPilotRepository
from interface.agents import render_agents_page
from interface.approvals import render_approvals_page
from interface.dashboard import render_dashboard_page
from interface.evaluation_lab import render_evaluation_lab_page
from interface.execution_monitor import render_execution_monitor_page
from interface.reports import render_reports_page
from interface.requests import render_requests_page
from interface.styles import apply_enterprise_styles
from services.llm_service import LLMService


def main() -> None:
    settings = get_settings()
    st.set_page_config(
        page_title="FlowPilot AI | Orquestração Multiagente",
        page_icon="🧭",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    apply_enterprise_styles()

    repo = FlowPilotRepository()

    # Inicialização de estado da sessão
    if "op_mode" not in st.session_state:
        st.session_state["op_mode"] = settings.operation_mode
    if "llm_provider" not in st.session_state:
        st.session_state["llm_provider"] = settings.llm_provider
    if "llm_model" not in st.session_state:
        st.session_state["llm_model"] = settings.llm_model
    if "llm_api_key" not in st.session_state:
        st.session_state["llm_api_key"] = settings.llm_api_key

    # Popula automaticamente o ambiente de demonstração na primeira abertura caso o banco esteja vazio
    if "initial_seed_checked" not in st.session_state:
        st.session_state["initial_seed_checked"] = True
        existing_reqs = repo.list_requests(include_demo=True)
        if len(existing_reqs) == 0:
            load_demo_environment(repository=repo)

    # Sidebar de Navegação e Controles Operacionais
    with st.sidebar:
        st.markdown(
            """
            <div style="padding: 8px 4px 16px 4px; border-bottom: 1px solid #334155; margin-bottom: 14px;">
                <div style="font-size: 1.35rem; font-weight: 700; color: #FFFFFF; letter-spacing: -0.02em;">
                    🧭 FLOWPILOT AI
                </div>
                <div style="font-size: 0.78rem; color: #94A3B8; margin-top: 2px;">
                    Enterprise Multi-Agent Operations
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        pending_approvals_count = len(repo.list_approvals(status_filter="PENDENTE"))
        approval_label = (
            f"🧑‍⚖️ Central de Aprovações ({pending_approvals_count})"
            if pending_approvals_count > 0
            else "🧑‍⚖️ Central de Aprovações"
        )

        page = st.radio(
            "NAVEGAÇÃO PRINCIPAL",
            [
                "📊 Dashboard Executivo",
                "📥 Central de Solicitações",
                "🤖 Central de Agentes & Regras",
                "⏱️ Monitor de Execução",
                approval_label,
                "📈 Relatórios & Exportação",
                "🧪 Agent Evaluation Lab",
            ],
        )

        st.markdown("<hr style='border-color:#334155; margin: 14px 0;'>", unsafe_allow_html=True)
        st.markdown("**⚙️ MODO DE INTELIGÊNCIA ARTIFICIAL**")
        selected_mode = st.selectbox(
            "Modo de Operação",
            ["LOCAL", "LLM"],
            index=0 if st.session_state["op_mode"] == "LOCAL" else 1,
            format_func=lambda m: (
                "Modo Local (Determinístico Python)"
                if m == "LOCAL"
                else "Modo LLM (API Externa Configurável)"
            ),
        )
        st.session_state["op_mode"] = selected_mode

        if selected_mode == "LLM":
            st.session_state["llm_provider"] = st.selectbox(
                "Provedor LLM",
                ["openai", "gemini"],
                index=0 if st.session_state["llm_provider"] == "openai" else 1,
            )
            st.session_state["llm_model"] = st.text_input(
                "Modelo",
                value=st.session_state["llm_model"],
                placeholder="gpt-4o-mini ou gemini-2.0-flash",
            )
            st.session_state["llm_api_key"] = st.text_input(
                "API Key (Não persistida em logs)",
                value=st.session_state["llm_api_key"],
                type="password",
            )
            if not st.session_state["llm_api_key"].strip():
                st.warning("Informe uma API Key válida ou utilize o Modo Local Determinístico.")

        llm = LLMService(
            mode=st.session_state["op_mode"],
            provider=st.session_state["llm_provider"],
            api_key=st.session_state["llm_api_key"],
            model=st.session_state["llm_model"],
        )

        st.markdown("<hr style='border-color:#334155; margin: 14px 0;'>", unsafe_allow_html=True)
        st.markdown("**🧪 AMBIENTE DE DEMONSTRAÇÃO**")
        all_reqs = repo.list_requests(include_demo=True)
        demo_count = sum(1 for r in all_reqs if r.get("is_demo"))
        real_count = len(all_reqs) - demo_count
        st.caption(f"Ativos: **{demo_count}** Demo | **{real_count}** Reais")

        if st.button("🔄 Carregar Dados Demo (22 Casos)", use_container_width=True):
            res_seed = load_demo_environment(repository=repo)
            st.toast(f"{res_seed['loaded_count']} solicitações de demonstração carregadas!", icon="✅")
            st.rerun()

        if st.button("🧹 Remover Dados Demo", use_container_width=True):
            removed = repo.clear_demo_data()
            st.toast(
                f"{removed} registros demo removidos. ({real_count} registros reais preservados).",
                icon="🧹",
            )
            st.rerun()

    # Roteamento de Páginas
    if page == "📊 Dashboard Executivo":
        render_dashboard_page(repo, llm)
    elif page == "📥 Central de Solicitações":
        render_requests_page(repo, llm)
    elif page == "🤖 Central de Agentes & Regras":
        render_agents_page(repo, llm)
    elif page == "⏱️ Monitor de Execução":
        render_execution_monitor_page(repo, llm)
    elif page.startswith("🧑‍⚖️ Central de Aprovações"):
        render_approvals_page(repo, llm)
    elif page == "📈 Relatórios & Exportação":
        render_reports_page(repo, llm)
    elif page == "🧪 Agent Evaluation Lab":
        render_evaluation_lab_page(llm)


if __name__ == "__main__":
    main()
