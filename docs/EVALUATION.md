# Metodologia de Avaliação & Resultados / Evaluation Methodology & Benchmark Results — FlowPilot AI

> 🌐 **Idioma / Language:** [🇧🇷 Português](#-português-br) | [🇺🇸 English](#-english)

---

# 🇧🇷 Português (BR)

## 1. Propósito do Agent Evaluation Lab
A engenharia de sistemas multiagentes exige avaliação automatizada e reproduzível (*Evals*). O módulo [`services/evaluation_service.py`](../services/evaluation_service.py) provisiona um banco de dados SQLite temporário isolado, executa **32 casos de benchmark estruturados** através do pipeline completo de 5 agentes do [`FlowPilotOrchestrator`](../orchestrator/workflow.py) e calcula métricas reais de precisão e segurança contra o gabarito esperado (*Ground Truth*).

> **Nota Metodológica**: O benchmark de 32 casos é uma suíte de testes sintéticos preparada especificamente para validar a classificação, extração, conformidade de políticas e guardrails de segurança deste projeto. Não deve ser interpretado como comprovação empírica de desempenho em bases de produção externas.

---

## 2. Composição da Suíte de Benchmark (32 Casos de Teste)

| Grupo de Cenário | IDs dos Casos | Qtd | Objetivo de Validação | Estado Final Esperado |
| :--- | :--- | :---: | :--- | :--- |
| **1. Automação Direta** | `EVAL-01` – `EVAL-08`, `EVAL-31`, `EVAL-32` | 10 | Classificação, extração de entidades e execução idempotente das 6 ferramentas internas dentro da alçada automática. | `CONCLUIDA` |
| **2. Solicitações Incompletas** | `EVAL-09` – `EVAL-12` | 4 | Detecção de campos obrigatórios ausentes sem alucinar dados faltantes. | `AGUARDANDO_INFORMACOES` |
| **3. Alto Valor & Escalonamento Executivo** | `EVAL-13` – `EVAL-15`, `EVAL-18` | 4 | Aplicação dos limites de compra (`> R$ 2.500` e `> R$ 25.000` executivo) e reembolso (`> R$ 800`). | `AGUARDANDO_APROVACAO` |
| **4. Compliance de Fornecedores (KYC)** | `EVAL-16`, `EVAL-17` | 2 | Aprovação humana obrigatória de compliance para novos fornecedores com CNPJ e e-mail válidos. | `AGUARDANDO_APROVACAO` |
| **5. Solicitações Ambíguas** | `EVAL-19` – `EVAL-21` | 3 | Detecção de incerteza semântica (`classification_uncertain=True`) e escalonamento seguro para revisão humana. | `AGUARDANDO_APROVACAO` |
| **6. Dados Contraditórios / Inválidos** | `EVAL-22` – `EVAL-25` | 4 | Detecção de divergência de valor entre texto e formulário, valores negativos e CNPJ inválido. | `REJEITADA` |
| **7. Submissões Duplicadas** | `EVAL-26`, `EVAL-27` | 2 | Bloqueio de solicitações ativas idênticas enviadas pelo mesmo solicitante. | `REJEITADA` |
| **8. Ataques de Prompt Injection** | `EVAL-28` – `EVAL-30` | 3 | Detecção e rejeição imediata de ataques de descarte de instruções e bypass de políticas. | `REJEITADA` |

---

## 3. Resultados Verificados (Modo Determinístico Local)
Todas as métricas abaixo são calculadas dinamicamente ao executar `EvaluationService.run_evaluation_suite()` ou `pytest`:

- **Total de Casos de Benchmark Executados**: `32`
- **Precisão de Classificação (`classification_accuracy_pct`)**: `100.0%` (`32/32`)
- **Precisão de Extração de Entidades (`extraction_accuracy_pct`)**: `100.0%` (`32/32`)
- **Conformidade de Decisão de Política (`policy_compliance_pct`)**: `100.0%` (`32/32`)
- **Falsos Positivos (`false_positives`)**: `0` (Zero solicitações inseguras aprovadas)
- **Falsos Negativos (`false_negatives`)**: `0` (Zero solicitações legítimas rejeitadas indevidamente)

---

## 4. Suíte Automatizada Pytest (`tests/`)
Além dos 32 casos do Evaluation Lab, o repositório inclui **20 testes automatizados em Pytest**:
- [`tests/test_flowpilot.py`](../tests/test_flowpilot.py) (**17 testes**): Testes de unidade e integração cobrindo os 5 agentes, alçadas financeiras (`R$ 2.500`, `R$ 25.000` e `R$ 28.500`), bloqueio de transições inválidas na FSM, aprovação humana, idempotência SHA-256, RBAC, auditoria cruzada real no SQLite pelo `SupervisorAgent`, Prompt Injection sem falsos positivos, fallback de LLM e exportação CSV/PDF.
- [`tests/test_api.py`](../tests/test_api.py) (**3 testes ponta a ponta da API REST**): Testes com `TestClient` do FastAPI validando saúde, métricas do dashboard, ciclo completo de solicitações, decisão humana, complementação de dados ausentes, atualização de políticas, execução do Evaluation Lab, downloads CSV/PDF e garantia de que chaves de API nunca são expostas nas respostas HTTP.

---
---

# 🇺🇸 English

## 1. Purpose of the Agent Evaluation Lab
Reliable AI engineering requires reproducible, automated evaluation (*Evals*). The module [`services/evaluation_service.py`](../services/evaluation_service.py) provisions an isolated temporary SQLite database, runs **32 structured benchmark cases** through the full [`FlowPilotOrchestrator`](../orchestrator/workflow.py) 5-agent pipeline, and computes real accuracy and safety metrics against expected ground truth.

> **Methodological Note**: The 32-case benchmark is a synthetic test suite specifically designed to validate this project's classification, extraction, policy compliance, and security guardrails. It is not a claim of empirical performance on external production datasets.

---

## 2. Verified Results (Deterministic Local Mode)
- **Total Benchmark Cases Executed**: `32`
- **Classification Accuracy (`classification_accuracy_pct`)**: `100.0%` (`32/32`)
- **Entity Extraction Accuracy (`extraction_accuracy_pct`)**: `100.0%` (`32/32`)
- **Policy Decision Compliance (`policy_compliance_pct`)**: `100.0%` (`32/32`)
- **False Positives (`false_positives`)**: `0`
- **False Negatives (`false_negatives`)**: `0`
- **Automated Pytest Suite (`python -m pytest -v`)**: **20 / 20 tests passing (100%)** (`17` core multi-agent/FSM/security tests + `3` end-to-end FastAPI integration tests).
