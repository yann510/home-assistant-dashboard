# Spotify Connect Library and Song Heart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start Spotify-controlled Sonos playback with one tap from Yann's saved playlists, preserve grouping and Follow me, and add a playful save/unsave heart for the current song.

**Architecture:** SpotifyPlus owns Spotify authentication, discovery, playback and library access. A small Home Assistant `dashboard_music` adapter fixes the account and validates commands; React keeps the current music/speaker interface with a Playlists sheet and a separate song heart. Sonos remains authoritative for group topology and room volumes; House Moods explicitly relinquishes manually replaced playback.

**Tech Stack:** Existing React 19/TypeScript/HAKit, Vitest/Testing Library, CSS/Web Animations API, Home Assistant Python custom component, Python unittest, SpotifyPlus, existing atomic dashboard release tooling. No new frontend dependency.

**Spec:** `docs/superpowers/specs/2026-10-17-spotify-connect-design.md` (read before execution).

## Global Constraints

- Every dashboard launch uses Yann's Spotify account.
- Successful playback must remain a Spotify Connect session. Hearing Spotify tracks from a Sonos local queue does not meet the requirement.
- Playlist selection preserves the current group, volume, Follow me enabled state, and saved source.
- The user starts and shares the Jam inside Spotify; this change does not create or invite people to a Jam automatically.
- Credentials stay in Home Assistant/integration storage, never dashboard source, build variables, logs, or Git.
- Set a total operation deadline of 30 seconds, with shorter per-call timeouts.
- Repeated request IDs return the same in-flight/completed result for a bounded five-minute retention period; a different simultaneous request gets busy instead of queuing stale music selections.
- Replace the heart that opens favourites with a compact text button labelled **Playlists**, opening the existing sheet with the heading **Your Spotify playlists**.
- Outline means not saved; filled means saved. Accessible labels are **Save [song] to Liked Songs** and **Remove [song] from Liked Songs**, with `aria-pressed` reflecting confirmed state.
- On a confirmed user-initiated save, animate a small heart pop with a few decorative sparkles over 420 ms. On a confirmed removal, use a soft shrink-and-settle over 240 ms.
- Under `prefers-reduced-motion: reduce`, update the filled/outline state immediately without either effect.
- House Mood presets continue their current playback behavior in this scope. Manual Spotify launches must safely override mood-owned playback; End mood must not stop that manual session.
- Work in the existing managed worktree from current main. Preserve unrelated changes in the original checkout. Fetch before integration, push verified work directly to `origin/main`, never force-push or open a PR.
- Execution is subagent-driven with independent reviews, already selected by the user. Do not ask them to choose an execution mode again.

## Review Focus

1. A Spotify library save finishes after the song changes: only the captured track is modified; the new song's heart and animation must not inherit the old result. Task 5 owns the regression.
2. A playback timeout returns before an upstream command settles: block overlapping starts and reconcile before retry, without replaying late commands. Task 3 owns the regression.
3. A saved playlist is removed or renamed between pages and selection: deduplicate by URI, refresh membership, and reject removed items without title substitution. Task 2 owns the regression.
4. Follow me or another browser changes the group while a playlist launches: never guess a new target or transfer automatically; return busy/unconfirmed. Tasks 3 and 6 own the regression.
5. A mood activation/restoration is already executing when manual Spotify starts: relinquish affected playback before the new effect, await older effects settling, and preserve lights/other controls. Task 3 owns the regression.

## File and interface map

Backend:

- `home-assistant/custom_components/dashboard_music/{__init__.py,manifest.json,services.yaml}`: HA configuration, permissions, response service and authenticated WebSocket commands.
- `home-assistant/custom_components/dashboard_music/{models.py,gateway.py,library.py,playback.py}`: typed results/protocol, SpotifyPlus adapter, paginated library/cache, launch orchestration. Keep HA imports lazy like `house_moods` so pure tests run locally.
- `home-assistant/custom_components/house_moods/__init__.py`: narrow async manual-playback supersession hook integrated with the existing coordinator guard.
- `home-assistant/tests/test_dashboard_music_{gateway,library,playback,moods,permissions}.py`: meaningful fake-clock/provider/runtime tests.
- `scripts/configure-dashboard-music.mjs`: read-only preflight by default; explicit backed-up installation/configuration mode, no tokens in output.
- `home-assistant/spotify-connect-verification.md`: exact compatibility pin, setup and real-device acceptance evidence, including failures/unverified checks.

