# Dashboard Interaction Testing Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for implementation, with independent review. Checkboxes track planned work, not completed verification.

**Goal:** Verify complete user journeys and competing actions across the dashboard, including device failures, automation interference, and tablet/phone interactions.

**Architecture:** Extend the existing Vitest/Testing Library HA fixture for deterministic command and event ordering. Combine frontend sequence tests with Python mood ownership tests, then validate the actual automation boundary and physical devices separately: a simulated service acknowledgement is not proof of a physical outcome.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Python unittest, local Vite preview, Home Assistant.

**Spec:** This document records the proposed interaction contract derived from the user's request on September 26. The user approved moods as temporary overlays on either Day or Night, restoring the preceding baseline when ended. Other expected outcomes preserve established user preferences.

## Baseline and scope

Executed September 26 against the current local worktree:

- `npx vitest run`: **383 tests passed, 31 files**.
- `python3 -m unittest discover -s home-assistant/tests -v`: **125 tests passed**.
- These are regression baselines, not certification of live automations, physical hardware, or every interaction below. HA-specific, attention and extension suites were not included in these counts.
- Implementation subsequently added interaction regressions and fixes. Final evidence is in `docs/canvas-qa/interaction-acceptance.md`; baseline counts above are retained for comparison.

Existing coverage includes command deduplication, late results, offline access, no replay on reconnect, partial failures, mood ownership/restoration, speaker handoff, weather units/DST, and dialog focus restoration. The main missing layer is interaction across these individually tested systems.

## Global constraints

- Use the active worktree verified through `git worktree list`; preserve unrelated changes.
- Local simulated preview first. Do not exercise physical home commands as part of automated tests.
- Group volume sets one absolute level on all confirmed members; no individual volume UI.
- Room brightness changes only currently-on dimmable lights, checking fresh state at dispatch; all-off disables the slider.
- Keep touch controls comfortable on landscape Fire tablet and smaller iPhone Pro; no checkmark selection styling or redundant selected-room copy.
- Service acceptance, observed state, and physical completion are distinct outcomes.
- Reconnect must never replay a stale user command.

## Mode contract: moods overlay Day or Night

Current source: `src/canvas/useCanvasModes.ts` independently sets Day/Night booleans; `src/canvas/CanvasMood.tsx` does not gate on Night; `home-assistant/custom_components/house_moods/ha_adapter.py` checks device preflight, not mode. Consequently Night → mood is currently allowed. The actual deployed Night/Day automation bodies are not checked in and were not inspected in this audit.

Approved policy: moods may start in either Day or Night without changing the base mode. End restores the pre-mood settings for controls still owned by the mood, preserving explicit manual overrides. Switching moods retains the original baseline. Normal disconnected, busy and recovery safeguards still apply.

| Sequence | Expected outcome |
|---|---|
| Night active → mood → End | Allow activation while keeping Night selected and nighttime automation rules. End restores the pre-mood nighttime settings for still-owned controls; never activates Day. |
| Mood active → Night | One coordinated transition: stop mood-owned activity and prevent restoration from undoing Night, then apply the Night routine. Never merely switch a boolean and leave the mood active. |
| Mood starting/restoring → Night | Reject conflicting requests with an explicit busy explanation; retry after the transaction finishes. Do not preempt partially committed device writes or queue a stale mode request. External helper changes rejected as busy are repaired to the authoritative helper state. |
| Night → Day | Serialize the mode transition with any mood command. Do not restart a previous mood automatically. |
| Day active → mood → another mood → End | Keep the original baseline across mood switches; restore only still-owned settings. |
| Manual light/music change during mood → End | Preserve the manual choice. Never restore a value merely because its late event resembles an earlier mood write. |
| Night active → direct light/music control | Allow explicit manual control; retain Night and do not start a mood implicitly. |
| Unknown/disconnected mode state | Mode writes require both valid helpers and a connection. All disconnected writes are disabled. A mood never invents a base mode when helper state is ambiguous. |

