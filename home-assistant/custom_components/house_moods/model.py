"""Versioned, private durable state and device boundary contracts."""
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Protocol

MoodId = Literal['love', 'unwind', 'dinner', 'party', 'gym']
Phase = Literal['idle', 'starting', 'active', 'restoring', 'recovery_required']
MOODS = ('love', 'unwind', 'dinner', 'party', 'gym')

@dataclass
class NativeSnapshot:
    version: int
    device_id: str
    captured_at: str
    fields: dict[str, Any]
    extra_observed: dict[str, Any] = field(default_factory=dict)

@dataclass
class Session:
    session_id: str
    active_mood: MoodId | None
    phase: Phase
    baseline: dict[str, dict[str, Any]] = field(default_factory=dict)
    expected: dict[str, dict[str, Any]] = field(default_factory=dict)
    overridden: set[str] = field(default_factory=set)
    journal: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    owned: set[str] = field(default_factory=set)
    included: set[str] = field(default_factory=set)
    pending_mood: MoodId | None = None
    mode_intent: str | None = None
    mode_completed: list[str] = field(default_factory=list)
    mode_before: dict[str, dict[str, Any]] = field(default_factory=dict)
    version: int = 1

    def to_dict(self):
        value = asdict(self)
        for name in ('owned', 'overridden', 'included'):
            value[name] = sorted(value[name])
        return value

    @classmethod
    def from_dict(cls, value):
        import copy
        value = copy.deepcopy(value)
        if not isinstance(value, dict) or value.get('version') != 1:
            raise ValueError('Unsupported session version')
        if value.get('phase') not in ('idle', 'starting', 'active', 'restoring', 'recovery_required'):
            raise ValueError('Invalid session phase')
        if not isinstance(value.get('session_id'), str):
            raise ValueError('Invalid session identity')
        if value.get('mode_intent') not in (None, 'day', 'night'):
            raise ValueError('Invalid mode intent')
        if not isinstance(value.get('mode_completed', []), list) or any(not isinstance(t, str) for t in value.get('mode_completed', [])):
            raise ValueError('Invalid mode progress')
        if not isinstance(value.get('mode_before', {}), dict) or any(not isinstance(k, str) or not isinstance(v, dict) for k, v in value.get('mode_before', {}).items()):
            raise ValueError('Invalid mode evidence')
        for name in ('active_mood', 'pending_mood'):
            if value.get(name) is not None and value[name] not in MOODS:
                raise ValueError('Invalid mood')
        for name in ('baseline', 'expected'):
            if not isinstance(value.get(name), dict) or any(not isinstance(k, str) or not isinstance(v, dict) for k, v in value[name].items()):
                raise ValueError('Invalid state map')
        for name in ('owned', 'overridden', 'included'):
            if not isinstance(value.get(name), list) or any(not isinstance(t, str) for t in value[name]):
                raise ValueError('Invalid control set')
            value[name] = set(value[name])
        for name in ('journal', 'errors'):
            if not isinstance(value.get(name), list) or any(not isinstance(e, dict) for e in value[name]):
                raise ValueError('Invalid session records')
        for entry in value['journal']:
            if entry.get('status') not in ('planned', 'confirmed', 'failed') or entry.get('action') not in ('apply', 'restore'):
                raise ValueError('Invalid journal status/action')
            if not isinstance(entry.get('operation_id'), str) or not isinstance(entry.get('until'), (int, float)):
                raise ValueError('Invalid journal identity/window')
            for name in ('targets', 'resolved'):
                if not isinstance(entry.get(name), list) or any(not isinstance(t, str) for t in entry[name]):
                    raise ValueError('Invalid journal controls')
            targets = set(entry['targets'])
            if not targets or not set(entry['resolved']) <= targets or not targets <= value['baseline'].keys():
                raise ValueError('Invalid journal target references')
            for name in ('requested', 'before', 'observed'):
                if not isinstance(entry.get(name), dict) or any(not isinstance(k, str) or not isinstance(v, dict) for k, v in entry[name].items()):
                    raise ValueError('Invalid journal state map')
                if name != 'observed' and set(entry[name]) != targets:
                    raise ValueError('Incomplete journal states')
        if not value['owned'] <= value['baseline'].keys() or not value['owned'] <= value['expected'].keys():
            raise ValueError('Owned controls lack durable evidence')
        if any(not isinstance(e.get('target'), str) or not isinstance(e.get('message'), str) for e in value['errors']):
            raise ValueError('Invalid error record')
        try:
            return cls(**value)
        except TypeError as err:
            raise ValueError('Invalid session shape') from err

@dataclass
class ControlWrite:
    operation_id: str
    action: str
    targets: list[str]
    requested: dict[str, dict[str, Any]]
    data: dict[str, Any]
    transition_seconds: float = 0

class Adapter(Protocol):
    """Read/capture return fresh authoritative normalized states, never echoes.

    plan_apply/preflight are read-only. Targets enumerate ALL effects, including
    script side effects. Playback restoration_state encodes safe stop, never queue replay.
    Native state uses {'native': <exact writable payload>}.
    """
    async def preflight(self, mood: MoodId) -> None: ...
    async def included_targets(self, mood: MoodId) -> list[str]: ...
    async def snapshot_targets(self) -> list[str]: ...
    async def capture(self, targets: list[str]) -> dict[str, dict[str, Any]]: ...
    async def read(self, target: str) -> dict[str, Any]: ...
    async def plan_apply(self, mood: MoodId) -> list[ControlWrite]: ...
    async def apply_write(self, write: ControlWrite, session_id: str) -> dict[str, dict[str, Any]]: ...
    def restore_dependencies(self) -> set[str]: ...
    async def prepare_restore(self, session: Session) -> list[ControlWrite]: ...
    def restoration_state(self, target: str, baseline: dict[str, Any]) -> dict[str, Any]: ...
    async def restore(self, target: str, state: dict[str, Any], session_id: str) -> None: ...

class SessionStore(Protocol):
    """Save is atomic; failed save leaves the previous durable value intact."""
    async def load(self) -> Session | None: ...
    async def save(self, session: Session | None) -> None: ...
