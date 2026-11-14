# Especificação dos Agentes & Contratos / Multi-Agent Specification & Contracts — FlowPilot AI

> 🌐 **Idioma / Language:** [🇧🇷 Português](#-português-br) | [🇺🇸 English](#-english)

---

# 🇧🇷 Português (BR)

Cada agente do **FlowPilot AI** segue o Princípio da Responsabilidade Única (*Single Responsibility Principle*), produz um contrato de saída validado por **Pydantic v2** e isola dados não confiáveis do usuário das instruções de sistema.

## 1. Agente 1 — Intake Agent ([`agents/intake_agent.py`](../agents/intake_agent.py))
- **Responsabilidade**: Receber textos livres e metadados de formulários, inspecionar sinais de segurança em duas camadas (`critical_flags` e `suspicious_flags`), registrar o motivo detalhado de cada alerta (`security_alert_reasons`), classificar na categoria correta e extrair entidades estruturadas em JSON preservando o texto original para auditoria.
- **Categorias Suportadas**:
  - `SOLICITACAO_COMPRA` (Solicitação de Compra)
  - `REEMBOLSO` (Reembolso de Despesas)
  - `CADASTRO_FORNECEDOR` (Cadastro de Fornecedor)
  - `SOLICITACAO_DOCUMENTOS` (Solicitação de Documentos)
  - `DUVIDAS_ADMINISTRATIVAS` (Dúvidas Administrativas)
  - `SOLICITACOES_GERAIS` (Solicitações Gerais)
  - `NAO_CLASSIFICADA` (Não Classificada / Ambígua)
- **Contrato de Saída (`IntakeResult`)**: `category`, `intent_summary`, `confidence` (`0.0` a `1.0`), `classification_uncertain` (`bool`), `suggested_priority`, `extracted_data` (`dict`), `missing_mandatory_fields` (`list[str]`), `prompt_injection_detected` (`bool`), `execution_mode`.

## 2. Agente 2 — Analyst Agent ([`agents/analyst_agent.py`](../agents/analyst_agent.py))
- **Responsabilidade**: Auditar completude, consistência, validade numérica e unicidade sem alucinar nem inventar campos ausentes.
- **Validações Realizadas**:
  - Confronta os campos extraídos com os campos obrigatórios definidos em `config/settings.py`.
  - Detecta contradições numéricas entre texto livre e formulário (ex.: formulário declara `R$ 450,00` e o texto pede `R$ 3.800,00`, ou o texto afirma "gratuito / sem custo" mas cobra valor positivo).
  - Valida CNPJ (14 dígitos) / CPF (11 dígitos) e formato de e-mail corporativo para fornecedores.
  - Consulta o SQLite (`find_potential_duplicate`) para barrar solicitações ativas duplicadas do mesmo solicitante.
- **Contrato de Saída (`AnalystResult`)**: `is_complete`, `missing_fields`, `inconsistencies`, `contradictions`, `is_duplicate`, `duplicate_of_request_id`, `requires_clarification`, `clarification_questions`, `executive_summary`.

## 3. Agente 3 — Policy Agent ([`agents/policy_agent.py`](../agents/policy_agent.py))
- **Responsabilidade**: Aplicar regras determinísticas de governança corporativa armazenadas na tabela `policy_rules` do SQLite. O texto do usuário jamais consegue sobrescrever ou alterar essas regras.
- **Regras Determinísticas Principais**:
  1. `RULE_SECURITY_PROMPT_INJECTION`: Bloqueia e rejeita imediatamente solicitações com flags críticos de Prompt Injection (`CRITICO`).
  2. `RULE_CONTRADICTION_OR_DUPLICATE_REJECT`: Rejeita solicitações contraditórias, com CNPJ/valores inválidos ou duplicadas (`ALTO`).
  3. `RULE_INCOMPLETE_BLOCK`: Pausa solicitações incompletas em `AGUARDANDO_INFORMACOES` e encaminha solicitações ambíguas ou suspeitas (`classification_uncertain=True`) para revisão humana (`AGUARDANDO_APROVACAO`).
  4. `RULE_PURCHASE_LIMIT` (`R$ 2.500,00`): Compras de até `R$ 2.500,00` seguem automação direta; compras acima de `R$ 2.500,00` até `R$ 25.000,00` exigem aprovação humana (`ALTO`).
  5. `RULE_PURCHASE_CRITICAL_CAP` (`R$ 25.000,00`): **Limite de Escalonamento para Aprovação Executiva** (não é rejeição cega). Compras acima de `R$ 25.000,00` (como `DEMO-004` de `R$ 28.500,00`) são escalonadas com risco `CRITICO` para exigir aprovação executiva explícita na Central de Aprovações antes da execução de qualquer ferramenta.
  6. `RULE_REIMBURSEMENT_RECEIPT` & `RULE_REIMBURSEMENT_LIMIT` (`R$ 800,00`): Exige comprovante fiscal em todos os reembolsos e aprovação humana acima de `R$ 800,00`.
  7. `RULE_SUPPLIER_MANDATORY_KYC`: Exige aprovação humana de compliance para cadastro de novos fornecedores.

## 4. Agente 4 — Action Agent ([`agents/action_agent.py`](../agents/action_agent.py))
- **Responsabilidade**: Executar as ferramentas operacionais internas somente para solicitações autorizadas.
- **Guardrails de Pré-Execução**: Lança `PermissionError` se `should_reject=True`, `requires_more_info=True` ou se `requires_human_approval=True` sem decisão humana `APROVADA` verificada.
- **Idempotência & RBAC**: Verifica `AGENT_TOOL_PERMISSIONS` e calcula uma chave determinística SHA-256 (`IDEMP-<hash>`) por `(request_id, tool_name, action_type)`.
- **Simulação Segura de Efeitos Externos**: Notificações externas, ordens de ERP e e-mails são gerados como rascunhos/registros estruturados no SQLite (`SIMULATED_SAFE`).

## 5. Agente 5 — Supervisor Agent ([`agents/supervisor_agent.py`](../agents/supervisor_agent.py))
- **Responsabilidade**: Realizar **auditoria cruzada real diretamente no SQLite** antes de consolidar o estado final da solicitação.
- **Verificações no Banco SQLite**:
  - Consulta `requests`, `processing_steps`, `actions_performed` e `approvals` diretamente pelo `FlowPilotRepository`.
  - Confere se todas as etapas anteriores obrigatórias foram gravadas com `SUCESSO`.
  - Confirma se as saídas em memória coincidem com os payloads JSON persistidos no SQLite.
  - Verifica se nenhuma ferramenta em `actions_performed` rodou sem o respectivo registro `APROVADA` em `approvals` quando aprovação humana era obrigatória.
  - Verifica se todas as ações executadas possuem chave `IDEMP-` válida e sem duplicidade, bloqueando a conclusão (`RequestState.ERRO`) caso encontre qualquer inconsistência.

---
---

# 🇺🇸 English

Each agent in **FlowPilot AI** follows the Single Responsibility Principle, produces a strict **Pydantic v2** output contract, and isolates untrusted user data from system instructions.

## 1. Agent 1 — Intake Agent ([`agents/intake_agent.py`](../agents/intake_agent.py))
- **Responsibility**: Receive unstructured text and form metadata, inspect two-layer security signals (`critical_flags` and `suspicious_flags`), record detailed alert reasons (`security_alert_reasons`), classify the request into one of the supported categories, and extract structured entities into JSON while preserving the original text for auditability.
- **Output Contract (`IntakeResult`)**: `category`, `intent_summary`, `confidence` (`0.0` to `1.0`), `classification_uncertain` (`bool`), `suggested_priority`, `extracted_data` (`dict`), `missing_mandatory_fields` (`list[str]`), `prompt_injection_detected` (`bool`), `execution_mode`.

## 2. Agent 2 — Analyst Agent ([`agents/analyst_agent.py`](../agents/analyst_agent.py))
- **Responsibility**: Validate completeness, consistency, numerical validity, and uniqueness without hallucinating or inventing missing fields.
- **Output Contract (`AnalystResult`)**: `is_complete`, `missing_fields`, `inconsistencies`, `contradictions`, `is_duplicate`, `duplicate_of_request_id`, `requires_clarification`, `clarification_questions`, `executive_summary`.

## 3. Agent 3 — Policy Agent ([`agents/policy_agent.py`](../agents/policy_agent.py))
- **Responsibility**: Enforce deterministic corporate governance rules stored in the SQLite `policy_rules` table (`RULE_SECURITY_PROMPT_INJECTION`, `RULE_CONTRADICTION_OR_DUPLICATE_REJECT`, `RULE_INCOMPLETE_BLOCK`, `RULE_PURCHASE_LIMIT` at `R$ 2,500`, `RULE_PURCHASE_CRITICAL_CAP` executive escalation at `R$ 25,000`, `RULE_REIMBURSEMENT_RECEIPT`, `RULE_REIMBURSEMENT_LIMIT` at `R$ 800`, `RULE_SUPPLIER_MANDATORY_KYC`).
- **Output Contract (`PolicyResult`)**: `policy_satisfied`, `risk_level`, `triggered_rules`, `requires_human_approval`, `should_reject`, `requires_more_info`, `rejection_reason`, `policy_explanation`.

## 4. Agent 4 — Action Agent ([`agents/action_agent.py`](../agents/action_agent.py))
- **Responsibility**: Execute internal operational tools only for authorized requests, enforcing `AGENT_TOOL_PERMISSIONS` (RBAC) and deterministic SHA-256 idempotency keys (`IDEMP-<hash>`). External side effects are safely simulated (`SIMULATED_SAFE`).

## 5. Agent 5 — Supervisor Agent ([`agents/supervisor_agent.py`](../agents/supervisor_agent.py))
- **Responsibility**: Perform a real **database cross-audit against SQLite** (`requests`, `processing_steps`, `actions_performed`, `approvals`) prior to finalizing the request state, blocking completion (`RequestState.ERRO`) if any discrepancy is detected.
