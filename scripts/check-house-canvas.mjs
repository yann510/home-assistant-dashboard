import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction } from '../public/concepts/house-canvas/state.js';
test('Whole house off skips unavailable lights', () => {
  const s = createState('busy');
  applyAction(s, { type: 'all-lights-off' });
  assert.ok(
    s.rooms
      .flatMap(r => r.lights)
      .filter(l => l.available)
      .every(l => !l.on)
  );
  assert.equal(s.rooms[2].lights[1].on, true);
});
test('All blinds commands reach exactly rooms with blinds', () => {
  const s = createState();
  applyAction(s, { type: 'blind', roomId: 'all', value: 'close' });
  assert.ok(s.rooms.every(r => r.lastBlindCommand === (r.blinds ? 'close' : null)));
});
test('Follow prevents manual regrouping; turning off retains original source', () => {
  const s = createState();
  applyAction(s, { type: 'group-all' });
  applyAction(s, { type: 'follow' });
  applyAction(s, { type: 'group-toggle', value: 'Bedroom' });
  assert.equal(s.music.members.length, 4);
  applyAction(s, { type: 'follow' });
  assert.deepEqual(s.music.members, ['Living room']);
});
test('Group volume preserves relative levels and clamps', () => {
  const s = createState();
  applyAction(s, { type: 'group-all' });
  applyAction(s, { type: 'speaker-volume', id: 'Bedroom', value: 90 });
  applyAction(s, { type: 'volume', value: 52 });
  assert.equal(s.music.volumes.Bedroom, 100);
  assert.equal(s.music.volumes['Living room'], 52);
});
