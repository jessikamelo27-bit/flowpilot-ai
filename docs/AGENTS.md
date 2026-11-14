# Multi-Agent Specification & Contracts — FlowPilot AI

Each agent in **FlowPilot AI** follows the Single Responsibility Principle, produces a strict **Pydantic v2** output contract, and isolates untrusted user data from system instructions.

---

## 1. Agent 1 — Intake Agent ([`agents/intake_agent.py`](../agents/intake_agent.py))
- **Responsibility**: Receive unstructured text and form metadata, inspect two-layer security signals (`critical_flags` and `suspicious_flags`), record detailed alert reasons (`security_alert_reasons`), classify the request into one of the supported categories, and extract structured entities into JSON while preserving the original text for auditability.
- **Supported Categories**:
  - `SOLICITACAO_COMPRA` (Purchase Request)
  - `REEMBOLSO` (Expense Reimbursement)
  - `CADASTRO_FORNECEDOR` (Supplier Onboarding)
  - `SOLICITACAO_DOCUMENTOS` (Document Request)
  - `DUVIDAS_ADMINISTRATIVAS` (Administrative Inquiry)
  - `SOLICITACOES_GERAIS` (General Request)
  - `NAO_CLASSIFICADA` (Unclassified / Ambiguous)
- **Output Contract (`IntakeResult`)**:
  - `category`, `intent_summary`, `confidence` (`0.0` to `1.0`), `classification_uncertain` (`bool`), `suggested_priority`, `extracted_data` (`dict`), `missing_mandatory_fields` (`list[str]`), `prompt_injection_detected` (`bool`), `execution_mode`.

---

## 2. Agent 2 — Analyst Agent ([`agents/analyst_agent.py`](../agents/analyst_agent.py))
- **Responsibility**: Validate completeness, consistency, numerical validity, and uniqueness without hallucinating or inventing missing fields.
- **Validations Performed**:
  - Cross-checks extracted fields against mandatory category fields defined in `config/settings.py`.
  - Detects numerical contradictions between free text and structured form fields (e.g., form states `R$ 450.00` while text requests `R$ 3,800.00`, or text claims "free of charge" while requesting a positive amount).
  - Validates tax IDs (CNPJ 14 digits / CPF 11 digits) and corporate email formatting for supplier onboarding.
  - Queries SQLite (`find_potential_duplicate`) to detect active duplicate requests from the same requester.
- **Output Contract (`AnalystResult`)**:
  - `is_complete`, `missing_fields`, `inconsistencies`, `contradictions`, `is_duplicate`, `duplicate_of_request_id`, `requires_clarification`, `clarification_questions`, `executive_summary`.

---

## 3. Agent 3 — Policy Agent ([`agents/policy_agent.py`](../agents/policy_agent.py))
- **Responsibility**: Enforce deterministic corporate governance rules stored in the SQLite `policy_rules` table. User text can never override or mutate these rules.
- **Core Deterministic Rules**:
  1. `RULE_SECURITY_PROMPT_INJECTION`: Immediately blocks and rejects requests with critical Prompt Injection flags (`CRITICO`).
  2. `RULE_CONTRADICTION_OR_DUPLICATE_REJECT`: Rejects requests containing contradictions, invalid tax IDs/amounts, or duplicate submissions (`ALTO`).
  3. `RULE_INCOMPLETE_BLOCK`: Places incomplete requests in `AGUARDANDO_INFORMACOES` and routes ambiguous or suspicious requests (`classification_uncertain=True`) to human review (`AGUARDANDO_APROVACAO`).
  4. `RULE_PURCHASE_LIMIT` (`R$ 2,500.00`): Purchases up to `R$ 2,500.00` are eligible for direct automation; purchases above `R$ 2,500.00` up to `R$ 25,000.00` require human approval (`ALTO`).
  5. `RULE_PURCHASE_CRITICAL_CAP` (`R$ 25,000.00`): **Executive Approval Escalation Threshold** (not a blind rejection). Purchases exceeding `R$ 25,000.00` (such as `DEMO-004` at `R$ 28,500.00`) are escalated with `CRITICO` risk to require explicit executive approval in the Approvals Center before any tool can execute.
  6. `RULE_REIMBURSEMENT_RECEIPT` & `RULE_REIMBURSEMENT_LIMIT` (`R$ 800.00`): Requires fiscal receipt reference on all reimbursements and human approval above `R$ 800.00`.
  7. `RULE_SUPPLIER_MANDATORY_KYC`: Requires human compliance approval for all supplier registrations.
- **Output Contract (`PolicyResult`)**:
  - `policy_satisfied`, `risk_level`, `triggered_rules`, `requires_human_approval`, `should_reject`, `requires_more_info`, `rejection_reason`, `policy_explanation`.

---

## 4. Agent 4 — Action Agent ([`agents/action_agent.py`](../agents/action_agent.py))
- **Responsibility**: Execute internal operational tools only for authorized requests.
- **Pre-Execution Guardrails**: Raises `PermissionError` if `should_reject=True`, `requires_more_info=True`, or if `requires_human_approval=True` without a verified `APROVADA` human decision.
- **Idempotency & RBAC**: Verifies `AGENT_TOOL_PERMISSIONS` and computes a deterministic SHA-256 key (`IDEMP-<hash>`) per `(request_id, tool_name, action_type)`. If an action was already executed, the existing record is returned without duplicating side effects.
- **Simulated Safe External Side Effects**: External notifications, ERP orders, and emails are generated as structured drafts/records in SQLite (`SIMULATED_SAFE`).

---

## 5. Agent 5 — Supervisor Agent ([`agents/supervisor_agent.py`](../agents/supervisor_agent.py))
- **Responsibility**: Perform a real **database cross-audit against SQLite** prior to finalizing the request state.
- **SQLite Cross-Checks**:
  - Queries `requests`, `processing_steps`, `actions_performed`, and `approvals` directly from `FlowPilotRepository`.
  - Verifies that all mandatory prior stages (`intake_agent`, `analyst_agent`, `policy_agent`, and `action_agent` when executed) were persisted with `SUCESSO`.
  - Confirms that in-memory agent outputs match the persisted JSON payloads in SQLite.
  - Verifies that no tool in `actions_performed` ran without a corresponding `APROVADA` record in `approvals` when human approval was required.
  - Verifies that every executed action has a valid `IDEMP-` key and that no duplicate tool actions exist.
  - Blocks completion and transitions the request to `RequestState.ERRO` if any discrepancy is found.