Frontend:

- `src/spotifyMusicTypes.ts`: public wire types shared by the three new hooks.
- `src/useSpotifyPlaylists.ts`, `src/useSpotifyPlaylistPlayback.ts`, `src/useSpotifyTrackSaved.ts`: independent library, playback lifecycle and song saved-state hooks.
- `src/canvas/{CanvasMusicProvider.tsx,CanvasMusic.tsx,CanvasPlayer.tsx}`: wire new data/actions into existing boundaries and label entry point.
- `src/canvas/CanvasPlaylists.tsx`: replacement for `CanvasFavourites.tsx`; reuse gallery artwork transition.
- `src/canvas/{CanvasTrackHeart.tsx,trackHeartAnimation.ts,canvas-music.css}`: accessible song control and optional decorative animation.
- Adjacent `.test.ts[x]` files plus `src/canvas/CanvasMusic.test.tsx`: focused tests and current interface regressions.

Wire contracts (all fixed to the backend-configured account):

```ts
type SpotifyPlaylist = { uri: string; title: string; owner: string; thumbnail?: string };
type SpotifyPlaylistPage = { items: SpotifyPlaylist[]; nextOffset: number | null; total: number };
type SpotifyPlayResult = { request_id: string; status: 'confirmed' | 'already_playing' | 'busy' | 'failed' | 'unconfirmed'; source_entity?: string; playlist_uri: string; message?: string };
type SpotifySavedTrack = { track_uri: string; saved: boolean };
```

- WS `dashboard_music/playlists`: `{offset: number, limit: number, refresh?: boolean}` -> `SpotifyPlaylistPage`; default limit 50, valid range 1–50, offset 0–100000. Bind cached data to configured account.
- WS `dashboard_music/track_saved`: `{track_uri: string}` -> `SpotifySavedTrack`.
- WS `dashboard_music/set_track_saved`: `{track_uri: string, saved: boolean}` -> `SpotifySavedTrack` after read-back. The authenticated connection supplies identity; do not trust a supplied user/account field.
- Response service `dashboard_music.play_spotify`: `{playlist_uri: string, source_entity: string, request_id: string}` -> `SpotifyPlayResult`. Read via HA's authenticated `call_service` socket with `return_response: true`.
- WS errors use HA error envelopes with stable codes `not_configured`, `auth_required`, `forbidden`, `rate_limited`, `unavailable`, `invalid_request`; rate limits include a bounded `retry_after` for the UI.
- Python gateway `SpotifyGateway` exposes async `list_playlists(offset: int, limit: int) -> dict`, `track_saved(track_uri: str) -> bool`, `set_track_saved(track_uri: str, saved: bool) -> None`, `resolve_device(source_entity: str) -> str`, `start_playlist(playlist_uri: str, device_id: str) -> None`, and `playback_state() -> PlaybackState`. `PlaybackState` contains `account_id`, `device_id`, `context_uri`, `is_playing`, and `is_connect`; missing evidence stays unknown, never synthesized as success.
- `Library` exposes async `page(offset, limit, refresh=False)`, `contains_playlist(uri)`, `saved_track(uri)`, and `set_saved_track(uri, saved)`; uses injected gateway and monotonic clock.
- `PlaybackController.play(playlist_uri, source_entity, request_id, user_id) -> dict` consumes Library, gateway and `SpeakerPort`. `SpeakerPort` provides `authorize`, `snapshot`, `supersede_mood`, and `confirm_sonos_playing`; its HA implementation uses the current registry/runtime.

