"""Native snapshots remain lossless; ordinary HA color services are never used."""
from copy import deepcopy
from .presets import NEON_EFFECTS, NEON_BRIGHTNESS


def normalized(snapshot):
    return {'native': deepcopy(snapshot.fields), 'snapshot': snapshot.to_dict()}


class NeonControls:
    def __init__(self, bridge, device_id):
        self.bridge = bridge
        self.device_id = device_id

    async def read(self):
        return normalized(await self.bridge.capture(self.device_id))

    async def recipe(self, mood):
        original = await self.bridge.capture(self.device_id)
        value = original.to_dict()
        # Retain inactive mode fields too: every field in the comparison is exact.
        value['fields'].update(d1=1, d2=2, d50=NEON_EFFECTS[mood], d52=NEON_BRIGHTNESS[mood])
        return type(original).from_dict(value)

    async def replay(self, value):
        # A fresh bridge snapshot gives us its validated class without importing HA
        # or duplicating the extension's schema. Restart restoration uses this too.
        current = await self.bridge.capture(self.device_id)
        snapshot = type(current).from_dict(deepcopy(value))
        if snapshot.device_id != self.device_id:
            raise ValueError('Office neon snapshot belongs to another device')
        return normalized(await self.bridge.replay(snapshot))
