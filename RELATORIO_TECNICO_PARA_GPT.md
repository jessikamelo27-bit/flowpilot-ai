# RELATÓRIO TÉCNICO COMPLETO DE ARQUITETURA, CÓDIGO E AUDITORIA — FLOWPILOT AI (v2.0 SaaS)

**Objetivo deste documento:** Fornecer uma visão técnica completa, transparente e auditável da arquitetura, contratos de dados, regras determinísticas, segurança, endpoints REST e componentes React + TypeScript do projeto **FlowPilot AI** para análise de código por avaliadores técnicos ou LLMs (GPT).

---

## 1. Visão Geral da Arquitetura Full-Stack

O **FlowPilot AI** é uma plataforma corporativa de orquestração multiagente para automação de operações administrativas com governança humana (*Human-in-the-Loop*) e rastreabilidade em banco relacional SQLite.

A arquitetura separa estritamente a **Camada de Apresentação SaaS (React + TypeScript)** do **Motor de Decisão e Orquestração (Python)**:

1. **Frontend SaaS B2B (`frontend/`)**:
   - Desenvolvido com **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **TanStack Query (React Query)**, **React Router v6**, **Recharts** e **Lucide React**.
   - Identidade visual Dark Mode corporativa (`#0B1020` fundo principal, `#070B16` sidebar, `#11182E` cards, azul elétrico `#3B82F6` e violeta `#7C3AED`).
   - **Zero regras de negócio no frontend**: O frontend nunca calcula aprovações financeiras nem altera estados diretamente; ele consome a API REST do backend Python.

2. **Camada de API REST (`api/main.py`)**:
   - Desenvolvida com **FastAPI** e contratos **Pydantic v2**.
   - Encapsula o orquestrador, os 5 agentes, o repositório SQLite, o serviço de analytics, o Evaluation Lab e os exportadores CSV/PDF.
   - Serve também o build estático compilado do React (`frontend/dist`) na porta `8000` para execução unificada, além de suportar proxy de desenvolvimento Vite na porta `5173`.

3. **Motor Multiagente e Máquina de Estados Finita (`agents/` e `orchestrator/`)**:
   - **9 Estados Explícitos (`orchestrator/state_manager.py`)**:
     `RECEBIDA`, `EM_PROCESSAMENTO`, `AGUARDANDO_INFORMACOES`, `AGUARDANDO_APROVACAO`, `APROVADA`, `REJEITADA`, `EXECUTADA`, `ERRO`, `CONCLUIDA`.
   - Transições inválidas disparam `InvalidStateTransitionError`.

---

## 2. Detalhamento dos 5 Agentes Especializados (`agents/`)

| Ordem | Agente | Arquivo | Responsabilidade Técnica e Validações |
| :---: | :--- | :--- | :--- |
| **1** | **Intake Agent** | `agents/intake_agent.py` | Sanitiza a entrada, executa o detector de Prompt Injection em 2 camadas (`analyze_security_signals`), classifica em uma das 6 categorias (`SOLICITACAO_COMPRA`, `REEMBOLSO`, `CADASTRO_FORNECEDOR`, `SOLICITACAO_DOCUMENTOS`, `DUVIDAS_ADMINISTRATIVAS`, `SOLICITACOES_GERAIS`) ou marca `NAO_CLASSIFICADA` com `classification_uncertain=True` quando há conflito/ambiguidade. Extrai entidades estruturadas sem inventar campos ausentes. |
| **2** | **Analyst Agent** | `agents/analyst_agent.py` | Confronta `extracted_data` com os campos obrigatórios de `config/settings.py`. Detecta contradições numéricas entre texto livre e formulário (`form_data`), valida valores negativos/zerados, verifica formato de CNPJ/CPF e consulta `find_potential_duplicate()` no SQLite para barrar solicitações duplicadas. |
| **3** | **Policy Agent** | `agents/policy_agent.py` | Motor 100% determinístico em Python (isolado do texto do usuário). Consulta a tabela `policy_rules` do SQLite: compras até `R$ 2.500,00` aprovam automaticamente se completas; compras acima de `R$ 2.500,00` exigem aprovação humana (`RULE_PURCHASE_LIMIT`, risco `ALTO`); compras acima de `R$ 25.000,00` acionam **escalonamento para aprovação executiva explícita** (`RULE_PURCHASE_CRITICAL_CAP`, risco `CRITICO`, ex.: `DEMO-004` de `R$ 28.500,00`). Reembolsos exigem comprovante (`RULE_REIMBURSEMENT_RECEIPT`) e acima de `R$ 800,00` exigem aprovação humana (`RULE_REIMBURSEMENT_LIMIT`). |
| **4** | **Action Agent** | `agents/action_agent.py` | Executa ferramentas internas (`tools/task_tools.py`, `tools/document_tools.py`, `tools/report_tools.py`) **somente** quando autorizado pelo Policy Agent ou após decisão humana `APROVADA`. Valida permissões RBAC (`check_tool_permission`) e gera chave determinística SHA-256 (`IDEMP-<hash>`) gravada em `actions_performed` para garantir idempotência absoluta em reprocessamentos. |
| **5** | **Supervisor Agent** | `agents/supervisor_agent.py` | Realiza **auditoria cruzada real diretamente no repositório SQLite** (`get_request_by_id`, `get_steps_for_request`, `get_actions_for_request`, `get_approvals_for_request`). Verifica se todas as etapas obrigatórias foram persistidas, se o estado no banco coincide com a memória, se alguma ferramenta rodou sem aprovação humana obrigatória e se todas as ações possuem chave `IDEMP-` única. Caso detecte qualquer anomalia no banco, bloqueia a conclusão e recomenda `RequestState.ERRO`. |