## Task 1: Prove and pin the SpotifyPlus route

**Files:** Create `scripts/configure-dashboard-music.mjs`, `home-assistant/spotify-connect-verification.md`, and `scripts/configure-dashboard-music.test.ts`.

**Interfaces:** Produces a recorded compatible SpotifyPlus version and verified service-response schemas for the gateway; no frontend changes. Installer exports pure `validatePreflight(report)` and defaults to inspection. Explicit `--install` backs up targeted files/settings; `--rollback BACKUP` restores only this task's changes.

- [ ] Add a failing installer test: `validatePreflight({hasAccount: true, desktopAuthorized: false})` rejects with an authorization-required error; incompatible runtime/missing service schema is rejected; dry-run performs no mutation. Mock all remote operations.
- [ ] Run `npm test -- scripts/configure-dashboard-music.test.ts`; confirm failures are the missing implementation, not the environment.
- [ ] Implement inspection/install/rollback using existing dotenv/SSH patterns; capture HA/Python versions, existing integrations and exact upstream release requirements. Keep credential-bearing files out of Git and output. Back up configuration before installing SpotifyPlus via the existing HA/HACS mechanism. Have the user complete required Spotify consent/login on their machine when reached; do not bypass it or expose tokens in chat.
- [ ] Verify one idle speaker and an existing group can cold-start a selected playlist using additional Desktop authorization, with the phone closed. Open Spotify, confirm same account/device/context, control queue, and verify Jam with user participation. Record exact upstream service names/payloads and fresh-state evidence used by later tasks. Also prove current library reads and save/check/remove methods work with Spotify's current API on this account; save/remove only a user-selected test track and restore its prior saved state.
- [ ] Run the installer test and record the real-device results. The documented acceptance matrix must identify pass/fail/unverified separately. If Connect/Jam/library support cannot be established, stop rollout and revise the incompatible assumption before downstream implementation; do not fabricate a compatible version or install a fallback silently.
- [ ] Commit only installer, its test, and redacted verification notes with `chore: verify SpotifyPlus Connect and library compatibility`.

## Task 2: Add the fixed-account library gateway

**Files:** Create `home-assistant/custom_components/dashboard_music/{__init__.py,manifest.json,services.yaml,models.py,gateway.py,library.py}` and `home-assistant/tests/test_dashboard_music_{gateway,library,permissions}.py`. Extend the Task 1 installer with the component configuration only after the pinned service schemas are verified.

**Interfaces:** Produces `SpotifyGateway`, `PlaybackState`, `Library`, and the three library WS commands from the interface map. The fixed account/entity is backend configuration; existing `dashboard_spotify` remains unchanged. Reserve playback-service registration for Task 3.

- [ ] Write failing tests named `test_fixed_account_cannot_be_selected_by_client`, `test_private_and_collaborative_playlist_pages`, `test_removed_renamed_and_duplicate_playlist_uris`, `test_membership_cache_miss_refreshes_once`, `test_rate_limit_respects_retry_after`, `test_set_saved_uses_explicit_state_and_reads_back`, and `test_read_permission_cannot_write`. Assert returned URIs and pagination fields, rejection of invalid IDs, permission denial before provider calls, and no arbitrary account/device writes.
- [ ] Run `python3 -m unittest discover -s home-assistant/tests -p 'test_dashboard_music_*.py' -v`; confirm expected missing-feature failures.
- [ ] Implement the gateway against Task 1's verified SpotifyPlus schemas. Normalize response shapes in one place. Reject account mismatch or missing supported methods. Use required library scopes and the upstream supported current library endpoints through SpotifyPlus; do not revive deprecated track endpoints or add a second OAuth/client implementation.
- [ ] Implement Library with 60-second freshness, 200 cached playlist pages per account at most, and saved-state cache capped at 500 tracks with 30-second freshness. Membership refresh scans at most 200 pages per launch; if that does not establish membership, reject explicitly rather than truncate the displayed library. Serialize per-track writes and read back state. Bound provider calls at 12 seconds; honor `Retry-After` clamped to 1–300 seconds. Validate pagination without accepting an upstream arbitrary URL from a client.
- [ ] Register authenticated WS handlers with explicit account entity read/control permission checks, sanitized error mapping, and cleanup on HA shutdown. Register configuration for exactly one SpotifyPlus account and the four existing Sonos entities. Playlist reads do not require an available Sonos speaker.
- [ ] Re-run the focused Python tests; test a fake provider returning null playlists and duplicate titles at a page boundary, verifying distinct URIs survive and a removed URI cannot launch after membership refresh.
- [ ] Commit scoped files with `feat: expose the configured Spotify playlist library and song saves`.