Night orchestration needs the real automation inspected first. Prefer one backend transaction/transition owner rather than a browser chain that can break on navigation. Define failure behavior explicitly: a failed cleanup must not be reported as successful Night; show actionable recovery, and test any deliberate best-effort night shutdown separately. Restoration must not briefly turn on pre-mood lights/music during the transition.

## Review focus

1. Cross-client action during a pending request: final authoritative intent wins, not last network response. Tasks 1–3.
2. Blind command acknowledged while motor still travels: Stop remains available for intended rooms. Task 3.
3. Manual changes during mood restoration: ownership cannot be reclaimed by delayed echoes. Task 2.
4. Group coordinator removal with partial topology updates: no incorrect playback or volume targets. Task 4.
5. Touch scrolling interrupts slider drag: no accidental command on later blur. Tasks 3 and 6.

## Task 1 — Build deterministic sequence fixtures

**Files:** Extend `src/canvas/testing/haFixture.ts`; create `src/canvas/CanvasInteractions.test.tsx`.

**Interface:** Keep `createHaFixture`, `respondWith`, `publish`, `disconnect`, and `reconnect`. Add a test-local deferred-response helper returning `{ promise, resolve, reject }`; use existing `fixture.calls` for exact domain/service/target/data assertions. No production network or generic auto-success simulator.

- [x] Write a harness test that delivers entity state before acknowledgement, acknowledgement before entity state, and no entity confirmation. Assert each is distinguishable.
- [x] Add sequences for rejected service, partial success, delayed stale response, disconnect before/after send, and a same-socket reconnect. Use fake timers for timeouts, not wall-clock sleeps.
- [x] Record both positive and forbidden writes: exact targets, data, number and order, rendered pending/error state, and final observed state.
- [x] Run `npx vitest run src/canvas/CanvasInteractions.test.tsx`; independently review that mocks do not supply the behavior the test claims to verify.

## Task 2 — Mode/mood conflicts and ownership (release blocker)

**Files:** Tests in `CanvasInteractions.test.tsx`, `src/canvas/CanvasModes.test.tsx`, `src/useHouseMood.test.tsx`, `home-assistant/tests/test_coordinator.py`, `home-assistant/tests_ha/test_integration.py`. Potential fixes in `useCanvasModes.ts`, `CanvasMood.tsx`, `useHouseMood.ts`, and the mood coordinator/HA adapter. Identify and capture the actual Day/Night automation definition before choosing its modification path.

- [x] Use the approved overlay policy above and inspect actual automation service effects, triggers, delays, and Day/Night mutual exclusion. Do not infer these from helper booleans.
- [x] Write failing scenarios for every row of the mode contract. Repeat Night during each mood phase: idle, starting, active, restoring, recovery-required. Cover all five moods with data-driven tests.
- [x] Test double taps; Night then immediate Day; mood A then B; End during start; Night from another client; both booleans on; missing mode entity. Assert only a valid transition is accepted and status never claims a completed routine based solely on the boolean.
- [x] Test motion-on and delayed motion-off before/during/after every mood. Existing motion guards specifically protect selected non-strip lights for Love/Party, not every mood. Verify this intended policy with the real automation rather than assuming universal suppression.
- [x] During activation/end/switch, issue manual brightness, all-lights-off, music pause, group-volume, speaker selection, and Follow me changes. Deliver related device events in reversed order. Assert manual overrides survive End/recovery and no stale mood write occurs after completed Night.
- [x] Test failure after a physical write but before acknowledgement; failure during restoration; HA restart during transition; retry after manual changes. Retry only unresolved work and preserve the original ownership baseline.
- [x] Implement fixes only after failing tests establish a reproducible conflict. Run frontend interaction/mood/mode suites and Python coordinator/HA suites; obtain independent review of transition ordering and ownership.

## Task 3 — Lights and blinds sequences (release blocker)