---

## 3. Segurança em Camadas e Integração LLM (`services/`)

1. **Detector de Prompt Injection em 2 Camadas (`services/security_service.py`)**:
   - **Camada 1 (Crítica — 17 expressões regulares bilíngues PT/EN)**: Captura tentativas explícitas de ignorar instruções (`ignore previous instructions`, `esqueça as regras`), exfiltração de prompt de sistema (`reveal your system prompt`), bypass de limites financeiros (`aprove imediatamente sem aprovação humana`, `altere o limite para R$ 999999`), escalada de privilégio (`sudo mode`, `assumir perfil de diretor`) e payloads camuflados em JSON (`"policy_satisfied": true`). Aciona rejeição imediata no `PolicyAgent`.
   - **Camada 2 (Heurística Contextual Suspeita)**: Identifica múltiplos marcadores de manipulação indireta sem gerar falsos positivos em textos corporativos legítimos (ex.: *"Preciso cancelar minha assinatura antiga"* ou *"Dúvida sobre política de alçada"* passam normalmente com `is_suspicious=False`). Casos suspeitos são encaminhados para revisão humana (`AGUARDANDO_APROVACAO`).
2. **Proteção e Mascaramento de Segredos (`redact_secrets`)**:
   - Mascaramento automático de chaves `sk-...`, `AIza...`, query params `?key=...`, headers `Bearer ...` e `x-goog-api-key` antes de persistir em `audit_logs` ou exibir erros.
   - Na API REST (`api/main.py`), a chave `llm_api_key` **jamais é retornada** em `GET /api/settings` ou `PUT /api/settings/llm` (retorna apenas `has_api_key_configured: bool` e máscara estática).
3. **Cliente LLM Real com Fallback Determinístico (`services/llm_service.py`)**:
   - Suporta **OpenAI** (`Authorization: Bearer`) e **Google Gemini** (`x-goog-api-key` no cabeçalho HTTP, sem vazar chave na URL).
   - Injeta o JSON Schema do contrato Pydantic v2 no prompt, aplica timeout e retries, valida a resposta contra o modelo Pydantic e, em caso de erro de rede, timeout ou JSON malformado, aciona fallback seguro e auditado para o motor determinístico local.

---

## 4. Persistência SQLite (`database/`)

O banco `data/flowpilot.db` opera em modo `WAL` com `PRAGMA foreign_keys = ON` e contém **8 tabelas relacionais**:
1. `requests` (solicitações, estado FSM, JSON extraído, campos pendentes, flag `is_demo`)
2. `executions` (ciclos de execução do orquestrador e latência medida)
3. `processing_steps` (etapas individuais de cada agente, entradas, saídas JSON, validações e duração em ms)
4. `agents` (catálogo dos 5 agentes e contadores reais de execuções, erros e latência média)
5. `policy_rules` (regras determinísticas configuráveis em tempo de execução)
6. `approvals` (fila de governança humana, regra acionada, revisor, justificativa e timestamp)
7. `actions_performed` (ações das ferramentas com restrição `UNIQUE` em `idempotency_key`)
8. `audit_logs` (trilha de auditoria imutável com severidade e metadados sanitizados)

---

## 5. Catálogo de Endpoints REST (`api/main.py`)