## Task 3: Launch playlists on the real coordinator and relinquish mood playback

**Files:** Create `home-assistant/custom_components/dashboard_music/playback.py`; modify its `models.py`, `gateway.py`, `__init__.py`, `services.yaml`; modify `home-assistant/custom_components/house_moods/__init__.py`; create `home-assistant/tests/test_dashboard_music_{playback,moods}.py`.

**Interfaces:** Produces response service `dashboard_music.play_spotify` and `PlaybackController.play(...)` from the interface map. Add `Runtime.async_supersede_playback(source_entity: str, context_id: str) -> None` on House Moods. Missing House Moods runtime is a valid no-op; a loaded runtime failure must prevent launching.

- [ ] Write failing tests for `test_follower_resolves_to_coordinator`, `test_follow_source_wins`, `test_topology_transition_is_busy`, `test_duplicate_request_shares_result`, `test_new_request_is_busy_until_late_command_settles`, `test_unrelated_track_or_local_queue_does_not_confirm`, `test_changed_coordinator_does_not_replay`, `test_manual_launch_survives_end_mood`, and `test_inflight_mood_effect_settles_before_manual_launch`. Assert fixed account/device/URI calls once, preserved groups/volume/follow state, and no Sonos `play_media` fallback.
- [ ] Run the focused Python discovery command from Task 2 and confirm the new cases fail for the expected missing behavior.
- [ ] Implement coordinator snapshot validation for the existing four rooms, permission checks using the caller context, Spotify device discovery by stable configured Sonos identity and explicit device ID, and launch confirmation using fresh account/device/context/playing evidence plus Sonos playing state. No default active Spotify device, duplicate-name guessing, or title-only confirmation.
- [ ] Implement one account lock, five-minute request-result retention capped at 128 results, and a 30-second user-facing deadline. Keep uncertain delegated operations guarded until settled; preserve a reconciliation marker if the caller times out/disconnects. Reused IDs with changed payloads fail invalid-request. Keep account/user identity in the deduplication key so callers cannot retrieve another user's result. HA shutdown cancels/settles work without replaying it on restart.
- [ ] Implement mood supersession using `engine.note_external` immediately, then await serialized persistence/older effects before dispatching Spotify playback. Reuse `engine.observe(..., origin='external:' + context_id)` with real context identity as appropriate; never send fake media commands. Preserve lights, volumes, groups and Follow me ownership unless those controls were actually manually changed. Prove older activation/restoration cannot stop the new music.
- [ ] Run `python3 -m unittest discover -s home-assistant/tests -v`. Existing mood/follow tests and all new controller tests must pass. Record any upstream confirmation limitations as unconfirmed, not as a weakened test.
- [ ] Commit with `feat: launch verified Spotify sessions on Sonos groups`.

## Task 4: Replace favourites with the Spotify playlist sheet

**Files:** Create `src/spotifyMusicTypes.ts`, `src/useSpotifyPlaylists.ts`, `src/useSpotifyPlaylistPlayback.ts`, their adjacent `.test.tsx` files, and `src/canvas/CanvasPlaylists.tsx`. Modify `src/canvas/{CanvasMusicProvider.tsx,CanvasMusic.tsx,CanvasPlayer.tsx,CanvasMusic.test.tsx,canvas-music.css}` and remove `CanvasFavourites.tsx` only after no imports remain. Keep old generic Sonos hooks if other callers still need them.

