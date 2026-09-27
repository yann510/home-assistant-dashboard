"""Fixed, response-bearing Chill action for a scoped Assist tool."""

import asyncio
from typing import Any

from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError


class ChillAction:
    """Dispatch at most one House Moods activation and verify its outcome."""

    def __init__(self, hass: HomeAssistant, *, response_timeout: float = 35) -> None:
        self._hass = hass
        self._response_timeout = response_timeout
        self._operation: asyncio.Task[Any] | None = None
        self._uncertain = False
        self._fresh_state = None
        self._dispatched = False
        self._closed = False
        self._unlisten = hass.bus.async_listen(EVENT_STATE_CHANGED, self._state_changed)

    def _state_changed(self, event: Any) -> None:
        if self._dispatched and event.data.get('entity_id') == 'sensor.house_mood':
            self._fresh_state = event.data.get('new_state')

    @staticmethod
    def _state_status(state: Any) -> tuple[str, Any, Any]:
        if state is None:
            raise HomeAssistantError('House Mood status is unavailable.')
        return state.state, state.attributes.get('active_mood'), state.attributes.get('errors')

    @staticmethod
    def _check_available(state: Any) -> bool:
        phase, mood, errors = ChillAction._state_status(state)
        if errors != []:
            raise HomeAssistantError('House Mood has unresolved errors; resolve them in the dashboard.')
        if phase == 'active':
            return mood == 'unwind'
        if phase == 'idle':
            return False
        if phase in ('starting', 'restoring'):
            raise HomeAssistantError('House Mood is still starting or restoring.')
        if phase == 'recovery_required':
            raise HomeAssistantError('House Mood needs recovery in the dashboard.')
        raise HomeAssistantError('House Mood status is unavailable.')

    @staticmethod
    def _check_response(result: Any) -> None:
        if not isinstance(result, dict):
            raise HomeAssistantError('Chill activation could not be confirmed.')
        if (result.get('success') is True and result.get('phase') == 'active'
                and result.get('active_mood') == 'unwind' and result.get('errors') == []):
            return
        errors = result.get('errors')
        if isinstance(errors, list) and errors:
            message = errors[0].get('message') if isinstance(errors[0], dict) else None
            if isinstance(message, str) and message:
                raise HomeAssistantError(f'Chill activation failed: {message}')
        if result.get('phase') == 'recovery_required':
            raise HomeAssistantError('Chill activation needs recovery in the dashboard.')
        raise HomeAssistantError('Chill activation could not be confirmed.')

    def _operation_finished(self, task: asyncio.Task[Any]) -> None:
        if not task.cancelled():
            task.exception()  # Consume a late service failure after the caller timed out.

    async def async_start(self, context: Context | None) -> dict[str, Any]:
        if self._closed:
            raise HomeAssistantError('Chill action is unavailable.')

        if self._operation is not None:
            if not self._operation.done():
                raise HomeAssistantError('Chill activation is still in progress.')
            if self._uncertain:
                if self._fresh_state is None:
                    raise HomeAssistantError('Chill activation could not be confirmed; wait for House Mood status.')
                if self._check_available(self._fresh_state):
                    self._uncertain = False
                    self._operation = None
                    self._dispatched = False
                    return {'status': 'already_active', 'mood': 'Chill'}
                raise HomeAssistantError('Chill activation could not be confirmed from House Mood status.')
            self._operation = None

        state = self._hass.states.get('sensor.house_mood')
        if self._check_available(state):
            return {'status': 'already_active', 'mood': 'Chill'}

        # Recheck immediately before issuing the single supported service call.
        if self._check_available(self._hass.states.get('sensor.house_mood')):
            return {'status': 'already_active', 'mood': 'Chill'}
        self._fresh_state = None
        self._dispatched = True
        self._operation = asyncio.create_task(self._hass.services.async_call(
            'house_moods', 'activate', {'mood': 'unwind'},
            blocking=True, context=context, return_response=True,
        ))
        self._operation.add_done_callback(self._operation_finished)
        try:
            result = await asyncio.wait_for(asyncio.shield(self._operation), self._response_timeout)
        except TimeoutError as err:
            self._uncertain = True
            raise HomeAssistantError('Chill activation timed out; its outcome is not yet confirmed.') from err
        except asyncio.CancelledError:
            self._uncertain = True
            raise
        except Exception as err:
            self._uncertain = True
            raise HomeAssistantError('Chill activation could not be confirmed.') from err
        try:
            self._check_response(result)
        except HomeAssistantError:
            self._uncertain = True
            raise
        self._operation = None
        self._dispatched = False
        return {'status': 'activated', 'mood': 'Chill'}

    async def async_close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._unlisten()
        if self._operation is not None and not self._operation.done():
            self._operation.cancel()
            await asyncio.gather(self._operation, return_exceptions=True)
        self._operation = None
