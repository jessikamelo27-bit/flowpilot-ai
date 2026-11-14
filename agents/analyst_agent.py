"""
AGENTE 2 — ANALYST AGENT
Responsabilidade: Analisar e validar as informações recebidas do Intake Agent.
Deve conferir campos obrigatórios, identificar inconsistências, detectar duplicidades,
identificar valores incompatíveis ou contraditórios, solicitar complementação quando
necessário e gerar um resumo objetivo sem inventar informações ausentes.
"""
import json
import re
from typing import Optional, Tuple
from database.models import (
    AnalystResult,
    IntakeResult,
    OperationMode,
    RequestCategory,
    RequestSubmission,
)
from database.repository import FlowPilotRepository
from services.llm_service import LLMCallMetadata, LLMService
from services.security_service import wrap_untrusted_user_data


ANALYST_SYSTEM_PROMPT = """
Você é o ANALYST AGENT do sistema FlowPilot AI.
Sua responsabilidade é auditar a completude e a consistência dos dados extraídos pelo Intake Agent.
REGRAS ESTRITAS:
1. NUNCA preencha nem invente dados que estejam na lista `missing_mandatory_fields`.
2. Aponte contradições quando o texto mencionar valores/quantidades diferentes do formulário ou múltiplos totais conflitantes.
3. Gere um `executive_summary` objetivo relatando apenas o que consta comprovadamente na solicitação.
"""


