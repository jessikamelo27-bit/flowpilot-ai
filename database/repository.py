"""
Repositório de Dados (Repository Pattern) para o FlowPilot AI.

Explicação didática:
O Repository Pattern separa completamente as consultas SQL da lógica dos agentes e da interface gráfica.
Se no futuro a empresa migrar do SQLite para PostgreSQL, basta atualizar este arquivo — os 5 agentes,
o orquestrador e as telas do Streamlit continuam funcionando sem alterações.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from database.connection import get_db_connection, init_database
from database.models import RequestSubmission, RequestState


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FlowPilotRepository:
    """Camada de persistência unificada para todas as entidades do FlowPilot AI."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path
        init_database(self.db_path)

    # =========================================================================
    # 1. SOLICITAÇÕES ADMINISTRATIVAS (REQUESTS)
    # =========================================================================
    def create_request(
        self,
        submission: RequestSubmission,
        request_id: Optional[str] = None,
        created_at_override: Optional[str] = None,
    ) -> str:
        req_id = request_id or f"REQ-{uuid.uuid4().hex[:8].upper()}"
        now = created_at_override or utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO requests (
                    request_id, title, requester_name, requester_department,
                    raw_text, form_data_json, source, status, is_demo,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    req_id,
                    submission.title,
                    submission.requester_name,
                    submission.requester_department,
                    submission.raw_text,
                    json.dumps(submission.form_data, ensure_ascii=False),
                    submission.source,
                    RequestState.RECEBIDA.value,
                    1 if submission.is_demo else 0,
                    now,
                    now,
                ),
            )
        self.log_audit(
            request_id=req_id,
            actor=submission.requester_name,
            event_type="REQUEST_CREATED",
            severity="INFO",
            description=f"Solicitação '{submission.title}' registrada com estado RECEBIDA.",
            metadata={"source": submission.source, "is_demo": submission.is_demo},
        )
        return req_id

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM requests WHERE request_id = ?", (request_id,)
            ).fetchone()
            if not row:
                return None
            return self._deserialize_request_row(dict(row))

    def list_requests(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        search_query: Optional[str] = None,
        include_demo: bool = True,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM requests WHERE 1=1"
        params: List[Any] = []
        if not include_demo:
            query += " AND is_demo = 0"
        if category and category != "TODAS":
            query += " AND category = ?"
            params.append(category)
        if status and status != "TODOS":
            query += " AND status = ?"
            params.append(status)
        if search_query:
            q = f"%{search_query.strip()}%"
            query += " AND (request_id LIKE ? OR title LIKE ? OR requester_name LIKE ? OR raw_text LIKE ?)"
            params.extend([q, q, q, q])
        query += " ORDER BY created_at DESC"

        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._deserialize_request_row(dict(r)) for r in rows]

    def update_request_fields(self, request_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = utc_now_iso()
        columns = []
        values = []
        for k, v in fields.items():
            if k in ("form_data", "extracted_data", "missing_fields"):
                col_name = f"{k}_json"
                val = json.dumps(v, ensure_ascii=False)
            else:
                col_name = k
                val = v
            columns.append(f"{col_name} = ?")
            values.append(val)
        values.append(request_id)
        sql = f"UPDATE requests SET {', '.join(columns)} WHERE request_id = ?"
        with get_db_connection(self.db_path) as conn:
            conn.execute(sql, values)

    def find_potential_duplicate(
        self,
        current_request_id: str,
        requester_name: str,
        title: str,
        raw_text: str,
    ) -> Optional[str]:
        """Verifica se já existe uma solicitação ativa idêntica ou quase idêntica do mesmo solicitante."""
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT request_id, title, raw_text, status
                FROM requests
                WHERE request_id != ?
                  AND LOWER(requester_name) = LOWER(?)
                  AND status NOT IN ('REJEITADA', 'ERRO')
                ORDER BY created_at DESC
                """,
                (current_request_id, requester_name.strip()),
            ).fetchall()
            norm_title = title.strip().lower()
            norm_text = " ".join(raw_text.strip().lower().split())
            for r in rows:
                other_title = str(r["title"]).strip().lower()
                other_text = " ".join(str(r["raw_text"]).strip().lower().split())
                if norm_text == other_text or (
                    len(norm_title) > 12 and norm_title == other_title and norm_text[:60] == other_text[:60]
                ):
                    return str(r["request_id"])
        return None

    def _deserialize_request_row(self, data: Dict[str, Any]) -> Dict[str, Any]:
        for json_col, target_col in [
            ("form_data_json", "form_data"),
            ("extracted_data_json", "extracted_data"),
            ("missing_fields_json", "missing_fields"),
        ]:
            raw_val = data.get(json_col, "{}")
            try:
                data[target_col] = json.loads(raw_val) if raw_val else {}
            except Exception:
                data[target_col] = {}
        return data

    # =========================================================================
    # 2. EXECUÇÕES E ETAPAS DO PROCESSAMENTO (EXECUTIONS & STEPS)
    # =========================================================================
    def start_execution(self, request_id: str, operation_mode: str) -> str:
        exec_id = f"EXEC-{uuid.uuid4().hex[:8].upper()}"
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO executions (execution_id, request_id, operation_mode, status, started_at)
                VALUES (?, ?, ?, 'EM_ANDAMENTO', ?)
                """,
                (exec_id, request_id, operation_mode, now),
            )
        return exec_id

    def finish_execution(
        self,
        execution_id: str,
        status: str,
        total_duration_ms: float,
        error_message: Optional[str] = None,
    ) -> None:
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE executions
                SET status = ?, finished_at = ?, total_duration_ms = ?, error_message = ?
                WHERE execution_id = ?
                """,
                (status, now, round(total_duration_ms, 2), error_message, execution_id),
            )

    def record_processing_step(
        self,
        execution_id: str,
        request_id: str,
        step_order: int,
        agent_id: str,
        agent_name: str,
        responsibility: str,
        status: str,
        operation_mode: str,
        input_summary: str,
        output_data: Dict[str, Any],
        validations: List[str],
        decision_summary: str,
        next_stage: str,
        duration_ms: float,
    ) -> str:
        step_id = f"STEP-{uuid.uuid4().hex[:8].upper()}"
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO processing_steps (
                    step_id, execution_id, request_id, step_order,
                    agent_id, agent_name, responsibility, status,
                    operation_mode, input_summary, output_json,
                    validations_json, decision_summary, next_stage,
                    duration_ms, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    step_id,
                    execution_id,
                    request_id,
                    step_order,
                    agent_id,
                    agent_name,
                    responsibility,
                    status,
                    operation_mode,
                    input_summary,
                    json.dumps(output_data, ensure_ascii=False),
                    json.dumps(validations, ensure_ascii=False),
                    decision_summary,
                    next_stage,
                    round(duration_ms, 2),
                    now,
                ),
            )
            # Atualiza métricas reais do Agente na tabela `agents`
            agent_row = conn.execute(
                "SELECT total_executions, total_errors, avg_duration_ms FROM agents WHERE agent_id = ?",
                (agent_id,),
            ).fetchone()
            if agent_row:
                prev_execs = int(agent_row["total_executions"])
                prev_errs = int(agent_row["total_errors"])
                prev_avg = float(agent_row["avg_duration_ms"])
                new_execs = prev_execs + 1
                new_errs = prev_errs + (1 if status == "ERRO" else 0)
                new_avg = ((prev_avg * prev_execs) + duration_ms) / new_execs
                conn.execute(
                    """
                    UPDATE agents
                    SET total_executions = ?, total_errors = ?, avg_duration_ms = ?, last_execution_at = ?
                    WHERE agent_id = ?
                    """,
                    (new_execs, new_errs, round(new_avg, 2), now, agent_id),
                )
        return step_id

    def get_steps_for_request(self, request_id: str) -> List[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM processing_steps
                WHERE request_id = ?
                ORDER BY created_at ASC, step_order ASC
                """,
                (request_id,),
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                try:
                    d["output"] = json.loads(d.get("output_json", "{}"))
                except Exception:
                    d["output"] = {}
                try:
                    d["validations"] = json.loads(d.get("validations_json", "[]"))
                except Exception:
                    d["validations"] = []
                result.append(d)
            return result

    def get_steps_for_agent(self, agent_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT ps.*, r.title as request_title, r.category as request_category
                FROM processing_steps ps
                JOIN requests r ON ps.request_id = r.request_id
                WHERE ps.agent_id = ?
                ORDER BY ps.created_at DESC
                LIMIT ?
                """,
                (agent_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    # =========================================================================
    # 3. AGENTES E REGRAS DE POLÍTICA (AGENTS & POLICY RULES)
    # =========================================================================
    def list_agents(self) -> List[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM agents ORDER BY rowid ASC").fetchall()
            return [dict(r) for r in rows]

    def list_policy_rules(self, active_only: bool = False) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM policy_rules"
        if active_only:
            sql += " WHERE is_active = 1"
        sql += " ORDER BY rowid ASC"
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(sql).fetchall()
            return [dict(r) for r in rows]

    def update_policy_rule(
        self,
        rule_code: str,
        parameter_value: float,
        is_active: bool = True,
        actor: str = "Admin",
    ) -> None:
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE policy_rules
                SET parameter_value = ?, is_active = ?, updated_at = ?
                WHERE rule_code = ?
                """,
                (parameter_value, 1 if is_active else 0, now, rule_code),
            )
        self.log_audit(
            request_id=None,
            actor=actor,
            event_type="POLICY_RULE_UPDATED",
            severity="WARNING",
            description=f"Regra {rule_code} atualizada: valor={parameter_value}, ativa={is_active}",
            metadata={"rule_code": rule_code, "parameter_value": parameter_value, "is_active": is_active},
        )

    # =========================================================================
    # 4. APROVAÇÕES HUMANAS (APPROVALS)
    # =========================================================================
    def create_approval_request(
        self,
        request_id: str,
        rule_triggered: str,
        risk_level: str,
    ) -> str:
        # Evita criar aprovação pendente duplicada para a mesma solicitação
        with get_db_connection(self.db_path) as conn:
            existing = conn.execute(
                "SELECT approval_id FROM approvals WHERE request_id = ? AND status = 'PENDENTE'",
                (request_id,),
            ).fetchone()
            if existing:
                return str(existing["approval_id"])

            app_id = f"APR-{uuid.uuid4().hex[:8].upper()}"
            now = utc_now_iso()
            conn.execute(
                """
                INSERT INTO approvals (
                    approval_id, request_id, rule_triggered,
                    risk_level, status, requested_at
                )
                VALUES (?, ?, ?, ?, 'PENDENTE', ?)
                """,
                (app_id, request_id, rule_triggered, risk_level, now),
            )
        return app_id

    def list_approvals(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = """
            SELECT a.*, r.title, r.requester_name, r.requester_department,
                   r.category, r.raw_text, r.extracted_data_json, r.status as request_status
            FROM approvals a
            JOIN requests r ON a.request_id = r.request_id
        """
        params: List[Any] = []
        if status_filter and status_filter != "TODOS":
            sql += " WHERE a.status = ?"
            params.append(status_filter)
        sql += " ORDER BY a.requested_at DESC"
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(sql, params).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                try:
                    d["extracted_data"] = json.loads(d.get("extracted_data_json", "{}"))
                except Exception:
                    d["extracted_data"] = {}
                result.append(d)
            return result

    def get_approvals_for_request(self, request_id: str) -> List[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM approvals WHERE request_id = ? ORDER BY requested_at DESC",
                (request_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def decide_approval(
        self,
        approval_id: str,
        decision: str,  # "APROVADA", "REJEITADA", "SOLICITAR_INFO"
        reviewer_name: str,
        justification: str,
    ) -> Optional[str]:
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT request_id FROM approvals WHERE approval_id = ?",
                (approval_id,),
            ).fetchone()
            if not row:
                return None
            request_id = str(row["request_id"])
            conn.execute(
                """
                UPDATE approvals
                SET status = ?, reviewer_name = ?, decision_justification = ?, decided_at = ?
                WHERE approval_id = ?
                """,
                (decision, reviewer_name.strip(), justification.strip(), now, approval_id),
            )
        self.log_audit(
            request_id=request_id,
            actor=reviewer_name,
            event_type=f"HUMAN_APPROVAL_{decision}",
            severity="INFO" if decision == "APROVADA" else "WARNING",
            description=f"Revisão humana ({decision}) por {reviewer_name}: {justification}",
            metadata={"approval_id": approval_id, "decision": decision},
        )
        return request_id

    # =========================================================================
    # 5. AÇÕES REALIZADAS E IDEMPOTÊNCIA (ACTIONS PERFORMED)
    # =========================================================================
    def get_action_by_idempotency_key(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM actions_performed WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            try:
                d["payload"] = json.loads(d.get("payload_json", "{}"))
            except Exception:
                d["payload"] = {}
            return d

    def record_action(
        self,
        request_id: str,
        agent_id: str,
        tool_name: str,
        action_type: str,
        idempotency_key: str,
        status: str,
        output_summary: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = self.get_action_by_idempotency_key(idempotency_key)
        if existing:
            return {
                "action_id": existing["action_id"],
                "tool_name": existing["tool_name"],
                "action_type": existing["action_type"],
                "idempotency_key": idempotency_key,
                "status": "SKIPPED_IDEMPOTENT",
                "output_summary": f"[IDEMPOTENTE - JÁ EXECUTADO] {existing['output_summary']}",
                "payload": existing.get("payload", {}),
            }

        act_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"
        now = utc_now_iso()
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO actions_performed (
                    action_id, request_id, agent_id, tool_name,
                    action_type, idempotency_key, status,
                    output_summary, payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    act_id,
                    request_id,
                    agent_id,
                    tool_name,
                    action_type,
                    idempotency_key,
                    status,
                    output_summary,
                    json.dumps(payload, ensure_ascii=False),
                    now,
                ),
            )
        return {
            "action_id": act_id,
            "tool_name": tool_name,
            "action_type": action_type,
            "idempotency_key": idempotency_key,
            "status": status,
            "output_summary": output_summary,
            "payload": payload,
        }

    def list_actions_for_request(self, request_id: str) -> List[Dict[str, Any]]:
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM actions_performed WHERE request_id = ? ORDER BY created_at ASC",
                (request_id,),
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                try:
                    d["payload"] = json.loads(d.get("payload_json", "{}"))
                except Exception:
                    d["payload"] = {}
                result.append(d)
            return result

    # =========================================================================
    # 6. AUDITORIA E GERENCIAMENTO DE DADOS DE DEMONSTRAÇÃO
    # =========================================================================
    def log_audit(
        self,
        request_id: Optional[str],
        actor: str,
        event_type: str,
        severity: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        from services.security_service import mask_sensitive_data

        audit_id = f"AUD-{uuid.uuid4().hex[:8].upper()}"
        now = utc_now_iso()
        safe_desc = mask_sensitive_data(description)
        safe_meta = mask_sensitive_data(json.dumps(metadata or {}, ensure_ascii=False))
        with get_db_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (
                    audit_id, request_id, actor, event_type,
                    severity, description, metadata_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (audit_id, request_id, actor, event_type, severity, safe_desc, safe_meta, now),
            )
        return audit_id

    def list_audit_logs(
        self, request_id: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM audit_logs"
        params: List[Any] = []
        if request_id:
            sql += " WHERE request_id = ?"
            params.append(request_id)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with get_db_connection(self.db_path) as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    def clear_demo_data(self) -> int:
        """
        Remove exclusivamente solicitações marcadas com `is_demo = 1` e recalcula
        as estatísticas dos agentes com base nos registros reais remanescentes.
        """
        with get_db_connection(self.db_path) as conn:
            demo_rows = conn.execute(
                "SELECT request_id FROM requests WHERE is_demo = 1"
            ).fetchall()
            demo_ids = [str(r["request_id"]) for r in demo_rows]
            if not demo_ids:
                return 0

            placeholders = ",".join(["?"] * len(demo_ids))
            conn.execute(
                f"DELETE FROM audit_logs WHERE request_id IN ({placeholders})", demo_ids
            )
            conn.execute("DELETE FROM requests WHERE is_demo = 1")

            # Recalcula métricas exatas dos agentes com base nas etapas restantes no banco
            agents = conn.execute("SELECT agent_id FROM agents").fetchall()
            for ag in agents:
                ag_id = str(ag["agent_id"])
                stats = conn.execute(
                    """
                    SELECT COUNT(*) as cnt,
                           SUM(CASE WHEN status = 'ERRO' THEN 1 ELSE 0 END) as errs,
                           AVG(duration_ms) as avg_ms,
                           MAX(created_at) as last_dt
                    FROM processing_steps
                    WHERE agent_id = ?
                    """,
                    (ag_id,),
                ).fetchone()
                cnt = int(stats["cnt"] or 0)
                errs = int(stats["errs"] or 0)
                avg_ms = round(float(stats["avg_ms"] or 0.0), 2)
                last_dt = stats["last_dt"]
                conn.execute(
                    """
                    UPDATE agents
                    SET total_executions = ?, total_errors = ?, avg_duration_ms = ?, last_execution_at = ?
                    WHERE agent_id = ?
                    """,
                    (cnt, errs, avg_ms, last_dt, ag_id),
                )
        self.log_audit(
            request_id=None,
            actor="Sistema",
            event_type="DEMO_DATA_CLEARED",
            severity="INFO",
            description=f"Removidas {len(demo_ids)} solicitações de demonstração sem afetar registros reais.",
            metadata={"deleted_count": len(demo_ids)},
        )
        return len(demo_ids)
