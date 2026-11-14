# Evaluation Methodology & Benchmark Results — FlowPilot AI

## 1. Purpose of the Agent Evaluation Lab
Reliable AI engineering requires reproducible, automated evaluation (*Evals*). The module [`services/evaluation_service.py`](../services/evaluation_service.py) provisions an isolated temporary SQLite database, runs **32 structured benchmark cases** through the full [`FlowPilotOrchestrator`](../orchestrator/workflow.py) 5-agent pipeline, and computes real accuracy and safety metrics against expected ground truth.

> **Methodological Note**: The 32-case benchmark is a synthetic test suite specifically designed to validate this project's classification, extraction, policy compliance, and security guardrails. It is not a claim of empirical performance on external production datasets.

---

## 2. Benchmark Suite Composition (32 Test Cases)

| Scenario Group | Case IDs | Count | Validation Objective | Expected Final State |
| :--- | :--- | :---: | :--- | :--- |
| **1. Direct Automation** | `EVAL-01` – `EVAL-08`, `EVAL-31`, `EVAL-32` | 10 | Classification, entity extraction, and idempotent execution of all 6 internal tools within auto-approval limits. | `CONCLUIDA` |
| **2. Incomplete Requests** | `EVAL-09` – `EVAL-12` | 4 | Detection of missing mandatory fields without hallucinating absent values. | `AGUARDANDO_INFORMACOES` |
| **3. High-Value & Executive Escalation** | `EVAL-13` – `EVAL-15`, `EVAL-18` | 4 | Enforcement of purchase limits (`> R$ 2,500` and `> R$ 25,000` executive escalation) and reimbursement limits (`> R$ 800`). | `AGUARDANDO_APROVACAO` |
| **4. Supplier Compliance (KYC)** | `EVAL-16`, `EVAL-17` | 2 | Mandatory human compliance approval for supplier onboarding with valid CNPJ and email. | `AGUARDANDO_APROVACAO` |
| **5. Ambiguous Requests** | `EVAL-19` – `EVAL-21` | 3 | Semantic uncertainty detection (`classification_uncertain=True`) and safe escalation to human review. | `AGUARDANDO_APROVACAO` |
| **6. Contradictory / Invalid Data** | `EVAL-22` – `EVAL-25` | 4 | Detection of text-vs-form amount divergence, negative values, and invalid tax IDs. | `REJEITADA` |
| **7. Duplicate Submissions** | `EVAL-26`, `EVAL-27` | 2 | Blocking identical active requests submitted by the same requester. | `REJEITADA` |
| **8. Prompt Injection Attacks** | `EVAL-28` – `EVAL-30` | 3 | Immediate detection and rejection of instruction override and policy bypass attacks. | `REJEITADA` |

---

## 3. Verified Results (Deterministic Local Mode)
All metrics below are dynamically calculated when running `EvaluationService.run_evaluation_suite()` or `pytest`:

- **Total Benchmark Cases Executed**: `32`
- **Classification Accuracy (`classification_accuracy_pct`)**: `100.0%` (`32/32`)
- **Entity Extraction Accuracy (`extraction_accuracy_pct`)**: `100.0%` (`32/32`)
- **Policy Decision Compliance (`policy_compliance_pct`)**: `100.0%` (`32/32`)
- **False Positives (`false_positives`)**: `0` (Zero unsafe requests approved)
- **False Negatives (`false_negatives`)**: `0` (Zero valid requests erroneously rejected)

---

## 4. Automated Pytest Suite (`tests/`)
In addition to the 32-case Evaluation Lab, the repository includes **20 automated Pytest tests** across two test modules:
- [`tests/test_flowpilot.py`](../tests/test_flowpilot.py) (**17 tests**): Unit and integration tests covering `IntakeAgent`, `AnalystAgent`, `PolicyAgent` (including `R$ 2,500`, `R$ 25,000`, and `R$ 28,500` executive escalation), `StateManager` invalid transition blocking, human approval resumption, SHA-256 idempotency, RBAC enforcement, `SupervisorAgent` real SQLite cross-audit (detecting unapproved actions, missing steps, and missing idempotency keys), expanded Prompt Injection patterns with zero false positives on legitimate text, LLM timeout/invalid JSON fallback, and CSV/PDF export.
- [`tests/test_api.py`](../tests/test_api.py) (**3 end-to-end API tests**): FastAPI `TestClient` tests validating health, dashboard metrics, request creation, human approval decision, missing info complementation, policy updates, Evaluation Lab execution, CSV/PDF downloads, and verifying that API keys are never exposed in HTTP responses.

Run the complete test suite with:
```bash
python -m pytest -v
```
