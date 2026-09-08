"""Native response service handlers, separated from HA registration for testing."""

class NativeServiceHandlers:
    def __init__(self, hass, domain, snapshot_type):
        self.hass = hass
        self.domain = domain
        self.snapshot_type = snapshot_type

    def resolve(self, data):
        device_id = data.get('device_id')
        entity_id = data.get('entity_id')
        if not device_id and not entity_id:
            raise ValueError('Specify a configured native device_id or entity_id')
        matches = []
        for entry_id, entry in self.hass.data.get(self.domain, {}).items():
            if data.get('entry_id') and data['entry_id'] != entry_id:
                continue
            for entity in entry.get('entities', []):
                did = getattr(entity, '_did', None)
                if did is None:
                    continue
                if device_id and did != device_id:
                    continue
                if entity_id and getattr(entity, 'entity_id', None) != entity_id:
                    continue
                matches.append((did, entry.get('native_state')))
        if len(matches) != 1 or matches[0][1] is None:
            raise ValueError('Target does not resolve to one configured native device')
        return matches[0]

    async def capture(self, call):
        did, bridge = self.resolve(call.data)
        return (await bridge.capture(did)).to_dict()

    async def restore(self, call):
        did, bridge = self.resolve(call.data)
        snapshot = self.snapshot_type.from_dict(call.data['snapshot'])
        if snapshot.device_id != did:
            raise ValueError('Snapshot belongs to a different device')
        return (await bridge.replay(snapshot)).to_dict()
