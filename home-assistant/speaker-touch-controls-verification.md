# Speaker touch controls — September 7, 2026

The local dashboard now uses the approved artwork-background design. The cover fills the player area, with a dark gradient behind the metadata and compact controls. Buttons retain 44 px touch targets and 36 px faces. A speaker icon and volume percentage open a floating panel with a full-width slider, ±2 percentage-point buttons, and mute. The normal card has a thin, read-only progress line; seeking is available through the explicit details button. Follow me remains a separate footer.

## Interaction and command changes

- Playback and seeking target the group's coordinator once. Sonos followers forward transport commands to the coordinator, so sending the same skip to every member can repeat it.
- Volume and mute target the current group's members. The details dialog exposes separate room volume and mute controls.
- Dragging keeps a local value and sends the final value on release. Repeated volume taps are serialized, with intermediate queued values coalesced. Delayed device updates cannot overwrite a drag.
- Native range controls support keyboard and assistive input. Cancelled touch gestures send no volume change.
- Only the expand button opens details. The native dialog remains inside the viewport after scrolling, handles focus and Escape, and has a labelled close button. The volume popover stays open throughout dragging, supports explicit close and tap-away dismissal, and keeps pending command errors visible even if dismissed. Its position follows scrolling and resizing without increasing the card height.
- The authenticated Home Assistant socket is awaited directly because the previous component's service helper swallowed command rejections. Errors and timeouts are now visible on the card. Unsupported or disconnected controls are disabled.
- An unavailable saved Follow me source stays selected instead of switching controls to another room.

## Verification

- All 55 tests across six files pass, including 34 tests using the actual playback/volume components and 15 Follow me tests.
- TypeScript, ESLint, production build, and whitespace checks pass. Vite retains the large-bundle warning from the existing dependency bundle.
- Browser viewport checks at 320, 390, and 768 px verify the artwork layout and volume popup. The sample playing card measures about 303 px tall at 390 px viewport width and 309 px at 320 px. At 320 px, the popup is 278 px wide with a 152 × 44 px range, remains within the viewport, and adds no height to the card. These checks use the real components with sample media, not physical phones or tablets.
- Live Living Room checks confirmed volume up/down, a direct range tap (Home Assistant reported 50%), and mute/unmute. Its original 34% volume and unmuted state were restored.
- The existing Follow me shutdown was stuck at its Sonos unjoin action from 16:57 local time. All four rooms were confirmed separate and Follow me was already off. Its trace and state were saved to `backups.local/speaker-stalled-shutdown-2026-09-07.json`; the stalled script was stopped, then the card's Retry ungrouping action completed cleanup. No automation configuration was changed.

## Remaining live check

Home Assistant logged real pause communication timeouts involving Living Room and its Gym follower earlier in the session. Living Room subsequently returned online but reported idle with no current track. A Play request did not produce a playing state. Actual pause/resume, skipping, and seeking with active media therefore remain unverified; their command routing and failure behavior are covered by automated tests. Audible output cannot be inferred from Home Assistant's group state alone.

The redesigned dashboard is implemented locally and has not been deployed to Home Assistant.

## Manual room picker and balanced group volume (September 7, 2026)

The room name now opens Play in: a bottom sheet at phone widths and a centered dialog on tablets. The current source remains selected. Other room selections are staged until Apply; connected, selected rooms expose immediate individual volume and mute controls. All rooms and Only source shortcuts are included. The list scrolls independently of the header and Apply footer.

Manual grouping sends only membership differences through media_player.join/unjoin, names failing rooms, and waits for reported group membership before showing success. It blocks stale initial selections if the group changed elsewhere. Switching from Follow me turns its helper off, waits for an already-running script to finish, then clears the saved source; this intentionally avoids the existing disable script's ungrouping behavior. No Home Assistant configuration was deployed for this change.

Group volume snapshots room levels at the beginning of a gesture or burst of adjustments, applies a common percentage-point change, and clamps each room to 0–100. The displayed group level follows the source speaker. Reported echoes do not rewrite the captured balance mid-gesture. The group is shown as muted only if every member is muted.

Verification: 67 tests across 6 files passed, ESLint passed, production build passed (existing bundle-size warning remains), and git diff --check passed. Coverage includes delayed volume echoes, independent volume caps, mixed mute states, staged selection, individual volume targeting, membership confirmation and timeout, named failures, stale groups, dismissal, and switching from Follow me without unjoining.

The browser sample was checked at 390×844, 320×568, and 768×1024. Confirmed adding and removing rooms, scrolling to lower speakers with Apply fixed, and group volume changing a 40% / 20% pair to 42% / 22%. The sample simulates service calls; actual hardware grouping has not been exercised in this change. The updated dashboard is local and has not been deployed.

## Deployment — September 7, 2026, 19:37 EDT

