# House Canvas Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved House Canvas as an authenticated, tested live dashboard and a separate tablet trial.

**Architecture:** Build focused React components and scoped styles, using the existing Home Assistant connection. Preserve existing mood, speaker and attention behaviour by extracting controllers only where presentation reuse requires it. Keep Classic and Quiet Home accessible and deploy the trial separately.

**Tech Stack:** React 19, TypeScript 6, Vite 8, HAKit 5.1.6, Home Assistant WebSocket 9.6, Vitest 4, Testing Library, node-scp.

**Spec:** [Approved production design](../specs/2026-09-23-house-canvas-production-design.md). Also read [source audit](../specs/2026-09-23-canvas-production-audit.md). Visual reference: `public/concepts/house-canvas`, commit `433ca08`.

## Global Constraints

- Classic remains the default and Quiet Home remains accessible.
- Do not execute the prototype's string-rendering modules in the production application.
- Primary controls have at least 44px targets.
- Keep essentials visible at 960×600 and 1280×800 reference viewports without clipping.
- No automatic writes on mount, reconnect, tab visibility changes or forecast/favourites refresh.
- Read-only UI verification must not issue real device commands.
- Never claim a physical outcome solely because a service resolved.
- No simulated forecast, favourite snapshot or demo response timer is used in production.
- Do not introduce a long-lived token into the published trial assets.
- Do not replace the currently deployed dashboard directory.
- Making Canvas the default or merging it into main is a later adoption decision.

Work in `/Users/yann510/.codex/worktrees/house-moods-20260908`, branch `codex/quiet-home-poc`. Preserve unrelated work. Fetch before pushing, never force-push. The approved trial-specific branch requirement supersedes the repository's usual main completion workflow for this change.

## Review Focus

1. A delayed response from an old connection must not overwrite a newer command or reconnect state (task 2).
2. A blind selection changed during dispatch must not change the captured targets; Stop must remain usable (task 4).
3. Another room playing unrelated audio must require an explicit grouping decision, including after the group changes externally (task 5).
4. Missing metadata, unknown conditions and daylight-saving transitions must produce honest readable states rather than fabricated values (tasks 5 and 7).
5. A failed upload or failed release switch must leave the previous working dashboard reachable (task 9).

## File boundaries and sequence

New production UI lives under `src/canvas/`. Domain logic lives beside its UI; only genuinely shared extracted controllers live directly in `src/`. Tests sit beside implementations. `CanvasDashboard.tsx` composes cards; it does not dispatch device services. `CanvasDialog.tsx` owns modal navigation/focus. Domain controllers own command intent and interpretation. Existing controllers remain authoritative for moods, attention, forecasts and speakers.

Tasks are ordered vertical increments. Each test snippet below is an acceptance anchor; add the explicitly enumerated cases in that task before implementing their behaviour. Use existing test conventions and mocks. Never introduce a second production provider to support a fixture.

For every task: run its tests red before implementation, green afterwards; run affected existing regression tests; inspect the diff; commit only named task files. Baseline tests currently number 190, but correctness is the gate, not preserving an exact count.

## Task 1: Authenticated optional Canvas shell and controlled test fixture

**Files:** Create `src/canvas/CanvasDashboard.tsx`, `src/canvas/CanvasDialog.tsx`, `src/canvas/canvas.css`, `src/canvas/testing/haFixture.ts`, `src/canvas/CanvasDashboard.test.tsx`, `src/canvas/CanvasDialog.test.tsx`, `src/App.test.tsx`. Modify `src/App.tsx`, `src/DashboardViews.tsx`.

**Interfaces:** `CanvasDashboard(): React.JSX.Element`; `CanvasDialog({title, children, onClose}: {title: string; children: React.ReactNode; onClose(): void}): React.JSX.Element`. Test-only `createHaFixture()` returns `{connection, calls, publish, disconnect, reconnect}`; `publish(entityId: string, state: string, attributes?: Record<string, unknown>): void`, `calls` contains captured WebSocket messages. The fixture mocks the existing HAKit store, never contacts HA and lives outside production imports.

