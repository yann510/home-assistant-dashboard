"""One-house YAML integration. HA imports stay lazy for pure Python tests."""
import asyncio
import logging
from contextlib import asynccontextmanager

_LOGGER = logging.getLogger(__name__)
STARTUP_READINESS_TIMEOUT = 60
STARTUP_READINESS_POLL = .5

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
        self.io.guard = lambda controls: bool(controls & self.engine._manual_during_operation)
        self.tasks = set()
        self.unsubscribers = []
        self.pending = set()
        self.dirty = set()
        self.closed = False
        self._startup_ready = False
        self._startup_lock = asyncio.Lock()
        from .modes import MODE_ENTITIES
        self.mode_states = {entity: self.io.state(entity)["state"] for entity in MODE_ENTITIES.values()}

    async def ensure_startup_ready(self):
        """Read startup Sonos telemetry before the first durable reconciliation.

        State events and service requests can arrive before HA's started event.
        All entry points share this gate; waiting never issues device controls or
        alters the saved session. The ordinary reconciler handles timeout and
        interrupted journals, so readiness cannot promote genuine recovery.
        """
        if self._startup_ready or self.engine._loaded:
            return
        async with self._startup_lock:
            if self._startup_ready or self.engine._loaded:
                return
            from .sonos import FOLLOW, GROUPS, SPEAKERS, PLAYBACK_SOURCES
            sonos_targets = {FOLLOW, GROUPS, *[e + '#volume' for e in SPEAKERS],
                             *[e + '#playback' for e in PLAYBACK_SOURCES]}
            try:
                saved = await self.engine.store.load()
            except Exception:
                saved = None  # The reconciler reports corrupt storage safely.
            targets = sorted(saved.owned & sonos_targets) if saved and saved.phase == 'active' else []
            try:
                async with asyncio.timeout(STARTUP_READINESS_TIMEOUT):
                    while targets:
                        ready = True
                        for target in targets:
                            try:
                                await self.adapter.read(target)
                            except (ValueError, RuntimeError, TimeoutError):
                                ready = False
                                break
                        if ready:
                            break
                        await asyncio.sleep(STARTUP_READINESS_POLL)
            except TimeoutError:
                pass  # Preserve normal recovery when telemetry never returns.
            await self.engine.reconcile()
            self._startup_ready = True

    def publish(self, status):
        from .modes import ModeControls
        self.hass.states.async_set('sensor.house_mood', status['phase'],
            {**{k: v for k, v in status.items() if k != 'phase'},
             'mode_control': 'coordinated-v1' if ModeControls(self.io).available() else None})

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
                await self.ensure_startup_ready()
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
        from .modes import LEGACY_AUTOMATIONS, MODE_ENTITIES, ModeControls
        entity = event.data['entity_id']
        state = event.data.get('new_state')
        if entity in MODE_ENTITIES.values() and state and (self.io.origin(state.context) or not ModeControls(self.io).available()):
            self.mode_states[entity] = state.state
        if event.data['entity_id'] in LEGACY_AUTOMATIONS:
            self.publish(self.engine.status())
        for target in self.adapter.observation_targets(event.data['entity_id']):
            self.observe(target)

    def service_called(self, event):
        from homeassistant.core import ServiceCall
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
        try:
            from homeassistant.helpers.target import TargetSelection, async_extract_referenced_entity_ids
        except ImportError:
            # Keep rollback to HA 2025.5 compatible.
            from homeassistant.helpers.service import async_extract_referenced_entity_ids
            call = ServiceCall(self.hass, domain, service, target_data, context=event.context)
            selected = async_extract_referenced_entity_ids(self.hass, call)
        else:
            selected = async_extract_referenced_entity_ids(self.hass, TargetSelection(target_data))
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
            if service in ('play_media', 'media_play', 'media_pause', 'media_stop', 'media_play_pause', 'clear_playlist', 'turn_off', 'turn_on', 'shuffle_set', 'repeat_set'):
                targets.update(e + '#playback' for e in speakers & set(PLAYBACK_SOURCES))
        if domain == 'localtuya' and service == 'set_dp':
            from .modes import TUYA_LIGHTS
            targets.update(entity for entity, device in TUYA_LIGHTS.items() if data.get('device_id') == device)
        for target in targets:
            self.engine.note_external(target)
            self.observe(target, 'external:' + event.context.id)
        from .modes import MODE_ENTITIES, ModeControls
        if domain == 'input_boolean' and service in ('turn_on', 'toggle') and ModeControls(self.io).available():
            for mode, entity in MODE_ENTITIES.items():
                if entity in entities and (service == 'turn_on' or self.io.state(entity)['state'] == 'off'):
                    self.schedule(self.apply_external_mode(mode))

    async def apply_external_mode(self, mode):
        await self.ensure_startup_ready()
        from .modes import MODE_ENTITIES
        result = await self.engine.apply_mode(mode)
        if result['success']:
            self.mode_states = {entity: self.io.state(entity)['state'] for entity in MODE_ENTITIES.values()}
            return
        # An external helper service may already have changed its boolean before
        # arbitration rejects it. Repair helper truth after the current transaction,
        # under the same lock, without replaying any physical mode routine.
        async with self.engine._lock:
            for entity, state in self.mode_states.copy().items():
                if state in ('on', 'off') and self.io.state(entity)['state'] != state:
                    await self.io.call('input_boolean', 'turn_on' if state == 'on' else 'turn_off', [entity], {}, 'mode-helper-repair')
            status = self.engine.status(False)
            status['errors'] = result['errors']
            self.publish(status)

    async def handle(self, call):
        self.io.check_open()
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            await self.ensure_startup_ready()
            if not self.engine._loaded and not self.engine._lock.locked():
                await self.engine.reconcile()
            if call.service in ('follow_join', 'follow_leave'):
                if self.engine._lock.locked():
                    result = self.engine.status(False)
                    result['errors'] = [{'target': 'coordinator', 'message': 'Operation in progress'}]
                    return result
                try:
                    from .sonos import FOLLOW, GROUPS
                    session = self.engine.session
                    if session and {FOLLOW, GROUPS} <= session.overridden:
                        return await self.manual_follow_change(call.data['room'], leave=call.service == 'follow_leave')
                    planner = self.adapter.sonos.plan_leave if call.service == 'follow_leave' else self.adapter.sonos.plan_join
                    write = await planner(call.data['room'])
                    return await self.engine.apply_owned_write(write) if write else self.engine.status()
                except (ValueError, RuntimeError) as err:
                    result = self.engine.status(False)
                    result['errors'] = [{'target': 'follow', 'message': str(err)}]
                    return result
            if call.service == 'apply_mode':
                result = await self.engine.apply_mode(call.data['mode'])
                if result['success']:
                    from .modes import MODE_ENTITIES
                    self.mode_states = {entity: self.io.state(entity)['state'] for entity in MODE_ENTITIES.values()}
                return result
            if call.service == 'activate':
                return await self.engine.activate(call.data['mood'])
            return await getattr(self.engine, call.service)()
        finally:
            self.tasks.discard(task)

    async def manual_follow_change(self, room, *, leave=False):
        from .sonos import FOLLOW, FOLLOW_SOURCE, GROUPS, SPEAKERS
        # Serialize against End, without calling the follow script recursively.
        async with self.engine._lock:
            session = self.engine.session
            if not session or session.phase != 'active' or not {FOLLOW, GROUPS} <= session.overridden:
                raise ValueError('An active manually controlled Follow me session is required.')
            source = self.io.state(FOLLOW_SOURCE)['state']
            if leave:
                if self.adapter.sonos.can_leave(room, source):
                    await self.io.call('media_player', 'unjoin', [room], {})
                return self.engine.status()
            if (self.io.state(FOLLOW)['state'] != 'on' or source not in SPEAKERS
                    or room not in SPEAKERS[1:] or room == source
                    or self.io.state(source)['state'] not in ('playing', 'buffering')
                    or self.io.state(room)['state'] in ('unknown', 'unavailable')):
                raise ValueError('This room is not following the saved source.')
            members = self.io.state(source)['attributes'].get('group_members') or [source]
            if room not in members:
                await self.io.call('media_player', 'join', [source], {'group_members': [room]})
            return self.engine.status()

    @asynccontextmanager
    async def manual_playback(self, source_entity, context_id):
        """Release playback durably, then gate moods over the delegated effect.

        The caller must retain this context through actual service settlement,
        even if its own response deadline expires. Follow me and observers use
        the ordinary engine lock while the network operation is yielded.
        """
        from .coordinator import PersistenceError
        from .sonos import SPEAKERS, PLAYBACK_SOURCES
        if source_entity not in SPEAKERS or not isinstance(context_id, str) or not context_id:
            raise ValueError('A known speaker and real caller context are required.')
        self.io.check_open()
        engine = self.engine
        engine._manual_playback_active += 1
        try:
            groups = self.adapter.sonos._groups()
            members = next(group for group in groups if source_entity in group)
            targets = {entity + '#playback' for entity in PLAYBACK_SOURCES if entity in members}
            # Capture manual intent before any awaited old write can resume.
            for target in targets:
                engine.note_external(target)
            await self.ensure_startup_ready()
            async with engine._lock:
                # A timed-out HA service may still be running in its executor.
                # Settling the coordinator coroutine alone is insufficient.
                await self.io.settle_pending()
                await engine._load()
                if engine._storage_failed:
                    raise PersistenceError('Mood ownership persistence is unavailable.')
                if engine.session:
                    for target in targets:
                        engine.note_external(target)
                    await engine._save()  # Failure must reach the manual launcher.
            yield
        finally:
            engine._manual_playback_active -= 1

    async def async_supersede_playback(self, source_entity, context_id):
        """Compatibility release hook; launchers use the full transaction above."""
        async with self.manual_playback(source_entity, context_id):
            pass

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
        for name in ('activate', 'end', 'retry_restoration', 'follow_join', 'follow_leave', 'apply_mode'):
            self.hass.services.async_remove('house_moods', name)

