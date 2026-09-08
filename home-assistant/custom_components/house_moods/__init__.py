"""One-house YAML integration. HA imports stay lazy for pure Python tests."""
import asyncio

# Exported lazily so importing pure coordinator modules needs no HA installation.
def HAAdapter(*args):
    from .ha_adapter import HAAdapter as Adapter
    return Adapter(*args)

class Runtime:
    def __init__(self, hass):
        from .ha_adapter import HAIO
        from .coordinator import MoodCoordinator
        from .storage import SessionStore
        self.hass = hass
        self.io = HAIO(hass)
        self.adapter = HAAdapter(hass, self.io)
        self.engine = MoodCoordinator(self.adapter, SessionStore(hass), on_status=self.publish)
        self.tasks = set()
        self.unsubscribers = []
        self.pending = set()
        self.closed = False

    def publish(self, status):
        self.hass.states.async_set('sensor.house_mood', status['phase'],
            {k: v for k, v in status.items() if k != 'phase'})

    def schedule(self, coroutine):
        if self.closed:
            coroutine.close()
            return
        task = self.hass.async_create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    def observe(self, target, origin=None):
        key = (target, origin)
        if key in self.pending:
            return
        self.pending.add(key)
        async def update():
            try:
                # Explicit service intent alone proves an override, even offline.
                value = {} if origin is not None else await self.adapter.read(target)
                await self.engine.observe(target, value, origin)
            except (ValueError, RuntimeError, TimeoutError):
                pass  # An unavailable report is not evidence of a manual change.
            finally:
                self.pending.discard(key)
        self.schedule(update())

    def state_changed(self, event):
        for target in self.adapter.observation_targets(event.data['entity_id']):
            self.observe(target)

    def service_called(self, event):
        from homeassistant.core import ServiceCall
        from homeassistant.helpers.service import async_extract_referenced_entity_ids
        from .ha_adapter import DEVICE
        from .presets import NEON
        from .sonos import SPEAKERS, SOURCE, FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT, GROUPS
        domain, service = event.data['domain'], event.data['service']
        data = event.data.get('service_data', {})
        origin = self.io.origin(event.context)
        if origin:
            return
        call = ServiceCall(self.hass, domain, service, data, context=event.context)
        selected = async_extract_referenced_entity_ids(self.hass, call)
        entities = selected.referenced | selected.indirectly_referenced
        targets = set()
        if domain == 'script' and (service == 'speaker_follow_motion' or FOLLOW_SCRIPT in entities):
            if data.get('command', data.get('variables', {}).get('command')) in ('enable', 'disable') or service in ('turn_off', 'toggle'):
                targets.update((FOLLOW, GROUPS))
        if domain in ('input_boolean', 'input_text') and entities & {FOLLOW, FOLLOW_SOURCE}:
            targets.update((FOLLOW, GROUPS))
        if domain == 'light':
            targets.update(e for e in entities if e in self.adapter.observation_targets(e) or e == NEON)
        if domain == 'lepro_led' and service not in ('capture_native_state',):
            if data.get('device_id') == DEVICE or NEON in entities:
                targets.add(NEON)
        if domain == 'number':
            entry = self.hass.data.get('lepro_led', {})
            for value in entry.values():
                if isinstance(value, dict) and any(getattr(e, '_did', None) == DEVICE and getattr(e, 'entity_id', None) in entities for e in value.get('entities', [])):
                    targets.add(NEON)
        if domain == 'media_player':
            speakers = entities & set(SPEAKERS)
            if service in ('volume_set', 'volume_up', 'volume_down', 'volume_mute'):
                targets.update(e + '#volume' for e in speakers)
            if service in ('join', 'unjoin') and (speakers or set(data.get('group_members', [])) & set(SPEAKERS)):
                targets.add(GROUPS)
            if SOURCE in speakers and service in ('play_media', 'media_play', 'media_pause', 'media_stop', 'media_play_pause', 'clear_playlist', 'media_next_track', 'media_previous_track', 'turn_off', 'turn_on'):
                targets.add(SOURCE + '#playback')
        for target in targets:
            self.observe(target, 'external:' + event.context.id)

    async def handle(self, call):
        self.io.check_open()
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            if not self.engine._loaded and not self.engine._lock.locked():
                await self.engine.reconcile()
            if call.service == 'follow_join':
                if self.engine._lock.locked():
                    result = self.engine.status(False)
                    result['errors'] = [{'target': 'coordinator', 'message': 'Operation in progress'}]
                    return result
                try:
                    write = await self.adapter.sonos.plan_join(call.data['room'])
                    return await self.engine.apply_owned_write(write) if write else self.engine.status()
                except ValueError as err:
                    result = self.engine.status(False)
                    result['errors'] = [{'target': 'follow', 'message': str(err)}]
                    return result
            if call.service == 'activate':
                return await self.engine.activate(call.data['mood'])
            return await getattr(self.engine, call.service)()
        finally:
            self.tasks.discard(task)

    async def close(self, event=None):
        if self.closed:
            return
        self.closed = self.io.closed = True
        for unsubscribe in self.unsubscribers:
            unsubscribe()
        current = asyncio.current_task()
        tasks = [t for t in self.tasks if t is not current]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for name in ('activate', 'end', 'retry_restoration', 'follow_join'):
            self.hass.services.async_remove('house_moods', name)

async def async_setup(hass, config):
    import voluptuous as vol
    from homeassistant.core import CoreState, SupportsResponse, callback
    from homeassistant.const import EVENT_CALL_SERVICE, EVENT_STATE_CHANGED, EVENT_HOMEASSISTANT_STARTED, EVENT_HOMEASSISTANT_STOP
    from .model import MOODS
    from .presets import NEON
    callback(Runtime.state_changed)
    callback(Runtime.service_called)
    runtime = Runtime(hass)
    hass.data['house_moods'] = runtime
    runtime.publish(runtime.engine.status())
    runtime.unsubscribers.extend([
        hass.bus.async_listen(EVENT_STATE_CHANGED, runtime.state_changed),
        hass.bus.async_listen(EVENT_CALL_SERVICE, runtime.service_called),
        runtime.adapter.native_subscribe(lambda: runtime.observe(NEON)),
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, runtime.close),
    ])
    for name in ('activate', 'end', 'retry_restoration', 'follow_join'):
        schema = vol.Schema({vol.Required('mood'): vol.In(MOODS)}) if name == 'activate' else vol.Schema({vol.Required('room'): str}) if name == 'follow_join' else vol.Schema({})
        hass.services.async_register('house_moods', name, runtime.handle, schema=schema, supports_response=SupportsResponse.ONLY)
    if hass.state == CoreState.running:
        await runtime.engine.reconcile()
    else:
        async def started(event):
            await runtime.engine.reconcile()
        runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started))
    return True
