"""Register the scoped Chill LLM API from one YAML entry."""

from homeassistant.components import llm
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .action import ChillAction
from .api import ChillAPI

DOMAIN = "chill_assist"
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register one API and close its action on HA stop."""
    action = ChillAction(hass)
    unregister = llm.async_register_api(hass, ChillAPI(hass, action))

    async def close(_event) -> None:
        unregister()
        await action.async_close()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, close)
    return True