async def async_setup(hass, config):
    import voluptuous as vol
    from homeassistant.core import CoreState, SupportsResponse, callback
    from homeassistant.const import EVENT_CALL_SERVICE, EVENT_STATE_CHANGED, EVENT_HOMEASSISTANT_STARTED, EVENT_HOMEASSISTANT_STOP
    from .model import MOODS
    from .presets import NEON
    callback(Runtime.state_changed)
    callback(Runtime.service_called)
    hass.data['house_moods_coordinated_modes'] = (config.get('house_moods') or {}).get('coordinated_modes', False) is True
    runtime = Runtime(hass)
    hass.data['house_moods'] = runtime
    runtime.publish(runtime.engine.status())
    runtime.unsubscribers.extend([
        hass.bus.async_listen(EVENT_STATE_CHANGED, runtime.state_changed),
        hass.bus.async_listen(EVENT_CALL_SERVICE, runtime.service_called),
        runtime.adapter.native_subscribe(lambda: runtime.observe(NEON)),
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, runtime.close),
    ])
    for name in ('activate', 'end', 'retry_restoration', 'follow_join', 'follow_leave', 'apply_mode'):
        schema = vol.Schema({vol.Required('mood'): vol.In(MOODS)}) if name == 'activate' else vol.Schema({vol.Required('room'): str}) if name in ('follow_join', 'follow_leave') else vol.Schema({vol.Required('mode'): vol.In(('day', 'night'))}) if name == 'apply_mode' else vol.Schema({})
        hass.services.async_register('house_moods', name, runtime.handle, schema=schema, supports_response=SupportsResponse.ONLY)
    async def started(event=None):
        runtime.unsubscribers.append(runtime.adapter.native_subscribe(lambda: runtime.observe(NEON)))
        await runtime.ensure_startup_ready()
    if hass.state == CoreState.running:
        await started()
    else:
        runtime.unsubscribers.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started))
    return True
