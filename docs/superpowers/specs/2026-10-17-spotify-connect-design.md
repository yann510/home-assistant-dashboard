# Spotify-controlled Sonos playback

Date: 2026-10-17
Status: proposed design for user review; implementation has not started.

## Agreed outcome

One tap on a dashboard favourite starts playback on the selected Sonos speaker/group, even with Spotify closed on the phone. Every dashboard launch uses Yann's Spotify account. Opening Spotify afterward exposes the active session for queue control and starting a Jam. Preserve Follow me, the speaker grouping interface, per-room volumes, current track links, and the dashboard's visual design.

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

## Chosen approach and alternatives

Use SpotifyPlus for Spotify Connect discovery, activation, and playback, with its documented additional Desktop authorization. Keep Sonos as the authority for speaker topology and local volumes. Use Spotify state to confirm Spotify playback identity.

The standard Spotify integration cannot satisfy Sonos cold starts. Opening a playlist in the Spotify app does not meet the one-tap requirement. Spotcast is an alternative but adds no demonstrated advantage over SpotifyPlus for this setup. A Music Assistant migration would expand the scope beyond the selected solution.

First implementation milestone is a real-device feasibility check, before changing the playlist launcher. Install a compatible, pinned SpotifyPlus release, complete account authorization, and prove cold-start playback, Spotify control, and Jam on one speaker and an existing group. If that fails, stop rollout and report the evidence; do not ship a local-queue substitute or add another integration without revisiting the design.

## User experience

- Keep the existing heart/favourites sheet, tile appearance, ordering, thumbnails, speaker picker, Follow me control, and transport/volume layout.
- Migrate the existing Spotify favourites using exact Spotify identifiers. Do not replace the list with the account's entire Spotify library.
- A tap starts the favourite on the current speaker group's coordinator. With no explicit speaker preference or active group, retain the current session's Living Room default.
- Show the existing pending state and prevent repeat starts while a request is running. Coordinate playlist starts with grouping and Follow me transitions.
- Close the chooser only after the requested Spotify context and target are confirmed. An already-playing match is a no-op only when account, target, and context are positively identified.
- Display specific actionable errors for missing authorization, unavailable speaker, unresolved favourite, busy topology transition, or unconfirmed playback. Keep choices available for retry.
- Preserve current song/app links. The user starts and shares the Jam inside Spotify; this change does not create or invite people to a Jam automatically.
- Credentials stay in Home Assistant/integration storage, never dashboard source, build variables, logs, or Git. Spotify's consent/login steps require the user's interaction during setup.

## Backend boundary

Add a small `dashboard_music` Home Assistant component with a response-capable `play_spotify` service. It delegates playback to SpotifyPlus; it does not implement Spotify authentication or a separate Spotify client. Keep the deployed catalog-read component separate.

Configuration fixes Yann's SpotifyPlus entity/account, the four existing Sonos entity mappings, and the curated favourite-to-Spotify-URI mappings. Discover/validate the installed service schemas and account identity during setup. Pin a version compatible with the actual HA/Python runtime and test its token refresh behavior. Do not infer compatibility from a manifest alone.

The service accepts an allowlisted favourite key, requested Sonos source entity, and a request ID. It returns a structured confirmed, already-playing, busy, failed, or unconfirmed outcome. It rejects arbitrary device/account selection. Enforce normal HA service permissions and permission checks on the affected speaker/account entities.

Processing:

1. Validate configuration, account authorization, favourite URI, permissions, and speaker availability before issuing playback effects.
2. Take one bounded operation lock for this configured Spotify account. Repeated request IDs return the same in-flight/completed result for a bounded five-minute retention period; a different simultaneous request gets busy instead of queuing stale music selections.
3. Read current Sonos membership and Follow me state. If grouping/follow cleanup is in transition, fail busy. Resolve a requested follower to its actual coordinator; while following, respect the saved Follow me source. Require consistent group reports and revalidate immediately before playback.
4. Resolve the coordinator's Spotify Connect identity using configured Sonos identity plus fresh discovery. Do not depend on a permanently cached group display name or guess among duplicate device names. Fail if the mapping is ambiguous.
5. Explicitly supersede House Mood playback ownership for the affected coordinator before the first playback effect, using a narrowly scoped internal notification/API. Preserve mood lighting ownership. An in-flight mood start/restoration must not overwrite this new manual music. This notification is not a fake media-player command.
6. Activate and start the exact Spotify URI through SpotifyPlus using the fixed account and explicit device. Require the additional Desktop authorization path; do not call Sonos `play_media` as a fallback.
7. Poll bounded fresh playback state and Sonos state to verify account, target, playing state, and requested context. A successful service call or changed song title alone is insufficient. For dynamic/personalized playlists, verify playlist context, not a fixed track or title. If upstream cannot provide enough identity evidence, return unconfirmed.
8. Recheck coordinator identity. If the target changed during the operation, report unconfirmed and do not automatically replay on another speaker. Release the lock and preserve enough bounded operation state to reconcile a retry.

