"""Run against the hash-guarded Lepro baseline with our patch applied.

LEPRO_BASELINE_DIR can point at an exported integration; no device connection is used.
"""
import ast
import colorsys
import json
import logging
import math
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import tempfile
import time
import textwrap
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(os.environ.get('LEPRO_BASELINE_DIR', ROOT.parent / '.local/lepro-baseline'))
RAINBOW = json.loads((ROOT / 'tests/fixtures/office-neon-original-effect.json').read_text())['service_data']['payload']['d50']
ROSE = 'N01:P10001FF3377F2100010019U3V3000640000E40032000000321664;'
WAVE = '2010064320000'


def load_light():
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp)
        for name in ('light.py', '__init__.py', 'services.yaml'):
            shutil.copy2(BASELINE / name, target / name)
        subprocess.run(['patch', '-p1', '-i', str(ROOT / 'lepro-extension/integration.patch')], cwd=target, check=True, capture_output=True)
        source = (target / 'light.py').read_text()
        tree = ast.parse(source)
    light = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'LeproLedLight')
    class Entity:
        name = "Test light"
        def async_write_ha_state(self):
            pass
    namespace = dict(LightEntity=Entity, LightEntityFeature=SimpleNamespace(EFFECT=1),
                     ColorMode=SimpleNamespace(RGB='rgb', COLOR_TEMP='color_temp'),
                     DOMAIN='lepro_led', _LOGGER=logging.getLogger('lepro-test'),
                     np=math, colorsys=colorsys, re=re, json=json, random=random, time=time)
    namespace.update({name: name.removeprefix('ATTR_').lower() for name in ('ATTR_BRIGHTNESS', 'ATTR_RGB_COLOR', 'ATTR_COLOR_TEMP_KELVIN', 'ATTR_EFFECT', 'ATTR_RGBW_COLOR')})
    exec(compile(ast.Module(body=[light], type_ignores=[]), 'patched-light.py', 'exec'), namespace)
    report = source[source.index('                # Update basic state'):source.index('                # Normalize devices')]
    exec('def apply_report(entity, data):\n' + textwrap.indent(textwrap.dedent(report), '    '), namespace)
    return namespace['LeproLedLight'], namespace['apply_report']


class EffectPreservationTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.light_class, report = load_light()
        cls.report = staticmethod(report)

    def device(self, mode=2, palette=ROSE, series='N1'):
        self.sent = []
        async def publish(topic, body):
            self.sent.append(json.loads(body)['d'])
        device = dict(did='test', fid='test', name='Neon', series=series,
                      d2=mode, d50=palette, d60=WAVE, d52=349, switch=1)
        light = self.light_class(device, SimpleNamespace(publish=publish), 'test')
        light.hass = SimpleNamespace(data={'lepro_led': {'test': {}}})
        return light

    def test_startup_ignores_inactive_special_effect(self):
        light = self.device()
        self.assertEqual(light.effect, light.EFFECT_BREATH)

    async def test_brightness_change_does_not_activate_retained_music_mode(self):
        light = self.device()
        await light.async_turn_on(brightness=255)
        self.assertEqual(self.sent, [{'d1': 1, 'd2': 2, 'd50': ROSE, 'd52': 1000}])

    async def test_custom_palette_survives_power_and_brightness_changes(self):
        for mode in (2, 3):
            for kwargs in ({}, {'brightness': 127}):
                with self.subTest(mode=mode, kwargs=kwargs):
                    light = self.device(mode=mode, palette=RAINBOW)
                    await light.async_turn_on(**kwargs)
                    key, recipe = ('d50', RAINBOW) if mode == 2 else ('d60', WAVE)
                    self.assertEqual(self.sent, [{'d1': 1, 'd2': mode, key: recipe, 'd52': 498 if kwargs else 349}])

    def test_partial_inactive_report_does_not_replace_active_effect(self):
        light = self.device()
        light._update_native_effect_state({'d60': WAVE})
        self.assertEqual(light.effect, light.EFFECT_BREATH)
        light._mode = 3
        light._update_native_effect_state({'d2': 3})
        self.assertEqual(light.effect, light.EFFECT_WAVE1)
        light._mode = 2
        light._update_native_effect_state({'d2': 2})
        self.assertEqual(light.effect, light.EFFECT_BREATH)

    async def test_explicit_color_and_effect_remain_supported(self):
        light = self.device(palette=RAINBOW)
        await light.async_turn_on(rgb_color=(255, 0, 100), effect=light.EFFECT_BREATH)
        self.assertEqual(self.sent[0]['d2'], 2)
        self.assertNotEqual(self.sent[0]['d50'], RAINBOW)

    async def test_report_then_brightness_keeps_active_native_recipe(self):
        light = self.device(mode=3)
        self.report(light, {'d2': 2, 'd50': ROSE, 'd60': WAVE, 'd52': 349})
        self.assertEqual(light.effect, light.EFFECT_BREATH)
        await light.async_turn_on(brightness=255)
        self.assertEqual(self.sent[-1], {'d1': 1, 'd2': 2, 'd50': ROSE, 'd52': 1000})

    async def test_immediate_brightness_after_explicit_special_effect(self):
        light = self.device()
        await light.async_turn_on(effect=light.EFFECT_WAVE2)
        previous = self.sent[-1]
        await light.async_turn_on(brightness=200)
        self.assertEqual(self.sent[-1], {**previous, 'd52': 784})

    async def test_b_bulb_bare_power_path_remains_unchanged(self):
        light = self.device(series='B1')
        await light.async_turn_on()
        self.assertEqual(self.sent, [{'d1': 1}])
