"""
Página 2: Central de Solicitações.
Permite criar novas solicitações (via texto livre + campos estruturados de formulário),
filtrar por categoria/status, buscar por identificador, consultar detalhes, complementar
solicitações em AGUARDANDO_INFORMACOES e acompanhar o histórico de etapas.
"""
from typing import Any, Dict
import pandas as pd
import streamlit as st
from database.models import RequestCategory, RequestState, RequestSubmission
from database.repository import FlowPilotRepository
from interface.styles import render_page_header, status_badge_html
from orchestrator.workflow import FlowPilotOrchestrator
from services.llm_service import LLMService


def render_requests_page(repo: FlowPilotRepository, llm: LLMService) -> None:
    render_page_header(
        title="Central de Solicitações Administrativas",
        subtitle="Submissão, triagem inteligente, acompanhamento de status e consulta detalhada",
        mode_badge=llm.get_active_mode_badge(),
    )

    orchestrator = FlowPilotOrchestrator(repository=repo, llm_service=llm)

    tab_list, tab_new = st.tabs(
        ["📋 Consultar & Filtrar Solicitações", "➕ Nova Solicitação Administrativa"]
    )

    with tab_new:
        st.subheader("Enviar Nova Solicitação para a Central FlowPilot AI")
        st.caption(
            "Preencha a solicitação em linguagem natural e, opcionalmente, forneça os metadados do formulário. "
            "O Orquestrador acionará os 5 agentes em sequência real."
        )
        with st.form("form_create_request", clear_on_submit=False):
            c1, c2, c3 = st.columns(3)
            with c1:
                title = st.text_input(
                    "Título da Solicitação *",
                    placeholder="Ex: Compra de 2 Monitores LG 27p",
                )
            with c2:
                requester_name = st.text_input(
                    "Nome do Solicitante *",
                    placeholder="Ex: Camila Mendes",
                )
            with c3:
                requester_dept = st.selectbox(
                    "Departamento *",
                    [
                        "Engenharia",
                        "Financeiro",
                        "Comercial",
                        "Suprimentos",
                        "RH",
                        "Marketing",
                        "Operações",
                        "Jurídico",
                        "TI",
                        "Geral",
                    ],
                )

            raw_text = st.text_area(
                "Descrição Detalhada da Solicitação *",
                height=110,
                placeholder=(
                    "Descreva sua solicitação administrativa com clareza (valores em R$, justificativa, "
                    "número de comprovante NF/REC, CNPJ do fornecedor ou finalidade do documento)..."
                ),
            )

            with st.expander("📎 Campos Estruturados de Formulário (Opcional)"):
                fc1, fc2, fc3 = st.columns(3)
                with fc1:
                    f_item = st.text_input("Item / Objeto (Compras)")
                    f_amount = st.number_input("Valor R$ (Compra / Reembolso)", value=0.0, step=50.0)
                with fc2:
                    f_receipt = st.text_input("Nº Comprovante / NF (Reembolso)")
                    f_supplier = st.text_input("Razão Social (Fornecedor)")
                with fc3:
                    f_cnpj = st.text_input("CNPJ (Fornecedor)")
                    f_email = st.text_input("E-mail do Fornecedor")
                f_just = st.text_input("Justificativa / Finalidade Formal")

            submitted = st.form_submit_button("🚀 Enviar e Processar com Agentes de IA", use_container_width=True)
            if submitted:
                if len(title.strip()) < 3 or len(requester_name.strip()) < 2 or len(raw_text.strip()) < 5:
                    st.error("Preencha o Título, Nome do Solicitante e uma Descrição com pelo menos 5 caracteres.")
                else:
                    form_payload: Dict[str, Any] = {}
                    if f_item.strip():
                        form_payload["item"] = f_item.strip()
                    if f_amount != 0.0:
                        form_payload["amount"] = float(f_amount)
                    if f_receipt.strip():
                        form_payload["receipt_id"] = f_receipt.strip()
                    if f_supplier.strip():
                        form_payload["supplier_name"] = f_supplier.strip()
                    if f_cnpj.strip():
                        form_payload["tax_id"] = f_cnpj.strip()
                    if f_email.strip():
                        form_payload["contact_email"] = f_email.strip()
                    if f_just.strip():
                        form_payload["justification"] = f_just.strip()
                        form_payload["purpose"] = f_just.strip()

                    submission = RequestSubmission(
                        title=title,
                        requester_name=requester_name,
                        requester_department=requester_dept,
                        raw_text=raw_text,
                        form_data=form_payload,
                        source="PORTAL_WEB",
                        is_demo=False,
                    )
                    trace = orchestrator.submit_and_process(submission)
                    req_out = trace["request"]
                    st.session_state["selected_request_id"] = req_out["request_id"]
                    st.success(
                        f"Solicitação **{req_out['request_id']}** processada! "
                        f"Categoria: `{RequestCategory.label(req_out['category'])}` | "
                        f"Estado Atual: `{req_out['status']}`"
                    )

    with tab_list:
        f_col1, f_col2, f_col3, f_col4 = st.columns([2, 2, 2, 1.5])
        with f_col1:
            search_q = st.text_input(
                "🔍 Buscar por ID, Título ou Solicitante",
                placeholder="Ex: DEMO-001, Monitor, Marina...",
            )
        with f_col2:
            cat_options = ["TODAS"] + [c.value for c in RequestCategory]
            cat_filter = st.selectbox(
                "Filtrar por Categoria",
                cat_options,
                format_func=lambda x: "Todas as Categorias" if x == "TODAS" else RequestCategory.label(x),
            )
        with f_col3:
            st_options = ["TODOS"] + [s.value for s in RequestState]
            status_filter = st.selectbox("Filtrar por Status", st_options)
        with f_col4:
            include_demo = st.checkbox("Incluir Dados Demo", value=True)

        requests_list = repo.list_requests(
            category=cat_filter,
            status=status_filter,
            search_query=search_q,
            include_demo=include_demo,
        )

        st.caption(f"Exibindo **{len(requests_list)}** solicitações encontradas.")

        if requests_list:
            df_table = pd.DataFrame(
                [
                    {
                        "ID": r["request_id"],
                        "Origem": "🧪 DEMO" if r.get("is_demo") else "🏢 REAL",
                        "Título": r["title"],
                        "Solicitante": f"{r['requester_name']} ({r['requester_department']})",
                        "Categoria": RequestCategory.label(r["category"]),
                        "Status": r["status"],
                        "Risco": r["risk_level"],
                        "Confiança": f"{int(float(r['confidence']) * 100)}%",
                        "Tempo (ms)": round(float(r.get("total_processing_ms", 0.0)), 1),
                    }
                    for r in requests_list
                ]
            )
            st.dataframe(df_table, use_container_width=True, hide_index=True)

            st.markdown("---")
            st.subheader("🔎 Inspecionar Detalhes e Histórico da Solicitação")
            all_ids = [r["request_id"] for r in requests_list]
            default_idx = 0
            saved_id = st.session_state.get("selected_request_id")
            if saved_id in all_ids:
                default_idx = all_ids.index(saved_id)

            selected_id = st.selectbox(
                "Selecione o Identificador da Solicitação:",
                all_ids,
                index=default_idx,
                format_func=lambda rid: f"{rid} — {next((x['title'] for x in requests_list if x['request_id'] == rid), '')}",
            )
            st.session_state["selected_request_id"] = selected_id

            trace = orchestrator.get_full_request_trace(selected_id)
            req_detail = trace["request"]

            d1, d2 = st.columns([2, 1])
            with d1:
                st.markdown(
                    f"#### {req_detail['request_id']} — {req_detail['title']} "
                    f"{status_badge_html(req_detail['status'])}",
                    unsafe_allow_html=True,
                )
                st.write(f"**Texto Original:** {req_detail['raw_text']}")
                if req_detail.get("final_summary"):
                    st.info(f"**Síntese do Fluxo:** {req_detail['final_summary']}")
                if req_detail.get("formal_response"):
                    st.success(f"**Resposta / Parecer Formal:**\n\n{req_detail['formal_response']}")

            with d2:
                st.markdown("**Dados Extraídos (JSON Estruturado):**")
                st.json(req_detail.get("extracted_data", {}))
                if req_detail.get("missing_fields"):
                    st.warning(f"Campos obrigatórios pendentes: {', '.join(req_detail['missing_fields'])}")

            # Se estiver em AGUARDANDO_INFORMACOES ou ERRO, permite complementar e retomar sem duplicar!
            if req_detail["status"] in (
                RequestState.AGUARDANDO_INFORMACOES.value,
                RequestState.ERRO.value,
            ):
                with st.expander("✏️ Complementar Informações e Retomar Solicitação", expanded=True):
                    with st.form(f"complement_form_{selected_id}"):
                        comp_text = st.text_input(
                            "Informações complementares (ex: Valor R$ 1.200,00, Comprovante NF-5544, Justificativa...)"
                        )
                        c_k, c_v = st.columns(2)
                        with c_k:
                            extra_field = st.selectbox(
                                "Campo obrigatório a preencher",
                                [
                                    "",
                                    "amount",
                                    "receipt_id",
                                    "justification",
                                    "purpose",
                                    "tax_id",
                                    "contact_email",
                                    "service_category",
                                    "item",
                                ],
                            )
                        with c_v:
                            extra_val = st.text_input("Valor do campo")

                        if st.form_submit_button("🔄 Atualizar Dados e Reprocessar"):
                            extra_dict: Dict[str, Any] = {}
                            if extra_field and extra_val.strip():
                                if extra_field == "amount":
                                    try:
                                        extra_dict["amount"] = float(extra_val.replace(",", "."))
                                    except ValueError:
                                        extra_dict["amount"] = extra_val
                                else:
                                    extra_dict[extra_field] = extra_val.strip()
                            orchestrator.resume_with_additional_info(
                                request_id=selected_id,
                                additional_text=comp_text,
                                additional_form_data=extra_dict,
                                actor=req_detail["requester_name"],
                            )
                            st.rerun()

            st.markdown("##### 📜 Etapas de Processamento Registradas")
            for step in trace["steps"]:
                st.markdown(
                    f"- **Etapa {step['step_order']} — {step['agent_name']}** (`{step['status']}` • `{step['duration_ms']} ms`): "
                    f"{step['decision_summary']} $\\rightarrow$ *Próxima etapa: {step['next_stage']}*"
                )
        else:
            st.info("Nenhuma solicitação encontrada para os filtros selecionados.")
