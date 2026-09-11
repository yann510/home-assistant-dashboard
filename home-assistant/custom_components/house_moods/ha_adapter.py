"""Home Assistant I/O and composition of the fixed household controls."""
import asyncio
from copy import deepcopy
from homeassistant.core import Context, CoreState
from .lights import LightControls
from .presets import NEON
from .sonos import SonosControls, SPEAKERS, SOURCE, PLAYBACK_SOURCES, FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT, GROUPS

DEVICE = '754063076'
ENTRY = '01M20KMKHSQVZTTT0QVQC109JS'

class HAIO:
    def __init__(self, hass):
        self.hass = hass
        self.contexts = {}
        self.closed = False

    def origin(self, context):
        origin = self.contexts.get(context.id) or self.contexts.get(context.parent_id)
        if origin:
            self.contexts[context.id] = origin
        return origin

    def state(self, entity):
        state = self.hass.states.get(entity)
        return {'state': state.state, 'attributes': dict(state.attributes)} if state else {'state': 'unavailable', 'attributes': {}}

    def check_open(self):
        if self.closed or self.hass.state in (CoreState.stopping, CoreState.final_write, CoreState.stopped):
            raise asyncio.CancelledError

    async def call(self, domain, service, targets, data, session_id=None, return_response=False):
        self.check_open()
        context = Context()
        if session_id:
            self.contexts[context.id] = session_id
        try:
            return await self.hass.services.async_call(domain, service, deepcopy(data),
                target={'entity_id': targets} if targets else None, blocking=True,
                context=context, return_response=return_response)
        except Exception:
            raise RuntimeError(f'{domain}.{service} did not complete.') from None

    async def wait(self, predicate, timeout=15):
        async with asyncio.timeout(timeout):
            while True:
                self.check_open()
                if predicate():
                    return
                await asyncio.sleep(.05)

    async def queue(self, entity):
        result = await self.call('sonos', 'get_queue', [entity], {}, return_response=True)
        if not isinstance(result, dict) or not isinstance(result.get(entity), list):
            raise ValueError('Sonos queue identity is unavailable.')
        return result[entity]

    async def browse(self, entity, kind, ident):
        from homeassistant.components.media_player import DATA_COMPONENT
        component = self.hass.data.get(DATA_COMPONENT)
        player = component.get_entity(entity) if component else None
        if player is None:
            raise ValueError('Living Room media browser is unavailable.')
        try:
            return (await player.async_browse_media(kind, ident)).as_dict()
        except Exception:
            raise RuntimeError('Sonos favorites could not be read.') from None

class LazyBridge:
    def __init__(self, hass):
        self.hass = hass
        self.busy = 0
        self.callback = None
        self.unsubscribe = None
        self.bridge = None

    def resolve(self):
        entry = self.hass.data.get('lepro_led', {}).get(ENTRY, {})
        entities = [e for e in entry.get('entities', []) if getattr(e, '_did', None) == DEVICE and getattr(e, 'entity_id', None) == NEON]
        bridge = entry.get('native_state')
        if len(entities) != 1 or bridge is None:
            raise ValueError('Office neon native state bridge is unavailable.')
        if bridge is not self.bridge:
            if self.unsubscribe:
                self.unsubscribe()
            self.bridge = bridge
            self.unsubscribe = bridge.subscribe(self.report)
        return bridge

    def report(self, device, kind, fields, timestamp):
        # Own capture/replay emits getr. Never recursively capture that response.
        if device == DEVICE and kind in ('rpt', 'getr') and not (self.busy and kind == 'getr') and self.callback:
            self.callback()

    async def capture(self, device):
        bridge = self.resolve()
        self.busy += 1
        try:
            return await bridge.capture(device)
        except Exception:
            raise RuntimeError('Office neon native state could not be read.') from None
        finally:
            self.busy -= 1

    async def replay(self, snapshot):
        bridge = self.resolve()
        self.busy += 1
        try:
            return await bridge.replay(snapshot)
        except Exception:
            raise RuntimeError('Office neon native restoration did not complete.') from None
        finally:
            self.busy -= 1

    def close(self):
        self.callback = None
        if self.unsubscribe:
            self.unsubscribe()
            self.unsubscribe = None

class HAAdapter:
    def __init__(self, hass, io=None):
        self.io = io or HAIO(hass)
        self.bridge = LazyBridge(hass)
        self.lights = LightControls(self.io, self.bridge, DEVICE)
        self.sonos = SonosControls(self.io)

    def control(self, target):
        if self.lights.owns(target):
            return self.lights
        if self.sonos.owns(target):
            return self.sonos
        raise ValueError('Unknown mood control')

    async def snapshot_targets(self):
        return self.lights.snapshot_targets() + self.sonos.snapshot_targets()

    async def included_targets(self, mood):
        return self.lights.included_targets(mood) + self.sonos.included_targets(mood)

    async def preflight(self, mood):
        await self.lights.preflight(mood)
        await self.sonos.preflight(mood)

    async def plan_apply(self, mood):
        return await self.lights.plan_apply(mood) + await self.sonos.plan_apply(mood)

    async def read(self, target):
        return await self.control(target).read(target)

    async def capture(self, targets):
        return {t: await self.read(t) for t in targets}

    async def apply_write(self, write, session_id):
        return await self.control(write.targets[0]).apply_write(write, session_id)

    async def restore(self, target, baseline, session_id):
        return await self.control(target).restore(target, baseline, session_id)

    def restoration_state(self, target, baseline):
        return self.control(target).restoration_state(target, baseline)

    def restore_dependencies(self):
        return {GROUPS, FOLLOW}

    async def prepare_restore(self, session):
        return await self.sonos.prepare_restore(session)

    def observation_targets(self, entity):
        if self.lights.owns(entity):
            if entity == NEON:
                try:
                    self.bridge.resolve()
                except ValueError:
                    pass
                return []
            return [entity]
        if entity in (FOLLOW, FOLLOW_SOURCE):
            return [FOLLOW]
        if entity in SPEAKERS:
            return [entity + '#volume', GROUPS] + ([entity + '#playback'] if entity in PLAYBACK_SOURCES else [])
        return []

    def native_subscribe(self, callback):
        self.bridge.callback = callback
        try:
            self.bridge.resolve()
        except ValueError:
            pass  # YAML setup may precede the Lepro config entry.
        return self.bridge.close
