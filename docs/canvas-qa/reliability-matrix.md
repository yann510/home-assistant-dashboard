# Dashboard reliability regression matrix

Run the component and service tests with `VITE_FOLDER_NAME=dashboard npm test`. Run `npx playwright install chromium` once, then `npm run test:browser` to exercise the Canvas dashboard with simulated Home Assistant responses.

The browser suite uses the measured Fire HD 10 landscape viewport of 1224×614 CSS pixels, device pixel ratio 1.5, and visual scale 1. It also runs at 960×540 and 393×852. The browser suite uses touch-capable Chromium contexts and the full dashboard around the control under test.

## Cases added in this pass

| Surface | Scenario | Expected result | Coverage |
| --- | --- | --- | --- |
| Song heart | Native Sonos queue reports an exact Spotify track ID with no source label, including playing and paused | Read the current track's saved state. Filled is saved. Remove and save update the same track and preserve playback. | `useSpotifyCurrentTrack.test.tsx`, `CanvasMusic.test.tsx`, `recovery.browser.ts` |
| Song heart | Idle, malformed, or explicitly non-Spotify metadata | Leave the heart unavailable. Send no saved-state write. | `useSpotifyCurrentTrack.test.tsx` |
| Song heart | Save fails and the user retries | Read the current saved state and re-enable the heart. A retry sends no duplicate write. | `useSpotifyTrackSaved.test.tsx`, `recovery.browser.ts` |
| Speakers | Selected speaker or its coordinator becomes unavailable | Use an available independent source when possible. Keep controls scoped to its active coordinator. | `CanvasMusic.test.tsx` |
| Follow me | Saved source goes offline or refers to a stale speaker ID | Offer the manual handoff or cleanup retry, then reopen room controls after confirmation. | `CanvasMusic.test.tsx` |
| Room grouping | Connection interrupts a pending update | Clear pending feedback, report the interruption, and let the user reload current rooms. | `CanvasMusic.test.tsx`, `useSpeakerRooms.recovery.test.tsx` |
| Spotify playlist library | First request times out or a pending page is canceled on close | Retry or reopen the list. Keep cached choices when available, and discard late replies. | `useSpotifyPlaylists.test.tsx` |
| Spotify playlist launch | Coordinator changes during a pending launch | Keep the picker open with actionable uncertainty and ignore the old confirmation. | `CanvasMusic.test.tsx` |
| House Mood | A command loses its reply or returns no usable confirmation | Check status over the authenticated connection without replaying a write. Reopen controls only for a fresh terminal status. Keep the status check available on busy state or timeout. | `useHouseMood.test.tsx`, `recovery.browser.ts` |
| House Mood | Subscription updates race with a status check or the socket reconnects | Keep the newer status, discard the old reply, and retain the write lock only while the outcome is uncertain. | `useHouseMood.test.tsx`, `CanvasSecondary.test.tsx` |
| Layout | Music command errors stack, track metadata is missing or long, or mood status is uncertain | Keep Music controls and neighboring cards in place. Keep the latest error visible. | `layout.browser.ts` |
| Layout | Playlist launch pending or failed, empty filter result, and concurrent library failure | Keep the filter, dialog controls, and choice position stable. Preserve a full-size Retry target. | `layout.browser.ts` |
| Layout | Light and blind commands fail, or the Stop target differs from the current selection | Keep the primary controls in both cards in place. Preserve room-specific errors, Stop options, and retry. | `blinds.browser.ts` |
| Spotify gateway | A provider save fails after the caller has timed out | Keep the provider operation tracked to settlement, consume the late error, and require fresh readback. | Existing `test_dashboard_music_gateway.py` regression, reproduced and fixed on Python 3.14 |

## Coverage already in the suite

| Surface | Existing scenarios |
| --- | --- |
| Song heart and playlists | Duplicate taps, wrong or late identities, reconnect, external saved-state refresh, pagination errors and rate limits, Liked Songs launch and confirmation |
| Day and Night | Rejected commands, disconnect or timeout, fresh helper readback, and recovery requiring user action |
| Lights and blinds | Rejected commands, partial success, absent acknowledgement or observation, reconnect, and reporting the exact failed target |
| Roomba | Targeted room commands, acknowledgement timeout, disconnect, paused resume, and retained room selection |
| Weather and House Pulse | Subscription retry, disconnect and reopen, stale events, and device health recovering |

Live checks use authenticated read-only access to verify current track identity, saved state, and the published dashboard. Save/remove and command failure tests run in the local preview. Physical touch behavior and device movement require household hardware.
