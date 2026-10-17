# Spotify-controlled Sonos playback

Date: 2026-10-17
Status: user-approved design, including save/unsave behavior; implementation planning authorized. The user additionally requested a cute animation for liking/unliking.

## Agreed outcome

One tap on a playlist from Yann's Spotify library starts playback on the selected Sonos speaker/group, even with Spotify closed on the phone. Every dashboard launch uses Yann's Spotify account. Opening Spotify afterward exposes the active session for queue control and starting a Jam. Preserve Follow me, the speaker grouping interface, per-room volumes, current track links, and the dashboard's visual design.

Revision requested by the user: replace Sonos favourites with Spotify saved playlists; replace the playlist-opening heart with a clear word label; reserve a separate heart for saving the currently playing song to Liked Songs. Proposed interpretation for review: saved playlists means playlists owned or followed by Yann, and the song heart is a save/unsave toggle. Liked Songs itself is not an ordinary playlist URI and its playback is outside this revision.

The user selected SpotifyPlus and authorized developing this design. Successful playback must remain a Spotify Connect session. Hearing Spotify tracks from a Sonos local queue does not meet the requirement.

## Evidence and baseline

- Home Assistant reports version 2026.9.3, with HACS, Sonos, and the standard Spotify integration loaded. SpotifyPlus is not loaded.
- The standard Spotify entity is `media_player.spotify_yann_luche_thibodeau`; its observed source list contains only a computer. Home Assistant explicitly documents Sonos as unsupported by the standard Spotify integration.
- SpotifyPlus documents separate Spotify Desktop OAuth authorization for Sonos activation. Without this authorization, its Sonos playback can use a local queue invisible to Spotify. This route is an upstream workaround, not an official guarantee of compatibility.
- A deployed `dashboard_spotify` component provides authenticated catalog search and collection reads. It is not a playback integration. Current main deliberately parks the custom catalog browser on another branch; do not restore that browser as part of this work.
- The fetched baseline was `origin/main` at `f2a91a7`. The original checkout is 274 commits behind and contains unrelated local changes. Design work uses a managed worktree from the fetched main; preserve the original checkout.
- Current frontend boundaries are `CanvasMusicProvider`, `useSpeakerSession`, `useSpeakerFavourites`, `useSpeakerFavouritePlayback`, `useSpeakerRooms`, and `useSpeakerTransport`.
- House Moods has playback ownership and restoration logic. A new manual playback path must explicitly relinquish affected mood playback ownership, including during an in-progress mood activation.

Sources:

- [Home Assistant Spotify limitations](https://www.home-assistant.io/integrations/spotify/#unsupported-devices)
- [SpotifyPlus Sonos limitations](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Spotify-Connect-Brand-Notes#sonos-limitations)
- [SpotifyPlus Desktop authorization](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Device-Configuration-Options#spotify-desktop-player-authentication-configuration)
- [SpotifyPlus services](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Services-Provided)
- [Spotify Jam](https://support.spotify.com/ws/article/jam/)
- [Spotify current user's playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists)
- [Spotify library writes](https://developer.spotify.com/documentation/web-api/reference/save-library-items)
- [Spotify 2026 API migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)

## Chosen approach and alternatives

Use SpotifyPlus for Spotify Connect discovery, activation, and playback, with its documented additional Desktop authorization. Keep Sonos as the authority for speaker topology and local volumes. Use Spotify state to confirm Spotify playback identity.

The standard Spotify integration cannot satisfy Sonos cold starts. Opening a playlist in the Spotify app does not meet the one-tap requirement. Spotcast is an alternative but adds no demonstrated advantage over SpotifyPlus for this setup. A Music Assistant migration would expand the scope beyond the selected solution.

First implementation milestone is a real-device feasibility check, before changing the playlist launcher. Install a compatible, pinned SpotifyPlus release, complete account authorization, and prove cold-start playback, Spotify control, and Jam on one speaker and an existing group. If that fails, stop rollout and report the evidence; do not ship a local-queue substitute or add another integration without revisiting the design.

## User experience

- Replace the heart that opens favourites with a compact text button labelled **Playlists**, opening the existing sheet with the heading **Your Spotify playlists**. Reuse existing theme, tiles, artwork treatment, focus states, and touch targets. Preserve the speaker picker, Follow me control, and transport/volume layout.
- Populate this sheet from Yann's owned/followed Spotify playlists, including private/collaborative playlists when authorization permits. Preserve the API's ordering; do not claim it matches Spotify's app-specific custom ordering or folders. Display playlist title, artwork, and owner where useful for duplicate titles. Use paginated loading, a simple name filter over loaded playlists, clear loading/empty/error states, and an explicit load-more action; never silently truncate the library.
- A tap starts that exact playlist URI on the current speaker group's coordinator. With no explicit speaker preference or active group, retain the current session's Living Room default.
- Place a separate song heart beside the current song metadata, visually distinct from Playlists. Outline means not saved; filled means saved. Accessible labels are **Save [song] to Liked Songs** and **Remove [song] from Liked Songs**, with `aria-pressed` reflecting confirmed state. Unknown/loading state must not imply that the song is unsaved.
- Disable the song heart when no valid Spotify track can be identified, while saved-state lookup/write is pending, or when authorization is unavailable. Paused identified tracks remain saveable. Missing metadata, local files, episodes, ads, and non-Spotify sources must not cause a guessed save. Successful saves add to Yann's Liked Songs without altering playback, queue, groups, or Follow me.
- On a confirmed user-initiated save, animate a small heart pop with a few decorative sparkles over 420 ms. On a confirmed removal, use a soft shrink-and-settle over 240 ms. Keep effects within the control's visual neighborhood, use existing theme colors, and avoid layout movement or blocking interaction. Do not animate initial saved-state loading, failed requests, external Spotify changes, or a response for a track no longer displayed. Under `prefers-reduced-motion: reduce`, update the filled/outline state immediately without either effect. Decorative particles are hidden from accessibility APIs and cannot intercept clicks. Unsupported/cancelled animations and unmounting clean up without changing save behavior.
- Show the existing pending state and prevent repeat starts while a request is running. Coordinate playlist starts with grouping and Follow me transitions.
- Close the chooser only after the requested Spotify context and target are confirmed. An already-playing match is a no-op only when account, target, and context are positively identified.
- Display specific actionable errors for missing authorization, unavailable speaker, unavailable playlist, busy topology transition, or unconfirmed playback. Keep choices available for retry. Library write errors appear by the song heart, preserving the last confirmed state.
- Preserve current song/app links. The user starts and shares the Jam inside Spotify; this change does not create or invite people to a Jam automatically.
- Credentials stay in Home Assistant/integration storage, never dashboard source, build variables, logs, or Git. Spotify's consent/login steps require the user's interaction during setup.

## Backend boundary

Add a small `dashboard_music` Home Assistant component with a response-capable `play_spotify` service and authenticated library read/save operations. It delegates to SpotifyPlus's supported library and playback services and uses its configured OAuth/account. It does not implement Spotify authentication or a separate Spotify client. Keep the deployed catalog-read component separate.

Configuration fixes Yann's SpotifyPlus entity/account and the four existing Sonos entity mappings. Discover/validate installed library/playback service schemas, granted scopes, and account identity during setup. Require private/collaborative playlist read access where supported, plus library read/modify access for the song heart. Pin a version compatible with the actual HA/Python runtime and current Spotify API, and test its token refresh behavior. Do not infer compatibility from a manifest alone. Spotify deprecated the old track save/contains endpoints in favor of `/me/library` and `/me/library/contains`; verify the chosen SpotifyPlus release handles the account's actual API access before promising library writes.

The playback service accepts a validated Spotify playlist URI returned by this account's playlist listing, requested Sonos source entity, and a request ID. Validate membership against a bounded backend cache, with a bounded refresh on a cache miss. It returns a structured confirmed, already-playing, busy, failed, or unconfirmed outcome. It rejects arbitrary device/account selection and URIs outside the supported playlist library. Enforce normal HA service permissions and permission checks on affected speaker/account entities. Library reads require account read permission; song save/unsave requires account control permission.

Processing:

1. Validate configuration, account authorization, playlist URI/library membership, permissions, and speaker availability before issuing playback effects.
2. Take one bounded operation lock for this configured Spotify account. Repeated request IDs return the same in-flight/completed result for a bounded five-minute retention period; a different simultaneous request gets busy instead of queuing stale music selections.
3. Read current Sonos membership and Follow me state. If grouping/follow cleanup is in transition, fail busy. Resolve a requested follower to its actual coordinator; while following, respect the saved Follow me source. Require consistent group reports and revalidate immediately before playback.
4. Resolve the coordinator's Spotify Connect identity using configured Sonos identity plus fresh discovery. Do not depend on a permanently cached group display name or guess among duplicate device names. Fail if the mapping is ambiguous.
5. Explicitly supersede House Mood playback ownership for the affected coordinator before the first playback effect, using a narrowly scoped internal notification/API. Preserve mood lighting ownership. An in-flight mood start/restoration must not overwrite this new manual music. This notification is not a fake media-player command.
6. Activate and start the exact Spotify URI through SpotifyPlus using the fixed account and explicit device. Require the additional Desktop authorization path; do not call Sonos `play_media` as a fallback.
7. Poll bounded fresh playback state and Sonos state to verify account, target, playing state, and requested context. A successful service call or changed song title alone is insufficient. For dynamic/personalized playlists, verify playlist context, not a fixed track or title. If upstream cannot provide enough identity evidence, return unconfirmed.
8. Recheck coordinator identity. If the target changed during the operation, report unconfirmed and do not automatically replay on another speaker. Release the lock and preserve enough bounded operation state to reconcile a retry.

Set a total operation deadline of 30 seconds, with shorter per-call timeouts. An outer timeout is not proof that upstream stopped executing: retain the in-flight guard until delegated work has settled or cancellation is acknowledged. A client disconnect must not cause an automatic replay. On uncertain retry, reconcile fresh playback/account/target/context before issuing another start.

The backend lock serializes playlist launches across clients. Existing grouping clients are not covered by that lock, so topology revalidation is mandatory; the design does not claim a global topology transaction. The initiating dashboard disables conflicting controls during its pending start, and rejects a launch while its grouping/follow operation is pending.

## Spotify library and song saves

Replace the dashboard's Sonos-favourites data source with a paginated listing from Yann's Spotify account. Use returned playlist URIs as stable identity; titles are display labels. Deduplicate by URI, tolerate removed/null entries, and preserve already loaded pages if a subsequent page fails. Respect rate-limit retry intervals and use short-lived account-specific caches. Refresh on sheet reopening when stale and provide manual retry/refresh. Pagination and filtering must not change the playback identity of a selected tile.

No migration of opaque Sonos favourite IDs, manual playlist mapping, title search, or playlist-track expansion is needed. Do not require permission to read every track in a followed playlist before starting its context: Spotify's development-mode restrictions can prevent reading items while context playback may still be possible. A playlist missing from this account's library must be refreshed/rejected rather than substituted. House Mood's existing Sonos favourites remain separate and unchanged.

For the song heart, derive an exact track URI from the current coordinator's Spotify track metadata using the existing URI parser and fresh session evidence. Bind saved-state reads and writes to account plus track URI, not a component's current title. Capture the URI when tapped: a natural track change during the request must not save the next track or apply the old response to its heart. Cancel/invalidate stale lookups; serialize writes for each track and send explicit desired saved state, never a blind server-side toggle.

Show saved state only after a successful lookup. After a write, re-read to reconcile the confirmed state; on uncertain completion, show a retryable message and reconcile before another write. Reflect changes made in Spotify through a bounded refresh on track change, app focus/reconnection, and stale state. Do not poll aggressively or keep an indefinite stale saved-state cache. Saving a song neither acquires playback ownership nor interrupts grouping; its pending guard is separate from playlist playback.

## Follow me, grouping, and existing playback controls

- Sonos remains responsible for joining/unjoining rooms. Spotify playback targets only the coordinator once.
- Playlist selection preserves the current group, volume, Follow me enabled state, and saved source. Follow me motion joins continue to use the same automation/script.
- Manual grouping retains its existing transition from Follow me to manual mode. Refresh Spotify target discovery before the next playlist launch after any group/coordinator change.
- Adding/removing followers must preserve the Spotify session and Jam. Do not restart or transfer playback merely to refresh topology.
- Keep existing Sonos transport commands initially, but prove pause/resume, next/previous, and seek preserve Spotify control and Jam. If a command demonstrably breaks the session, route that Spotify-session transport command through SpotifyPlus with the same explicit account/target guards. Keep transport for other sources working.
- House Mood presets continue their current playback behavior in this scope. Manual Spotify launches must safely override mood-owned playback; End mood must not stop that manual session. Converting every mood preset to Spotify Connect is a separate product change.

## Verification and rollout

Automated tests cover fixed-account enforcement, playlist pagination/membership, duplicate titles and URIs, private playlists, API rate limits, unavailable/ambiguous targets, coordinator changes, duplicate requests, concurrent clients, timeouts with late completion, reconnects, already-playing context, auth failure, and rejection of local-queue/unrelated-track confirmation. Cover heart saved/unsaved/unknown/error states, explicit save/unsave, permission failure, missing/invalid tracks, track changes during lookup/write, external Spotify changes, and stale responses after disconnection. Add focused frontend tests for pending/error behavior and shared guards with grouping/Follow me. Add a House Mood regression proving manual Spotify supersession survives End mood and an in-progress mood activation.

Real-device acceptance must demonstrate:

1. With Spotify closed on the phone and Sonos idle long enough to require rediscovery, one tap starts the selected playlist on the intended speaker.
2. Opening Spotify on Yann's account shows that speaker/session; queue changes and transport control work.
3. A Jam can be started and a second participant can add a track. This needs user-visible Spotify verification; audio alone is insufficient evidence.
4. The same cold-start flow works for an existing Sonos group and after changing the coordinator.
5. Follow me joins each mapped room without restarting music or losing the Spotify/Jam session. Turning it off retains playback on the original source.
6. Manual grouping, ungrouping, per-room volume, and manual-mode handoff keep their existing behavior and preserve the Spotify/Jam session.
7. Auth expiration/refresh, HA restart, disconnection, and a failed launch leave understandable recoverable state without an automatic local-queue fallback.
8. Starting a library playlist during a mood relinquishes only relevant ownership; ending the mood cannot stop the manually started music.
9. The playlist sheet shows Yann's real saved library across pages, with working private playlist access and exact-URI playback. Sonos favourites no longer populate this dashboard list.
10. Saving the current song appears in Yann's Spotify Liked Songs, and removing it clears that saved state. Spotify-side changes reconcile in the dashboard. A track change during a heart request cannot affect a different track; saving/removing does not interrupt playback, Jam, Follow me, or grouping.

Inspect phone/tablet preview states, focus, disabled and pending controls with existing theme tokens. Run the repository's relevant frontend/backend tests, lint, and build once implementation is complete; use independent implementation reviews as the user's standing preference requires.

Back up affected HA configuration/integration files before installation. Keep a record of the prior dashboard release and integration settings. Deploy only after the feasibility milestone passes; verify production assets and actual playback. If acceptance fails, restore the previous dashboard path/configuration and clearly report which requirements remain unproven. Do not uninstall an existing integration or discard other changes as part of rollback.

Fetch again before final integration. Work from current main, preserve unrelated checkouts, commit only scoped changes, and push verified work directly to `origin/main` without force-pushing or opening a PR.

## Review and next stage

Review this written specification before creating the implementation plan. Then use the writing-plans skill and the user's already-selected subagent-driven execution with independent reviews. No need to ask the user to select an execution method again. Account authorization and hands-on Jam acceptance remain explicit user participation points, not reasons to leave independently executable work incomplete.