- [ ] Write routing/auth and dialog tests. Cover default Classic, Quiet, Canvas, unknown view fallback, no service calls on mount/reconnect, Escape, focus trap including selects, and restoration to trigger.

```tsx
it('does not supply a bundled token to HassConnect', () => {
  render(<App />);
  expect(hassConnectProps).not.toHaveProperty('hassToken');
});
```

Here `hassConnectProps` is captured by the test's mocked `HassConnect` component; keep the existing real provider in application code.

- [ ] Run `npx vitest run src/App.test.tsx src/canvas/CanvasDashboard.test.tsx src/canvas/CanvasDialog.test.tsx`; expect missing components/auth assertion failures.
- [ ] Use the installed supported client authentication flow (confirmed in `node_modules/@hakit/core/dist/types/HassConnect/index.d.ts`):

```tsx
<HassConnect hassUrl={import.meta.env.VITE_HA_URL}>
  <ThemeProvider />
  <DashboardViews />
</HassConnect>
```

Implement three-way URL routing, retain query parameters, and scope every Canvas rule under `.canvas` or `.canvas-dialog`. Dialogs use a single owned modal with route/back state rather than nested competing focus traps. Use existing geometric art as React SVG; no prototype runtime imports.
- [ ] Run tests green and `npx tsc -b`. Commit `feat: add authenticated optional Canvas shell`.

## Task 2: Observable command lifecycle

**Files:** Create `src/canvas/commands.ts`, `src/canvas/useDeviceCommand.ts`, `src/canvas/commands.test.ts`, `src/canvas/useDeviceCommand.test.tsx`.

**Interfaces:**

```ts
export type CommandPhase = 'pending' | 'accepted' | 'observed' | 'failed' | 'unconfirmed';
export type DeviceIntent = {
  domain: string; service: string; targets: readonly string[];
  data?: Record<string, unknown>;
};
export type TargetResult = { target: string; phase: CommandPhase; message?: string };
export type CommandResult = { results: TargetResult[] };
// Hook reads the current HAKit connection at send time.
// observe returns true only from reported device state.
export type SendCommand = (
  intent: DeviceIntent,
  observe?: (entityId: string) => boolean
) => Promise<CommandResult>;
```

`useDeviceCommand()` returns `{send: SendCommand, pending: boolean, result: CommandResult | null}`. Per-hook generations prevent obsolete completion writes. De-duplicate exact in-flight intent keys; distinguish per-target outcomes. Reuse the direct authenticated socket pattern from `useSpeakerCommand.ts`; do not use helpers that swallow rejections.

- [ ] Write tests with deferred acknowledgements and fake timers. Assert rejection, 15s acknowledgement timeout, 15s observation timeout, disconnect, unmount, duplicate taps, missing entities and partial targets. Pin old connection/new request isolation:

```ts
expect(result.results).toEqual([
  { target: 'light.gym', phase: 'unconfirmed', message: expect.any(String) },
]);
```

For that case resolve the service but never publish the expected state. Add a separate test publishing a new state before acknowledgement; it must still reconcile correctly once accepted.
- [ ] Run `npx vitest run src/canvas/commands.test.ts src/canvas/useDeviceCommand.test.tsx`; expect missing exports.
- [ ] Implement immutable target/data capture, explicit state predicates and bounded timers. Send target calls independently when individual failure reporting is required:

```ts
const message = {
  type: 'call_service', domain: intent.domain, service: intent.service,
  target: { entity_id: [target] }, service_data: intent.data ?? {},
};
```

Read a fresh connection before each dispatch. Never automatically replay on reconnect. Never treat an acknowledgement-only command as observed. Clear timers/subscriptions and ignore obsolete callbacks.
- [ ] Run tests green and type-check. Commit `feat: track device commands and observed results`.

## Task 3: Room lights, all lights and Day/Night

**Files:** Create `src/canvas/CanvasLights.tsx`, `src/canvas/useCanvasLights.ts`, `src/canvas/CanvasLightDetails.tsx`, `src/canvas/CanvasModes.tsx`, `src/canvas/CanvasLights.test.tsx`, `src/canvas/CanvasModes.test.tsx`. Reuse `src/useLightSummary.ts`; modify it only to export its existing inventory if necessary.

