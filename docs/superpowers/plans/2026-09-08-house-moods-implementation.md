# House Moods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user authorized subagent review and routine decisions while away; reviewers apply stated preferences and cannot impersonate the user or invent approval.

**Goal:** Build the approved one-tap House Mood card with four Sonos-backed presets and durable, lossless restoration of lights and the Office neon.

**Architecture:** A small `house_moods` Home Assistant custom integration owns one persisted session and serializes changes. A narrow extension to the installed Lepro integration exposes authoritative opaque snapshots/replay; the frontend uses the existing authenticated HAKit socket and a status sensor. Reuse the existing follow-me script rather than creating another grouping system.

**Tech Stack:** Verified sibling React 19/HAKit 5.1.6/TypeScript 6/Vite 8 repository; Vitest 4 and Testing Library; Home Assistant 2025.5.3; installed Lepro 1.4.1; Python standard-library unit tests for pure session/protocol logic.

**Spec:** `docs/superpowers/specs/2026-09-08-house-moods-design.md`

## Global Constraints

- Actual source root: `/Users/yann510/github/home-assistant-dashboard`. The initial `home-dashboard/ha-dashboard` is a starter, not the deployed application.
- Preserve the many pre-existing tracked and untracked changes. Record them before edits; never stage unrelated files.
- Follow `AGENTS.md`: reuse theme tokens, borders, radii, typography, selected/focus/disabled states, and compact touch targets.
- Four presets only: Love, Unwind, Dinner, Party. Every preset starts its exact existing Sonos favorite; follow-me affects only music.
- No details control, settings, playlist picker, scene editor, or new Night mood.
- Keep the recovered rainbow payload opaque and byte-for-byte intact. Never flatten a saved palette into the main entity's RGB color.
- Production snapshots must not use logs, outgoing command echoes, browser local storage, or guessed request-correlation behavior.
- Existing follow-me uses `script.speaker_follow_motion`, `input_boolean.speaker_follow_motion`, and `input_text.speaker_follow_source`.
- Physical changes and a Home Assistant restart are not needed to implement or run offline tests. Preserve the running rainbow during development. A real-device acceptance run remains separate from offline correctness and cannot be replaced with a reviewer's imagined visual approval.

## Verified evidence

The local `dist/assets/index-KBW-T9wq.js` hash exactly matched `/local/dashboard/assets/index-KBW-T9wq.js`. The live follow script and all three motion automations match `home-assistant/speaker-follow.json` after HA service/action and singular/plural normalization.

Read-only downloads of the installed Lepro files are currently `/tmp/lepro-installed-light.py`, `/tmp/lepro-installed-__init__.py`, `/tmp/lepro-installed-number.py`, `/tmp/lepro-installed-services.yaml`, and `/tmp/lepro-installed-manifest.json`. Refresh and hash them before generating a deployable patch. The installed path is `/config/custom_components/lepro_led`. Its incoming handler accepts `rpt`, `set`, and `getr`; the new authoritative snapshot path must accept only device `rpt`/`getr`. Its ordinary send method catches publish errors, so the new replay path must not use silent success.

## File map

Create these files in the actual source repository:

- `home-assistant/custom_components/house_moods/{__init__.py,manifest.json,services.yaml}`: HA registration, validation, sensor publication and shutdown.
- `home-assistant/custom_components/house_moods/{model.py,presets.py,coordinator.py,ownership.py}`: serializable contracts, four presets, lifecycle, and ownership rules.
- `home-assistant/custom_components/house_moods/{ha_adapter.py,neon.py,sonos.py}`: standard lights/HA Store bridge, Lepro public interface, favorites/follow-me operations.
- `home-assistant/lepro-extension/native_state.py`: authoritative report collection, capture and replay implementation installed into the existing Lepro integration.
- `home-assistant/lepro-extension/integration.patch`: minimal installed-source hook and registration changes; retain existing unrelated customizations.
- `home-assistant/lepro-extension/base-sha256.json`: hashes the patch is based on; deployment fails on drift.
- `home-assistant/tests/test_{native_state,coordinator,ownership,sonos}.py`: deterministic backend tests with fake clocks, reports and adapters.
- `home-assistant/tests/fixtures/office-neon-original-effect.json`: the user-confirmed recovered effect fixture.
- `src/HouseMoodCard.tsx`, `src/HouseMoodCard.test.tsx`: presentational card and UX tests.
- `src/useHouseMood.ts`, `src/useHouseMood.test.tsx`: existing-socket connection and service/status behavior.
- `home-assistant/house-moods-deployment.md`: exact staging, backup, validation, rollback and acceptance instructions.

