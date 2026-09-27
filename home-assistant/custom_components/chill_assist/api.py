"""A single purpose LLM API for activating Chill."""

from typing import Any

import voluptuous as vol

from homeassistant.components import llm
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .action import ChillAction


class StartChillTool(llm.Tool):
    """Expose only the fixed Chill activation action."""

    name = "StartChill"
    description = "Start Chill, the unwind House Mood. No arguments are accepted."
    parameters = vol.Schema({})

    def __init__(self, action: ChillAction) -> None:
        self._action = action

    async def async_call(
        self, hass: HomeAssistant, tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> dict[str, Any]:
        """Reject all caller supplied targets and run the shared action."""
        if tool_input.tool_name != self.name or tool_input.tool_args != {}:
            raise HomeAssistantError("StartChill requires its exact name and no arguments.")
        return await self._action.async_start(llm_context.context)


class ChillAPI(llm.API):
    """Keep the Chill tool isolated from the general Assist API."""

    def __init__(self, hass: HomeAssistant, action: ChillAction) -> None:
        super().__init__(hass=hass, id="chill_assist", name="Chill assistant")
        self._tool = StartChillTool(action)

    async def async_get_api_instance(self, llm_context: llm.LLMContext) -> llm.APIInstance:
        """Expose one action with no entity or general intent context."""
        return llm.APIInstance(
            api=self,
            api_prompt="You can only start Chill, the unwind House Mood, using StartChill with no arguments.",
            llm_context=llm_context,
            tools=[self._tool],
        )
