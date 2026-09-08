"""Sonos controls behind a small asynchronous Home Assistant I/O boundary."""
from copy import deepcopy
from math import isfinite
from uuid import uuid4
from .model import ControlWrite

SOURCE = 'media_player.living_room'
SPEAKERS = (SOURCE, 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym')
FOLLOW = 'input_boolean.speaker_follow_motion'
FOLLOW_SOURCE = 'input_text.speaker_follow_source'
FOLLOW_SCRIPT = 'script.speaker_follow_motion'
GROUPS = 'sonos#groups'
FAVORITES = {
    'love': ('FV:2/1', 'Crush Radio', .25, True),
    'unwind': ('FV:2/4', 'Chill House Mix', .20, True),
    'dinner': ('FV:2/3', 'Cozy Dinner Mix', .20, False),
    'party': ('FV:2/7', 'Electro House Mix', .40, True),
}


def resolve_favorite(items, expected_id, title):
    candidates = [item for item in items if item.get('can_play') and item.get('title') == title]
    exact = [item for item in candidates if item.get('media_content_id') == expected_id]
    selected = exact if len(exact) == 1 else candidates
    if len(selected) != 1:
        raise ValueError(f'{title} is missing or ambiguous in Sonos favorites.')
    item = selected[0]
    if not item.get('media_content_type') or not item.get('media_content_id'):
        raise ValueError(f'{title} has no playable Sonos reference.')
    return deepcopy(item)


def _canonical(groups):
    result = []
    for group in groups:
        if not group:
            continue
        group = [group[0], *sorted(set(group[1:]) - {group[0]}, key=SPEAKERS.index)]
        if group not in result:
            result.append(group)
    return sorted(result, key=lambda group: SPEAKERS.index(group[0]))


def _remove(groups, speaker):
    result = [[e for e in g if e != speaker] for g in groups]
    return _canonical([*result, [speaker]])


class SonosControls:
    def __init__(self, io):
        self.io = io
        self._favorites = {}

    def snapshot_targets(self):
        return [*[e + '#volume' for e in SPEAKERS], GROUPS, SOURCE + '#playback', FOLLOW]

    def included_targets(self, mood):
        # Switching recipes retains music controls even without a physical write.
        return self.snapshot_targets()

    def owns(self, target):
        return target in self.snapshot_targets()

    def _available(self, entity):
        raw = self.io.state(entity)
        if not isinstance(raw, dict) or not isinstance(raw.get('state'), str) or raw['state'] in ('unavailable', 'unknown'):
            raise ValueError(f'{entity} is unavailable; retry when telemetry returns.')
        return raw

    def _volume(self, entity):
        raw = self._available(entity)
        attrs = raw.get('attributes')
        volume = attrs.get('volume_level') if isinstance(attrs, dict) else None
        if isinstance(volume, bool) or not isinstance(volume, (int, float)) or not isfinite(volume) or not 0 <= volume <= 1:
            raise ValueError(f'{entity} volume is unavailable; retry when telemetry returns.')
        return volume

    def _groups(self):
        reports = {}
        for speaker in SPEAKERS:
            attrs = self._available(speaker).get('attributes')
            members = attrs.get('group_members') if isinstance(attrs, dict) else None
            if (not isinstance(members, list) or not members
                    or any(not isinstance(e, str) or e not in SPEAKERS for e in members)
                    or speaker not in members or len(set(members)) != len(members)):
                raise ValueError(f'{speaker} group report is incomplete; retry when telemetry returns.')
            reports[speaker] = _canonical([members])[0]
        # Every member must report the same coordinator and membership. A partial
        # join/unjoin event is not evidence of a manual replacement of the graph.
        for members in reports.values():
            if any(reports[member] != members for member in members):
                raise ValueError('Sonos group reports are inconsistent; retry once they settle.')
        return _canonical(reports.values())

    def _follow(self):
        state = self._available(FOLLOW)['state']
        source = self._available(FOLLOW_SOURCE)['state']
        if state not in ('on', 'off') or source not in ('', *SPEAKERS) or (state == 'on' and not source):
            raise ValueError('Follow me has no valid switch/source report; retry once it settles.')
        return {'state': state, 'source': source}

    async def read(self, target):
        if target == FOLLOW:
            return self._follow()
        if target == GROUPS:
            return {'groups': self._groups()}
        entity, control = target.split('#', 1)
        if control == 'volume':
            return {'volume_level': self._volume(entity)}
        raw = self._available(entity)
        if control != 'playback' or entity != SOURCE:
            raise ValueError('Unsupported Sonos control')
        if raw['state'] in ('unavailable', 'unknown'):
            raise ValueError('Living Room speaker is unavailable.')
        queue = await self.io.queue(entity)
        uris = [item.get('media_content_id') for item in queue]
        if any(not isinstance(uri, str) for uri in uris):
            raise ValueError('Sonos queue identity is unavailable.')
        attrs = raw['attributes']
        return {
            'state': 'playing' if raw['state'] in ('playing', 'buffering') else 'stopped',
            'queue': uris,
            'source': attrs.get('source'),
            # Queued track IDs naturally advance. A non-queue stream URI is its identity.
            'stream': None if uris else attrs.get('media_content_id'),
        }

    async def preflight(self, mood):
        ident, title, _, _ = FAVORITES[mood]
        if self.io.state(SOURCE)['state'] in ('unavailable', 'unknown'):
            raise ValueError('Living Room speaker is unavailable.')
        for entity in (FOLLOW, FOLLOW_SOURCE, FOLLOW_SCRIPT):
            if self.io.state(entity)['state'] in ('unavailable', 'unknown'):
                raise ValueError('Follow me is unavailable.')
        if self.io.state(FOLLOW_SCRIPT)['state'] == 'on':
            raise ValueError('Follow me is updating. Please try again once it finishes.')
        follow = self._follow()
        if follow['state'] == 'on' and follow['source'] not in SPEAKERS:
            raise ValueError('Follow me has no valid source. Turn it off before starting a mood.')
        self._groups()
        # Every configured speaker may be changed by follow-me during this session.
        # Capture a restorable baseline instead of inventing optional offline state.
        for speaker in SPEAKERS:
            self._volume(speaker)
        found, visited = [], set()
        async def visit(kind, ident, depth=0):
            key = (kind, ident)
            if key in visited:
                return
            if depth > 5 or len(visited) >= 50:
                raise ValueError('Sonos favorites contain too many folders.')
            visited.add(key)
            result = await self.io.browse(SOURCE, kind, ident)
            for item in result.get('children', []):
                if item.get('can_play'):
                    found.append(item)
                elif item.get('can_expand'):
                    await visit(item['media_content_type'], item['media_content_id'], depth + 1)
        await visit('favorites', '')
        self._favorites[mood] = resolve_favorite(found, ident, title)

    @staticmethod
    def _write(action, requested, data):
        return ControlWrite(str(uuid4()), action, list(requested), requested, data)

    async def plan_apply(self, mood):
        if mood not in self._favorites:
            raise ValueError('Validate the Sonos favorite before activation.')
        _, _, volume, following = FAVORITES[mood]
        follow = self._follow()
        groups = self._groups()
        writes = []
        if follow['source'] and (follow['state'] != 'on' or not following or follow['source'] != SOURCE):
            old = next((g for g in groups if follow['source'] in g), [])
            groups = _canonical([g for g in groups if g != old] + [[e] for e in old])
            follow = {'state': 'off', 'source': ''}
            writes.append(self._write('sonos.follow_disable', {FOLLOW: follow, GROUPS: {'groups': groups}}, {}))
        source_group = next(g for g in groups if SOURCE in g)
        if source_group[0] != SOURCE:
            groups = _remove(groups, SOURCE)
            writes.append(self._write('sonos.unjoin', {GROUPS: {'groups': groups}}, {'entity': SOURCE}))
        writes.append(self._write('sonos.volume', {SOURCE + '#volume': {'volume_level': volume}}, {'entity': SOURCE, 'volume_level': volume}))
        # Confirm a stopped boundary so old, already-playing music cannot
        # falsely acknowledge a rejected/delayed favorite command.
        writes.append(self._write('sonos.stop', {SOURCE + '#playback': {'state': 'stopped'}}, {}))
        writes.append(self._write('sonos.play', {SOURCE + '#playback': {'state': 'playing'}}, self._favorites[mood]))
        if following:
            writes.append(self._write('sonos.follow_enable', {FOLLOW: {'state': 'on', 'source': SOURCE}}, {}))
        return writes

    async def plan_join(self, room):
        if room not in SPEAKERS or room == SOURCE or self._follow() != {'state': 'on', 'source': SOURCE}:
            raise ValueError('This room is not following the active mood.')
        if self.io.state(room)['state'] in ('unavailable', 'unknown'):
            raise ValueError('The following speaker is unavailable.')
        groups = self._groups()
        current = next(g for g in groups if SOURCE in g)
        if room in current:
            return None
        groups = _remove(groups, room)
        groups = [g for g in groups if g != [room]]
        current = next(g for g in groups if SOURCE in g)
        current.append(room)
        return self._write('sonos.join', {GROUPS: {'groups': _canonical(groups)}}, {'entity': room})

    async def apply_write(self, write, session_id):
        data, action = write.data, write.action
        call = self.io.call
        if action == 'sonos.volume':
            await call('media_player', 'volume_set', [data['entity']], {'volume_level': data['volume_level']}, session_id)
            await self.io.wait(lambda: abs(self._volume(data['entity']) - data['volume_level']) <= .01)
        elif action == 'sonos.stop':
            await call('media_player', 'media_stop', [SOURCE], {}, session_id)
            await self.io.wait(lambda: self.io.state(SOURCE)['state'] in ('idle', 'paused', 'off'))
        elif action == 'sonos.play':
            await call('media_player', 'play_media', [SOURCE], {k: data[k] for k in ('media_content_id', 'media_content_type')}, session_id)
            await self.io.wait(lambda: self.io.state(SOURCE)['state'] in ('playing', 'buffering'))
        elif action in ('sonos.follow_enable', 'sonos.follow_disable'):
            command = 'enable' if action.endswith('enable') else 'disable'
            result = await call('script', 'speaker_follow_motion', [], {'command': command, **({'source_entity': SOURCE} if command == 'enable' else {})}, session_id, return_response=True)
            if result.get('success') is not True:
                raise ValueError(result.get('error') or 'Follow me did not confirm the change.')
            await self.io.wait(lambda: self._follow() == write.requested[FOLLOW])
        elif action == 'sonos.freeze_follow':
            await call('input_boolean', 'turn_off', [FOLLOW], {}, session_id)
            await self.io.wait(lambda: self.io.state(FOLLOW)['state'] == 'off' and self.io.state(FOLLOW_SCRIPT)['state'] == 'off')
        elif action in ('sonos.join', 'sonos.unjoin'):
            join = action.endswith('.join')
            await call('media_player', 'join' if join else 'unjoin', [SOURCE] if join else [data['entity']], {'group_members': [data['entity']]} if join else {}, session_id)
        else:
            raise ValueError('Unsupported Sonos mood action')
        if GROUPS in write.targets:
            await self.io.wait(lambda: self._groups() == write.requested[GROUPS]['groups'])
        return {target: await self.read(target) for target in write.targets}

    def restoration_state(self, target, baseline):
        return {'state': 'stopped'} if target.endswith('#playback') else baseline

    async def prepare_restore(self, session):
        if FOLLOW not in session.owned or FOLLOW in session.overridden:
            return []
        follow = self._follow()
        if FOLLOW in session.owned and FOLLOW not in session.overridden and follow['state'] == 'on':
            return [self._write('sonos.freeze_follow', {FOLLOW: dict(follow, state='off')}, {})]
        return []

    async def restore(self, target, baseline, session_id):
        call = self.io.call
        if target == FOLLOW:
            # Group restoration is owned separately. Do not invoke disable, whose
            # normal cleanup would alter the already restored group graph.
            await call('input_boolean', 'turn_off', [FOLLOW], {}, session_id)
            await self.io.wait(lambda: self.io.state(FOLLOW_SCRIPT)['state'] == 'off')
            await call('input_text', 'set_value', [FOLLOW_SOURCE], {'value': baseline['source']}, session_id)
            if baseline['state'] == 'on':
                await call('input_boolean', 'turn_on', [FOLLOW], {}, session_id)
            await self.io.wait(lambda: self._follow() == baseline)
        elif target == GROUPS:
            desired = baseline['groups']
            if self._groups() == desired:
                return
            # All group mutations are one explicitly journaled aggregate control.
            unchanged = [group for group in self._groups() if group in desired]
            for group in self._groups():
                if group in unchanged:
                    continue
                for member in group[1:]:
                    await call('media_player', 'unjoin', [member], {}, session_id)
            for group in desired:
                if len(group) > 1 and group not in unchanged:
                    await call('media_player', 'join', [group[0]], {'group_members': group[1:]}, session_id)
            await self.io.wait(lambda: self._groups() == desired)
        elif target.endswith('#volume'):
            if baseline['volume_level'] is None:
                raise ValueError('The previous speaker volume was unavailable.')
            entity = target.split('#')[0]
            await call('media_player', 'volume_set', [entity], baseline, session_id)
            await self.io.wait(lambda: abs(self._volume(entity) - baseline['volume_level']) <= .01)
        elif target == SOURCE + '#playback':
            await call('media_player', 'media_stop', [SOURCE], {}, session_id)
            await self.io.wait(lambda: self.io.state(SOURCE)['state'] in ('idle', 'paused', 'off'))
        else:
            raise ValueError('Unsupported Sonos restore target')
