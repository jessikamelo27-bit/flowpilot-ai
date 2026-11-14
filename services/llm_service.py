"""
Camada de Abstração de Inteligência Artificial e LLMs (LLM Service).

Explicação didática:
Por que criar uma camada de abstração (`LLMService`) em vez de chamar a biblioteca da OpenAI ou Gemini dentro de cada agente?
1. **Desacoplamento de Provedor**: Podemos trocar de `gpt-4o-mini` para `gemini-2.0-flash` ou um modelo local via Ollama sem alterar uma única linha dos 5 agentes.
2. **Transparência entre Modo Local e Modo LLM**:
   - No **Modo LOCAL**, o sistema executa extratores e avaliadores determinísticos em Python puro (expressões regulares, heurísticas semânticas e regras de negócio) e rotula explicitamente `execution_mode = LOCAL`. Ele NUNCA finge que uma resposta local veio de uma IA generativa.
   - No **Modo LLM**, o serviço monta um prompt separado em `system_prompt` (instruções imutáveis + JSON Schema do Pydantic) e `user_message` (encapsulado como dado não confiável), controla tentativas (`max_retries`), valida o JSON retornado com Pydantic e contabiliza tokens. Se a API falhar, se a chave for inválida/ausente ou se o modelo retornar JSON fora do formato após as tentativas, ele registra o erro mascarando segredos e aciona o fallback determinístico de segurança, identificando claramente o modo utilizado (`LOCAL`).
"""
import json
import logging
import time
from typing import Callable, Optional, Tuple, Type, TypeVar
import httpx
from pydantic import BaseModel, ValidationError
from config.settings import get_settings
from database.models import OperationMode
from services.security_service import mask_sensitive_data

logger = logging.getLogger("flowpilot.llm")

T = TypeVar("T", bound=BaseModel)


class LLMCallMetadata(BaseModel):
    """Metadados reais da chamada ao provedor ou motor local."""
    mode_used: OperationMode
    provider: str
    model: str
    attempts: int = 1
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    fallback_triggered: bool = False
    live_api_validated: bool = False
    error_log: Optional[str] = None
    latency_ms: float = 0.0


