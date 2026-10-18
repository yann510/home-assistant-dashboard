# Task 4 implementation report

Implemented the fixed-account Spotify library and playlist start UI in the managed worktree. No worker performed network/house effects, browser automation, deployment, push, or secret/.env inspection. Root retains ownership of device/UI acceptance and remote integration.

## Behavior delivered

- Replaced the browsing heart with a theme-token Playlists text button, 44px minimum height, alongside the existing transport and volume controls. The title row reserves a separate, noninteractive 44px song-heart slot for Task 5.
- The route heading is Your Spotify playlists. The sheet retains Spotify app/web links and the gallery artwork transition and fallbacks. Playlist owners are visible and included in accessible button names. URI keys distinguish identically named playlists.
- Authenticated `dashboard_music/playlists` loads one page of 50 at a time, deduplicates exact URIs, keeps earlier choices on page failure, and offers Load more, Refresh and failed-page retry. Filter loaded playlists searches only the choices already retrieved. Cached choices reopen immediately; data at least 60 seconds old refreshes on reopening. Disconnect/reconnect and canceled read generations cannot publish late data. Library browsing is independent of speaker availability.
- Playlist starts send exactly one authenticated HA `call_service` intent with `return_response: true`; the hook unwraps `result.response`. Confirmed/already_playing require matching request ID, exact URI and source before returning success. Backend busy/failed/unconfirmed, invalid envelopes, transport failures and the 35-second deadline preserve the sheet with uncertainty/error feedback, with no automatic retry.
- HTTP-safe request IDs use randomUUID when available and a timestamp/counter/random fallback when unavailable. A single attempt owns its ID and pending lock. Source changes, disconnect and unmount abort waiting; dismissed/reopened sheets cannot close from an old component's completion.
- Synchronous provider guards block starts during grouping, Follow transitions and transport commands, and disable conflicting transport/seek/volume/group/Follow controls during a start. A retained old-source callback cannot restore the previous preferred source. Confirmed status announcements are visually hidden on the overview to preserve card geometry.
- Removed CanvasFavourites after its final import was replaced. Retained the older generic Sonos hook modules and existing tests to avoid unrelated removals. No new library path invokes Sonos browse_media.

## TDD and self-review evidence

1. Wrote the new library/playback hook tests and new playlist UI regression first. The initial no-module run failed to resolve the absent hook imports. Added interface-only no-op stubs, then reran the required focused command: 18 behavior failures and 122 passing existing tests. Failures demonstrated missing authenticated paging/confirmation/cancellation/status and the missing Playlists entry point; this was the behavior RED run, not a passing import-only test.
2. Implemented hooks; their tests passed. Implemented provider, sheet, theme and preview wiring, then adapted only old favourites-specific assertions to the new Spotify contract. Preserved the existing speaker/mood/Follow/group/volume/seek cases.
3. A source-change layout-effect state reset temporarily erased Rooms updated feedback in three existing handoff tests. Replaced it with conditional render-time state reset, consistent with the previous hook, restoring those tests without weakening assertions.
4. Wrote and ran preview contract tests against an empty handler: 7 expected failures. The actual local handler then passed paging/URI/owner/empty/rate-limit and service response envelope cases.
5. Self-review added a failing retained-callback regression (Gym reverted to Living Room). The provider now checks latest source/blocked state before changing preferred source; regression passes.
6. Self-review added a failing canceled-read regression (Load more/Refresh spinner stuck after reopening). Conditional state reset on the library-enabled transition releases those flags; regression passes.
7. Strengthened the HTTP fallback coverage to require a `dashboard-` fallback ID. That assertion exposed that the original Vitest spy still called native randomUUID. Replaced the test setup with an explicitly absent crypto.randomUUID; the test now proves the actual HTTP fallback, along with synchronous click deduplication and response confirmation.
8. Full-suite first pass exposed three old CanvasIntegration assertions using Favourites/browse_media. Updated those intended contract changes. Build initially flagged test Array.at against the ES2020 target; used an indexed last-call lookup. Lint initially flagged a test probe's render-time external assignment and a direct state reset in a library effect; moved the probe capture to an effect and used the supported conditional prop-change reset pattern. All are included in the final reruns below.

## Verification

- `VITE_FOLDER_NAME=dashboard npm test -- src/useSpotifyPlaylists.test.tsx src/useSpotifyPlaylistPlayback.test.tsx src/canvas/CanvasMusic.test.tsx`: PASS, 3 files / 145 tests, exit 0.
- `VITE_FOLDER_NAME=dashboard npm test`: PASS, 44 files / 729 tests, exit 0 (16.39s). Includes all new preview tests and existing speaker/mood/light regressions.
- `npm run lint`: PASS, exit 0, no warnings/errors.
- `npm run build:dashboard`: PASS, exit 0, TypeScript + dashboard Vite build. Vite reports its existing >500kB chunk warning and plugin-timing advisory; no compilation failures.
- `git diff --check`: PASS, exit 0.