**Files:** `src/canvas/CanvasLights.test.tsx`, `CanvasBlinds.test.tsx`, `CanvasInteractions.test.tsx`; potential fixes in `CanvasLights.tsx`, `CanvasLightDetails.tsx`, `useCanvasLights.ts`, `useCanvasBlinds.ts`.

| Test sequence | Required assertion |
|---|---|
| Mixed on/off lights → room brightness | Every currently-on dimmable target gets the same level; off, unavailable and non-dimmable targets get no write. |
| Light turns off between drag and release | Fresh state excludes it; if none remain, no command. |
| Quick light toggle → room brightness → All lights off | Correct scope and final off state; late confirmations cannot erase a newer outcome. |
| Change room while command pending; close/reopen details | Feedback belongs to original room/action; no duplicate sends. |
| Scroll/pointercancel/blur during brightness drag | Cancelled gesture produces no accidental write; keyboard commit still works once. |
| Select two blind rooms → Open → change selection | The operation retains its original targets. |
| Open acknowledged → clear selection → Stop during travel | Stop reaches the intended moving rooms, including after request settlement. |
| Open still pending → Stop → delayed Open acknowledgement | Send Stop immediately without waiting for ACK; block new movement while Stop is pending. A late Open response cannot overwrite Stop feedback or replay writes after reconnect. Provider-side physical ordering remains an explicit hardware acceptance limit. |
| One blind room fails → Retry | Only failed original targets are retried; successful rooms are not repeated. |

- [x] Write failing tests for uncovered sequences; retain existing on-only brightness tests as regression coverage.
- [x] Investigate `useCanvasBlinds.ts` clearing remembered movement targets when the request settles. If blinds lack movement telemetry, define an explicit bounded operational policy; never invent a stopped/completed position.
- [x] Implement minimal fixes and run Lights, Blinds and Integration suites plus independent review.

## Task 4 — Speaker topology, playback and volume (release blocker)

**Files:** `src/canvas/CanvasMusic.test.tsx`, `src/SpeakerPlayback.test.tsx`, `CanvasInteractions.test.tsx`, `dev/canvas-preview/speaker-services.test.ts`; fixes belong in existing speaker controller/session modules.

- [x] Test every subset of available speakers, preserving at least one selected room. Removing the coordinator transfers to a survivor; selecting the final room off issues no destructive empty-group command.
- [x] Transfer with three surviving rooms; deliver inconsistent group reports in different orders, delay one member, reject transfer, disconnect, and change track during handoff. Do not resume/pause prematurely or target the removed coordinator afterward.
- [x] Group volume reaches every confirmed member at the same absolute level, including initially different levels. Add/remove a room during a volume gesture; target membership is revalidated at dispatch. Partial failures stay visible and are not reported as uniform success.
- [x] Exercise Follow me on/off with manual group selection, transfer, Night and mood transitions. Define whether manual selection pauses Follow me or Follow me can subsequently move playback; test that policy explicitly before altering it.
- [x] Playlist → pause → transfer → resume; no track metadata; idle/offline speaker; unsupported transport. No duplicate playback and no “Ready to play” presented as a song.
- [x] Run Music, SpeakerPlayback and preview speaker-service suites; independent review of delayed state and command ordering.

## Task 5 — Attention, weather and secondary controls

**Files:** `CanvasSecondary.test.tsx`, `CanvasWeather.test.tsx`, `CanvasIntegration.test.tsx`, `src/useAttention.test.tsx`, `home-assistant/tests_attention/`.

- [x] Appliance running → finished → new run while reminder dismissal is pending: stale episode acknowledgement must not dismiss the new run. Unknown/offline must not look like all-clear or active running. Test multiple simultaneous appliances and reminders.
- [x] Weather hourly → daily → close/reopen with late responses and disconnect: correct latest view, released subscriptions, no duplicate rows. Zero is valid; missing feels-like/wind is omitted; amount never becomes probability. Verify Verdun label is independent of the valid America/Toronto time zone, midnight, DST and condition icons.
- [x] Thermostat min/max/step and unsupported modes; vacuum unavailable, unsupported action, rejected command, repeated tap. Read-only navigation must send no device commands.
- [x] Run corresponding frontend suites and `python3 -m unittest discover -s home-assistant/tests_attention -v`; categorize environmental failures separately from assertions.