**Interfaces:** `CanvasLights({onOpenAll}: {onOpenAll(): void})`; `CanvasLightDetails({entityId}: {entityId: string})`; `CanvasModes()`. `useCanvasLights()` exposes rooms from the existing inventory, selected room and explicit power/brightness commands using task 2. All-light detail route lists every room with separate toggle/detail buttons.

- [ ] Add tests for room targeting, mixed states, offline members, supported colour/temperature/effects, room brightness drafts, all-off only in overview detail, mode errors and independent mode state.

```tsx
await user.click(screen.getByRole('button', { name: 'Turn off all lights' }));
expect(fixture.calls.filter(c => c.service === 'toggle')).toHaveLength(0);
expect(fixture.calls.filter(c => c.service === 'turn_off').length).toBeGreaterThan(0);
```

`fixture` is task 1's controlled connection. Assert exact available targets from the inventory, not only the count.
- [ ] Run `npx vitest run src/canvas/CanvasLights.test.tsx src/canvas/CanvasModes.test.tsx`; expect missing controls.
- [ ] Implement explicit desired power using fresh entity state, supported colour modes and reported min/max temperature units. No hard-coded capability assumption. Mode buttons target `input_boolean.morning_mode` and `input_boolean.night_mode` independently:

```ts
send({ domain: 'input_boolean', service: 'turn_on', targets: [entityId] },
  id => useStore.getState().entities[id]?.state === 'on');
```

Use actual entity typing from installed HAKit. Preserve local slider values until commit/confirmation or visible failure. Target unknown state is disabled, never interpreted as off.
- [ ] Run new tests plus `src/LightCard.test.tsx src/LightsGroup.test.tsx src/QuietHome.test.tsx`; type-check. Commit `feat: add live Canvas lighting and home modes`.

## Task 4: Captured multi-room blind commands

**Files:** Create `src/canvas/CanvasBlinds.tsx`, `src/canvas/useCanvasBlinds.ts`, `src/canvas/CanvasBlinds.test.tsx`.

**Interfaces:** `BlindRoom = 'living room' | 'bedroom' | 'gym'`; `BlindAction = 'open' | 'stop' | 'close'`. `useCanvasBlinds()` returns selection, `toggleRoom(room)`, `run(action): Promise<CommandResult>`, failed-room retry and results. Stop uses its own command lifecycle so an in-flight Open cannot block it.

- [ ] Test empty selection, two-room commands, selection changes while pending, one failure, retry only failed rooms, disconnected commands, Stop while Open is waiting:

```tsx
await user.click(screen.getByRole('button', { name: 'Open selected blinds' }));
expect(screen.getByRole('button', { name: 'Stop selected blinds' }).disabled).toBe(false);
```

- [ ] Run `npx vitest run src/canvas/CanvasBlinds.test.tsx`; expect missing controls.
- [ ] Capture the room array before awaiting; use socket `google_assistant_sdk.send_text_command` service with the existing command wording. Confirm domain/service from `BlindCard.tsx` and installed generated types before wiring:

```ts
const command = `${action} all the blinds ${room}`;
const intent = { domain: 'google_assistant_sdk', service: 'send_text_command',
  targets: [], data: { command } };
```

Task 2 must support targetless calls with caller-provided room correlation (extend its internal dispatch adapter, not fake entity IDs). Results say “Command sent · position unavailable”; never animate a fabricated physical position. Preserve immutable failed-room retry targets.
- [ ] Run green, type-check, commit `feat: add reliable multi-room blind controls`.

## Task 5: Speaker, Player and live artwork favourites

**Files:** Create `src/canvas/CanvasMusic.tsx`, `src/canvas/CanvasPlayer.tsx`, `src/canvas/CanvasSpeakers.tsx`, `src/canvas/CanvasFavourites.tsx`, `src/canvas/CanvasMusic.test.tsx`. Extract only needed presentation-independent logic to `src/useSpeakerSession.ts`, `src/useSpeakerFavourites.ts` and corresponding tests; modify `SpeakerCard.tsx`, `SpeakerRooms.tsx`, `SpeakerFavourites.tsx` to consume extracted logic. Preserve `useSpeakerCommand.ts`, `SpeakerVolume.tsx`, `SpeakerSeek.tsx` contracts.

