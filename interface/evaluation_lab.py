"""
Página 7: Agent Evaluation Lab (Laboratório de Avaliação Reproduzível de Agentes).
Executa os 32 casos de teste reais sobre o pipeline do FlowPilot AI, calcula métricas
verdadeiras (sem inventar resultados), plota Matriz de Confusão e permite exportar o relatório.
"""
import pandas as pd
import plotly.express as px
import streamlit as st
from interface.styles import render_kpi_card, render_page_header
from services.evaluation_service import EvaluationService, get_benchmark_test_suite
from services.llm_service import LLMService


def render_evaluation_lab_page(llm: LLMService) -> None:
    render_page_header(
        title="Agent Evaluation Lab (Benchmark de Qualidade & Segurança)",
        subtitle="Suíte reproduzível com 32 casos de teste cobrindo classificação, extração, alçadas, duplicidade e Prompt Injection",
        mode_badge=llm.get_active_mode_badge(),
    )

    suite = get_benchmark_test_suite()
    st.markdown(
        f"O **Agent Evaluation Lab** conta com **{len(suite)} casos de teste estruturados** "
        "(Simples, Incompletas, Ambíguas, Contraditórias, Acima do Limite, Duplicadas, Compliance e Prompt Injection). "
        "Nenhuma métrica é pré-gravada: clique abaixo para executar todos os casos em um banco isolado e aferir os resultados reais."
    )

    col_btn, col_info = st.columns([1.2, 2.8])
    with col_btn:
        run_clicked = st.button(
            "🧪 Executar Suíte Completa (32 Casos de Teste)",
            use_container_width=True,
        )
    with col_info:
        st.caption(
            "A execução processa cada caso pelos 5 agentes no orquestrador real e compara com o Ground Truth."
        )

    if run_clicked or "eval_lab_results" not in st.session_state:
        with st.spinner("Executando os 32 casos de teste no pipeline multiagente..."):
            eval_service = EvaluationService(llm_service=llm)
            st.session_state["eval_lab_results"] = eval_service.run_evaluation_suite()

    res = st.session_state["eval_lab_results"]

    # Linha de KPIs de Qualidade Medida
    k1, k2, k3, k4, k5, k6 = st.columns(6)
    with k1:
        render_kpi_card(
            "Casos Executados",
            str(res["total_cases"]),
            f"Tempo total: {res['total_suite_duration_ms']:.1f} ms",
            "#0F172A",
        )
    with k2:
        render_kpi_card(
            "Precisão Classificação",
            f"{res['classification_accuracy_pct']}%",
            "Intake Agent",
            "#4F46E5",
        )
    with k3:
        render_kpi_card(
            "Precisão Extração",
            f"{res['extraction_accuracy_pct']}%",
            "Entidades estruturadas",
            "#6366F1",
        )
    with k4:
        render_kpi_card(
            "Conformidade Regras",
            f"{res['policy_compliance_pct']}%",
            "Policy & Supervisor",
            "#16A34A",
        )
    with k5:
        render_kpi_card(
            "Falsos Positivos / Negativos",
            f"{res['false_positives']} FP / {res['false_negatives']} FN",
            f"TP: {res['true_positives']} | TN: {res['true_negatives']}",
            "#1E293B",
        )
    with k6:
        render_kpi_card(
            "Taxa Intervenção Humana",
            f"{res['human_intervention_rate_pct']}%",
            f"Média: {res['avg_processing_ms']:.2f} ms/caso",
            "#D97706",
        )

    st.markdown("<div style='height: 18px'></div>", unsafe_allow_html=True)

    c_mat, c_grp = st.columns([1.2, 1.2])
    with c_mat:
        st.subheader("🎯 Matriz de Confusão de Estados Finais (Esperado vs. Obtido)")
        labels = res["state_labels"]
        matrix_dict = res["state_confusion_matrix"]
        z_vals = [[matrix_dict[exp][obt] for obt in labels] for exp in labels]

        fig_cm = px.imshow(
            z_vals,
            x=labels,
            y=labels,
            text_auto=True,
            color_continuous_scale="Purples",
            labels=dict(x="Estado Obtido", y="Estado Esperado (Ground Truth)", color="Casos"),
        )
        fig_cm.update_layout(height=340, margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig_cm, use_container_width=True)

    with c_grp:
        st.subheader("📊 Desempenho por Grupo de Complexidade")
        df_cases = pd.DataFrame(res["case_results"])
        grp_summary = (
            df_cases.groupby("scenario_group")
            .agg(
                Casos=("case_id", "count"),
                Classificacao_OK=("category_match", "sum"),
                Extracao_OK=("extraction_match", "sum"),
                Estado_OK=("state_match", "sum"),
                Tempo_Medio_ms=("duration_ms", "mean"),
            )
            .reset_index()
        )
        grp_summary["Tempo_Medio_ms"] = grp_summary["Tempo_Medio_ms"].round(2)
        st.dataframe(grp_summary, use_container_width=True, hide_index=True)

        csv_eval = df_cases.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            "📥 Exportar Relatório Reproduzível do Evaluation Lab (CSV)",
            data=csv_eval,
            file_name="flowpilot_agent_evaluation_benchmark.csv",
            mime="text/csv",
            use_container_width=True,
        )

    st.subheader("🔬 Detalhamento Caso a Caso (32 Cenários Executados)")
    st.dataframe(df_cases, use_container_width=True, hide_index=True)