Modify only the relevant sections of `src/Dashboard.tsx`, `src/Dashboard.test.tsx`, `src/index.css`, and `supported-types.d.ts`. Modify the follow script only if tests show extra ownership reporting is required; preserve its existing public enable/disable/join behavior.

## Shared contracts

Use JSON-compatible versioned data. Raw snapshots stay in HA Store and never become status-sensor attributes.

```python
# model.py
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

MoodId = Literal['love', 'unwind', 'dinner', 'party']
Phase = Literal['idle', 'starting', 'active', 'restoring', 'recovery_required']

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

@dataclass
class ControlWrite:
    operation_id: str
    action: str
    targets: list[str]
    requested: dict[str, dict[str, Any]]
    data: dict[str, Any]

class Adapter(Protocol):
    async def preflight(self, mood: MoodId) -> None: ...
    async def capture(self, targets: list[str]) -> dict[str, dict[str, Any]]: ...
    async def plan_apply(self, mood: MoodId) -> list[ControlWrite]: ...
    async def apply_write(self, write: ControlWrite, session_id: str) -> dict[str, dict[str, Any]]: ...
    async def restore(self, target: str, state: dict[str, Any], session_id: str) -> None: ...

class SessionStore(Protocol):
    async def load(self) -> Session | None: ...
    async def save(self, session: Session | None) -> None: ...
```

The protocol method bodies above intentionally specify interfaces, not unfinished implementations. `plan_apply` is read-only. Before each `apply_write`, the coordinator persists the requested change and baselines for every affected control. After confirmation it persists the observations. Script operations that affect several controls must enumerate those controls before execution; they are not an opaque batch hidden behind `apply(mood)`. A raised or timed-out operation remains journaled as unconfirmed and is reconciled before rollback; do not assume it changed nothing. Serialize sets as sorted arrays and validate version/shape during deserialization. Each journal entry contains target/control, operation ID, requested state, status (`planned`, `confirmed`, `failed`) and the last authoritative observation.

Public HA services return `{success: bool, session_id: str | null, phase: Phase, errors: [{target, message}]}`:

- `house_moods.activate` with `{mood: MoodId}`.
- `house_moods.end` with no arguments.
- `house_moods.retry_restoration` with no arguments.

Publish `sensor.house_mood`, whose state is `Phase`; attributes are `active_mood`, `pending_mood`, and `errors`. No raw payloads, account credentials, favorite URIs, or snapshot content in the public sensor.

## Task 1: Lossless authoritative neon capture/replay

**Files:** `home-assistant/lepro-extension/*`, `home-assistant/tests/test_native_state.py`, the original-effect fixture.

**Consumes:** Installed integration source and confirmed device report. **Produces:** `NativeStateBridge.capture(device_id: str, timeout: float = 10) -> NativeSnapshot`, `replay(snapshot: NativeSnapshot, timeout: float = 10) -> NativeSnapshot`, `ingest(device_id: str, message_type: str, fields: dict, received_at: float) -> None`, and `subscribe(callback) -> unsubscribe`.

- [x] Copy the confirmed recovery JSON into the test fixture.
- [ ] Download a fresh installed-source baseline into an ignored local backup and record hashes. Do not modify the live integration.
- [ ] Write an isolated report-collection regression test. The bridge constructor accepts `publish(topic, payload)` and monotonic `clock` callables for tests.

```python
class NativeStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_set_echo_cannot_complete_capture(self):
        sent = []
        async def publish(topic, payload):
            sent.append((topic, payload))
        bridge = NativeStateBridge(publish=publish, clock=lambda: 1.0)
        pending = asyncio.create_task(bridge.capture('754063076', timeout=1))
        await asyncio.sleep(0)
        fields = {'d1': 1, 'd2': 2, 'd52': 1000,
                  'd50': 'N01:P10003ff000000ff000000ffU3F601030000V3002640800;'}
        bridge.ingest('754063076', 'set', fields, 2.0)
        self.assertFalse(pending.done())
        bridge.ingest('754063076', 'getr', fields, 3.0)
        result = await pending
        self.assertEqual(result.fields, fields)
```

