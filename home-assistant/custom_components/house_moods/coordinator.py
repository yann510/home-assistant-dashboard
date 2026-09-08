"""Serialized mood transactions with a durable journal before every write."""
import asyncio
import copy
import time
import uuid
from .model import MOODS, Session
from .ownership import classify, matches

class PersistenceError(Exception):
    pass

class MoodCoordinator:
    def __init__(self, adapter, store, *, on_status=None, clock=time.time):
        self.adapter, self.store = adapter, store
        self.session = None
        self._loaded = False
        self._lock = asyncio.Lock()
        self._clock = clock
        self._on_status = on_status
        self._last_errors = []
        self._storage_failed = False

    def status(self, success=True):
        s = self.session
        return {'success': success, 'session_id': s.session_id if s else None,
                'phase': 'recovery_required' if self._storage_failed else s.phase if s else 'idle',
                'active_mood': s.active_mood if s else None,
                'pending_mood': s.pending_mood if s else None,
                'affected_devices': sorted(s.owned) if s else [],
                'errors': copy.deepcopy(self._last_errors or (s.errors if s else []))}

    def _publish(self):
        if self._on_status:
            # Notification failure must never invalidate durable device evidence.
            try:
                self._on_status(self.status(not bool(self._last_errors)))
            except Exception:
                pass

    async def _save(self):
        try:
            await self.store.save(self.session)
        except Exception as err:
            self._storage_failed = True
            raise PersistenceError(str(err)) from err
        self._publish()

    async def _load(self):
        if not self._loaded:
            try:
                self.session = await self.store.load()
            except Exception as err:
                raise PersistenceError(str(err)) from err
            self._loaded = True
            if self.session:
                await self._reconcile()

    def _error(self, target, err):
        record = {'target': target, 'message': str(err)}
        self._last_errors.append(record)
        if self.session:
            self.session.errors.append(record)

    async def _storage_error(self, err):
        self._storage_failed = True
        self._error('storage', err)
        if self.session:
            self.session.phase = 'recovery_required'
            self.session.active_mood = None
            self.session.pending_mood = None
        # Do not confirm or roll back after failed persistence. A restart sees
        # the last atomic planned entry and reconciles it without writing.
        self._loaded = False
        self._publish()
        return self.status(False)

    async def activate(self, mood):
        if self._lock.locked():
            result = self.status(False)
            result['errors'] = [{'target': 'coordinator', 'message': 'Operation in progress'}]
            return result
        async with self._lock:
            self._last_errors = []
            try:
                await self._load()
                if self._storage_failed or (self.session and self.session.phase != 'active'):
                    self._error('coordinator', 'Resolve recovery before activating a mood')
                    return self.status(False)
                if self.session and self.session.active_mood == mood:
                    return self.status()
                if mood not in MOODS:
                    raise ValueError('Unknown mood')
                # All read-only preparation completes before any operation.
                await self.adapter.preflight(mood)
                writes = await self.adapter.plan_apply(mood)
                targets = set()
                for write in writes:
                    if not write.targets or set(write.targets) != set(write.requested):
                        raise ValueError('Every operation must enumerate its requested controls')
                    targets.update(write.targets)
                included = targets.copy()
                if hasattr(self.adapter, 'included_targets'):
                    included.update(await self.adapter.included_targets(mood))
                capture_targets = included.copy()
                if not self.session and hasattr(self.adapter, 'snapshot_targets'):
                    capture_targets |= set(await self.adapter.snapshot_targets())
                captured = await self.adapter.capture(sorted(capture_targets))
                if set(captured) != capture_targets:
                    raise ValueError('Incomplete target snapshot')
                if not self.session:
                    self.session = Session(str(uuid.uuid4()), None, 'starting')
                s = self.session
                previous = s.included.copy()
                for target in capture_targets:
                    excluded_changed = (target not in previous and target in s.baseline
                                        and not matches(target, s.baseline[target], captured[target]))
                    if target not in s.baseline or (target not in previous and (target in s.overridden or excluded_changed)):
                        s.baseline[target] = copy.deepcopy(captured[target])
                s.phase, s.pending_mood, s.errors = 'starting', mood, []
                await self._save()
                try:
                    dropped = (previous - included) & s.owned
                    blocked, _ = await self._prepare_restoration(dropped)
                    await self._restore_targets(dropped - blocked)
                    if s.phase == 'recovery_required':
                        raise RuntimeError('Dropped controls need recovery')
                    for write in writes:
                        await self._apply_write(write)
                    s.active_mood, s.pending_mood, s.phase, s.included = mood, None, 'active', included
                    await self._save()
                    return self.status()
                except PersistenceError:
                    raise
                except Exception as err:
                    self._error('activation', err)
                    s.phase, s.active_mood, s.pending_mood = 'recovery_required', None, None
                    await self._save()
                    await self._resolve_planned()
                    await self._finish_restoration()
                    return self.status(False)
            except PersistenceError as err:
                return await self._storage_error(err)
            except Exception as err:
                self._error('preflight', err)
                self._publish()
                return self.status(False)

    async def apply_owned_write(self, write):
        """Journal attributed follow-me activity; never reclaim manual controls."""
        if self._lock.locked():
            result = self.status(False)
            result['errors'] = [{'target': 'coordinator', 'message': 'Operation in progress'}]
            return result
        async with self._lock:
            self._last_errors = []
            try:
                await self._load()
                s = self.session
                if self._storage_failed or not s or s.phase != 'active':
                    self._error('coordinator', 'An active mood is required')
                    return self.status(False)
                if not write.targets or set(write.targets) != set(write.requested):
                    raise ValueError('Invalid attributed operation')
                if set(write.targets) & s.overridden:
                    raise ValueError('Attributed operations cannot reclaim manual controls')
                captured = await self.adapter.capture(write.targets)
                if set(captured) != set(write.targets):
                    raise ValueError('Incomplete attributed operation snapshot')
                for target in write.targets:
                    if target in s.owned and not matches(target, s.expected[target], captured[target]):
                        s.overridden.add(target)
                        s.owned.discard(target)
                        await self._save()
                        raise ValueError('Attributed control changed externally')
                    if target not in s.baseline:
                        s.baseline[target] = copy.deepcopy(captured[target])
                try:
                    s.included.update(write.targets)
                    await self._apply_write(write)
                    return self.status()
                except PersistenceError:
                    raise
                except Exception as err:
                    self._error('attributed operation', err)
                    s.phase, s.active_mood, s.pending_mood = 'recovery_required', None, None
                    await self._save()
                    await self._resolve_planned()
                    await self._finish_restoration()
                    return self.status(False)
            except PersistenceError as err:
                return await self._storage_error(err)
            except Exception as err:
                self._error('attributed operation', err)
                return self.status(False)

    async def _apply_write(self, write):
        s = self.session
        before = await self.adapter.capture(write.targets)
        entry = self._entry(write.operation_id, 'apply', write.targets, write.requested, before, write.transition_seconds)
        s.journal.append(entry)
        # Selecting a new mood explicitly reclaims its included
        # controls, even if a previous mood was overridden.
        for target in write.targets:
            s.overridden.discard(target)
        await self._save()
        observations = await self.adapter.apply_write(write, s.session_id)
        for target in write.targets:
            if target not in observations or not matches(target, write.requested[target], observations[target]):
                raise RuntimeError('Device did not confirm requested state: ' + target)
            s.expected[target] = copy.deepcopy(observations[target])
            s.owned.add(target)
            s.overridden.discard(target)
        entry['status'], entry['observed'] = 'confirmed', copy.deepcopy(observations)
        await self._save()

    def _entry(self, operation_id, action, targets, requested, before, transition=0):
        return {'operation_id': operation_id, 'action': action, 'targets': list(targets),
                'requested': copy.deepcopy(requested), 'before': copy.deepcopy(before),
                'status': 'planned', 'observed': {}, 'resolved': [],
                'until': self._clock() + max(0, transition) + 5}

    async def _resolve_planned(self):
        s = self.session
        for entry in s.journal:
            if entry['status'] != 'planned':
                continue
            for target in entry['targets']:
                if target in entry['resolved']:
                    continue
                try:
                    current = await self.adapter.read(target)
                    entry['observed'][target] = copy.deepcopy(current)
                    if target in s.overridden:
                        s.owned.discard(target)
                    elif matches(target, entry['requested'][target], current):
                        if entry['action'] == 'restore':
                            s.owned.discard(target)
                        else:
                            s.owned.add(target)
                            s.expected[target] = copy.deepcopy(current)
                    elif matches(target, entry['before'][target], current):
                        # A failed apply may leave earlier mood ownership intact.
                        pass
                    else:
                        raise RuntimeError('Ambiguous unconfirmed write; ownership requires review')
                    entry['resolved'].append(target)
                except Exception as err:
                    self._error(target, err)
            if set(entry['resolved']) == set(entry['targets']):
                entry['status'] = ('confirmed' if all(matches(t, entry['requested'][t], entry['observed'][t])
                                                    for t in entry['targets']) else 'failed')
            await self._save()

    def _pending_targets(self):
        return {t for entry in self.session.journal if entry['status'] == 'planned'
                for t in entry['targets'] if t not in entry['resolved']}

    async def _restore_targets(self, targets):
        s = self.session
        pending = self._pending_targets()
        for target in sorted(targets & s.owned, key=lambda t: (2 if t == 'input_boolean.speaker_follow_motion' else 0 if t.endswith('#playback') else 1, t)):
            if target in pending or target in s.overridden:
                continue
            try:
                current = await self.adapter.read(target)
                if not matches(target, s.expected[target], current):
                    s.overridden.add(target)
                    s.owned.discard(target)
                    await self._save()
                    continue
                destination = copy.deepcopy(s.baseline[target])
                if hasattr(self.adapter, 'restoration_state'):
                    destination = self.adapter.restoration_state(target, destination)
                entry = self._entry(str(uuid.uuid4()), 'restore', [target], {target: destination}, {target: current})
                s.journal.append(entry)
                await self._save()
                await self.adapter.restore(target, copy.deepcopy(s.baseline[target]), s.session_id)
                current = await self.adapter.read(target)
                if not matches(target, destination, current):
                    raise RuntimeError('Restoration not confirmed')
                entry['status'], entry['observed'] = 'confirmed', {target: current}
                s.owned.discard(target)
                await self._save()
            except PersistenceError:
                raise
            except Exception as err:
                self._error(target, err)
                s.phase = 'recovery_required'
                await self._save()

    def _restoration_dependencies(self):
        """Only these controls are blocked when quiescence cannot be confirmed."""
        if hasattr(self.adapter, 'restore_dependencies'):
            dependencies = self.adapter.restore_dependencies()
            if not isinstance(dependencies, (set, list, tuple)) or any(not isinstance(t, str) for t in dependencies):
                raise ValueError('Invalid restoration dependency controls')
            return set(dependencies)
        # Older adapters can still restore controls known to be independent.
        # Unknown/script controls fail closed until their dependency is stated.
        return {t for t in self.session.baseline
                if not (t.startswith('light.') or t.endswith(('#volume', '#playback')))}

    async def _prepare_restoration(self, targets):
        s = self.session
        if not hasattr(self.adapter, 'prepare_restore') or not targets:
            return set(), False
        dependencies = set(s.baseline)
        try:
            dependencies = self._restoration_dependencies()
            if not targets & dependencies:
                return set(), False
            writes = await self.adapter.prepare_restore(copy.deepcopy(s))
            for write in writes:
                if not write.targets or set(write.targets) != set(write.requested):
                    raise ValueError('Invalid preparation operation')
                eligible = s.owned - s.overridden - self._pending_targets()
                if not set(write.targets) <= eligible:
                    raise ValueError('Restoration preparation includes unowned controls')
                for target in write.targets:
                    current = await self.adapter.read(target)
                    if not matches(target, s.expected[target], current):
                        s.overridden.add(target)
                        s.owned.discard(target)
                        await self._save()
                        raise RuntimeError('Preparation control changed externally')
                await self._apply_write(write)
            return set(), False
        except PersistenceError:
            raise
        except Exception as err:
            self._error('restoration preparation', err)
            s.phase = 'recovery_required'
            await self._save()
            return dependencies, True

    async def _finish_restoration(self):
        s = self.session
        s.phase, s.active_mood, s.pending_mood = 'restoring', None, None
        await self._save()
        blocked, preparation_failed = await self._prepare_restoration(s.owned.copy())
        await self._restore_targets(s.owned - blocked)
        if s.owned or self._pending_targets() or preparation_failed:
            s.phase = 'recovery_required'
        else:
            self.session = None
        await self._save()

    async def end(self):
        async with self._lock:
            self._last_errors = []
            try:
                await self._load()
                if self._storage_failed:
                    return self.status(False)
                if not self.session:
                    return self.status()
                self.session.errors = []
                await self._resolve_planned()
                await self._finish_restoration()
                return self.status(self.session is None)
            except PersistenceError as err:
                return await self._storage_error(err)
            except Exception as err:
                self._error('coordinator', err)
                return self.status(False)

    async def retry_restoration(self):
        # Explicit retry also allows recovery from a transient Store outage.
        if self._storage_failed:
            self._storage_failed = False
            self._loaded = False
        return await self.end()

    async def _reconcile(self):
        s = self.session
        interrupted = s.phase != 'active'
        await self._resolve_planned()
        for target in sorted(s.owned - self._pending_targets()):
            try:
                current = await self.adapter.read(target)
                if not matches(target, s.expected[target], current):
                    s.overridden.add(target)
                    s.owned.discard(target)
            except Exception as err:
                self._error(target, err)
                interrupted = True
        if interrupted or self._pending_targets():
            s.phase, s.active_mood, s.pending_mood = 'recovery_required', None, None
        await self._save()

    async def reconcile(self):
        async with self._lock:
            self._last_errors = []
            try:
                self.session = await self.store.load()
                self._loaded, self._storage_failed = True, False
                if self.session:
                    await self._reconcile()
                self._publish()
                return self.status(not self.session or self.session.phase == 'active')
            except Exception as err:
                return await self._storage_error(err)

    async def observe(self, target, observed=None, context_id=None):
        async with self._lock:
            try:
                await self._load()
                s = self.session
                if not s or target not in s.baseline:
                    return
                if observed is None:
                    observed = await self.adapter.read(target)
                expected = s.expected.get(target, s.baseline[target])
                disposition = classify(target, observed, expected, s.journal, s.session_id, context_id, self._clock())
                if disposition == 'external':
                    s.overridden.add(target)
                    s.owned.discard(target)
                    await self._save()
            except PersistenceError as err:
                await self._storage_error(err)