**Interfaces:** `CanvasMusic({onOpenPlayer, onOpenSpeakers}: {onOpenPlayer(): void; onOpenSpeakers(): void})`, `CanvasPlayer()`, `CanvasSpeakers()`. `useSpeakerSession()` returns the existing resolved coordinator, follow state, cleanup state and shared action callbacks; derive its return type from the extracted implementation rather than inventing alternate HA models. `useSpeakerFavourites(entityId: string)` returns `{items, loading, error, retry}`; items retain existing media content type/id/title/thumbnail fields.

- [ ] Characterize existing controller behaviour before extraction. Test main-speaker invariant, follow enable/disable/cleanup/retry, busy script, manual handoff, grouping conflict and external changes, relative group volumes/clamping, mute capabilities, latest queued volume draft, stream/no duration, seek seconds, browse recursion limits/load failure, playback confirmation and broken artwork.

```tsx
await user.click(screen.getByRole('button', { name: 'Open player' }));
expect(screen.queryByRole('slider', { name: /volume/i })).toBeNull();
expect(screen.getByRole('slider', { name: 'Track position' }).getAttribute('aria-valuetext'))
  .toMatch(/\d+:\d{2}/);
```

Seed the fixture with a seek-capable player and real-shaped duration/position attributes. In a separate radio test assert seek is absent. For grouping conflicts assert no join calls occur until confirmed, then change the external group and require revalidation.
- [ ] Run `npx vitest run src/canvas/CanvasMusic.test.tsx src/SpeakerCard.test.tsx src/SpeakerPlayback.test.tsx` red for new behaviour, retaining green baseline.
- [ ] Extract controllers without changing HA semantics. Keep one authoritative coordinator across both detail views, coordinator-only transport, 30s Follow response validation and cleanup retry. Render favourite thumbnails from current browse results with HA URL resolution, accessible names and image-failure fallback:

```tsx
<button aria-label={`Play ${item.title}`} onClick={() => play(item)}>
  <img src={artworkUrl} alt='' />
</button>
```

`play` delegates to the existing favourite playback/confirmation controller; `artworkUrl` uses the current HA base. No visible duplicate title, source selector or player volume. Speaker volume has large touch affordances and separate mute.
- [ ] Run speaker regression suite and new tests green, type-check. Commit `feat: integrate Canvas music with existing speaker behaviour`.

## Task 6: Mood, House pulse and complete device directory

**Files:** Create `src/canvas/CanvasMood.tsx`, `src/canvas/CanvasPulse.tsx`, `src/canvas/CanvasDevices.tsx`, `src/canvas/activity.ts`, `src/canvas/CanvasSecondary.test.tsx`. Reuse `useHouseMood.ts`, `useAttention.ts`, `applianceStatus.ts`, `ApplianceIcon.tsx`, `TemperatureCard.tsx`, `AppliancesCard.tsx` and existing Roomba controls.

**Interfaces:** `CanvasMood()`; `CanvasPulse({onOpen}: {onOpen(route: string): void})`; `CanvasDevices({onOpen}: {onOpen(route: string): void})`. Export a typed discriminated route union from `src/canvas/routes.ts` and replace these string parameters with that union in this task. Include overview, all lights, light entity, player, speakers, weather, moods, thermostats, appliances and vacuum routes.

- [ ] Test all five moods, End and recovery retry; appliance running/paused/returning/finished/unknown/offline; simultaneous attention/activity; attention dismissal/context; search by device/room; every secondary destination; thermostat min/max/step and command errors.

```tsx
expect(screen.getByRole('button', { name: /Dishwasher.*running/i })).toBeTruthy();
expect(screen.queryByText('0 minutes remaining')).toBeNull();
```

Supply running state with absent completion time. Verify missing time is omitted, not fabricated.
- [ ] Run `npx vitest run src/canvas/CanvasSecondary.test.tsx`; expect absent components.
- [ ] Render existing controller states without duplicating automation logic. Keep House pulse reserved height; expose activity with sage and actionable attention with amber plus text/icons. Animate only active devices, under reduced-motion media query disable animation. Device search indexes labels, rooms and capabilities; preserve actual secondary controls instead of placeholder destinations.

