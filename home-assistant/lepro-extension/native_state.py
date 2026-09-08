"""Lossless Lepro mode 2/3 snapshots. No Home Assistant dependency.

All methods run on the same asyncio event loop. Observer callbacks receive
(device_id, message_type, fields, received_at); incremental reports are evidence,
not snapshots. captured_at uses the injected monotonic clock's time domain.
"""
import asyncio
from copy import deepcopy
from contextlib import asynccontextmanager
from dataclasses import dataclass
import json
import logging
import secrets
import time

_LOGGER = logging.getLogger(__name__)
WRITABLE = frozenset({'d1', 'd2', 'd50', 'd52', 'd60'})
READ_KEYS = ['d1', 'd2', 'd50', 'd52', 'd60', 'd30', 'online']


def required_fields(fields):
    mode = fields.get('d2')
    if type(mode) is not int or mode not in (2, 3):
        raise ValueError('Native capture supports only modes 2 and 3')
    return {'d1', 'd2', 'd52', 'd50' if mode == 2 else 'd60'}


@dataclass(frozen=True)
class NativeSnapshot:
    version: int
    device_id: str
    captured_at: float
    fields: dict
    extra_observed: dict

    def to_dict(self):
        return deepcopy(vars(self))

    @classmethod
    def from_dict(cls, value):
        snapshot = cls(**deepcopy(value))
        validate_snapshot(snapshot)
        return snapshot


def validate_snapshot(snapshot, device_id=None):
    if type(snapshot.version) is not int or snapshot.version != 1:
        raise ValueError('Unsupported native snapshot version')
    if not isinstance(snapshot.device_id, str) or not snapshot.device_id.isdecimal():
        raise ValueError('Invalid native device identity')
    if device_id is not None and snapshot.device_id != device_id:
        raise ValueError('Snapshot belongs to a different device')
    if not isinstance(snapshot.fields, dict) or set(snapshot.fields) - WRITABLE:
        raise ValueError('Snapshot includes unverified writable fields')
    if not required_fields(snapshot.fields) <= snapshot.fields.keys():
        raise ValueError('Incomplete native snapshot')
    if type(snapshot.fields['d1']) is not int or snapshot.fields['d1'] not in (0, 1):
        raise ValueError('Invalid power state')
    if type(snapshot.fields['d52']) is not int or not 0 <= snapshot.fields['d52'] <= 1000:
        raise ValueError('Invalid native brightness')
    for key in ('d50', 'd60'):
        if key in snapshot.fields and not isinstance(snapshot.fields[key], str):
            raise ValueError('Native effects must be opaque strings')
    if not isinstance(snapshot.extra_observed, dict):
        raise ValueError('Invalid extra observed evidence')
    json.dumps(snapshot.to_dict(), allow_nan=False)


class NativeStateBridge:
    def __init__(self, publish, clock=time.monotonic):
        self._publish = publish
        self._clock = clock
        self._locks = {}
        self._waiters = {}
        self._subscribers = set()
        self._closed = False
        self._transactions = set()

    def subscribe(self, callback):
        self._subscribers.add(callback)
        return lambda: self._subscribers.discard(callback)

    def ingest(self, device_id, message_type, fields, received_at):
        if self._closed or message_type not in ('getr', 'rpt') or not isinstance(fields, dict):
            return
        for callback in tuple(self._subscribers):
            try:
                callback(device_id, message_type, deepcopy(fields), received_at)
            except Exception:
                _LOGGER.exception('Native state observer failed')
        waiter = self._waiters.get(device_id)
        if not waiter or message_type != 'getr':
            return
        requested_at, future = waiter
        if received_at <= requested_at or future.done() or 'd2' not in fields:
            return
        try:
            required = required_fields(fields)
            if not required <= fields.keys():
                return
            snapshot = NativeSnapshot(1, device_id, received_at,
                {k: deepcopy(v) for k, v in fields.items() if k in WRITABLE},
                {k: deepcopy(v) for k, v in fields.items() if k not in WRITABLE})
            validate_snapshot(snapshot)
        except (ValueError, TypeError) as error:
            future.set_exception(error)
        else:
            future.set_result(snapshot)

    async def _capture_locked(self, device_id):
        if self._closed:
            raise RuntimeError('Native state bridge is unloaded')
        future = asyncio.get_running_loop().create_future()
        self._waiters[device_id] = (self._clock(), future)
        try:
            await self._publish(f'le/{device_id}/prp/get', json.dumps({'d': READ_KEYS}))
            return await future
        finally:
            self._waiters.pop(device_id, None)
            if not future.done():
                future.cancel()
            elif not future.cancelled():
                future.exception()  # Retrieve a report error even if publishing failed.

    @asynccontextmanager
    async def _transaction(self, device_id, timeout):
        if self._closed:
            raise RuntimeError('Native state bridge is unloaded')
        task = asyncio.current_task()
        self._transactions.add(task)
        try:
            async with asyncio.timeout(timeout):
                async with self._locks.setdefault(device_id, asyncio.Lock()):
                    if self._closed:
                        raise RuntimeError('Native state bridge is unloaded')
                    yield
        finally:
            self._transactions.discard(task)

    async def capture(self, device_id: str, timeout: float = 10) -> NativeSnapshot:
        if not isinstance(device_id, str) or not device_id.isdecimal():
            raise ValueError('Invalid native device identity')
        async with self._transaction(device_id, timeout):
            return await self._capture_locked(device_id)

    async def replay(self, snapshot: NativeSnapshot, timeout: float = 10) -> NativeSnapshot:
        snapshot = NativeSnapshot.from_dict(snapshot.to_dict())
        async with self._transaction(snapshot.device_id, timeout):
            await self._publish(f'le/{snapshot.device_id}/prp/set', json.dumps({
                'id': secrets.randbelow(1000000001), 't': int(time.time()), 'd': snapshot.fields}))
            actual = await self._capture_locked(snapshot.device_id)
            if any(actual.fields.get(k) != v or type(actual.fields.get(k)) is not type(v)
                   for k, v in snapshot.fields.items()):
                raise ValueError('Native replay readback differs from requested state')
            return actual

    def close(self):
        self._closed = True
        for task in tuple(self._transactions):
            task.cancel()
        for _, future in self._waiters.values():
            future.cancel()
        self._subscribers.clear()