Deployed the production dashboard to http://homeassistant.local:8123/local/dashboard/ after 67 tests, lint, build, and git diff --check passed. Uploaded to a separate staging directory and verified all 68 files by SHA-256 before switching directories. Verified the served index and both referenced entry assets match the local build over HTTP. The three existing Follow me helpers/script endpoints are available.

Previous release: /homeassistant/dashboard-backups/dashboard-2026-09-07T23-37-07-573Z. Local backup and deployment manifest: backups.local/deployment-2026-09-07T23-37-07-573Z/. No Home Assistant configuration or music playback was changed as part of deployment. The in-app browser blocked the live URL with ERR_BLOCKED_BY_CLIENT, so a final live visual check was unavailable; HTTP artifact verification succeeded.

## Expand removal and seek popup — September 7, 2026, 23:25 EDT

Removed the expand button and duplicate details panel. The progress bar now opens a native seek popover styled like group volume, with a full-size range touch target, close button, Escape/light-dismiss, focus restoration, and visible late command errors after dismissal. Unsupported tracks remain passive. Room controls remain in Play in.

69 tests, lint, production build, and git diff --check passed. Browser sample verified at 390×844 and 320×568: seek changed 74s to 116s and Escape/close returned focus to progress. Deployed 68 SHA-256-verified files and checked served index/entry assets. Previous version: /homeassistant/dashboard-backups/dashboard-2026-09-08T03-25-08-058Z. Actual music was not controlled during this update.

## Direct seeking — September 8, 2026

Replaced the seek popover with a directly tappable/draggable native range. Its line stays 2px tall inside a 44px interaction area; the thumb appears during dragging or keyboard focus. Pointer interactions preview locally and seek once on release. Vertical movement, pointer cancellation, loss of capture, blur, and Escape cancel an active gesture. CSS allows native vertical panning and pinch zoom. Keyboard/assistive range changes remain supported. Unsupported tracks show passive progress.

71 tests, lint, build, and git diff --check passed. Browser sample confirmed tapping to 56 seconds, dragging to 162 seconds, and a vertical drag preserving 162 seconds without a seek. Actual touchscreen scrolling has not been tested on physical hardware; vertical cancellation is covered by tests and browser mouse gestures. Sample visually checked at phone widths. No actual music playback was changed during verification.

## Sonos favourites idle card — September 8, 2026

Implemented the approved responsive grid of up to twelve Sonos favourites while idle, including nested non-playable favourite folders. Playing and paused cards keep the artwork and provide a favourites sheet beside volume; paused transport is labelled Resume. Idle state suppresses stale artwork/metadata and transport. Library empty/error states provide an app hint or retry. Selection targets only the coordinator with the browser-provided content type/id, prevents duplicate starts, and waits for a playback state/content change before closing; after 20 seconds without confirmation it reports uncertainty and permits another selection. Grouping and volume are untouched by the selection command; existing Follow me automation still governs groups if enabled.

Verification: 79 tests pass, lint and production build pass, git diff --check passes. Added coverage for nested lists, twelve-item limit, sheet access during playback, coordinator-only explicit selection, empty/error/retry handling, duplicate start protection, volume-only changes not confirming playback, timeout recovery, and idle-to-playing transitions. Browser preview checked a 390px card, idle grid, starting a sample favourite, switching through the sheet, paused Resume, and dialog focus restoration. Preview uses sample artwork and mocked commands. No real speaker playback was started; actual audible playback from these favourites remains unverified. A live library read earlier in the conversation confirmed seven playable favourites with artwork.

## White-screen startup fix — September 8, 2026

Reproduced the blank dashboard using the production build against real Home Assistant in a local browser. Uncaught error: Entity not found - light.desk_led_strip. LightCard used the default throwing useEntity lookup; a missing configured light aborted the entire React tree. Changed it to returnNullIfNotFound and a disabled existing-style ButtonCard without an entity, labelled Desk Strip · Unavailable. The same component recovers when the entity returns. The new test failed before the fix (1 failed, 2 passed) and passes afterward; full suite 80 passed, lint/build passed. Full production dashboard then rendered Home mode, Lights, Blinds, Roomba, Weather and Speakers with zero browser console errors. This is stronger coverage than the isolated speaker preview used for the preceding release. No speaker or light command was sent during verification.

## Empty paused Spotify session — September 8, 2026

Paused speakers without a nonblank media title or playlist now use Ready to play and the favourites grid. A content id alone (including retained x-sonos-vli Spotify sessions) is not treated as identifiable media. Playing/buffering remains active regardless of metadata; paused titled tracks retain Resume even without artwork. Seek is hidden in the idle presentation. Regression test reproduced the old empty paused player before the fix; full suite now 82 passing, lint/build/diff checks pass. The local production build connected to real Home Assistant showed Ready to play and all seven favourites, with zero browser console errors. No playback command was sent.
