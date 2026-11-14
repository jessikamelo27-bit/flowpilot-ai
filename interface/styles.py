"""
Sistema de Design e Estilos CSS do FlowPilot AI.
Paleta Corporativa B2B:
- Azul-marinho profundo: #0F172A e #1E293B
- Branco puro e off-white limpo: #FFFFFF e #F8FAFC
- Roxo discreto institucional: #6366F1 e #4F46E5
"""
import streamlit as st


def apply_enterprise_styles() -> None:
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        html, body, [class*="css"] {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .stApp {
            background-color: #F8FAFC;
        }

        /* Sidebar Azul-Marinho Corporativa */
        section[data-testid="stSidebar"] {
            background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%);
            border-right: 1px solid #334155;
        }
        section[data-testid="stSidebar"] * {
            color: #F8FAFC !important;
        }
        section[data-testid="stSidebar"] .stButton > button {
            background-color: #312E81 !important;
            border: 1px solid #6366F1 !important;
            color: #FFFFFF !important;
            border-radius: 8px;
            font-weight: 600;
            width: 100%;
        }
        section[data-testid="stSidebar"] .stButton > button:hover {
            background-color: #4F46E5 !important;
            border-color: #818CF8 !important;
        }

        /* Banner Principal */
        .fp-header-banner {
            background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 65%, #312E81 100%);
            color: #FFFFFF;
            padding: 22px 28px;
            border-radius: 14px;
            margin-bottom: 20px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.18);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .fp-header-title {
            font-size: 1.55rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin: 0;
            color: #FFFFFF;
        }
        .fp-header-sub {
            font-size: 0.92rem;
            color: #CBD5E1;
            margin-top: 4px;
        }
        .fp-mode-pill {
            background: rgba(99, 102, 241, 0.22);
            border: 1px solid #818CF8;
            color: #E0E7FF;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.03em;
        }

        /* Cards de KPI */
        .fp-kpi-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-top: 4px solid #4F46E5;
            border-radius: 12px;
            padding: 18px 20px;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            height: 100%;
        }
        .fp-kpi-label {
            font-size: 0.78rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748B;
            margin-bottom: 6px;
        }
        .fp-kpi-value {
            font-size: 1.75rem;
            font-weight: 700;
            color: #0F172A;
            line-height: 1.15;
        }
        .fp-kpi-sub {
            font-size: 0.80rem;
            color: #475569;
            margin-top: 6px;
        }

        /* Badges de Status */
        .fp-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 0.74rem;
            font-weight: 600;
            letter-spacing: 0.03em;
        }
        .fp-badge-CONCLUIDA, .fp-badge-APROVADA, .fp-badge-EXECUTADA {
            background-color: #DCFCE7;
            color: #166534;
            border: 1px solid #86EFAC;
        }
        .fp-badge-AGUARDANDO_APROVACAO {
            background-color: #EDE9FE;
            color: #5B21B6;
            border: 1px solid #C4B5FD;
        }
        .fp-badge-AGUARDANDO_INFORMACOES, .fp-badge-RECEBIDA, .fp-badge-EM_PROCESSAMENTO {
            background-color: #FEF3C7;
            color: #92400E;
            border: 1px solid #FDE68A;
        }
        .fp-badge-REJEITADA, .fp-badge-ERRO {
            background-color: #FEE2E2;
            color: #991B1B;
            border: 1px solid #FCA5A5;
        }

        /* Timeline do Monitor de Execução */
        .fp-timeline-step {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-left: 5px solid #4F46E5;
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 14px;
            box-shadow: 0 2px 5px rgba(15, 23, 42, 0.03);
        }
        .fp-timeline-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .fp-timeline-agent {
            font-weight: 700;
            color: #0F172A;
            font-size: 1.02rem;
        }
        .fp-timeline-meta {
            font-size: 0.78rem;
            color: #64748B;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_page_header(title: str, subtitle: str, mode_badge: str) -> None:
    st.markdown(
        f"""
        <div class="fp-header-banner">
            <div>
                <div class="fp-header-title">{title}</div>
                <div class="fp-header-sub">{subtitle}</div>
            </div>
            <div class="fp-mode-pill">{mode_badge}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_kpi_card(label: str, value: str, subtext: str, accent_color: str = "#4F46E5") -> None:
    st.markdown(
        f"""
        <div class="fp-kpi-card" style="border-top-color: {accent_color};">
            <div class="fp-kpi-label">{label}</div>
            <div class="fp-kpi-value">{value}</div>
            <div class="fp-kpi-sub">{subtext}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def status_badge_html(status: str) -> str:
    return f'<span class="fp-badge fp-badge-{status}">{status}</span>'