**Interfaces:** `useSpotifyPlaylists(enabled: boolean)` returns `{items, loading, loadingMore, error, hasMore, loadMore, refresh, retry}`. `useSpotifyPlaylistPlayback(sourceEntity: string, disabled: boolean)` returns `{play(item: SpotifyPlaylist): Promise<boolean>, pending, error, status}`. Provider exposes `playlists`, `playlistPlayback`, and the existing session/rooms/playback fields; update all consumers together.

- [ ] Add failing hook/UI tests proving Playlists opens **Your Spotify playlists**, pages use distinct URI keys, private playlists display, filtering is labelled **Filter loaded playlists**, load-more errors keep earlier choices, and library browsing remains available when the speaker is unavailable while playback is disabled. Assert no Sonos media-browser request supplies this list.
- [ ] Add playback tests: request IDs stay constant for a single attempt, repeated clicks send one service call, confirmed/already-playing closes and optionally animates artwork, unconfirmed/errors keep the sheet open, and a stale response after source change/disconnect cannot close a different sheet. Disable starts during pending grouping/Follow me transitions; disable conflicting local controls during a pending start.
- [ ] Run `npm test -- src/useSpotifyPlaylists.test.tsx src/useSpotifyPlaylistPlayback.test.tsx src/canvas/CanvasMusic.test.tsx`; verify new failures match missing behavior.
- [ ] Implement hooks via existing authenticated `useStore` connection and disconnect helpers. Use backend envelopes from the interface map; timeout frontend response waiting at 35 seconds, showing uncertainty without automatic replay. Load one 50-item page at a time, deduplicate by URI, ignore stale generations, refresh stale pages on reopening, and expose explicit Load more/Refresh actions. Filter only loaded items and label that scope accurately.
- [ ] Replace the browsing heart with a 44px-minimum-height **Playlists** text button using current tokens/states. Retain song/app links, gallery thumbnail fallback and artwork handoff; let text width expand rather than squeeze a word into the prior 44px circle. Place the song-heart slot by the song metadata without overlaying playlist/transport controls.
- [ ] Run the focused frontend command and `npm run lint`; update old favourites-specific assertions only where behavior intentionally changed, retaining speaker/mood/grouping assertions.
- [ ] Commit with `feat: browse and play saved Spotify playlists`.

## Task 5: Add the song heart and cute confirmed-state animations

**Files:** Create `src/useSpotifyTrackSaved.ts`, `src/useSpotifyTrackSaved.test.tsx`, `src/canvas/{CanvasTrackHeart.tsx,CanvasTrackHeart.test.tsx,trackHeartAnimation.ts,trackHeartAnimation.test.ts}`. Modify `src/canvas/{CanvasMusicProvider.tsx,CanvasMusic.tsx,canvas-music.css}`. Consume the existing `src/canvas/spotifyTrackUri.ts` parser.

**Interfaces:** `useSpotifyTrackSaved(trackUri: string | undefined, enabled: boolean)` returns `{saved: boolean | null, loading: boolean, pending: boolean, error: string | null, setSaved(saved: boolean): Promise<boolean>, retry(): void}`. `CanvasTrackHeart({trackUri, title, enabled})` owns presentation and uses this hook. `animateTrackHeart(element: HTMLElement, saved: boolean): () => void` returns cleanup and is best-effort only.

