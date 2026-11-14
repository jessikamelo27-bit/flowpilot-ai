"""
AGENTE 3 — POLICY AGENT
Responsabilidade: Verificar as regras administrativas cadastradas.
Implementa um MOTOR DE REGRAS DETERMINÍSTICO em Python/SQLite totalmente separado do LLM.
A IA pode apenas redigir uma explicação amigável das regras avaliadas, mas a decisão de
conformidade (`compliant`, `requires_human_approval`, `should_reject`, `requires_more_info`, `risk_level`)
é 100% determinada pelo motor determinístico e NUNCA pode ser sobrescrita por um modelo de linguagem.
"""
from typing import Any, Dict, List, Optional, Tuple
from database.models import (
    AnalystResult,
    IntakeResult,
    OperationMode,
    PolicyResult,
    PolicyRuleViolation,
    RequestCategory,
    RiskLevel,
)
from database.repository import FlowPilotRepository
from services.llm_service import LLMCallMetadata, LLMService


class PolicyAgent:
    """Agente 3: Motor Determinístico de Políticas Empresariais e Alçadas."""

    agent_id = "policy_agent"
    agent_name = "Policy Agent"
    responsibility = (
        "Verificar regras administrativas determinísticas, alçadas financeiras, "
        "bloqueios de segurança e conformidade documental."
    )

    def __init__(
        self,
        repository: FlowPilotRepository,
        llm_service: Optional[LLMService] = None,
    ) -> None:
        self.repo = repository
        self.llm = llm_service or LLMService()

    def process(
        self,
        intake_result: IntakeResult,
        analyst_result: AnalystResult,
    ) -> Tuple[PolicyResult, LLMCallMetadata]:
        # 1. Executa SEMPRE o motor determinístico primeiro
        deterministic_result = self._evaluate_deterministic_rules(intake_result, analyst_result)

        # 2. Mesmo quando o Modo LLM está ativo, os campos booleanos de decisão e as regras avaliadas
        # vêm exclusivamente do motor determinístico; o LLM jamais pode alterar a decisão de política.
        meta = LLMCallMetadata(
            mode_used=OperationMode.LOCAL,
            provider="deterministic_policy_engine",
            model="rules-v1",
            attempts=1,
            latency_ms=0.5,
        )
        return deterministic_result, meta

    def _evaluate_deterministic_rules(
        self,
        intake: IntakeResult,
        analyst: AnalystResult,
    ) -> PolicyResult:
        active_rules_db = {
            r["rule_code"]: r for r in self.repo.list_policy_rules(active_only=True)
        }
        evaluated: List[PolicyRuleViolation] = []
        should_reject = False
        requires_approval = False
        requires_more_info = False
        highest_risk = RiskLevel.BAIXO

        def escalate_risk(new_risk: RiskLevel) -> None:
            nonlocal highest_risk
            order = [RiskLevel.BAIXO, RiskLevel.MEDIO, RiskLevel.ALTO, RiskLevel.CRITICO]
            if order.index(new_risk) > order.index(highest_risk):
                highest_risk = new_risk

        # REGRA 1: Segurança contra Prompt Injection / Manipulação de Políticas
        if "RULE_SECURITY_PROMPT_INJECTION" in active_rules_db:
            has_injection = len(intake.security_flags) > 0
            evaluated.append(
                PolicyRuleViolation(
                    rule_code="RULE_SECURITY_PROMPT_INJECTION",
                    rule_name=active_rules_db["RULE_SECURITY_PROMPT_INJECTION"]["rule_name"],
                    passed=not has_injection,
                    action_required="REJECT" if has_injection else "ALLOW",
                    reason=(
                        f"Detectada tentativa de manipulação/Prompt Injection ({', '.join(intake.security_flags)})."
                        if has_injection
                        else "Nenhuma tentativa de manipulação detectada."
                    ),
                )
            )
            if has_injection:
                should_reject = True
                escalate_risk(RiskLevel.CRITICO)

        # REGRA 2: Contradições Graves, Valores Inválidos ou Duplicidade
        if "RULE_CONTRADICTION_OR_DUPLICATE_REJECT" in active_rules_db:
            has_contradiction_or_dup = (
                len(analyst.contradictions) > 0
                or analyst.is_duplicate
                or len(analyst.inconsistencies) > 0
            )
            reasons_c = []
            if analyst.is_duplicate:
                reasons_c.append(f"Duplicada da solicitação {analyst.duplicate_of_request_id}")
            if analyst.contradictions:
                reasons_c.extend(analyst.contradictions)
            if analyst.inconsistencies:
                reasons_c.extend(analyst.inconsistencies)

            evaluated.append(
                PolicyRuleViolation(
                    rule_code="RULE_CONTRADICTION_OR_DUPLICATE_REJECT",
                    rule_name=active_rules_db["RULE_CONTRADICTION_OR_DUPLICATE_REJECT"]["rule_name"],
                    passed=not has_contradiction_or_dup,
                    action_required="REJECT" if has_contradiction_or_dup else "ALLOW",
                    reason="; ".join(reasons_c)
                    if has_contradiction_or_dup
                    else "Dados consistentes e sem duplicidade.",
                )
            )
            if has_contradiction_or_dup:
                should_reject = True
                escalate_risk(RiskLevel.ALTO)

        # REGRA 3: Solicitações Incompletas, Não Classificadas ou com Sinais Suspeitos de Segurança
        if "RULE_INCOMPLETE_BLOCK" in active_rules_db and not should_reject:
            incomplete = (not analyst.is_complete) or intake.classification_uncertain
            suspicious_flags = intake.extracted_data.get("suspicious_security_flags", [])
            if intake.classification_uncertain:
                susp_msg = (
                    f" Sinais suspeitos detectados ({', '.join(suspicious_flags)})."
                    if suspicious_flags
                    else ""
                )
                # Encaminha casos incertos/ambíguos ou suspeitos para revisão humana
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_INCOMPLETE_BLOCK",
                        rule_name="Encaminhamento de Solicitação Ambígua / Suspeita para Revisão Humana",
                        passed=False,
                        action_required="REQUIRE_APPROVAL",
                        reason=(
                            f"Classificação incerta ou requer revisão (confiança {int(intake.confidence * 100)}%)."
                            f"{susp_msg} Encaminhada para análise humana."
                        ),
                    )
                )
                requires_approval = True
                escalate_risk(RiskLevel.ALTO if suspicious_flags else RiskLevel.MEDIO)
            else:
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_INCOMPLETE_BLOCK",
                        rule_name=active_rules_db["RULE_INCOMPLETE_BLOCK"]["rule_name"],
                        passed=not incomplete,
                        action_required="HOLD_FOR_INFO" if incomplete else "ALLOW",
                        reason=(
                            f"Campos obrigatórios ausentes: {', '.join(analyst.missing_fields)}."
                            if incomplete
                            else "Todos os campos obrigatórios foram informados."
                        ),
                    )
                )
                if incomplete:
                    requires_more_info = True
                    escalate_risk(RiskLevel.MEDIO)

        # REGRA 4: Alçada de Compras (Até R$ 2.500: automática | > R$ 2.500 até R$ 25.000: aprovação padrão | > R$ 25.000: aprovação executiva explícita)
        if intake.category == RequestCategory.SOLICITACAO_COMPRA and not should_reject:
            amount = float(intake.extracted_data.get("amount") or 0.0)
            if "RULE_PURCHASE_LIMIT" in active_rules_db:
                limit_val = float(active_rules_db["RULE_PURCHASE_LIMIT"]["parameter_value"] or 2500.0)
                exceeds = amount > limit_val
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_PURCHASE_LIMIT",
                        rule_name=active_rules_db["RULE_PURCHASE_LIMIT"]["rule_name"],
                        passed=not exceeds,
                        action_required="REQUIRE_APPROVAL" if exceeds else "ALLOW",
                        reason=(
                            f"Valor da compra (R$ {amount:,.2f}) excede o limite de aprovação automática (R$ {limit_val:,.2f})."
                            if exceeds
                            else f"Valor da compra (R$ {amount:,.2f}) dentro da alçada automática (<= R$ {limit_val:,.2f})."
                        ),
                    )
                )
                if exceeds:
                    requires_approval = True
                    escalate_risk(RiskLevel.ALTO)

            if "RULE_PURCHASE_CRITICAL_CAP" in active_rules_db and amount > 0:
                cap_val = float(active_rules_db["RULE_PURCHASE_CRITICAL_CAP"]["parameter_value"] or 25000.0)
                exceeds_cap = amount > cap_val
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_PURCHASE_CRITICAL_CAP",
                        rule_name=active_rules_db["RULE_PURCHASE_CRITICAL_CAP"]["rule_name"],
                        passed=not exceeds_cap,
                        action_required="REQUIRE_APPROVAL" if exceeds_cap else "ALLOW",
                        reason=(
                            f"Compra acima do limite crítico (R$ {amount:,.2f} > R$ {cap_val:,.2f}): "
                            "escalonada para aprovação executiva explícita obrigatória."
                            if exceeds_cap
                            else f"Valor da compra (R$ {amount:,.2f}) não exige escalonamento executivo (<= R$ {cap_val:,.2f})."
                        ),
                    )
                )
                if exceeds_cap:
                    requires_approval = True
                    escalate_risk(RiskLevel.CRITICO)

        # REGRA 5: Reembolsos (Comprovante e Limite)
        if intake.category == RequestCategory.REEMBOLSO and not should_reject:
            amount = float(intake.extracted_data.get("amount") or 0.0)
            has_receipt = bool(intake.extracted_data.get("receipt_id"))
            has_just = bool(intake.extracted_data.get("justification"))
            if "RULE_REIMBURSEMENT_RECEIPT" in active_rules_db:
                ok_doc = has_receipt and has_just
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_REIMBURSEMENT_RECEIPT",
                        rule_name=active_rules_db["RULE_REIMBURSEMENT_RECEIPT"]["rule_name"],
                        passed=ok_doc,
                        action_required="ALLOW" if ok_doc else "HOLD_FOR_INFO",
                        reason=(
                            "Comprovante e justificativa verificados."
                            if ok_doc
                            else "Reembolso sem comprovante fiscal ou justificativa válida."
                        ),
                    )
                )
                if not ok_doc:
                    requires_more_info = True
                    escalate_risk(RiskLevel.MEDIO)

            if "RULE_REIMBURSEMENT_LIMIT" in active_rules_db and amount > 0:
                reimb_limit = float(
                    active_rules_db["RULE_REIMBURSEMENT_LIMIT"]["parameter_value"] or 800.0
                )
                exceeds_reimb = amount > reimb_limit
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_REIMBURSEMENT_LIMIT",
                        rule_name=active_rules_db["RULE_REIMBURSEMENT_LIMIT"]["rule_name"],
                        passed=not exceeds_reimb,
                        action_required="REQUIRE_APPROVAL" if exceeds_reimb else "ALLOW",
                        reason=(
                            f"Reembolso de R$ {amount:,.2f} excede o teto automático (R$ {reimb_limit:,.2f})."
                            if exceeds_reimb
                            else f"Reembolso de R$ {amount:,.2f} dentro do teto automático (<= R$ {reimb_limit:,.2f})."
                        ),
                    )
                )
                if exceeds_reimb:
                    requires_approval = True
                    escalate_risk(RiskLevel.ALTO)

        # REGRA 6: Cadastro de Fornecedor (Compliance / Homologação Humana)
        if (
            intake.category == RequestCategory.CADASTRO_FORNECEDOR
            and not should_reject
            and not requires_more_info
        ):
            if "RULE_SUPPLIER_MANDATORY_KYC" in active_rules_db:
                need_sup_approval = (
                    float(active_rules_db["RULE_SUPPLIER_MANDATORY_KYC"]["parameter_value"] or 1.0)
                    >= 1.0
                )
                evaluated.append(
                    PolicyRuleViolation(
                        rule_code="RULE_SUPPLIER_MANDATORY_KYC",
                        rule_name=active_rules_db["RULE_SUPPLIER_MANDATORY_KYC"]["rule_name"],
                        passed=not need_sup_approval,
                        action_required="REQUIRE_APPROVAL" if need_sup_approval else "ALLOW",
                        reason=(
                            "Homologação de novo fornecedor exige aprovação humana de compliance."
                            if need_sup_approval
                            else "Cadastro de fornecedor liberado."
                        ),
                    )
                )
                if need_sup_approval:
                    requires_approval = True
                    escalate_risk(RiskLevel.ALTO)

        compliant = (not should_reject) and (not requires_more_info)
        failed_reasons = [r.reason for r in evaluated if not r.passed]
        if should_reject:
            explanation = "REJEITADO PELO MOTOR DE POLÍTICAS: " + " | ".join(failed_reasons)
        elif requires_more_info:
            explanation = "AGUARDANDO COMPLEMENTAÇÃO DE DADOS: " + " | ".join(failed_reasons)
        elif requires_approval:
            explanation = "ENCAMINHADO PARA APROVAÇÃO HUMANA: " + " | ".join(failed_reasons)
        else:
            explanation = (
                "CONFORME: Todas as regras administrativas determinísticas foram atendidas "
                "para execução automatizada."
            )

        return PolicyResult(
            compliant=compliant,
            requires_human_approval=requires_approval and (not should_reject) and (not requires_more_info),
            should_reject=should_reject,
            requires_more_info=requires_more_info and (not should_reject),
            risk_level=highest_risk,
            evaluated_rules=evaluated,
            policy_explanation=explanation,
            deterministic_engine_verified=True,
            execution_mode=OperationMode.LOCAL,
        )