No test failures remain unresolved. Final logs are local `/tmp/task4-final-{required,all,lint,build}.log`; these contain no service payloads or credentials.

## Isolated preview QA entry points

Existing root-owned server remains `http://127.0.0.1:8797/dev/canvas-preview/index.html?scene=everyday`.

- `playlists=paged`: 50-item page plus second page with a deliberate boundary URI duplicate.
- `playlists=empty`, `playlists=rate-limited`, `playlists=more-error`, `playlists=unavailable`.
- `long=1`, `brokenArt=1`: long playlist label and broken artwork; default fixtures also include a private playlist without artwork and identical labels with different owners.
- `spotifyPlay=confirmed|already_playing|busy|failed|unconfirmed` and optional `spotifyDelay=5000` (up to 60000ms, useful for the 35-second deadline).
- Every handler is local-only. Successful mock starts change source track metadata and preserve group, volume and Follow helpers. Main preview seeds an exact Spotify track URI/source for Task 5.

Root reported its initial 1224x614 CSS px, visual scale 1 preview pass (desktop emulator DPR1 separately from measured Fire DPR1.5): no horizontal overflow, Playlists 73.95x44, search/Refresh 44px, close 45px, readable owners, surrounding dashboard preserved. Root screenshot: `backups.local/spotify-connect-qa/task4-sheet-1224x614.jpg`. This worker has not independently inspected that screenshot and makes no physical Fire acceptance claim.

## Remaining ownership / limitations

- Independent review follows this implementation commit.
- Root owns final UI states/paging/error/phone acceptance, backend integration/deployment, fetch/merge and push to origin/main. No worker deployment/push is implied by the local commit.
- Song save state and animation remain Task 5; its slot intentionally has no misleading temporary heart control.


## Post-review QA fix round 1 (base c369cc5)

Root's browser QA found the original playback pending/error paragraphs after the gallery, outside the visible tablet scrollport (unconfirmed alert y939 on the 614px-high Fire viewport). Moved the same existing feedback into one named Playlist playback region before the filter/gallery, pinned with `position: sticky; top: 0` within the existing dialog body. Its opaque background, borders, padding and 12px corners reuse current theme tokens and feedback styling. No playback request, retry, hooks, fixture or song-heart behavior changed; no overview card dimensions changed. Preserved all Task 5 heart changes.

Regression tests: `pins pending and uncertain playback feedback ahead of the gallery for its first loaded choice` and `... last loaded choice`. They load both pages (56 choices), select the first/final playlist, verify pending feedback lives in the named region before the gallery, apply the actual stylesheet to verify sticky/top/layering, keep the user's simulated scroll position through pending→unconfirmed, retain the sheet and assert exactly one service intent. The initial RED run failed both cases because the pinned region was absent. After implementation and test stylesheet setup, both cases pass. Vitest stubs CSS imports even with raw/inline queries, so these tests read the stylesheet from disk and include the installed Node types for that test file; this also fixed the intermediate test-only TS2591 import error. No production configuration changes were needed.

Focused final verification (no full-suite repetition):

- `VITE_FOLDER_NAME=dashboard npm test -- src/canvas/CanvasMusic.test.tsx src/canvas/CanvasIntegration.test.tsx src/useSpotifyPlaylistPlayback.test.tsx src/useSpotifyPlaylists.test.tsx src/canvas/CanvasTrackHeart.test.tsx`: PASS, 5 files / 179 tests, exit 0.
- `npx eslint src/canvas/CanvasPlaylists.tsx src/canvas/CanvasMusic.test.tsx`: PASS, exit 0, no output.
- `npx tsc -b`: PASS, exit 0, no output.
- `git diff --check`: PASS, exit 0.

Self-review: feedback remains inside the existing gallery section whose height spans all loaded pages, so its sticky boundary includes the final row; it has an opaque theme surface and a higher stacking layer than the gallery. No forced scrolling/focus changes, extra network intent, replay or retry was added. Empty feedback creates no extra sheet row. Existing live-region roles remain on the actual pending/error text. The worker used mock-only tests; jsdom can validate DOM placement and style cascade but cannot establish viewport visibility or actual browser scroll geometry.

Root separately reported browser geometry/screenshot checks passed: at 1224x614, first-row pending/unconfirmed and final-item pending are visible at x206.5,y105.2,w800,h44. At 375x812, first-row pending is visible at x20,y141.2,w324,h44; final-item pending at x20,y85.2,w324,h44 and unconfirmed at x20,y85.2,w324,h62. Root reported no horizontal overflow. Those are root-owned browser acceptance observations, not independent worker/physical Fire claims. Scoped independent review and root's final integrated checks follow. No worker browser/auth/house/deploy/push actions occurred.
