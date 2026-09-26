"""Captured household Day/Night effects; rollout must disable legacy writers first."""
# Verified against the live LocalTuya device/entity registry on 2026-09-26.
TUYA_LIGHTS = {
    'light.office_bulbs': '05007261bcddc23010d3',
    'light.light_living_room_bulbs': '05007261bcddc239d5da',
    'light.living_room_led_strip': '50040117e868e78a390a',
    'light.light_toilet': '60357018b4e62d670486',
    'light.light_bedroom': '60357018dc4f2261c6cc',
    'light.light_front_door': '60357018dc4f2261ffa2',
    'light.light_kitchen': '60357018dc4f22620d04',
}
MODE_ENTITIES = {'day': 'input_boolean.morning_mode', 'night': 'input_boolean.night_mode'}
LEGACY_AUTOMATIONS = (
    'automation.bedroom_lights_on_when_morning_mode_turns_on',
    'automation.apply_night_mode',
    'automation.reset_morning_mode_at_9_30pm',
)

class ModeControls:
    def __init__(self, io):
        self.io = io
    def available(self):
        # Positive explicit rollout acknowledgement plus runtime guard. Missing
        # legacy entities are not proof they stopped: require known disabled state.
        return bool(self.io.hass.data.get('house_moods_coordinated_modes')) and all(
            self.io.state(entity)['state'] == 'off' for entity in LEGACY_AUTOMATIONS)
    async def preflight(self, mode):
        if mode not in MODE_ENTITIES:
            raise ValueError('Unknown mode')
        if not self.available():
            raise ValueError('Coordinated mode rollout is not ready')
        if any(self.io.state(entity)['state'] not in ('on', 'off') for entity in MODE_ENTITIES.values()):
            raise ValueError('Both mode helpers must be available')
        if not self.io.hass.services.has_service('localtuya', 'set_dp'):
            raise ValueError('LocalTuya brightness staging is unavailable')
    def targets(self, mode):
        return list(TUYA_LIGHTS)
    def steps(self, mode):
        return ['opposite_off', *(['toilet_off'] if mode == 'night' else []), *TUYA_LIGHTS, 'selected_on']
    def target(self, mode, step):
        return 'light.light_toilet' if step == 'toilet_off' else step if step in TUYA_LIGHTS else None
    async def apply(self, mode, step, session_id):
        # Recheck the deployment guard on every step, including after restart.
        await self.preflight(mode)
        if step == 'opposite_off':
            other = MODE_ENTITIES['day' if mode == 'night' else 'night']
            await self.io.call('input_boolean', 'turn_off', [other], {}, session_id)
        elif step == 'selected_on':
            await self.io.call('input_boolean', 'turn_on', [MODE_ENTITIES[mode]], {}, session_id)
        elif step == 'toilet_off':
            await self.io.call('light', 'turn_off', ['light.light_toilet'], {}, session_id)
        elif step in TUYA_LIGHTS:
            await self.io.call('localtuya', 'set_dp', [], {
                'device_id': TUYA_LIGHTS[step], 'dp': 22,
                'value': 126 if mode == 'night' else 1000,
            }, session_id)
        else:
            raise ValueError('Unknown mode step')