- [ ] Write failing tests for unknown/loading/unsaved/saved/error states and accessible pressed state, paused valid Spotify tracks, invalid/non-Spotify sources, rapid double taps, explicit desired-state writes, external change refresh, auth failure, and stale responses. The key race test starts a save for track A, switches to B, resolves A, and asserts the mutation contained A while B's state/animation is untouched. Verify retry re-reads an uncertain write before deciding whether another write is needed.
- [ ] Add animation tests asserting save duration 420 ms, remove duration 240 ms, decorative particles are `aria-hidden` and pointer-inert, reduced motion schedules no animations, errors/initial reads cause no effect, and cleanup runs on cancelled/rejected/unsupported animation or unmount. Assert no thrown animation error can undo a successful saved-state change. Test lifecycle branches, not every keyframe coordinate.
- [ ] Run `npm test -- src/useSpotifyTrackSaved.test.tsx src/canvas/CanvasTrackHeart.test.tsx src/canvas/trackHeartAnimation.test.ts` and verify intended failures.
- [ ] Implement track-keyed lookup/write generations and captured-URI writes with the backend commands. Refresh on track change and reconnection; on window focus or visible-tab return refresh if saved state is older than 30 seconds. Do not tie the heart's pending lock to playback/grouping. Use exact current coordinator Spotify metadata/session evidence; a parsable retained URI on TV/radio is insufficient. Missing or ambiguous source evidence disables the heart until resolved.
- [ ] Implement outline/filled SVG using existing colors and 44px touch target. Unknown state omits `aria-pressed` and exposes loading/disabled copy rather than saying unsaved. Confirmed state uses the exact spec labels. Trigger decoration only after the captured track's successful user write is confirmed and still displayed: saving scales 1 → 1.22 → 1 with a few tiny sparkles; removing scales 1 → .82 → 1 with a gentle tilt. Keep particles positioned within a contained decorative layer, never changing layout or covering neighboring controls. Honor reduced motion before starting and cancel if that preference changes during an effect.
- [ ] Run focused tests plus `npm test -- src/canvas/spotifyTrackUri.test.ts src/canvas/CanvasMusic.test.tsx`; preview the like/unlike interaction with mocked success/error and reduced motion. Verify keyboard focus remains on the heart, and liking a song never calls playback/group/follow APIs.
- [ ] Commit with `feat: add an animated Spotify song heart`.

## Task 6: Validate integrated speaker controls and responsive states

**Files:** Modify `src/canvas/CanvasMusic.test.tsx`, relevant `src/useSpeakerRooms*.test.tsx` and `src/SpeakerPlayback.test.tsx` only for meaningful integration regressions; extend `home-assistant/tests/test_dashboard_music_playback.py` and `home-assistant/spotify-connect-verification.md`. Inspect `useSpeakerTransport.ts`, `useSpeakerSession.ts`, `useSpeakerRooms.ts`, `SpeakerSeek.tsx` and `SpeakerVolume.tsx` before changing them.

**Interfaces:** Preserve existing provider consumers and Sonos topology/volume behavior. If real-device evidence shows a Sonos transport command breaks Connect/Jam, add response service `dashboard_music.transport` with explicit source/action/position, routing only validated Spotify sessions via gateway `transport(action: str, device_id: str, position_ms: int | None)`. Supported actions are pause, resume, next, previous, seek; non-Spotify sources retain the existing Sonos path. Do not add this routing without evidence.

- [ ] Add failing regressions for an externally changed coordinator during launch and manual Follow me handoff while playlist start is pending. Assert no unintended transfer/restart, no double skip, and per-room volume still targets individual members. Test failed start recovery after reconnect without automatically issuing another play.
- [ ] Run focused tests to confirm failures, implement only missing guards/routing established by actual evidence, then rerun those tests. If no transport routing change is needed, keep existing commands and document the verified result.
- [ ] Run `npm test`, `npm run lint`, `npm run build:dashboard`, `python3 -m unittest discover -s home-assistant/tests -v`, and `git diff --check`. Use Node 24 and the repository lockfile (`npm ci` in this worktree if required); do not run the broad formatter as an incidental build step. All applicable checks must pass.
- [ ] In a local preview inspect phone 375×812 and tablet 960×540, then restore viewport settings. Verify no horizontal overflow, word-button width, empty/long/duplicate playlist names, focus/disabled/selected/pending/error states, heart effects at both sizes, reduced motion, and touch targets. Use mocks for failure/loading states without disturbing real playback.
- [ ] Commit with `test: cover Spotify library and speaker control integration`. Record test commands/results and screenshots/paths without credentials. Independent task review must distinguish code verification from still-pending live acceptance.

