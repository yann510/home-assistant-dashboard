"""Check the Party recipe using the actual Lepro palette parser/generator."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from test_light_effect_preservation import load_light

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from custom_components.house_moods.presets import NEON_EFFECTS, NEON_BRIGHTNESS


class PartyPaletteTests(unittest.TestCase):
    def test_party_is_full_rainbow_at_maximum_gradient_speed(self):
        cls, _ = load_light()
        light = cls(dict(did='test', fid='test', name='Party neon', series='N1',
                         d2=2, d50=NEON_EFFECTS['party'], d52=1000, switch=1),
                    SimpleNamespace(), 'test')
        expected = [(255, 0, 0), (255, 128, 0), (255, 255, 0),
                    (0, 255, 0), (0, 128, 255), (75, 0, 255), (255, 0, 128)]
        self.assertEqual(set(light._segment_colors), set(expected))
        self.assertEqual(len(light._segment_colors), 25)
        self.assertEqual(light.effect, light.EFFECT_GRADIENT)
        self.assertAlmostEqual(light._speed, 100, delta=0.5)
        self.assertEqual(NEON_BRIGHTNESS['party'], 1000)
        self.assertEqual(light._generate_d50_string(), NEON_EFFECTS['party'])
