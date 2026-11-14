"""Testes de integração da camada REST FastAPI (api/main.py) do FlowPilot AI."""

from __future__ import annotations

from pathlib import Path
from fastapi.testclient import TestClient

from api.main import app, runtime_state


def test_api_health_and_dashboard(tmp_path: Path):
    """Garante que os endpoints de saúde e dashboard executivo retornam dados reais do SQLite."""
    runtime_state.db_path = str(tmp_path / "test_api_flowpilot.db")
    runtime_state.operation_mode = "LOCAL"

    with TestClient(app) as client:
        # 1. Health check (o lifespan já carrega os dados demo se o banco estiver vazio)
        resp_health = client.get("/api/health")
        assert resp_health.status_code == 200
        health_data = resp_health.json()
        assert health_data["status"] == "ok"
        assert health_data["operation_mode"] == "LOCAL"
        assert health_data["total_requests"] >= 22

        # 2. Consulta dashboard executivo
        resp_dash = client.get("/api/dashboard")
        assert resp_dash.status_code == 200
        dash = resp_dash.json()
        assert dash["metrics"]["total_requests"] >= 22
        assert dash["metrics"]["completed_requests"] > 0
        assert dash["metrics"]["awaiting_approval"] > 0
        assert "department_distribution" in dash
        assert len(dash["attention_alerts"]) > 0
        assert len(dash["recent_agent_activity"]) > 0


def test_api_request_lifecycle_approval_and_complement(tmp_path: Path):
    """Testa criação de solicitações, aprovação humana, retomada da FSM e complementação de dados."""
    runtime_state.db_path = str(tmp_path / "test_api_lifecycle.db")
    runtime_state.operation_mode = "LOCAL"

    with TestClient(app) as client:
        # 1. Solicitação de compra de baixo valor -> CONCLUIDA automaticamente
        resp_low = client.post(
            "/api/requests",
            json={
                "title": "Compra de 2 mouses ergonômicos",
                "requester_name": "Marina Costa",
                "requester_department": "Operações",
                "source": "PORTAL_WEB",
                "raw_text": (
                    "Solicito compra de 2 mouses ergonômicos no valor de R$ 280,00 com o "
                    "fornecedor Kalungo Suprimentos para a equipe de Operações."
                ),
                "form_data": {
                    "category_hint": "SOLICITACAO_COMPRA",
                    "amount": 280.00,
                    "supplier_name": "Kalungo Suprimentos",
                    "item_description": "2 mouses ergonômicos sem fio",
                    "cost_center": "CC-OPS-10",
                },
            },
        )
        assert resp_low.status_code == 200
        data_low = resp_low.json()
        assert data_low["request"]["status"] == "CONCLUIDA"
        req_low_id = data_low["request"]["request_id"]

        # Verifica detalhes completos e auditoria cruzada do Supervisor
        resp_detail = client.get(f"/api/requests/{req_low_id}")
        assert resp_detail.status_code == 200
        detail = resp_detail.json()
        assert detail["request"]["status"] == "CONCLUIDA"
        sup_steps = [s for s in detail["steps"] if s["agent_id"] == "supervisor_agent"]
        assert len(sup_steps) >= 1
        assert sup_steps[-1]["output"]["approved_for_completion"] is True
        assert "action_agent" in sup_steps[-1]["output"]["stages_verified"]
        assert sup_steps[-1]["output"]["detected_anomalies"] == []

        # 2. Solicitação de compra acima de R$ 2.500 -> AGUARDANDO_APROVACAO e depois APROVADA
        resp_high = client.post(
            "/api/requests",
            json={
                "title": "Servidor de homologação Dell PowerEdge",
                "requester_name": "Carlos Mendes",
                "requester_department": "TI & Engenharia",
                "source": "PORTAL_WEB",
                "raw_text": (
                    "Solicito compra de servidor de homologação Dell PowerEdge no valor de "
                    "R$ 9.500,00 com o fornecedor Dell Brasil para o cluster de testes."
                ),
                "form_data": {
                    "category_hint": "SOLICITACAO_COMPRA",
                    "amount": 9500.00,
                    "supplier_name": "Dell Brasil",
                    "item_description": "Servidor Dell PowerEdge R450",
                    "cost_center": "CC-TECH-01",
                },
            },
        )
        assert resp_high.status_code == 200
        data_high = resp_high.json()
        assert data_high["request"]["status"] == "AGUARDANDO_APROVACAO"
        req_high_id = data_high["request"]["request_id"]

        # Lista aprovações pendentes
        resp_approvals = client.get("/api/approvals?status=PENDENTE")
        assert resp_approvals.status_code == 200
        pending_list = resp_approvals.json()["pending"]
        target_approval = next(a for a in pending_list if a["request_id"] == req_high_id)

        # Decide aprovar
        resp_decide = client.post(
            f"/api/approvals/{target_approval['approval_id']}/decide",
            json={
                "decision": "APROVADA",
                "reviewer_name": "Diretora Helena",
                "justification": "Orçamento de infraestrutura aprovado para Q4.",
            },
        )
        assert resp_decide.status_code == 200
        decide_data = resp_decide.json()
        assert decide_data["request"]["status"] == "CONCLUIDA"

        # 3. Solicitação incompleta -> AGUARDANDO_INFORMACOES e complementação
        resp_inc = client.post(
            "/api/requests",
            json={
                "title": "Reembolso de despesa de viagem",
                "requester_name": "Pedro Alves",
                "requester_department": "Comercial",
                "source": "PORTAL_WEB",
                "raw_text": "Preciso pedir reembolso de uma despesa de viagem mas esqueci de informar o valor e o recibo.",
                "form_data": {"category_hint": "REEMBOLSO"},
            },
        )
        assert resp_inc.status_code == 200
        data_inc = resp_inc.json()
        assert data_inc["request"]["status"] == "AGUARDANDO_INFORMACOES"
        req_inc_id = data_inc["request"]["request_id"]

        # Complementa informações ausentes
        resp_comp = client.post(
            f"/api/requests/{req_inc_id}/complement",
            json={
                "additional_text": "O valor do táxi corporativo foi R$ 110,00 com comprovante NF-9012 para visita ao cliente.",
                "additional_form_data": {
                    "expense_type": "Transporte / Táxi Corporativo",
                    "amount": 110.00,
                    "receipt_id": "NF-9012",
                    "justification": "Deslocamento para reunião com cliente",
                },
                "actor": "Pedro Alves",
            },
        )
        assert resp_comp.status_code == 200
        comp_data = resp_comp.json()
        assert comp_data["request"]["status"] == "CONCLUIDA"


