"""Optional replay of locally retained, uncommitted household evidence."""
import json
from datetime import datetime
from pathlib import Path
import unittest
from test_engine import Engine, module

HISTORY = Path(__file__).parents[2] / '.local/attention-investigation/history.json'

class ReplayTests(unittest.TestCase):
    @unittest.skipUnless(HISTORY.exists(), 'Private household history is not committed')
    def test_recorded_six_completions_and_short_cloud_gap(self):
        history = json.loads(HISTORY.read_text())
        rows = []
        for stream in history:
            if not stream: continue
            entity = stream[0]['entity_id']
            if entity not in module.ENTITIES: continue
            for item in stream:
                rows.append((datetime.fromisoformat(item['last_changed']).timestamp(), entity, item['state']))
        rows.sort()
        engine = Engine(rows[0][0] - 121)
        seen = {}
        dishwasher_gap_alerts = []
        for timestamp, entity, state in rows:
            engine.update(entity, state, {}, timestamp)
            for item in engine.items(timestamp):
                if item['kind'] == 'completion': seen[item['episode']] = item['id']
                if item['id'] == 'lost:dishwasher': dishwasher_gap_alerts.append(timestamp)
        self.assertEqual(list(seen.values()).count('complete:washer'), 1)
        self.assertEqual(list(seen.values()).count('complete:dryer'), 4)
        self.assertEqual(list(seen.values()).count('complete:dishwasher'), 1)
        # Initial job=unknown before the dishwasher began reporting stages can
        # legitimately create uncertainty; specifically check the 31-second gap.
        gap_start = datetime.fromisoformat('2026-09-05T21:16:19+00:00').timestamp()
        self.assertFalse([t for t in dishwasher_gap_alerts if gap_start <= t <= gap_start + 32])