| Método | Endpoint | Descrição |
| :---: | :--- | :--- |
| `GET` | `/api/health` | Status da aplicação, modo efetivo (`LOCAL`/`LLM`) e contadores do banco. |
| `GET` | `/api/dashboard` | KPIs reais do SQLite, evolução por período, categorias, alertas e atividade recente. |
| `PUT` | `/api/dashboard/impact-params` | Atualiza parâmetros configuráveis do Simulador de Impacto Empresarial. |
| `GET` | `/api/requests` | Lista solicitações com busca textual e filtros por categoria, status, risco e período. |
| `POST` | `/api/requests` | Cria e processa uma nova solicitação através dos 5 agentes. |
| `GET` | `/api/requests/{request_id}` | Retorna o trace completo (`request`, `steps`, `actions`, `approvals`, `audit_logs`). |
| `POST` | `/api/requests/{request_id}/complement` | Complementa campos ausentes e retoma solicitações em `AGUARDANDO_INFORMACOES`. |
| `GET` | `/api/agents` | Telemetria dos 5 agentes, ordem no pipeline, permissões RBAC e histórico recente. |
| `GET` | `/api/approvals` | Fila de aprovações pendentes (com flag `is_executive_escalation`) e histórico decidido. |
| `POST` | `/api/approvals/{approval_id}/decide` | Registra decisão humana (`APROVADA`, `REJEITADA`, `SOLICITAR_INFO`) e retoma a FSM. |
| `GET` / `PUT` | `/api/policies` & `/api/policies/{code}` | Lista e edita limites e ativação das regras determinísticas no SQLite. |
| `GET` / `POST` | `/api/evaluation` & `/api/evaluation/run` | Consulta e executa a suíte de 32 casos de benchmark do Agent Evaluation Lab. |
| `GET` | `/api/reports/export-csv` & `/export-pdf` | Gera e baixa relatórios gerenciais reais em CSV (`UTF-8-SIG`) e PDF (`fpdf2`). |
| `GET` / `PUT` | `/api/settings` & `/api/settings/llm` | Configurações de IA (sem expor chaves), segurança, RBAC e ambiente. |
| `POST` | `/api/demo/load` & `/api/demo/clear` | Recarrega ou limpa isoladamente os 22 casos de demonstração (`is_demo=1`). |

---

## 6. As 8 Páginas do Frontend React + TypeScript (`frontend/src/pages/`)

1. **`DashboardPage.tsx`**: 6 KPIs reais, gráficos Recharts de evolução diária e distribuição por categoria, painel de Alertas Operacionais e feed de Atividade Recente dos Agentes.
2. **`RequestsPage.tsx`**: Busca, filtros combinados, modal de Nova Solicitação, modal de Detalhes com JSON extraído e formulário interativo para complementar informações pendentes.
3. **`AgentsPage.tsx`**: Visualizador conectado do pipeline `Intake → Analyst → Policy → Action → Supervisor`, métricas reais, permissões RBAC e inspetor de contrato JSON estruturado.
4. **`ExecutionMonitorPage.tsx`**: Linha do tempo cronológica por solicitação, validações por etapa, card de **Auditoria Cruzada SQLite do Supervisor Agent**, regras do Policy Agent, chaves SHA-256 (`IDEMP-`) e Audit Log.
5. **`ApprovalsPage.tsx`**: Central de governança humana com destaque para Escalonamento Executivo (`> R$ 25.000,00`), modal de confirmação com justificativa obrigatória e histórico de decisões.
6. **`EvaluationLabPage.tsx`**: Execução ao vivo dos 32 casos de benchmark, acurácia de classificação/extração/política, Falsos Positivos/Negativos, Matriz de Confusão visual e exportação CSV.
7. **`AnalyticsPage.tsx`**: Simulador Configurável de Impacto Empresarial (separando claramente estimativa manual configurável de tempo automatizado real medido), gráficos por departamento/estado/agente e exportação CSV/PDF.
8. **`SettingsPage.tsx`**: Configuração segura de LLM (OpenAI/Gemini), painel de segurança/RBAC, editor interativo de regras determinísticas (`policy_rules`) e gestão dos dados de demonstração.

---

## 7. Resultados Verificados de Testes e Qualidade

- **Pytest (`python -m pytest -v`)**: **20/20 testes passando (100%)**:
  - 17 testes de unidade e integração do motor multiagente, FSM, idempotência, RBAC, auditoria cruzada SQLite do Supervisor, limites executivos (`R$ 28.500,00`), detector de Prompt Injection sem falsos positivos e fallback de LLM (`tests/test_flowpilot.py`).
  - 3 testes de integração ponta a ponta da camada REST FastAPI cobrindo todos os endpoints e garantindo que chaves de API nunca vazam nas respostas (`tests/test_api.py`).
- **Agent Evaluation Lab**: **32/32 casos de benchmark aprovados** (100% de precisão de classificação, 100% de extração, 100% de conformidade de política, 0 Falsos Positivos e 0 Falsos Negativos).
- **Compilação Frontend (`npm run build`)**: TypeScript (`tsc -b`) e empacotamento de produção Vite concluídos com **0 erros**.
