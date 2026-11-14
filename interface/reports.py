"""
Página 6: Relatórios Executivos e Exportação em CSV / PDF.
Exibe solicitações processadas, tempo de processamento, categorias mais frequentes,
principais motivos de rejeição, intervenções humanas, erros por agente, taxa de automação
e estimativa de tempo economizado.
"""
import pandas as pd
import plotly.express as px
import streamlit as st
from database.models import RequestCategory
from database.repository import FlowPilotRepository
from interface.styles import render_kpi_card, render_page_header
from services.analytics_service import AnalyticsService
from services.llm_service import LLMService
from tools.report_tools import export_analytics_to_pdf, export_requests_to_csv


def render_reports_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Relatórios & Exportação Analítica",
        subtitle="Consolidação de indicadores operacionais, motivos de rejeição, erros por agente e exportação CSV/PDF",
        mode_badge=llm.get_active_mode_badge(),
    )

    analytics = AnalyticsService(repo)
    manual_est = st.session_state.get("cfg_manual_min", 18.0)
    review_est = st.session_state.get("cfg_review_min", 4.5)
    metrics = analytics.compute_dashboard_metrics(
        manual_minutes_per_req=manual_est,
        human_review_minutes=review_est,
    )
    requests_list = repo.list_requests(include_demo=True)

    # Botões de Exportação CSV e PDF no topo
    exp_col1, exp_col2, exp_col3 = st.columns([1.2, 1.2, 2])
    with exp_col1:
        csv_bytes = export_requests_to_csv(requests_list)
        st.download_button(
            label="📥 Exportar Relatório em CSV",
            data=csv_bytes,
            file_name="flowpilot_relatorio_solicitacoes.csv",
            mime="text/csv",
            use_container_width=True,
        )
    with exp_col2:
        pdf_bytes = export_analytics_to_pdf(metrics, requests_list)
        st.download_button(
            label="📄 Exportar Relatório Executivo em PDF",
            data=pdf_bytes,
            file_name="flowpilot_relatorio_executivo.pdf",
            mime="application/pdf",
            use_container_width=True,
        )
    with exp_col3:
        st.caption(
            "Os arquivos CSV e PDF são gerados dinamicamente com os registros reais persistidos no SQLite."
        )

    st.markdown("<div style='height: 12px'></div>", unsafe_allow_html=True)

    # Indicadores de Relatório
    r1, r2, r3, r4 = st.columns(4)
    with r1:
        render_kpi_card(
            "Taxa de Automação Direta",
            f"{metrics['automation_rate_pct']}%",
            "Sem necessidade de intervenção humana",
            "#4F46E5",
        )
    with r2:
        render_kpi_card(
            "Intervenções Humanas",
            str(metrics["human_interventions"]),
            "Aprovações ou complementos solicitados",
            "#6366F1",
        )
    with r3:
        render_kpi_card(
            "Solicitações Rejeitadas",
            str(metrics["rejected_requests"]),
            "Bloqueadas por política ou segurança",
            "#DC2626",
        )
    with r4:
        render_kpi_card(
            "Economia Estimada (Configurável)",
            f"{metrics['estimated_saved_hours']:.2f} h",
            f"{metrics['estimated_saved_minutes']:.1f} min poupados [Estimativa]",
            "#16A34A",
        )

    st.markdown("<div style='height: 18px'></div>", unsafe_allow_html=True)

    c_left, c_right = st.columns(2)
    with c_left:
        st.subheader("🚫 Principais Motivos de Rejeição")
        rej = metrics["rejection_reasons"]
        if rej:
            df_rej = pd.DataFrame(
                {"Motivo": list(rej.keys()), "Ocorrências": list(rej.values())}
            )
            fig_rej = px.pie(
                df_rej,
                names="Motivo",
                values="Ocorrências",
                hole=0.45,
                color_discrete_sequence=["#DC2626", "#F97316", "#6366F1", "#0F172A"],
            )
            fig_rej.update_layout(height=300, margin=dict(l=10, r=10, t=10, b=10))
            st.plotly_chart(fig_rej, use_container_width=True)
        else:
            st.info("Nenhuma solicitação rejeitada até o momento.")

    with c_right:
        st.subheader("🤖 Desempenho e Erros por Agente")
        df_ag = pd.DataFrame(metrics["agent_volume"])
        df_ag_display = df_ag.rename(
            columns={
                "name": "Agente",
                "executions": "Execuções",
                "errors": "Erros Registrados",
                "avg_duration_ms": "Tempo Médio (ms)",
            }
        )[["Agente", "Execuções", "Erros Registrados", "Tempo Médio (ms)"]]
        st.dataframe(df_ag_display, use_container_width=True, hide_index=True)

    st.subheader("📋 Tabela Consolidada de Solicitações Processadas")
    if requests_list:
        df_all = pd.DataFrame(
            [
                {
                    "ID": r["request_id"],
                    "Título": r["title"],
                    "Solicitante": r["requester_name"],
                    "Departamento": r["requester_department"],
                    "Categoria": RequestCategory.label(r["category"]),
                    "Status": r["status"],
                    "Risco": r["risk_level"],
                    "Intervenção Humana": "Sim" if (r.get("human_intervention_occurred") or r.get("requires_human_approval")) else "Não",
                    "Tempo (ms)": round(float(r.get("total_processing_ms", 0.0)), 2),
                    "Motivo Rejeição": r.get("rejection_reason") or "—",
                }
                for r in requests_list
            ]
        )
        st.dataframe(df_all, use_container_width=True, hide_index=True)
    else:
        st.info("Sem registros para exibir no relatório.")