class LLMService:
    """Abstração configurável para chamadas estruturadas a LLMs com validação Pydantic e Modo Local."""

    def __init__(
        self,
        mode: Optional[str] = None,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        settings = get_settings()
        self.mode = (mode or settings.operation_mode or "LOCAL").upper()
        self.provider = (provider or settings.llm_provider or "openai").lower()
        self.api_key = api_key if api_key is not None else settings.llm_api_key
        self.model = model or settings.llm_model
        self.base_url = base_url or settings.llm_base_url
        self.timeout = settings.llm_timeout_seconds
        self.max_retries = settings.llm_max_retries

    def is_llm_configured(self) -> bool:
        """Verifica se o modo LLM está selecionado e possui chave configurada com comprimento mínimo plausível."""
        if self.mode != "LLM":
            return False
        cleaned_key = (self.api_key or "").strip()
        return len(cleaned_key) >= 8

    def get_active_mode_badge(self) -> str:
        """Retorna descrição clara e honesta do modo ativo para exibição na UI."""
        if self.is_llm_configured():
            return f"MODO LLM CONFIGURADO ({self.provider.upper()} • {self.model})"
        if self.mode == "LLM":
            return "MODO LOCAL ATIVO (Credencial LLM ausente/inválida • Fallback Determinístico)"
        return "MODO LOCAL DETERMINÍSTICO (Python Engine • Sem API Externa)"

    def execute_structured(
        self,
        system_prompt: str,
        untrusted_user_payload: str,
        response_model: Type[T],
        local_deterministic_fn: Callable[[], T],
    ) -> Tuple[T, LLMCallMetadata]:
        """
        Executa uma tarefa estruturada.
        - Se estiver em Modo LOCAL (ou se o Modo LLM estiver sem chave válida), executa `local_deterministic_fn`
          diretamente e identifica claramente `mode_used = LOCAL`.
        - Se estiver em Modo LLM com credencial configurada, chama a API exigindo JSON compatível com `response_model`,
          valida com Pydantic, realiza retries em caso de JSON inválido/incompleto ou falha HTTP e faz fallback
          controlado e auditado se o provedor estiver indisponível ou retornar erro.
        """
        start_time = time.perf_counter()

        if not self.is_llm_configured():
            result = local_deterministic_fn()
            if hasattr(result, "execution_mode"):
                result.execution_mode = OperationMode.LOCAL
            elapsed = (time.perf_counter() - start_time) * 1000.0
            missing_key_fallback = self.mode == "LLM"
            err_msg = (
                "Modo LLM solicitado, porém API Key ausente ou inválida. Executado em Modo Local Determinístico."
                if missing_key_fallback
                else None
            )
            meta = LLMCallMetadata(
                mode_used=OperationMode.LOCAL,
                provider="local_python_engine",
                model="deterministic-v1",
                attempts=1,
                fallback_triggered=missing_key_fallback,
                live_api_validated=False,
                error_log=err_msg,
                latency_ms=round(elapsed, 2),
            )
            return result, meta

        # Modo LLM Ativo
        schema_json = json.dumps(response_model.model_json_schema(), ensure_ascii=False)
        full_system_prompt = (
            f"{system_prompt.strip()}\n\n"
            "REGRAS OBRIGATÓRIAS DE FORMATO:\n"
            "1. Responda EXCLUSIVAMENTE com um objeto JSON válido.\n"
            "2. Não inclua blocos markdown ```json, comentários ou texto fora do JSON.\n"
            "3. Respeite estritamente este JSON Schema:\n"
            f"{schema_json}"
        )

        last_error: Optional[str] = None
        prompt_tokens = 0
        completion_tokens = 0

        for attempt in range(1, self.max_retries + 2):
            try:
                raw_json_str, p_tok, c_tok = self._call_external_provider(
                    system_prompt=full_system_prompt,
                    user_content=untrusted_user_payload,
                )
                prompt_tokens += p_tok
                completion_tokens += c_tok

                cleaned_json = self._clean_json_fence(raw_json_str)
                parsed_dict = json.loads(cleaned_json)
                validated_obj = response_model.model_validate(parsed_dict)
                if hasattr(validated_obj, "execution_mode"):
                    validated_obj.execution_mode = OperationMode.LLM

                elapsed = (time.perf_counter() - start_time) * 1000.0
                return validated_obj, LLMCallMetadata(
                    mode_used=OperationMode.LLM,
                    provider=self.provider,
                    model=self.model,
                    attempts=attempt,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens,
                    fallback_triggered=False,
                    live_api_validated=True,
                    latency_ms=round(elapsed, 2),
                )
            except (
                json.JSONDecodeError,
                ValidationError,
                httpx.HTTPError,
                ValueError,
                KeyError,
                IndexError,
                TypeError,
            ) as exc:
                safe_err = mask_sensitive_data(str(exc))
                last_error = f"Tentativa {attempt} falhou ({type(exc).__name__}): {safe_err[:220]}"
                logger.warning(last_error)

        # Se todas as tentativas do LLM falharem, aciona o motor determinístico local como contingência
        fallback_result = local_deterministic_fn()
        if hasattr(fallback_result, "execution_mode"):
            fallback_result.execution_mode = OperationMode.LOCAL
        elapsed = (time.perf_counter() - start_time) * 1000.0
        return fallback_result, LLMCallMetadata(
            mode_used=OperationMode.LOCAL,
            provider=self.provider,
            model=self.model,
            attempts=self.max_retries + 1,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            fallback_triggered=True,
            live_api_validated=False,
            error_log=last_error,
            latency_ms=round(elapsed, 2),
        )

    def _call_external_provider(
        self, system_prompt: str, user_content: str
    ) -> Tuple[str, int, int]:
        """Realiza a requisição HTTP para OpenAI, Gemini ou endpoint compatível sem expor a API key na URL."""
        cleaned_key = (self.api_key or "").strip()
        if not cleaned_key:
            raise ValueError("API key ausente para chamada externa.")

        if self.provider == "gemini":
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.model}:generateContent"
            )
            headers = {
                "x-goog-api-key": cleaned_key,
                "Content-Type": "application/json",
            }
            payload = {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_content}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                },
            }
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                candidates = data.get("candidates")
                if not candidates or not isinstance(candidates, list):
                    raise ValueError("Resposta do Gemini sem candidates válidos.")
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts or "text" not in parts[0]:
                    raise ValueError("Resposta do Gemini sem campo 'text' estruturado.")
                text = parts[0]["text"]
                usage = data.get("usageMetadata", {})
                return (
                    str(text),
                    int(usage.get("promptTokenCount", 0)),
                    int(usage.get("candidatesTokenCount", 0)),
                )

        # OpenAI / OpenAI-Compatible REST API
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {cleaned_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        }
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices")
            if not choices or not isinstance(choices, list):
                raise ValueError("Resposta da API sem choices válidos.")
            content = choices[0].get("message", {}).get("content")
            if not content:
                raise ValueError("Resposta da API com message.content vazio.")
            usage = data.get("usage", {})
            return (
                str(content),
                int(usage.get("prompt_tokens", 0)),
                int(usage.get("completion_tokens", 0)),
            )

    @staticmethod
    def _clean_json_fence(raw_text: str) -> str:
        text = (raw_text or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return text