```css
.canvas .canvas-pulse { min-height: 64px; }
@media (prefers-reduced-motion: reduce) {
  .canvas .appliance-animation { animation: none; }
}
```

- [ ] Run new tests and mood/attention/appliance/temperature regression tests green, type-check. Commit `feat: complete Canvas moods activity and device access`.

## Task 7: Readable real weather

**Files:** Create `src/canvas/CanvasWeather.tsx`, `src/canvas/weather.ts`, `src/canvas/CanvasWeather.test.tsx`, `src/canvas/weather.test.ts`. Reuse `src/useQuietForecast.ts`.

**Interfaces:** `CanvasWeather()`; `weatherIcon(condition: string | undefined, isDaytime?: boolean): string`; `forecastDateKey(datetime: string, timeZone: string): string`. Use actual HA configuration timezone and reported temperature units. Display local formatted hour plus timezone offset when DST repeats an hour.

- [ ] Test default 12/24 hour filtering, daily column separation, unsupported hourly fallback, subscription cancellation/retry, all specified condition families, missing values, midnight and repeated DST hour.

```ts
expect(forecastDateKey('2026-09-24T02:00:00Z', 'America/Toronto'))
  .toBe('2026-09-23');
expect(weatherIcon(undefined)).toBe('unknown');
```

- [ ] Run `npx vitest run src/canvas/weather.test.ts src/canvas/CanvasWeather.test.tsx`; expect missing exports.
- [ ] Map actual conditions to React SVG icons; retain neutral unknown. Filter only valid future forecast timestamps, do not invent missing hours. Build day keys with `Intl.DateTimeFormat(...).formatToParts()` (numeric year/month/day), not UTC slicing. Render vertical rows with explicit independent columns:

```css
.canvas-dialog .forecast-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) 6rem 4.5rem;
  gap: .75rem;
}
```

Use narrower phone columns without text overlap. Empty data, unsupported types and retry are visible. Preserve the existing forecast subscription cleanup.
- [ ] Run tests plus `src/QuietWeather.test.tsx` green, type-check. Commit `feat: add live chronological Canvas forecast`.

## Task 8: Composition, responsive and accessibility acceptance

**Files:** Complete `src/canvas/CanvasDashboard.tsx`, `src/canvas/CanvasDialog.tsx`, `src/canvas/canvas.css`; create `src/canvas/CanvasIntegration.test.tsx`, `docs/house-canvas-verification.md`.

**Interfaces:** All routes share one modal owner and restore the appropriate trigger on Back/Close. No service dispatch in composition. Existing views remain visually isolated.

- [ ] Write end-to-end component interactions through the controlled fixture: overview to every detail route and back, mood recovery, all-light partial failure, selected blind retry, speakers/player roundtrip, favourites playback, forecast failure, search and attention context. Test keyboard traversal and retained slider focus after entity updates:

```tsx
const slider = screen.getByRole('slider', { name: 'Group volume' });
slider.focus();
act(() => fixture.publish('media_player.living_room', 'playing', { volume_level: .4 }));
expect(document.activeElement).toBe(slider);
```

- [ ] Run `npx vitest run src/canvas/CanvasIntegration.test.tsx` red for incomplete navigation.
- [ ] Compose approved layout, root-scoped tokens and semantic buttons. Implement safe areas, min 44px interactive bounds, scrollable sheets, body scroll restoration, visible keyboard focus, selected checkmarks, announcements for errors and preserved identity across state updates. Keep available vertical space for House pulse, not content-dependent jumps.
- [ ] Run `npm test`, `npx tsc -b`, scoped `npx eslint src/canvas src/App.tsx src/DashboardViews.tsx` plus other changed TS files, then `npx vite build`. Do not run `npm run build` because its prebuild formats unrelated files. Record any pre-existing lint failure precisely.
- [ ] Use a test-only local fixture preview to inspect actual rendering at 960×600, 1280×800, 375×812 and 393×852. Record screenshots, target bounds, scroll dimensions, no console errors, dialogs, long titles, Daily overlap regression, empty/offline/busy scenes. Also inspect Classic and Quiet for style leakage. Do not use jsdom dimensions as visual evidence or send live commands.
- [ ] Commit `feat: finish responsive Canvas dashboard and integration coverage`.

