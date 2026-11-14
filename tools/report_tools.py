"""
Ferramentas internas para geração de relatórios de processamento por solicitação e exportação em CSV/PDF.
"""
import io
from datetime import datetime
from typing import Any, Dict, List
import pandas as pd
from fpdf import FPDF
from database.models import ExecutedToolAction, RequestCategory
from database.repository import FlowPilotRepository
from services.security_service import check_tool_permission, compute_idempotency_key


def generate_processing_report(
    repo: FlowPilotRepository,
    request_id: str,
    agent_id: str,
    category: RequestCategory,
    risk_level: str,
    human_approved: bool,
) -> ExecutedToolAction:
    tool_name = "generate_processing_report"
    if not check_tool_permission(agent_id, tool_name):
        raise PermissionError(f"Agente '{agent_id}' não possui permissão para executar '{tool_name}'.")

    idemp_key = compute_idempotency_key(request_id, tool_name, "PROCESSING_REPORT")
    summary = (
        f"Relatório de auditoria operacional emitido para {request_id} "
        f"(Risco: {risk_level}, Revisão Humana: {'Sim' if human_approved else 'Não'})."
    )
    rec = repo.record_action(
        request_id=request_id,
        agent_id=agent_id,
        tool_name=tool_name,
        action_type="PROCESSING_REPORT",
        idempotency_key=idemp_key,
        status="EXECUTED",
        output_summary=summary,
        payload={
            "request_id": request_id,
            "category": category.value,
            "risk_level": risk_level,
            "human_approved": human_approved,
        },
    )
    return ExecutedToolAction(**rec)


def export_requests_to_csv(requests_list: List[Dict[str, Any]]) -> bytes:
    """Exporta a lista de solicitações processadas para CSV compatível com Excel/UTF-8."""
    if not requests_list:
        df = pd.DataFrame(
            columns=[
                "request_id",
                "title",
                "requester_name",
                "requester_department",
                "category",
                "status",
                "risk_level",
                "confidence",
                "total_processing_ms",
                "created_at",
            ]
        )
    else:
        rows = []
        for r in requests_list:
            rows.append(
                {
                    "ID": r.get("request_id"),
                    "Título": r.get("title"),
                    "Solicitante": r.get("requester_name"),
                    "Departamento": r.get("requester_department"),
                    "Categoria": RequestCategory.label(str(r.get("category", ""))),
                    "Status": r.get("status"),
                    "Risco": r.get("risk_level"),
                    "Confiança (%)": round(float(r.get("confidence", 0.0)) * 100, 1),
                    "Intervenção Humana": "Sim" if r.get("human_intervention_occurred") else "Não",
                    "Modo": r.get("operation_mode"),
                    "Tempo Processamento (ms)": round(float(r.get("total_processing_ms", 0.0)), 2),
                    "Criado em": r.get("created_at"),
                }
            )
        df = pd.DataFrame(rows)
    return df.to_csv(index=False).encode("utf-8-sig")


def _latin1_safe(text: str) -> str:
    """Garante compatibilidade de caracteres com fontes padrão ISO-8859-1 do FPDF."""
    return (
        str(text or "")
        .replace("—", "-")
        .replace("–", "-")
        .replace("•", "*")
        .replace("“", '"')
        .replace("”", '"')
        .replace("’", "'")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def export_analytics_to_pdf(
    metrics: Dict[str, Any],
    requests_list: List[Dict[str, Any]],
) -> bytes:
    """Gera um relatório executivo em PDF das operações do FlowPilot AI."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Cabeçalho
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1_safe("FLOWPILOT AI - Relatorio Executivo de Operacoes"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(
        0,
        6,
        _latin1_safe(f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    # Resumo de Indicadores
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1_safe("1. Indicadores Consolidados"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    summary_lines = [
        f"Total de Solicitacoes Recebidas: {metrics.get('total_requests', 0)}",
        f"Solicitacoes Concluidas: {metrics.get('completed_requests', 0)} ({metrics.get('completion_rate_pct', 0.0):.1f}%)",
        f"Taxa de Automacao Direta: {metrics.get('automation_rate_pct', 0.0):.1f}%",
        f"Intervencoes Humanas Registradas: {metrics.get('human_interventions', 0)}",
        f"Tempo Medio de Processamento: {metrics.get('avg_processing_ms', 0.0):.1f} ms",
        f"Economia Estimada (vs. Manual Configurado): {metrics.get('estimated_saved_minutes', 0.0):.1f} min ({metrics.get('estimated_saved_hours', 0.0):.2f} h) [Estimativa]",
    ]
    for line in summary_lines:
        pdf.cell(0, 6, _latin1_safe(f"  * {line}"), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1_safe("2. Registro de Solicitacoes Recentes"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)

    for req in requests_list[:25]:
        line = (
            f"[{req.get('request_id')}] {req.get('status')} | "
            f"{RequestCategory.label(str(req.get('category', '')))} | "
            f"{req.get('requester_name')} - {str(req.get('title'))[:45]}"
        )
        pdf.cell(0, 6, _latin1_safe(line), new_x="LMARGIN", new_y="NEXT")

    out = pdf.output()
    return bytes(out)
