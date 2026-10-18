# Task 5 implementation report

Base: `976ca18`. Implemented the current-song Spotify heart in the already reserved 44px title-row slot. No live-home actions, private auth reads, deployment, push, preview-server controls, or subagents were used by this worker. Root owns independent review, CUA, deployment and integration.

## Behavior and contracts

- `useSpotifyTrackSaved(trackUri, enabled)` returns the specified saved/loading/pending/error/setSaved/retry shape. Exact Spotify track URIs only; authenticated `dashboard_music/track_saved` and explicit `dashboard_music/set_track_saved` desired-state messages use a captured URI. State is unknown until confirmed, and errors return to unknown. No implicit-current mutation, optimistic state, automatic write replay, or playback/group/follow call.
- Track/connection generations cancel client waits, reject stale responses, and clear old identity synchronously. Save pending is independent of speaker controls. An interrupted/uncertain write requires a read reconciliation; retry only reads.
- Visible connected tracks are read every 30 seconds. Focus and visible-tab return read only when state is at least 30 seconds old; overlapping reads/writes deduplicate. Hidden tabs do not poll. Reconnection performs a fresh read. Individual reads/writes time out at 15 seconds; cancellation and unmount release timers.
- `useSpotifyCurrentTrack` accepts exact URI metadata only with Spotify source evidence on playing/buffering/paused coordinators. Retained TV/radio, ambiguous direct metadata, local files and episodes remain disabled. Native `x-sonos-vli:...:2,spotify:...` sessions resolve through authenticated read-only `dashboard_music/current_track` for the actual coordinator, accepting only the same returned coordinator and exact track URI. Missing source on a native wrapper is delegated to server provenance verification; explicit TV source is rejected. Source/track/disconnect changes invalidate previous resolved identity, including reconnect before fresh response. Wrapper identity polls/focus refreshes with the same visibility/dedup policy.
- The button exposes the exact Save/Remove labels and confirmed `aria-pressed`; unknown omits pressed and displays a muted question/loading/error marker. Errors show compact in-card feedback and tapping the heart retries the read. Pending uses aria-disabled with an enforced synchronous hook lock so keyboard focus remains on the button.
- Successful current-track user saves trigger a 420ms heart pop (1 → 1.22 → 1) with four tiny contained decorative sparkles. Removals trigger a 240ms gentle shrink/tilt/settle. Initial/external reads, failed writes and old-track completions do not decorate. Reduced motion prevents effects and preference changes cancel running effects. Completed/rejected/cancelled/unsupported/throwing animation APIs clean their particles and listeners; animation failure never reverses saved state.

## TDD and verification

Used the test-driven-development skill and its writing-good-tests reference. New files initially failed import resolution; minimal no-op interface stubs then established real behavioral RED: 13 failed / 2 passed across hook/current-track/component/animation cases. Green implementation followed. Preview handler and paused-source integration cases then demonstrated 3 intended failures before integration. Self-review found two additional races and established RED before fixes: delayed initial network reads causing the first 30s poll to slip to 60s; old Connect identity resurrecting while reconnect lookup was pending.

Final commands/results:

- `VITE_FOLDER_NAME=dashboard npm test -- src/useSpotifyTrackSaved.test.tsx src/useSpotifyCurrentTrack.test.tsx src/canvas/CanvasTrackHeart.test.tsx src/canvas/trackHeartAnimation.test.ts dev/canvas-preview/spotify-services.test.ts src/canvas/CanvasMusic.test.tsx src/canvas/spotifyTrackUri.test.ts` — 7 files, 189 tests passed.
- `VITE_FOLDER_NAME=dashboard npm test` — 48 files, 751 tests passed, 16.29s. Earlier full runs caught only the two new self-review regression RED cases, which are fixed and included in the final run; no omitted failing tests.
- `npx tsc -b` — passed.
- Scoped `npx eslint` for all new files and modified TS/TSX implementation/preview files — passed. Initial hook-state lint findings were corrected using render-keyed state reset and layout generation cleanup.
- `git diff --check` — passed.
- `npm run build:dashboard` — passed, 1004 modules, production build completed in 3.82s. Existing large-bundle/plugin-timing warnings remain; no broad prebuild/prettier run. Prettier was run only on the eight newly created files.

Boundary tests cover unknown/loading/confirmed states, explicit URI/desired payload, rapid taps, A-write/B-switch race, failed/auth writes and retry read, external polling, hidden/focus/visibility/reconnect dedup, interrupted writes, mismatched responses, timeout/unmount, direct paused source provenance/TV/episode rejection, native wrapper delayed identities/coordinator mismatch/reconnect invalidation, successful save/remove durations, particles/accessibility, reduced-motion start/change, cleanup including rejected/unsupported/throwing APIs, failed/stale/initial/external animation suppression, focus preservation and unrelated speaker-control independence.

## Local preview and root QA handoff

Preview fixtures remain wholly local. New query modes: `song=saved`, `error`, `remove-error`, `read-error`, `auth`, `connect`, `connect-paused`, `tv`, `unknown`, `episode`, `local`; default is a valid unsaved Spotify song. `songDelay=<ms>` delays write confirmation, `songReadDelay=<ms>` delays read/current identity, `songSwitchAfter=<ms>` switches displayed metadata to a new exact track for stale-write QA. Existing `media=paused` also works. `song=error&songDelay=1200&songSwitchAfter=600` exercises a delayed failed save after song change; `songDelay=1200&songSwitchAfter=600` exercises successful old-song confirmation. Reduced motion is controlled by browser preference.

Root reported CUA at measured Fire iframe emulation 1224×614: heart touch target 44×44; filled→outline removal works; visible error bubble at x717.89/y216, width230/height43.94 stays within music card; overview intact. Root will fresh-reload the final stable commit to finish phone/Fire interactions because mid-edit HMR briefly blanked the preview after a viewport change. This worker claims no physical-device acceptance or real-home save test; those remain root/user-owned.

## Self-review and remaining concerns

Reviewed captured-write and read generations, cancellation/timer cleanup, connection-in-place events, retry uncertainty, source provenance, reduced-motion lifetime, focus and unchanged card geometry. No known implementation issue remains. Final CUA acceptance, independent task review, deployment/push and physical Follow/Jam participation remain root/user work. Existing offscreen playlist feedback is a separately acknowledged Task4 follow-up and was not changed here.