## Task 6 — Browser interaction and real-device acceptance

**Files:** Create `docs/canvas-qa/interaction-acceptance.md` containing scenario, environment, expected/actual result, screenshot and pass/fail/blocked evidence. Use existing local preview and its simulated scenes.

- [x] At 1024×600 landscape and 390×844 portrait, verify normal, busy, offline, empty and unconfirmed scenes.
- [ ] Verify actual Fire tablet viewport/browser; desktop emulation alone cannot certify it.
- [x] Exercise room picker by browser pointer and keyboard; open/close/nested Back; outside click and Escape; focus return; independent scroll in dialogs; slider vertical-scroll cancellation; rapid taps and navigation during pending requests.
- [x] Capture screenshots of loading/error and active selection; existing long-title regressions remain covered. Check no overlap, clipped art, tiny controls, card height jumps, off-centre icons or unreadable contrast. Main tablet controls must remain reachable without accidental scrolling.
- [ ] Run an agreed supervised real-tablet session: one light, room brightness, two blind rooms plus Stop, group playback transfer and absolute volume, then Night/mood policy. Record actual hardware state and restore the agreed baseline afterward. Do not automate physical home effects without an explicit test session.
- [ ] Reload/suspend/wake the tablet during pending actions; verify fresh state, no replay, and useful recovery. Repeat from a second client to expose cross-client ordering.

## Release gate and evidence

- [x] Automated/local P1 sequences pass with regressions for fixed defects. Hardware-only acceptance remains open below.
- [x] Run `npx vitest run`, `npx tsc -b --pretty false`, Python mood/attention suites and the repository's HA-specific test environment. Run `npx vite build` directly after TypeScript to avoid the whole-repo formatting prebuild hook.
- [x] Independent reviewer checks forbidden writes, stale state, transition ownership and whether the fixture conceals backend behavior.
- [x] Record scenarios still blocked by unknown automation or physical device support; no “everything works” claim while critical cases remain unverified.
- [x] Preserve local preview during iteration. Follow the repository's commit/push workflow for completed verified implementation, keeping deployment a separate step and preserving unrelated work.

## Execution order

1. Inspect actual automations against the approved overlay policy; build deterministic scenario harness.
2. Mode/mood and blinds Stop gaps first, then lights and multi-speaker races.
3. Secondary interactions and phone/tablet UX.
4. Full regressions, independent review and supervised hardware acceptance.

The prior brightness-only change is complete separately: its focused Lights/Integration run passed 47 tests. This plan expands coverage beyond that isolated behavior.

## Implementation decisions and remaining acceptance

- Tasks1–5 implemented with independent review and regression verification. Counts and concrete remaining limits live in the acceptance report; checkboxes indicate the automated/local implementation work, not hardware certification.
- Busy mode transitions reject rather than preempt ongoing mood transactions. Cost: a mode command during a short transition must be retried; interrupted physical writes are not guessed safe.
- Stop sends immediately as best effort and prevents further movement commands while pending. The latest movement targets are retained90seconds without claiming motion telemetry; Google Assistant cannot establish physical completion/order.
- Exact per-light staged brightness is hidden when a Tuya light is off. Verified fallback: restage only still-owned, mood-brightness-touched devices to the captured exclusive mode default after confirming power off, and only if that mode is unchanged. Unobserved custom pre-mood staging cannot be restored exactly; no global routine overwrites manual adjustments.
- Actual Fire tablet touch/suspend testing, real Sonos/blinds/DP behavior, and live backend rollout remain unchecked. No deployment or physical test occurred.