- [ ] Run `python3 -m unittest discover -s home-assistant/tests -p test_native_state.py -v`; verify failure is missing bridge behavior rather than a syntax/import mistake.
- [ ] Implement one lock and at most one capture per device. Register the waiter before publishing a read; accept a fresh complete `getr` after that request. Do not merge missing required fields from stale cache. Capture mode 2 only with `d1,d2,d50,d52`; mode 3 requires `d1,d2,d60,d52`. Reject unsupported modes before any mutation.
- [ ] Store opaque writable fields exactly. Exclude `online`, message IDs/timestamps and unverified `d30` from replay. The role of `d30` is not established: retain it in `extra_observed` evidence if reported, rather than calling it sequence metadata or treating it as a known writable field. Accept incremental `rpt` updates for ownership observation, but distinguish them from a complete fresh snapshot.
- [ ] Make replay publish errors propagate. After publishing, request independent readback and compare required fields exactly. A mismatching report is failure; never accept the outbound `set` echo. Serialize with capture and release waiters on timeout/unload.
- [ ] Add regressions for stale fields, partial `getr`, unsupported mode, two captures, publish exception, rejected replay, off-state retained effect, and exact preservation of the original rainbow string.
- [ ] Generate the minimal integration patch: instantiate bridge on setup, call `ingest` before lossy parsing for `rpt/getr` only, and expose it in entry data as `native_state`. Keep the regular entity UI unchanged; do not alter unrelated bulbs or replace the MQTT callback.
- [ ] Register response-capable `lepro_led.capture_native_state` and `lepro_led.restore_native_state` services that resolve the configured entity/device and call the bridge. Validate replay identity and allowlisted writable fields; reject a snapshot for a different device.
- [ ] Run focused tests and `git diff --check`. Request an independent review of freshness, opaque preservation, and exception paths before proceeding.

## Task 2: Persisted session lifecycle and ownership

**Files:** `model.py`, `presets.py`, `coordinator.py`, `ownership.py`, `test_coordinator.py`, `test_ownership.py`.

**Consumes:** Adapter/SessionStore contracts. **Produces:** `MoodCoordinator(adapter, store).activate(mood)`, `.end()`, `.retry_restoration()`, `.reconcile()`, `.observe(target, observed, context_id=None)`.

- [ ] Implement test-only `MemoryStore` that deep-copies sessions, and `FakeAdapter` with `states`, `writes`, `fail_on`, and `preflight_error`. `capture` deep-copies current target states; `plan_apply` returns per-operation writes and `apply_write` records/executes only that write; `restore` records a target write or raises for `fail_on`.
- [ ] Write a baseline/switch regression:

```python
async def test_switch_keeps_first_baseline(self):
    store = MemoryStore()
    adapter = FakeAdapter(states={'light.light_kitchen': {'state': 'off'}})
    engine = MoodCoordinator(adapter, store)
    await engine.activate('love')
    initial = copy.deepcopy((await store.load()).baseline)
    await engine.activate('dinner')
    self.assertEqual((await store.load()).baseline, initial)
    await engine.end()
    self.assertEqual(adapter.states['light.light_kitchen']['state'], 'off')
```

- [ ] Run the focused test and confirm it fails on unimplemented lifecycle behavior.
- [ ] Implement a single operation lock, durable pre-write journal, idempotent active-mood tap and End while idle, and refusal to activate during unresolved recovery. Preflight all targets/favorite/snapshot capabilities before issuing writes.
- [ ] Persist an original baseline across switches. Restore dropped targets on switch; track explicit manual changes and preserve them at End. If a manually changed excluded target is included again, capture its newer return destination before applying the new preset.
- [ ] Add expected-state matching with standard-light brightness tolerance of two HA units and explicit transition/pending-write windows. Native payload equality is exact; do not apply approximate RGB matching to raw palettes.
- [ ] Mark a manually changed light as wholly relinquished; keep volume, playback and follow-me ownership separate. A Day/Night-triggered light change is external. Ignore natural media position/title progression as evidence of replacement playback.
- [ ] Test failed preflight writes nothing; failed partial apply journals and rolls back only owned writes; one offline target does not prevent other restoration; restart reconciles without playback or light writes; stale/delayed acknowledgements do not claim a manual override; save failure prevents its associated device write.
- [ ] Define a failed switch as ending the session and restoring the still-owned original baseline, not reactivating the previous mood. Add Love → Dinner failure after kitchen changes and neon rejection: original baseline is restored, manual overrides survive, and active_mood is cleared only when recovery state is accurately published.
- [ ] Add a write-success/Store-confirmation-failure regression: retain the earlier durable planned entry, surface recovery, and reconcile device readback after restart without blindly applying it again.
- [ ] Implement recovery persistence and explicit retry. On retry, recheck current state against last owned state; preserve newer external changes instead of replaying blindly. Surface ambiguous ownership as recovery status without discarding snapshots.
- [ ] Run `python3 -m unittest discover -s home-assistant/tests -p 'test_*coordinator*.py' -v` and ownership tests, then review session loss and failure paths.