## Task 9: Safe separate trial deployment and hardware handoff

**Files:** Create `scripts/deploy-canvas.ts`, `scripts/canvas-release.ts`, `scripts/canvas-release.test.ts`, `docs/house-canvas-trial.md`; modify `package.json` only for explicit trial commands. Do not change `scripts/deploy.ts` behaviour as part of this trial.

**Interfaces:** `publishTrial(adapter, localDirectory, releaseId): Promise<void>` and `rollbackTrial(adapter): Promise<void>`. Define an injected adapter for upload, remote read/hash verification, exists, rename and close, backed by the installed SSH/SFTP library. Restrict remote destinations to the resolved HA www root plus `canvas-trial` and names prefixed `canvas-trial-`; reject path traversal and any `dashboard` destination. Resolve exactly one valid HA root, fail on ambiguity.

- [ ] Write fake-adapter tests for upload interruption, missing/hash-mismatched assets, failed promotion, rollback, retained previous release and rejection of other destinations:

```ts
await expect(publishTrial(failingUploadAdapter, 'dist', 'test-release'))
  .rejects.toThrow();
expect(failingUploadAdapter.operations.some(op =>
  op.kind === 'rename' && op.from.endsWith('/canvas-trial'))).toBe(false);
```

The fake records operations and rejects upload. Add promotion-failure test asserting previous release is restored. Reject concurrent deployments with a remote lock and clean only this run's stage after failure.
- [ ] Run `npx vitest run scripts/canvas-release.test.ts`; expect missing implementation.
- [ ] Build with `VITE_FOLDER_NAME=canvas-trial npx vite build`. Use a local manifest of SHA-256 hashes, upload to a unique staging sibling, verify every asset remotely before switching. Retain the existing trial as a previous release, promote staged directory, restore previous on failed promotion. Document that a two-rename switch is recoverable but not atomic; do not claim otherwise. Keep old hashed assets available during the switch to avoid breaking already-open clients. Fail with nonzero exit status; close connections in finally. Never remove the current dashboard. Read SSH credentials without logging them; no client-side token reference may remain in built assets.
- [ ] Test release code green, full tests/type-check/build, then inspect build artifacts for secret inclusion without printing matching values. Deploy only the dedicated trial. Fetch and push verified code to `origin/codex/quiet-home-poc`, never force. Verify remote HEAD equals the tested commit.
- [ ] Verify actual LAN trial HTML and assets, login flow and read-only entity updates. Record exact URL ending `/local/canvas-trial/?view=canvas`, source commit, release ID, validation and rollback command. If connectivity/auth/server capability blocks deployment, report the exact blocker rather than claiming completion.
- [ ] Provide hardware checklist: actual CSS viewport/Silk version, full-screen fit at normal viewing distance, every main touch action, follow/manual handoff, multi-room blinds and Stop, favourites art, daily/hourly forecast, appliance animation, tablet sleep/Wi-Fi recovery, iPhone safe areas/background resume. Mark each hardware item pending until observed on that device. Current dashboard's original URL remains immediate fallback.
- [ ] Commit verification and handoff docs and push the same branch. Adoption/default switch remains a later user decision.

## Self-review record

- Coverage: architecture/auth task 1; lifecycle task 2; lights/modes task 3; blinds task 4; music task 5; moods/activity/device parity task 6; weather task 7; responsive/accessibility/regressions task 8; trial/rollback/hardware task 9.
- Failure focus cases have named tests in their owning tasks.
- No new runtime data source, automatic home commands or default-view replacement is introduced.
- Execution must refine extracted speaker hook types from existing implementations; it must not rewrite mature semantics to match a speculative new interface.
- The blind adapter must support non-entity service calls explicitly; rooms are result-correlation keys, never HA entity targets.
- Desktop validation and physical tablet validation are distinct completion evidence.