class AnalystAgent:
    """Agente 2: Validação de Completude, Consistência, Contradições e Duplicidade."""

    agent_id = "analyst_agent"
    agent_name = "Analyst Agent"
    responsibility = (
        "Conferir campos obrigatórios, detectar inconsistências, duplicidades e contradições, "
        "solicitar complementação quando necessário e gerar resumo objetivo."
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
        request_id: str,
        submission: RequestSubmission,
        intake_result: IntakeResult,
    ) -> Tuple[AnalystResult, LLMCallMetadata]:
        dup_id = self.repo.find_potential_duplicate(
            current_request_id=request_id,
            requester_name=submission.requester_name,
            title=submission.title,
            raw_text=submission.raw_text,
        )

        def local_logic() -> AnalystResult:
            return self._deterministic_analysis(submission, intake_result, dup_id)

        payload = wrap_untrusted_user_data(
            submission.raw_text,
            {
                "form_data": submission.form_data,
                "intake_extracted": intake_result.extracted_data,
                "intake_missing": intake_result.missing_mandatory_fields,
                "duplicate_of": dup_id,
            },
        )
        result, meta = self.llm.execute_structured(
            system_prompt=ANALYST_SYSTEM_PROMPT,
            untrusted_user_payload=payload,
            response_model=AnalystResult,
            local_deterministic_fn=local_logic,
        )

        # Garantias determinísticas pós-LLM: não permite que o LLM ignore campos ausentes ou duplicidades reais
        det = self._deterministic_analysis(submission, intake_result, dup_id)
        if not det.is_complete:
            result.is_complete = False
            result.missing_fields = det.missing_fields
        for inc in det.inconsistencies:
            if inc not in result.inconsistencies:
                result.inconsistencies.append(inc)
        for cont in det.contradictions:
            if cont not in result.contradictions:
                result.contradictions.append(cont)
        if det.is_duplicate:
            result.is_duplicate = True
            result.duplicate_of_request_id = det.duplicate_of_request_id
        if det.requires_clarification:
            result.requires_clarification = True
            if not result.clarification_message:
                result.clarification_message = det.clarification_message

        return result, meta

    def _deterministic_analysis(
        self,
        submission: RequestSubmission,
        intake: IntakeResult,
        duplicate_id: Optional[str],
    ) -> AnalystResult:
        missing = list(intake.missing_mandatory_fields)
        inconsistencies = []
        contradictions = []
        data = intake.extracted_data

        # 1. Validação de Valores Numéricos
        amount = data.get("amount")
        if amount is not None:
            try:
                val = float(amount)
                if val <= 0:
                    inconsistencies.append(
                        f"Valor monetário inválido ou não positivo (R$ {val:.2f})."
                    )
            except (ValueError, TypeError):
                inconsistencies.append(f"Formato numérico inválido para o campo valor: '{amount}'.")

        # 2. Detecção de Contradições (Formulário vs Texto ou múltiplos valores conflitantes)
        form_amount = submission.form_data.get("amount")
        text_amount = data.get("text_amount")
        if form_amount is not None and text_amount is not None:
            try:
                if abs(float(form_amount) - float(text_amount)) >= 1.0:
                    contradictions.append(
                        f"Contradição entre valor do formulário (R$ {float(form_amount):.2f}) "
                        f"e valor citado no texto (R$ {float(text_amount):.2f})."
                    )
            except (ValueError, TypeError):
                pass

        multi_amounts = data.get("detected_Amounts_in_text")
        if isinstance(multi_amounts, list) and len(set(multi_amounts)) > 1:
            # Verifica se o texto menciona explícita contradição (ex: "valor total R$ 500 ... total de R$ 5000")
            txt_l = submission.raw_text.lower()
            if any(
                kw in txt_l
                for kw in ["mas o total", "porém o valor", "na nota consta", "diferente de", "total de r$"]
            ):
                contradictions.append(
                    f"Múltiplos valores monetários conflitantes detectados no texto: {multi_amounts}."
                )

        # Contradição semântica: pede reembolso dizendo que não teve gasto ou pede compra gratuita com valor alto
        txt_lower = submission.raw_text.lower()
        if "sem custo" in txt_lower or "gratuito" in txt_lower or "custo zero" in txt_lower:
            if amount is not None and float(amount) > 0:
                contradictions.append(
                    f"Texto afirma que o item é sem custo/gratuito, mas solicita valor de R$ {float(amount):.2f}."
                )

        # 3. Validação de CNPJ e E-mail para Cadastro de Fornecedor
        if intake.category == RequestCategory.CADASTRO_FORNECEDOR:
            tax_id = str(data.get("tax_id", ""))
            if tax_id:
                digits = re.sub(r"\D", "", tax_id)
                if len(digits) != 14 or len(set(digits)) == 1:
                    inconsistencies.append(
                        f"CNPJ informado ('{tax_id}') não possui 14 dígitos válidos."
                    )
            email = str(data.get("contact_email", ""))
            if email and ("@" not in email or "." not in email.split("@")[-1]):
                inconsistencies.append(f"E-mail de contato inválido: '{email}'.")

        is_complete = (len(missing) == 0) and (not intake.classification_uncertain)
        requires_clarification = (not is_complete) and (not duplicate_id) and (len(contradictions) == 0)

        clarification_msg = None
        if requires_clarification:
            if intake.classification_uncertain:
                clarification_msg = (
                    "Sua solicitação está ambígua ou não pôde ser classificada com segurança. "
                    "Por favor, especifique claramente o objetivo e os dados obrigatórios."
                )
            else:
                fields_str = ", ".join(missing)
                clarification_msg = (
                    f"Para prosseguir com '{RequestCategory.label(intake.category.value)}', "
                    f"informe os seguintes campos obrigatórios ausentes: {fields_str}."
                )

        summary_parts = [
            f"Categoria: {RequestCategory.label(intake.category.value)} (Confiança: {int(intake.confidence * 100)}%).",
            f"Solicitante: {submission.requester_name} ({submission.requester_department}).",
        ]
        if amount is not None:
            try:
                summary_parts.append(f"Valor identificado: R$ {float(amount):,.2f}.")
            except (ValueError, TypeError):
                pass
        if missing:
            summary_parts.append(f"Campos ausentes: {', '.join(missing)}.")
        if contradictions:
            summary_parts.append(f"Contradições detectadas: {len(contradictions)}.")
        if duplicate_id:
            summary_parts.append(f"Duplicidade detectada com a solicitação {duplicate_id}.")

        return AnalystResult(
            is_complete=is_complete,
            missing_fields=missing,
            inconsistencies=inconsistencies,
            contradictions=contradictions,
            is_duplicate=bool(duplicate_id),
            duplicate_of_request_id=duplicate_id,
            requires_clarification=requires_clarification,
            clarification_message=clarification_msg,
            executive_summary=" ".join(summary_parts),
            execution_mode=OperationMode.LOCAL,
        )