## Task 3: Exact light presets and native effect adapter

**Files:** `presets.py`, `ha_adapter.py`, `neon.py`, extend `test_native_state.py` and `test_coordinator.py`.

**Consumes:** Coordinator contracts and Lepro bridge. **Produces:** standard-light `capture/plan_apply/apply_write/restore` operations and deterministic neon preset snapshots.

- [ ] Encode the exact preset table in the spec. Keep server-side definitions authoritative; the frontend only needs names/icons/accent keys.
- [ ] Capture on/off plus mode-appropriate brightness/RGB/HS/temperature for each standard light. Restore off targets to off; do not force unsupported color properties onto brightness-only bulbs. Use transition 3 only when `supported_features` advertises transition.
- [ ] Preserve these verified native strings as deterministic recipes (brightness is a separate `d52` field):

```python
NEON_EFFECTS = {
    'love': 'N01:P10001FF3377F2100010019U3V3000640000E40088000000881664;',
    'unwind': 'N01:P10001FFAA44F2100010019U3V3000640000E1;',
    'dinner': 'N01:P10001FFC070F2100010019U3V3000640000E1;',
    'party': 'N01:P10001FFFFFFF2100010019U3V3100640000E3004BC2O6004B;',
}
NEON_BRIGHTNESS = {'love': 349, 'unwind': 250, 'dinner': 200, 'party': 698}
```

Love and Party reproduce observed preview payloads. Unwind/Dinner follow the verified single-color static form and still require readback acceptance. Do not generate a 25-segment rainbow or send the generic speed slider after native replay.

- [ ] Write tests that applying a preset never mutates the stored original payload and End invokes native replay instead of generic `light.turn_on(rgb_color=...)`.
- [ ] Test kitchen temperature clamping, exclusions, unsupported transitions, off-state restoration and device unavailable failure. The adapter returns only confirmed values to the journal.
- [ ] Read the fixture, apply every recipe against a fake device, and assert the exact original bytes are passed to replay afterwards.
- [ ] Run focused backend tests. Record that the actual device readback/appearance round trip still belongs to acceptance, not these fake-device tests.

## Task 4: Sonos favorites and existing follow-me ownership

**Files:** `sonos.py`, `test_sonos.py`; narrowly update `home-assistant/speaker-follow.json` only if necessary for context reporting.

**Consumes:** Four favorite references, existing script contract, HA service/state/event APIs. **Produces:** favorite resolution and session-owned music/follow/volume/group operations through the Adapter interface.

- [ ] Add a favorite-resolution unit test using supplied library entries:

```python
class FavoriteTests(unittest.TestCase):
    def test_missing_id_resolves_unique_title(self):
        item = resolve_favorite(
            [{'title': 'Crush Radio', 'media_content_id': 'FV:2/99',
              'media_content_type': 'favorite_item_id', 'can_play': True}],
            expected_id='FV:2/1', title='Crush Radio')
        self.assertEqual(item['media_content_id'], 'FV:2/99')
```

Define `resolve_favorite(items: list[dict], expected_id: str, title: str) -> dict`; reject zero or duplicate title matches and mismatched IDs without a unique title match.