Set a total operation deadline of 30 seconds, with shorter per-call timeouts. An outer timeout is not proof that upstream stopped executing: retain the in-flight guard until delegated work has settled or cancellation is acknowledged. A client disconnect must not cause an automatic replay. On uncertain retry, reconcile fresh playback/account/target/context before issuing another start.

The backend lock serializes playlist launches across clients. Existing grouping clients are not covered by that lock, so topology revalidation is mandatory; the design does not claim a global topology transaction. The initiating dashboard disables conflicting controls during its pending start, and rejects a launch while its grouping/follow operation is pending.

## Favourite identity migration

Sonos `favorite_item_id` values are opaque and cannot be sent to Spotify. Read the existing favourites and resolve their underlying Spotify URIs through available read-only metadata. Store exact mappings keyed by the favourite identity; titles are labels, never the sole playback identifier.

If underlying metadata cannot identify a favourite unambiguously, obtain and verify its exact Spotify share URI during setup. No fuzzy search, title substitution, or guessed playlist IDs. Validate mappings against the current favourite ID and available metadata; report a changed/missing favourite explicitly. Unsupported radio/service favourites remain visible with an explanation and cannot silently start a Sonos queue.

Support the valid Spotify media types actually found in the curated list. The initial requirement is playlists; do not silently convert an unsupported artist/radio context into a playlist. Preserve the existing browser traversal bounds and error/retry behavior.

## Follow me, grouping, and existing playback controls

- Sonos remains responsible for joining/unjoining rooms. Spotify playback targets only the coordinator once.
- Playlist selection preserves the current group, volume, Follow me enabled state, and saved source. Follow me motion joins continue to use the same automation/script.
- Manual grouping retains its existing transition from Follow me to manual mode. Refresh Spotify target discovery before the next playlist launch after any group/coordinator change.
- Adding/removing followers must preserve the Spotify session and Jam. Do not restart or transfer playback merely to refresh topology.
- Keep existing Sonos transport commands initially, but prove pause/resume, next/previous, and seek preserve Spotify control and Jam. If a command demonstrably breaks the session, route that Spotify-session transport command through SpotifyPlus with the same explicit account/target guards. Keep transport for other sources working.
- House Mood presets continue their current playback behavior in this scope. Manual Spotify launches must safely override mood-owned playback; End mood must not stop that manual session. Converting every mood preset to Spotify Connect is a separate product change.

## Verification and rollout

Automated tests cover fixed-account enforcement, URI/favourite resolution, unavailable/ambiguous targets, coordinator changes, duplicate requests, concurrent clients, timeouts with late completion, reconnects, already-playing context, auth failure, and rejection of local-queue/unrelated-track confirmation. Add focused frontend tests for existing pending/error behavior and shared guards with grouping/Follow me. Add a House Mood regression proving manual Spotify supersession survives End mood and an in-progress mood activation.

Real-device acceptance must demonstrate:

1. With Spotify closed on the phone and Sonos idle long enough to require rediscovery, one tap starts the selected playlist on the intended speaker.
2. Opening Spotify on Yann's account shows that speaker/session; queue changes and transport control work.
3. A Jam can be started and a second participant can add a track. This needs user-visible Spotify verification; audio alone is insufficient evidence.
4. The same cold-start flow works for an existing Sonos group and after changing the coordinator.
5. Follow me joins each mapped room without restarting music or losing the Spotify/Jam session. Turning it off retains playback on the original source.
6. Manual grouping, ungrouping, per-room volume, and manual-mode handoff keep their existing behavior and preserve the Spotify/Jam session.
7. Auth expiration/refresh, HA restart, disconnection, and a failed launch leave understandable recoverable state without an automatic local-queue fallback.
8. Starting a favourite during a mood relinquishes only relevant ownership; ending the mood cannot stop the manually started music.

Inspect phone/tablet preview states, focus, disabled and pending controls with existing theme tokens. Run the repository's relevant frontend/backend tests, lint, and build once implementation is complete; use independent implementation reviews as the user's standing preference requires.

Back up affected HA configuration/integration files before installation. Keep a record of the prior dashboard release and integration settings. Deploy only after the feasibility milestone passes; verify production assets and actual playback. If acceptance fails, restore the previous dashboard path/configuration and clearly report which requirements remain unproven. Do not uninstall an existing integration or discard other changes as part of rollback.

Fetch again before final integration. Work from current main, preserve unrelated checkouts, commit only scoped changes, and push verified work directly to `origin/main` without force-pushing or opening a PR.

## Review and next stage

Review this written specification before creating the implementation plan. Then use the writing-plans skill and the user's already-selected subagent-driven execution with independent reviews. No need to ask the user to select an execution method again. Account authorization and hands-on Jam acceptance remain explicit user participation points, not reasons to leave independently executable work incomplete.
