"""Whole-light ownership and confirmed standard/native light operations."""
from copy import deepcopy
import colorsys
from .model import ControlWrite
from .neon import NeonControls
from .ownership import matches
from .presets import STRIP, BULBS, KITCHEN, NEON, LIGHTS

COLOR_KEYS = {'rgb':'rgb_color', 'hs':'hs_color', 'xy':'xy_color', 'color_temp':'color_temp_kelvin', 'rgbw':'rgbw_color', 'rgbww':'rgbww_color'}
TRANSITION = 32  # Home Assistant LightEntityFeature.TRANSITION


class LightControls:
    def __init__(self, io, bridge, device_id):
        self.io = io
        self.neon = NeonControls(bridge, device_id)

    def snapshot_targets(self):
        return [STRIP, BULBS, KITCHEN, NEON]

    def included_targets(self, mood):
        if mood not in LIGHTS:
            raise ValueError('Unknown mood')
        return [*LIGHTS[mood], NEON]

    def owns(self, target):
        return target in self.snapshot_targets()

    def _state(self, target):
        if not self.owns(target):
            raise ValueError(f'Unknown mood light: {target}')
        state = self.io.state(target)
        if not state or state['state'] not in ('on', 'off'):
            raise ValueError(f'{target} is unavailable')
        return state

    def standard_state(self, target):
        state = self._state(target)
        attributes = state['attributes']
        result = {'state': state['state']}
        if state['state'] == 'on':
            mode = attributes.get('color_mode')
            if attributes.get('brightness') is None or mode not in {'brightness', 'white', *COLOR_KEYS}:
                raise ValueError(f'{target} has incomplete brightness/mode state')
            color = COLOR_KEYS.get(mode)
            if color and attributes.get(color) is None:
                raise ValueError(f'{target} has incomplete color state')
        for key in ('brightness', 'color_mode'):
            if attributes.get(key) is not None:
                result[key] = deepcopy(attributes[key])
        color = COLOR_KEYS.get(attributes.get('color_mode'))
        if color and attributes.get(color) is not None:
            result[color] = deepcopy(attributes[color])
        return result

    async def read(self, target):
        self._state(target)
        return await self.neon.read() if target == NEON else self.standard_state(target)

    async def capture(self, targets):
        return {target: await self.read(target) for target in targets}

    async def preflight(self, mood):
        if mood not in LIGHTS:
            raise ValueError('Unknown mood')
        # The coordinator captures the entire collection before writing anything.
        for target in self.snapshot_targets():
            await self.read(target)
        await self.plan_apply(mood)

    def _plan_standard(self, target, data):
        attributes = self._state(target)['attributes']
        modes = attributes.get('supported_color_modes', [])
        data = deepcopy(data)
        if 'rgb_color' in data:
            if 'rgb' not in modes:
                if 'hs' not in modes:
                    raise ValueError(f'{target} must support RGB or HS readback')
                hue, saturation, _ = colorsys.rgb_to_hsv(*(channel / 255 for channel in data.pop('rgb_color')))
                data['hs_color'] = [round(hue * 360, 3), round(saturation * 100, 3)]
        if 'color_temp_kelvin' in data:
            if 'color_temp' not in modes:
                raise ValueError(f'{target} does not support color temperature')
            low, high = attributes.get('min_color_temp_kelvin'), attributes.get('max_color_temp_kelvin')
            if not isinstance(low, (int,float)) or not isinstance(high, (int,float)) or low > high:
                raise ValueError(f'{target} has no valid temperature range')
            data['color_temp_kelvin'] = max(low, min(high, data['color_temp_kelvin']))
        if not modes or set(modes) <= {'onoff', 'unknown'}:
            raise ValueError(f'{target} does not support brightness')
        requested = {'state':'on', **deepcopy(data)}
        if 'rgb_color' in data:
            requested['color_mode'] = 'rgb'
        elif 'hs_color' in data:
            requested['color_mode'] = 'hs'
        elif 'color_temp_kelvin' in data:
            requested['color_mode'] = 'color_temp'
        elif attributes.get('color_mode'):
            requested['color_mode'] = attributes['color_mode']
        transition = 3 if attributes.get('supported_features',0) & TRANSITION else 0
        if transition:
            data['transition'] = transition
        return ControlWrite(f'light:{target}', 'light', [target], {target:requested}, data, transition)

    async def plan_apply(self, mood):
        if mood not in LIGHTS:
            raise ValueError('Unknown mood')
        writes = [self._plan_standard(target, data) for target,data in LIGHTS[mood].items()]
        self._state(NEON)
        snapshot = await self.neon.recipe(mood)
        writes.append(ControlWrite('light:neon', 'native', [NEON], {NEON:{'native':deepcopy(snapshot.fields)}}, snapshot.to_dict()))
        return writes

    async def apply_write(self, write, session_id):
        if len(write.targets) != 1 or not self.owns(write.targets[0]):
            raise ValueError('Invalid light operation')
        target = write.targets[0]
        self._state(target)
        if target == NEON:
            observed = await self.neon.replay(write.data)
        else:
            await self.io.call('light','turn_on',[target],deepcopy(write.data),session_id)
            try:
                await self.io.wait(lambda: matches(target, write.requested[target], self.standard_state(target)))
            except TimeoutError as err:
                raise TimeoutError(f'{target} did not confirm the requested state before timeout') from err
            observed = self.standard_state(target)
        if not matches(target, write.requested[target], observed):
            raise ValueError(f'{target} did not confirm the requested state')
        return {target: observed}

    def restoration_state(self, target, baseline):
        if target == NEON:
            return {'native':deepcopy(baseline['native'])}
        if baseline['state'] == 'off':
            return {'state':'off'}
        return deepcopy(baseline)

    async def restore(self, target, baseline, session_id):
        self._state(target)
        if target == NEON:
            actual = await self.neon.replay(baseline['snapshot'])
            if not matches(target, self.restoration_state(target,baseline), actual):
                raise ValueError('Office neon restoration readback differs')
            return
        desired = self.restoration_state(target, baseline)
        data = {k:deepcopy(v) for k,v in baseline.items() if k in {'brightness', *COLOR_KEYS.values()}} if baseline['state']=='on' else {}
        if self._state(target)['attributes'].get('supported_features',0) & TRANSITION:
            data['transition'] = 3
        await self.io.call('light','turn_on' if baseline['state']=='on' else 'turn_off',[target],data,session_id)
        await self.io.wait(lambda: matches(target,desired,self.standard_state(target)))
