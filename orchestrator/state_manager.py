"""
Gerenciador de Estados Explícitos (Finite State Machine) do FlowPilot AI.

Explicação didática:
Em sistemas transacionais, não podemos permitir que o status de uma solicitação pule diretamente
de `RECEBIDA` para `CONCLUIDA` sem passar por `EM_PROCESSAMENTO` e `EXECUTADA`, nem que uma
solicitação `REJEITADA` seja marcada como `EXECUTADA` por engano.
O `StateManager` define um grafo estrito de transições permitidas e registra cada mudança no Audit Log.
"""
from typing import Dict, Optional, Set
from database.models import RequestState
from database.repository import FlowPilotRepository


class InvalidStateTransitionError(ValueError):
    """Exceção lançada quando uma transição de estado viola o fluxo permitido."""


ALLOWED_TRANSITIONS: Dict[RequestState, Set[RequestState]] = {
    RequestState.RECEBIDA: {
        RequestState.EM_PROCESSAMENTO,
        RequestState.ERRO,
    },
    RequestState.EM_PROCESSAMENTO: {
        RequestState.AGUARDANDO_INFORMACOES,
        RequestState.AGUARDANDO_APROVACAO,
        RequestState.APROVADA,
        RequestState.REJEITADA,
        RequestState.ERRO,
    },
    RequestState.AGUARDANDO_INFORMACOES: {
        RequestState.EM_PROCESSAMENTO,
        RequestState.REJEITADA,
        RequestState.ERRO,
    },
    RequestState.AGUARDANDO_APROVACAO: {
        RequestState.APROVADA,
        RequestState.REJEITADA,
        RequestState.AGUARDANDO_INFORMACOES,
        RequestState.ERRO,
    },
    RequestState.APROVADA: {
        RequestState.EXECUTADA,
        RequestState.ERRO,
    },
    RequestState.EXECUTADA: {
        RequestState.CONCLUIDA,
        RequestState.ERRO,
    },
    RequestState.REJEITADA: set(),  # Estado terminal
    RequestState.CONCLUIDA: set(),  # Estado terminal
    RequestState.ERRO: {
        RequestState.EM_PROCESSAMENTO,  # Permite recuperação após erro (retry seguro)
    },
}


class StateManager:
    """Controlador determinístico de transições de estado de solicitações."""

    def __init__(self, repository: FlowPilotRepository) -> None:
        self.repo = repository

    @staticmethod
    def can_transition(current_state: RequestState, target_state: RequestState) -> bool:
        if current_state == target_state:
            return True
        return target_state in ALLOWED_TRANSITIONS.get(current_state, set())

    def transition(
        self,
        request_id: str,
        target_state: RequestState,
        actor: str = "Orquestrador",
        reason: Optional[str] = None,
    ) -> RequestState:
        req = self.repo.get_request(request_id)
        if not req:
            raise ValueError(f"Solicitação '{request_id}' não encontrada no banco.")

        current_state = RequestState(req["status"])
        if current_state == target_state:
            return current_state

        if not self.can_transition(current_state, target_state):
            raise InvalidStateTransitionError(
                f"Transição de estado inválida para {request_id}: "
                f"{current_state.value} -> {target_state.value}."
            )

        self.repo.update_request_fields(request_id, status=target_state.value)
        self.repo.log_audit(
            request_id=request_id,
            actor=actor,
            event_type="STATE_TRANSITION",
            severity="INFO" if target_state != RequestState.ERRO else "ERROR",
            description=(
                f"Estado alterado: {current_state.value} -> {target_state.value}"
                + (f" ({reason})" if reason else "")
            ),
            metadata={"from": current_state.value, "to": target_state.value, "reason": reason},
        )
        return target_state
