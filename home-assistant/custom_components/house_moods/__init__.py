"""One-house YAML integration. HA imports stay lazy for pure Python tests."""
import asyncio
import logging

_LOGGER = logging.getLogger(__name__)

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
        self.dirty = set()
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
        def finished(done):
            self.tasks.discard(done)
            if not done.cancelled() and done.exception() is not None:
                _LOGGER.warning("A house mood observation could not be completed")
        task.add_done_callback(finished)
        return task

    def observe(self, target, origin=None):
        key = (target, origin)
        if key in self.pending:
            self.dirty.add(key)
            return
        self.pending.add(key)
        async def update():
            try:
                # Explicit service intent alone proves an override, even offline.
                while True:
                    self.dirty.discard(key)
                    await self.engine.observe(target, {} if origin is not None else None, origin)
                    if key not in self.dirty:
                        break
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
        from .sonos import SPEAKERS, SOURCE, PLAYBACK_SOURCES, FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT, GROUPS
        domain, service = event.data['domain'], event.data['service']
        data = event.data.get('service_data', {})
        origin = self.io.origin(event.context)
        if origin:
            return
        # Lepro device_id is a native decimal identity, not an HA registry selector.
        target_data = {k: v for k, v in data.items() if k != 'device_id'} if domain == 'lepro_led' else data
        call = ServiceCall(self.hass, domain, service, target_data, context=event.context)
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
        if domain == 'lepro_led' and service in ('restore_native_state', 'send_debug_command'):
            if data.get('device_id') == DEVICE or NEON in entities:
                targets.add(NEON)
        if domain == 'number' and service == 'set_value':
            from .ha_adapter import ENTRY
            numbers = self.hass.data.get('lepro_led', {}).get(ENTRY, {}).get('numbers', {}).get(DEVICE, [])
            if any(getattr(e, 'entity_id', None) in entities and
                   getattr(getattr(e, '_light', None), '_did', None) == DEVICE for e in numbers):
                targets.add(NEON)
        if domain == 'sonos':
            if service in ('play_queue', 'remove_from_queue', 'restore'):
                targets.update(e + '#playback' for e in entities & set(PLAYBACK_SOURCES))
            if service == 'restore' and entities & set(SPEAKERS):
                targets.update((GROUPS, *[e + '#volume' for e in entities & set(SPEAKERS)]))
        if domain == 'media_player':
            speakers = entities & set(SPEAKERS)
            if service in ('volume_set', 'volume_up', 'volume_down', 'volume_mute'):
                targets.update(e + '#volume' for e in speakers)
            if service in ('join', 'unjoin') and (speakers or set(data.get('group_members', [])) & set(SPEAKERS)):
                targets.add(GROUPS)
            if service in ('play_media', 'media_play', 'media_pause', 'media_stop', 'media_play_pause', 'clear_playlist', 'turn_off', 'turn_on'):
                targets.update(e + '#playback' for e in speakers & set(PLAYBACK_SOURCES))
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
                    from .sonos import FOLLOW, GROUPS
                    session = self.engine.session
                    if session and {FOLLOW, GROUPS} <= session.overridden:
                        return await self.manual_follow_join(call.data['room'])
                    write = await self.adapter.sonos.plan_join(call.data['room'])
                    return await self.engine.apply_owned_write(write) if write else self.engine.status()
                except (ValueError, RuntimeError) as err:
                    result = self.engine.status(False)
                    result['errors'] = [{'target': 'follow', 'message': str(err)}]
                    return result
            if call.service == 'activate':
                return await self.engine.activate(call.data['mood'])
            return await getattr(self.engine, call.service)()
        finally:
            self.tasks.discard(task)

    async def manual_follow_join(self, room):
        from .sonos import FOLLOW, FOLLOW_SOURCE, GROUPS, SPEAKERS
        # Serialize against End, without calling the follow script recursively.
        async with self.engine._lock:
            session = self.engine.session
            if not session or session.phase != 'active' or not {FOLLOW, GROUPS} <= session.overridden:
                raise ValueError('An active manually controlled Follow me session is required.')
            source = self.io.state(FOLLOW_SOURCE)['state']
            if (self.io.state(FOLLOW)['state'] != 'on' or source not in SPEAKERS
                    or room not in SPEAKERS[1:] or room == source
                    or self.io.state(source)['state'] not in ('playing', 'buffering')
                    or self.io.state(room)['state'] in ('unknown', 'unavailable')):
                raise ValueError('This room is not following the saved source.')
            members = self.io.state(source)['attributes'].get('group_members') or [source]
            if room not in members:
                await self.io.call('media_player', 'join', [source], {'group_members': [room]})
            return self.engine.status()

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
    async def started(event=None):
        runtime.unsubscribers.append(runtime.adapter.native_subscribe(lambda: runtime.observe(NEON)))
        await runtime.engine.reconcile()
    if hass.state == CoreState.running:
        await started()
    else:
        runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started))
    return True