## Task 7: Live acceptance, independent final review, and atomic release

**Files:** Update `home-assistant/spotify-connect-verification.md`, `README.md` and a dated `docs/canvas-qa/spotify-connect-2026-10-17.md`; use existing `scripts/deploy-canvas.ts` and `scripts/canvas-release.ts` without replacing the atomic release mechanism.

**Interfaces:** Existing `npm run build:canvas-trial`, `npm run deploy:canvas-trial -- RELEASE_ID`, `npm run build:dashboard`, `npm run deploy:dashboard -- RELEASE_ID`, and `npm run rollback:dashboard` are the release operations. Use a unique timestamped release ID at execution time, not a reused hard-coded name.

- [ ] Complete the spec's ten real-device acceptance checks using the trial deployment after backed-up backend installation. Confirm playlist pagination/private library, each speaker's idle cold start, Spotify account/device/context, group cold start, coordinator changes, transport/seek/volumes, Follow me on/off, manual grouping and handoff, and a manual launch during/after a mood. Do not mark audible Sonos playback as proof of Spotify Connect.
- [ ] With the user, verify starting a Jam and adding a track from a second participant before and after a Follow me/manual grouping change. Verify save/remove on a user-selected track in actual Spotify Liked Songs and restore the prior state unless the user wants the changed state. Record any required consent or unavailable participant check honestly and leave the dependent acceptance item pending; continue independent tests/docs.
- [ ] Review a whole-branch diff with a fresh independent reviewer, with the spec, plan, task review results, deferred findings, and test evidence. Resolve actionable findings through the selected subagent review workflow; re-run only checks affected by fixes. No implementation is accepted solely on its author's self-review.
- [ ] Fetch and integrate concurrent `origin/main` changes safely before the production build; repeat affected checks and review if integration changes code. Build/publish the production dashboard atomically only after the feasibility and acceptance gates pass. Verify served HTML/assets match the built release, the production account/library is correct, and heart/Playlists/grouping/Follow me work. If acceptance fails, keep/restore the previous dashboard/configuration, record the precise failed requirement, and do not claim deployment complete.
- [ ] Update README with the configured-account behavior, Playlists versus song-heart semantics, authorization refresh/setup, and targeted rollback. Commit only task-scoped sources/docs; never add runtime tokens, `.env`, caches, or unrelated checkout edits.
- [ ] Fetch `origin` again and verify `origin/main` is an ancestor of the final HEAD. Push with `git push origin HEAD:main` and verify remote HEAD. If a new remote update requires further integration, repeat affected checks and rebuild/republish changed production code before claiming the served and remote versions match. Never force-push, never stop at a local branch, and never ask for another push confirmation already covered by AGENTS.md.

## Plan self-review and execution handoff

Coverage: Task 1 proves compatibility/authorization and original Connect/Jam assumptions; Task 2 supplies exact-account playlist/library operations and current API handling; Task 3 owns bounded playback, topology, idempotency and mood supersession; Task 4 supplies the replacement playlist sheet; Task 5 supplies song save/unsave, track races and animation; Task 6 covers existing UI/control integration and responsive states; Task 7 owns live acceptance, independent final review, deployment/rollback and remote completion. The five Review Focus conditions have named regression owners above.

User participation is required for Spotify consent and hands-on Jam verification. These are implementation milestones, not requests to choose the architecture again. The implementer must record exact version/service compatibility in Task 1 before using those schemas downstream. Keep experimental setup failures separate from verified product claims.

The user has approved the written design and selected subagent-driven execution. Review this implementation plan before starting product code. Preserve that execution choice; after plan review, execute the tasks with fresh implementers and independent task reviews, followed by final whole-branch review. The controller self-reviews this plan itself; do not dispatch an extra planning-review subagent.
