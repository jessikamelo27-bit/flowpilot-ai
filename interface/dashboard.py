"""
Página 1: Dashboard Executivo & Simulador de Impacto Empresarial.
Calcula 100% dos indicadores a partir dos registros reais do banco SQLite.
"""
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from database.repository import FlowPilotRepository
from interface.styles import render_kpi_card, render_page_header
from services.analytics_service import AnalyticsService
from services.llm_service import LLMService

NAVY_PALETTE = ["#0F172A", "#4F46E5", "#6366F1", "#818CF8", "#1E293B", "#475569", "#94A3B8"]


def render_dashboard_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Dashboard Executivo de Operações",
        subtitle="Métricas em tempo real da orquestração multiagente, alçadas e eficiência operacional",
        mode_badge=llm.get_active_mode_badge(),
    )

    analytics = AnalyticsService(repo)
    manual_est = st.session_state.get("cfg_manual_min", 18.0)
    review_est = st.session_state.get("cfg_review_min", 4.5)
    metrics = analytics.compute_dashboard_metrics(
        manual_minutes_per_req=manual_est,
        human_review_minutes=review_est,
    )

    if metrics["total_requests"] == 0:
        st.info(
            "O banco de dados está vazio no momento. Utilize o botão **'Carregar Dados de Demonstração (22 Casos)'** "
            "na barra lateral ou crie uma nova solicitação na **Central de Solicitações**."
        )

    # Linha 1 de KPIs
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1:
        render_kpi_card(
            "Total Recebidas",
            str(metrics["total_requests"]),
            "Solicitações registradas",
            "#0F172A",
        )
    with c2:
        render_kpi_card(
            "Concluídas",
            str(metrics["completed_requests"]),
            f"Taxa: {metrics['completion_rate_pct']}%",
            "#16A34A",
        )
    with c3:
        render_kpi_card(
            "Pendentes",
            str(metrics["pending_requests"]),
            f"Info pendente: {metrics['awaiting_info']}",
            "#D97706",
        )
    with c4:
        render_kpi_card(
            "Aguardando Aprovação",
            str(metrics["awaiting_approval"]),
            "Fila de revisão humana",
            "#6366F1",
        )
    with c5:
        render_kpi_card(
            "Taxa de Conclusão",
            f"{metrics['completion_rate_pct']}%",
            f"Automação direta: {metrics['automation_rate_pct']}%",
            "#4F46E5",
        )
    with c6:
        render_kpi_card(
            "Tempo Médio (Pipeline)",
            f"{metrics['avg_processing_ms']:.1f} ms",
            "Processamento real medido",
            "#1E293B",
        )

    st.markdown("<div style='height: 18px'></div>", unsafe_allow_html=True)

    # Linha 2: Distribuição por Categoria e Volume por Agente
    col_left, col_right = st.columns(2)
    with col_left:
        st.subheader("📊 Distribuição por Categoria")
        cat_dist = metrics["category_distribution"]
        if cat_dist:
            df_cat = pd.DataFrame(
                {"Categoria": list(cat_dist.keys()), "Quantidade": list(cat_dist.values())}
            ).sort_values("Quantidade", ascending=True)
            fig_cat = px.bar(
                df_cat,
                x="Quantidade",
                y="Categoria",
                orientation="h",
                color_discrete_sequence=["#4F46E5"],
                text="Quantidade",
            )
            fig_cat.update_layout(
                height=320,
                margin=dict(l=10, r=10, t=10, b=10),
                plot_bgcolor="#FFFFFF",
                paper_bgcolor="#FFFFFF",
            )
            st.plotly_chart(fig_cat, use_container_width=True)
        else:
            st.caption("Sem dados de categorias para exibir.")

    with col_right:
        st.subheader("🤖 Volume de Execuções por Agente")
        agent_vol = metrics["agent_volume"]
        df_ag = pd.DataFrame(agent_vol)
        fig_ag = px.bar(
            df_ag,
            x="name",
            y="executions",
            color="name",
            color_discrete_sequence=NAVY_PALETTE,
            text="executions",
            labels={"name": "Agente Especializado", "executions": "Execuções Registradas"},
        )
        fig_ag.update_layout(
            height=320,
            showlegend=False,
            margin=dict(l=10, r=10, t=10, b=10),
            plot_bgcolor="#FFFFFF",
            paper_bgcolor="#FFFFFF",
        )
        st.plotly_chart(fig_ag, use_container_width=True)

    # Linha 3: Evolução Diária e Mensal + Comparativo Manual vs Automatizado
    col_evo, col_imp = st.columns(2)
    with col_evo:
        st.subheader("📈 Evolução de Solicitações (Diária e Mensal)")
        tab_d, tab_m = st.tabs(["Evolução Diária", "Evolução Mensal"])
        with tab_d:
            daily = metrics["daily_evolution"]
            if daily:
                df_d = pd.DataFrame({"Data": list(daily.keys()), "Solicitações": list(daily.values())})
                fig_d = px.area(
                    df_d,
                    x="Data",
                    y="Solicitações",
                    markers=True,
                    color_discrete_sequence=["#6366F1"],
                )
                fig_d.update_layout(height=260, margin=dict(l=10, r=10, t=10, b=10))
                st.plotly_chart(fig_d, use_container_width=True)
            else:
                st.caption("Sem registros diários suficientes.")
        with tab_m:
            monthly = metrics["monthly_evolution"]
            if monthly:
                df_m = pd.DataFrame({"Mês": list(monthly.keys()), "Solicitações": list(monthly.values())})
                fig_m = px.bar(
                    df_m,
                    x="Mês",
                    y="Solicitações",
                    color_discrete_sequence=["#0F172A"],
                    text="Solicitações",
                )
                fig_m.update_layout(height=260, margin=dict(l=10, r=10, t=10, b=10))
                st.plotly_chart(fig_m, use_container_width=True)
            else:
                st.caption("Sem registros mensais suficientes.")

    with col_imp:
        st.subheader("⏱️ Simulador de Impacto Empresarial (Manual vs. FlowPilot AI)")
        c_s1, c_s2 = st.columns(2)
        with c_s1:
            new_manual = st.number_input(
                "Tempo manual estimado por solicitação (min)",
                min_value=1.0,
                max_value=240.0,
                value=float(manual_est),
                step=1.0,
                key="input_manual_min",
            )
            st.session_state["cfg_manual_min"] = new_manual
        with c_s2:
            new_review = st.number_input(
                "Tempo médio gasto em cada revisão humana (min)",
                min_value=0.5,
                max_value=120.0,
                value=float(review_est),
                step=0.5,
                key="input_review_min",
            )
            st.session_state["cfg_review_min"] = new_review

        imp = analytics.calculate_business_impact(
            request_count=metrics["total_requests"],
            manual_minutes_per_request=new_manual,
            automated_total_execution_ms=metrics["total_processing_ms"],
            human_review_count=metrics["human_interventions"],
            human_review_minutes_each=new_review,
        )

        fig_comp = go.Figure(
            data=[
                go.Bar(
                    name="Fluxo Manual Estimado",
                    x=["Tempo Total (Minutos)"],
                    y=[imp["estimated_manual_minutes"]],
                    marker_color="#64748B",
                    text=[f"{imp['estimated_manual_minutes']:.1f} min ({imp['estimated_manual_hours']:.2f} h)"],
                    textposition="auto",
                ),
                go.Bar(
                    name="Fluxo Automatizado + Revisões Humanas",
                    x=["Tempo Total (Minutos)"],
                    y=[imp["total_automated_minutes"]],
                    marker_color="#4F46E5",
                    text=[f"{imp['total_automated_minutes']:.1f} min ({imp['total_automated_hours']:.2f} h)"],
                    textposition="auto",
                ),
            ]
        )
        fig_comp.update_layout(
            barmode="group",
            height=210,
            margin=dict(l=10, r=10, t=10, b=10),
            plot_bgcolor="#FFFFFF",
            paper_bgcolor="#FFFFFF",
        )
        st.plotly_chart(fig_comp, use_container_width=True)

        st.markdown(
            f"**Economia Estimada:** `{imp['estimated_saved_minutes']:.1f} minutos` "
            f"(`{imp['estimated_saved_hours']:.2f} horas` | Redução de `{imp['time_reduction_pct']}%`)  \n"
            f"<small style='color:#64748B'>⚠️ {imp['disclaimer']}</small>",
            unsafe_allow_html=True,
        )
