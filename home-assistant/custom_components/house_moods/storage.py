"""Private atomic HA Store, with failures propagated before any physical write."""
import json
from pathlib import Path
from homeassistant.core import CoreState
from homeassistant.helpers.storage import Store
from .model import Session

class StrictStore(Store):
    async def _async_write_data(self, *args):
        # HA 2025.5 Store normally logs WriteError and returns success. Journaling
        # cannot use that contract; wrap before Store's suppressing error handler.
        try:
            # HA 2025.5 passes (path, data); HA 2026.9 passes only (data,).
            await super()._async_write_data(*args)
        except Exception as err:
            raise RuntimeError('Mood state could not be saved. No further commands were sent.') from err

class SessionStore:
    def __init__(self,hass):
        self.hass=hass
        self.store=StrictStore(hass,1,'house_moods.session',private=True,atomic_writes=True)

    def _validate_file(self):
        path=Path(self.store.path)
        try:raw=json.loads(path.read_text())
        except FileNotFoundError:return
        except Exception as err:raise RuntimeError('Mood recovery data is unreadable. Restore its backup before starting a mood.') from err
        if not isinstance(raw,dict) or raw.get('version')!=1 or not isinstance(raw.get('data'),dict) or 'session' not in raw['data']:
            raise RuntimeError('Mood recovery data has an unsupported format.')
        if raw['data']['session'] is not None:Session.from_dict(raw['data']['session'])

    async def load(self):
        # Prevent HA's normal corrupt-file rename-and-empty fallback from silently
        # discarding a baseline. A damaged journal must block new device writes.
        await self.hass.async_add_executor_job(self._validate_file)
        data=await self.store.async_load()
        if data is None or data['session'] is None:return None
        return Session.from_dict(data['session'])

    async def save(self,session):
        if self.hass.state in (CoreState.stopping,CoreState.final_write,CoreState.stopped):
            raise RuntimeError('Home Assistant is stopping; mood commands are paused.')
        await self.store.async_save({'session':session.to_dict() if session else None})