- [ ] Browse favorites using the existing Sonos entity media-browser API; bound folder traversal to depth five and fifty nodes as the existing frontend does. Use title+ID validation and never silently substitute music.
- [ ] Snapshot the four speakers' volume/group membership and follow helper/source state before any script call. If following another source, disable and await cleanup before starting Living Room playback and re-enabling with that source. If Living Room is grouped under another coordinator, detach it with recorded ownership before promising Living Room as the starting source.
- [ ] Set and confirm the preset volume before `media_player.play_media`, then verify playing/buffering. Journal volume and playback separately so a playback failure can still restore the confirmed volume change. Enable following only once source playback is usable. Dinner uses the existing disable operation, including its ungroup behavior, and records the groups it changes.
- [ ] Record HA command contexts and script parent contexts. Treat external `play_media`, stop/pause, or queue replacement as relinquishing playback; natural track changes and seeking do not relinquish ownership. Confirm how Sonos reports a new queue independently of the dashboard, and fail conservatively if replacement cannot be distinguished.
- [ ] Track follow-script child joins as session-owned grouping, while manual group/volume changes are external. If the script does not expose sufficient attribution, add a small event containing session/context, source and room without changing normal enable/disable/join semantics.
- [ ] On End, preserve externally replaced playback; otherwise stop the session's music. Restore owned volumes/groups and the original follow switch/source. Preserve manual follow changes as a whole follow-control override so restoration cannot undo their group effects.
- [ ] Test duplicate/missing favorites, already-following another room, pending cleanup, group coordinator changes, volume-confirmation-before-play ordering, natural next track, manual playlist replacement, manual volume, disabled automation states remaining untouched, and failed group restoration retaining recovery data.
- [ ] Run `python3 -m unittest discover -s home-assistant/tests -p test_sonos.py -v` and existing `npm test -- src/SpeakerCard.test.tsx src/SpeakerPlayback.test.tsx`.

## Task 5: Home Assistant service/status registration and durable storage

**Files:** `__init__.py`, `manifest.json`, `services.yaml`, `ha_adapter.py`, deployment instructions; extend backend tests.

**Consumes:** Pure coordinator and concrete adapters. **Produces:** public service responses and `sensor.house_mood` contract specified above.

- [ ] Register a YAML-configured single-house integration with a fixed configured neon entity, and no arbitrary automation runner. Use Home Assistant `Store(hass, 1, 'house_moods.session')` to persist private data. Load without replaying actions and reconcile after dependencies are available.
- [ ] Validate service `mood` against the four IDs. Register explicit response support, return the agreed object, and publish progress before awaited device operations. Map exceptions to target-specific errors without leaking credentials or raw payloads.
- [ ] Connect service calls to the existing request context, event subscription and coordinator lock. Unsubscribe and cancel waiters on shutdown; leave durable journal data for restart recovery.
- [ ] Unit-test JSON serialization/version rejection and exercise registration against HA 2025.5.3 in an isolated test environment before rollout. Reject any API usage unavailable in that version rather than upgrading Home Assistant as a side effect.
- [ ] Add a restart test loading a partially confirmed journal: it publishes recovery status with zero device writes and does not replay music.
- [ ] Add the exact minimal configuration snippet `house_moods: {}` and required installed-file list to deployment instructions. Do not edit live `configuration.yaml` during offline development.

## Task 6: Approved compact card and socket hook

**Files:** `src/HouseMoodCard.tsx`, `src/useHouseMood.ts`, both test files, `src/Dashboard.tsx`, `src/Dashboard.test.tsx`, `src/index.css`, `supported-types.d.ts`.

**Consumes:** service/status contract. **Produces:** responsive always-visible card immediately below Day/Night.

```ts
export type MoodId = 'love' | 'unwind' | 'dinner' | 'party';
export type MoodPhase = 'idle' | 'starting' | 'active' | 'restoring' | 'recovery_required';
export type MoodStatus = {
  phase: MoodPhase;
  activeMood: MoodId | null;
  pendingMood: MoodId | null;
  errors: { target: string; message: string }[];
};
export type HouseMoodCardProps = {
  status: MoodStatus;
  connected: boolean;
  available: boolean;
  onActivate: (mood: MoodId) => void;
  onEnd: () => void;
  onRetry: () => void;
};
```

- [ ] Write a real interaction test before the card:

```tsx
it('selects a mood directly and exposes no details control', async () => {
  const activate = vi.fn();
  render(<HouseMoodCard status={{phase:'idle', activeMood:null, pendingMood:null, errors:[]}}
    connected available onActivate={activate} onEnd={vi.fn()} onRetry={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', {name:'Love'}));
  expect(activate).toHaveBeenCalledWith('love');
  expect(screen.queryByRole('button', {name:/details|settings/i})).toBeNull();
  expect(screen.queryByRole('button', {name:'End mood'})).toBeNull();
});
```

- [ ] Run `npm test -- src/HouseMoodCard.test.tsx`; confirm the missing feature fails.
- [ ] Implement a presentational section with four native accessible buttons, existing theme tokens, icon/name, active `aria-pressed`, a checkmark, and subtle active tint. Four columns at adequate container width; two columns on narrow cards. Reuse existing focus/disabled treatment and 44px targets.
- [ ] Implement `useHouseMood()` using `useStore` and the existing authenticated connection. Subscribe to `sensor.house_mood`; call the three services through `connection.sendMessagePromise` with `return_response: true`. Never use a separate browser token or raw fetch to another origin.
- [ ] Set local pending state immediately for click feedback, but clear/reconcile it from authoritative status. Prevent double taps synchronously. A service timeout is not proof of failure: retain authoritative pending state and do not resubmit automatically.
- [ ] Display Starting/Restoring progress, persistent target-specific error and Retry restoration. Disable activation during recovery, lost connection, missing backend or pending operation. Keep no-mood End hidden. Avoid generic per-device/playlist summaries.
- [ ] Wire into Dashboard after `HomeModeControls`; mock the connected wrapper in the existing Dashboard test so its current mode assertions remain meaningful. Update entity typing only for the new status sensor.
- [ ] Add tests for all four buttons, selected check/aria state, active-mood no-op, pending lock, End, retry, disconnection, missing backend, service timeout reconciliation, and keyboard use. Keep focus stable through status changes.
- [ ] Run `npm test -- src/HouseMoodCard.test.tsx src/useHouseMood.test.tsx src/Dashboard.test.tsx`; inspect the card at phone/tablet/desktop sizes in a local preview using mocked mood status. Test neutral, selected, busy, disabled and error states without changing the live house.

## Task 7: Integrated verification and reviewable rollout package

**Files:** deployment instructions, installer/patch artifacts, focused tests, design/plan progress.

**Consumes:** reviewed tasks 1–6. **Produces:** tested local changes, backups/rollback procedure, explicit remaining live acceptance evidence.

- [ ] Run all backend unit tests and full frontend suite once, then `npm run lint` and `npx tsc -b && npx vite build`. Avoid `npm run build`'s automatic repository-wide prettier step while unrelated changes exist.
- [ ] Review `git diff` against the recorded starting changes so user work is not mistaken for this feature. Have a subagent independently review restoration, lost-connection, and UI behavior; resolve findings before claiming readiness.
- [ ] Prepare an installer that defaults to dry-run, backs up the deployed Lepro/config/dashboard artifacts, checks base hashes, stages files, and refuses to overwrite drifted integration source. Never delete the serving dashboard directory before a successful staged build is ready; the existing deploy script currently deletes it and is not suitable for an atomic rollout unchanged.
- [ ] Document restoration of prior files/config and dependency reload/restart requirements. A Home Assistant restart affects the entire house; do not hide it inside a frontend deploy command.
- [ ] Keep live acceptance explicit: verify native capture/replay readback before enabling presets; test a single short mood with saved baseline; test switch/End; confirm the rainbow returns; verify manual override and offline recovery. When the user is away, do not fabricate visual feedback or run intrusive music/light trials just to finish a checklist.
- [ ] Record exactly which validations passed, which are offline-only, and whether anything was deployed. Leave the current live rainbow unchanged unless performing the separately coordinated acceptance trial.

## Review and execution decisions

The user has approved the UI and delegated routine review decisions while away. Use subagent review for scope, simplicity, code quality and test coverage. No further preference question is needed for card placement, architecture or routine implementation details. A subagent cannot grant new access, supply an unknown credential, certify the physical appearance of an effect, or stand in for the user during a house-affecting acceptance trial.

This plan deliberately keeps backend state machinery private and UI small. Do not turn it into an extensible scene engine. A missing live acceptance result should be reported as a remaining validation step, not masked by claiming the feature is fully deployed and tested.