def test_api_agents_policies_evaluation_and_settings_security(tmp_path: Path):
    """Testa endpoints de agentes, políticas, Evaluation Lab, exportações e proteção de chaves de API."""
    runtime_state.db_path = str(tmp_path / "test_api_extra.db")
    runtime_state.operation_mode = "LOCAL"

    with TestClient(app) as client:
        # 1. Agentes
        resp_agents = client.get("/api/agents")
        assert resp_agents.status_code == 200
        agents_data = resp_agents.json()
        assert len(agents_data["agents"]) == 5

        # 2. Políticas
        resp_pol = client.get("/api/policies")
        assert resp_pol.status_code == 200
        policies = resp_pol.json()["rules"]
        assert any(p["rule_code"] == "RULE_PURCHASE_CRITICAL_CAP" for p in policies)

        # Atualiza uma política
        resp_upd_pol = client.put(
            "/api/policies/RULE_PURCHASE_LIMIT",
            json={
                "parameter_value": 3500.0,
                "is_active": True,
                "actor": "Tester Admin",
            },
        )
        assert resp_upd_pol.status_code == 200
        updated_rules = resp_upd_pol.json()["rules"]
        target_rule = next(r for r in updated_rules if r["rule_code"] == "RULE_PURCHASE_LIMIT")
        assert target_rule["parameter_value"] == 3500.0

        # 3. Configurações e segurança de chave de API (nunca exposta na resposta)
        fake_secret = "sk-proj-SUPERSECRETKEY999888777"
        resp_llm = client.put(
            "/api/settings/llm",
            json={
                "operation_mode": "LLM",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-mini",
                "api_key": fake_secret,
            },
        )
        assert resp_llm.status_code == 200
        assert fake_secret not in resp_llm.text
        assert resp_llm.json()["has_api_key_configured"] is True

        resp_settings = client.get("/api/settings")
        assert resp_settings.status_code == 200
        assert fake_secret not in resp_settings.text

        # Restaura modo LOCAL para o Evaluation Lab rodar determinístico e rápido
        client.put(
            "/api/settings/llm",
            json={
                "operation_mode": "LOCAL",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-mini",
                "clear_api_key": True,
            },
        )

        # 4. Evaluation Lab
        resp_eval = client.post("/api/evaluation/run")
        assert resp_eval.status_code == 200
        eval_latest = resp_eval.json()["latest"]
        assert eval_latest["total_cases"] == 32
        assert eval_latest["classification_accuracy_pct"] >= 90.0

        # 5. Exportações CSV e PDF
        resp_csv = client.get("/api/reports/export-csv")
        assert resp_csv.status_code == 200
        assert "text/csv" in resp_csv.headers["content-type"]

        resp_pdf = client.get("/api/reports/export-pdf")
        assert resp_pdf.status_code == 200
        assert "application/pdf" in resp_pdf.headers["content-type"]
        assert resp_pdf.content.startswith(b"%PDF")
