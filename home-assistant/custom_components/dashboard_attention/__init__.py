"""Persistent, dashboard-only attention tracking for this household."""
import asyncio
from datetime import datetime, timedelta, timezone
import logging

from .engine import ENTITIES, Engine

DOMAIN = 'dashboard_attention'
_LOGGER = logging.getLogger(__name__)

class Runtime:
    def __init__(self, hass, store, clock=None, gateway=None):
        self.gateway = gateway
        self.hass = hass
        self.store = store
        self.clock = clock or (lambda: datetime.now(timezone.utc).timestamp())
        self.lock = asyncio.Lock()
        self.engine = None
        self.last_saved = None
        self.last_published = []
        self.unsubscribers = []
        self.tasks = set()
        self.closed = False

    async def start(self, states):
        async with self.lock:
            saved = await self.store.async_load()
            self.engine = Engine(self.clock(), saved)
            if self.gateway:
                states = {**states, "sensor.hilo_gateway": self.gateway()}
            self.engine.prime(states, self.clock())
            await self.flush()

    async def flush(self):
        snapshot = self.engine.serialize()
        if snapshot != self.last_saved:
            try:
                await self.store.async_save(snapshot)
            except Exception:
                self.hass.states.async_set('sensor.dashboard_attention', 'unavailable',
                                           {'items': self.last_published, 'ready': False})
                raise
            self.last_saved = snapshot
        now = self.clock()
        items = self.engine.items(now)
        self.last_published = items
        active = sum(not i['snoozed_until'] or datetime.fromisoformat(i['snoozed_until']).timestamp() <= now for i in items)
        self.hass.states.async_set('sensor.dashboard_attention', active,
                                   {'friendly_name': 'Dashboard attention', 'items': items,
                                    'ready': now >= self.engine.started + 120})

    async def change(self, entity, state, attributes, timestamp):
        async with self.lock:
            self.engine.update(entity, state, attributes, timestamp)
            await self.flush()

    async def tick(self):
        async with self.lock:
            if self.gateway:
                self.engine.update("sensor.hilo_gateway", self.gateway(), {}, self.clock())
            self.engine.tick(self.clock())
            await self.flush()

    async def action(self, action, key, episode):
        async with self.lock:
            # Persist before publication or service success. A failed disk write
            # leaves the previous visible snapshot and permits an explicit retry.
            previous = self.engine.serialize()
            changed = self.engine.action(action, key, episode, self.clock())
            try:
                await self.flush()
            except Exception:
                self.engine.events = previous['events']
                raise
            return changed

    def schedule(self, coroutine):
        if self.closed:
            coroutine.close()
            return
        task = self.hass.async_create_task(coroutine)
        self.tasks.add(task)
        def done(result):
            self.tasks.discard(result)
            if not result.cancelled() and result.exception():
                _LOGGER.error('Dashboard attention update failed', exc_info=result.exception())
        task.add_done_callback(done)

    async def stop(self, _event=None):
        self.closed = True
        for unsubscribe in self.unsubscribers:
            unsubscribe()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        async with self.lock:
            await self.flush()

async def async_setup(hass, config):
    """Install using `dashboard_attention:` in configuration.yaml."""
    import voluptuous as vol
    from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_HOMEASSISTANT_STOP
    from homeassistant.core import callback
    from homeassistant.exceptions import ServiceValidationError
    from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
    from homeassistant.helpers.storage import Store

    from homeassistant.helpers import entity_registry as er
    from .gateway import gateway_state
    registry = er.async_get(hass)
    def resolve_gateway():
        config_ids = {entry.config_entry_id for entity in ('climate.thermostat_office', 'climate.thermostat_gym', 'climate.thermostat_bedroom')
                      if (entry := registry.async_get(entity)) is not None}
        entries = [dict(entity_id=e.entity_id, platform=e.platform, unique_id=e.unique_id,
                        config_entry_id=e.config_entry_id, disabled_by=e.disabled_by) for e in registry.entities.values()]
        states = {e['entity_id']: {'state': state.state, 'attributes': dict(state.attributes)} for e in entries
                  if (state := hass.states.get(e['entity_id'])) is not None}
        return gateway_state(entries, states, config_ids)
    runtime = Runtime(hass, Store(hass, 1, DOMAIN), gateway=resolve_gateway)
    hass.data[DOMAIN] = runtime
    hass.states.async_set('sensor.dashboard_attention', 0, {'items': [], 'ready': False})

    async def begin(_event=None):
        @callback
        def changed(event):
            state = event.data.get('new_state')
            runtime.schedule(runtime.change(event.data['entity_id'], state.state if state else 'unavailable',
                                            dict(state.attributes) if state else {}, runtime.clock()))
        runtime.unsubscribers.append(async_track_state_change_event(hass, ENTITIES - {"sensor.hilo_gateway"}, changed))
        await runtime.start({entity: state.state for entity in ENTITIES if (state := hass.states.get(entity)) is not None})
        @callback
        def timer(_now):
            runtime.schedule(runtime.tick())
        runtime.unsubscribers.append(async_track_time_interval(hass, timer, timedelta(seconds=5)))
        runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, runtime.stop))

    schema = vol.Schema({vol.Required('id'): str, vol.Required('episode'): str})
    async def action(call):
        if runtime.engine is None:
            raise ServiceValidationError('Attention tracking is starting. Try again shortly.')
        changed = await runtime.action(call.service, call.data['id'], call.data['episode'])
        if not changed:
            raise ServiceValidationError('This attention item changed or does not support that action. Refresh its status.')
    for service in ('dismiss', 'snooze', 'unsnooze'):
        hass.services.async_register(DOMAIN, service, action, schema=schema)
    if hass.is_running:
        await begin()
    else:
        runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, begin))
    return True
