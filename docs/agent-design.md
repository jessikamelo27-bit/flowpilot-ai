# Design dos Agentes Especializados — FlowPilot AI

Cada agente do **FlowPilot AI** possui responsabilidade única (Single Responsibility Principle), contrato de saída validado por **Pydantic v2** e separação estrita entre instruções de sistema e dados não confiáveis do usuário.

---

## 1. AGENTE 1 — Intake Agent ([`agents/intake_agent.py`](../agents/intake_agent.py))
- **Responsabilidade**: Receber textos livres e metadados de formulários, inspecionar sinais de segurança em duas camadas (`critical_flags` e `suspicious_flags`), registrar o motivo detalhado de cada alerta (`security_alert_reasons`), classificar na categoria correta e extrair entidades estruturadas preservando o texto original para auditoria.
- **Contrato de Saída (`IntakeResult`)**:
  - `category`: `SOLICITACAO_COMPRA`, `REEMBOLSO`, `CADASTRO_FORNECEDOR`, `SOLICITACAO_DOCUMENTOS`, `DUVIDAS_ADMINISTRATIVAS`, `SOLICITACOES_GERAIS` ou `NAO_CLASSIFICADA`.
  - `confidence`: Score numérico entre `0.0` e `1.0`.
  - `classification_uncertain`: Booleano acionado quando a mensagem é ambígua, possui baixa confiança (`< 0.60`) ou apresenta sinais suspeitos que exigem revisão humana.
  - `extracted_data`: Dicionário de entidades identificadas (`amount`, `item`, `receipt_id`, `tax_id`, `contact_email`, `justification`, `purpose`, além de `security_alert_reasons` quando aplicável).
  - `missing_mandatory_fields`: Lista determinística de campos exigidos para a categoria que não foram informados.

## 2. AGENTE 2 — Analyst Agent ([`agents/analyst_agent.py`](../agents/analyst_agent.py))
- **Responsabilidade**: Auditar a qualidade dos dados extraídos sem jamais inventar campos ausentes.
- **Validações Realizadas**:
  - Conferência de completude dos campos obrigatórios.
  - Detecção de valores numéricos inválidos ou negativos.
  - Detecção de **contradições** (ex: formulário declara `R$ 450,00` e o texto pede `R$ 3.800,00`, ou texto diz "gratuito / sem custo" mas cobra valor positivo).
  - Detecção de **duplicidade** consultando solicitações ativas do mesmo solicitante no SQLite.
  - Validação estrutural de CNPJ (14 dígitos não repetidos) e formato de e-mail para fornecedores.
- **Contrato de Saída (`AnalystResult`)**: `is_complete`, `missing_fields`, `inconsistencies`, `contradictions`, `is_duplicate`, `requires_clarification`, `executive_summary`.

## 3. AGENTE 3 — Policy Agent ([`agents/policy_agent.py`](../agents/policy_agent.py))
- **Responsabilidade**: Avaliar as regras administrativas cadastradas na tabela `policy_rules` através de um **Motor Determinístico em Python**, isolado do modelo de linguagem.
- **Regras Determinísticas Padrão e Escalonamento Financeiro**:
  1. `RULE_SECURITY_PROMPT_INJECTION`: Bloqueia e rejeita imediatamente qualquer tentativa crítica de Prompt Injection (`CRITICO`).
  2. `RULE_CONTRADICTION_OR_DUPLICATE_REJECT`: Rejeita solicitações contraditórias, com CNPJ/valores inválidos ou duplicadas (`ALTO`).
  3. `RULE_INCOMPLETE_BLOCK`: Pausa solicitações incompletas em `AGUARDANDO_INFORMACOES` e encaminha solicitações ambíguas ou com sinais suspeitos para revisão humana.
  4. `RULE_PURCHASE_LIMIT` (`R$ 2.500,00`): Compras de até `R$ 2.500,00` seguem aprovação automática; compras acima de `R$ 2.500,00` e até `R$ 25.000,00` exigem aprovação humana de governança (`ALTO`).
  5. `RULE_PURCHASE_CRITICAL_CAP` (`R$ 25.000,00`): **Limite de Escalonamento para Aprovação Executiva** (não é um bloqueio proibitivo absoluto). Compras acima de `R$ 25.000,00` (como `DEMO-004` de `R$ 28.500,00`) são escalonadas com risco `CRITICO` para aprovação executiva explícita na Central de Aprovações, e nenhuma ferramenta é executada sem essa autorização.
  6. `RULE_REIMBURSEMENT_RECEIPT` & `RULE_REIMBURSEMENT_LIMIT`: Exige comprovante fiscal em todos os reembolsos e aprovação humana acima de `R$ 800,00`.
  7. `RULE_SUPPLIER_MANDATORY_KYC`: Exige aprovação humana de compliance para homologação de novos fornecedores.

## 4. AGENTE 4 — Action Agent ([`agents/action_agent.py`](../agents/action_agent.py))
- **Responsabilidade**: Executar as ferramentas internas somente para solicitações aprovadas.
- **Guardrails de Pré-Execução**: Lança `PermissionError` imediato se `should_reject=True`, `requires_more_info=True` ou se `requires_human_approval=True` sem que haja autorização humana registrada.
- **Ferramentas Acionadas**: `create_internal_task`, `organize_pending_items`, `generate_summary_document`, `generate_formal_response`, `prepare_notification_draft`, `generate_processing_report`.

## 5. AGENTE 5 — Supervisor Agent ([`agents/supervisor_agent.py`](../agents/supervisor_agent.py))
- **Responsabilidade**: Realizar **auditoria cruzada real consultando o repositório SQLite** antes de consolidar o estado final.
- **Verificações Persistidas no Banco de Dados**:
  - Consulta diretamente `requests`, `processing_steps`, `actions_performed` e `approvals` no SQLite.
  - Confere se todas as etapas obrigatórias (`intake_agent`, `analyst_agent`, `policy_agent` e, quando aplicável, `action_agent`) foram gravadas com status `SUCESSO`.
  - Verifica se os dados em memória correspondem exatamente aos JSONs persistidos no banco.
  - Verifica se existem divergências entre `requests.status` e o histórico de execução.
  - Bloqueia a conclusão (transicionando para `ERRO`) caso identifique ferramentas executadas antes da aprovação humana obrigatória, ações sem chave de idempotência válida (`IDEMP-...`), ações duplicadas ou falhas de contenção de alertas críticos de segurança.
