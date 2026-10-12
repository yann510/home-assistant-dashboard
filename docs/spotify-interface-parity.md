# Spotify-style music navigation and behavior

Goal: a music interface that feels very similar to Spotify in everyday browsing and listening, within this Home Assistant dashboard.

The user's accepted constraints remain: a compact unified home, no wide sidebar, playlists first, Sonos favourites and personal track suggestions below, the library within home, visible Liked songs, normal catalog search, direct playlist playback from the main card, current dashboard theme, and persistent playback controls.

## Verification targets

- Home exposes real personal playlists, Liked songs, top/recent tracks, favourites and library collections with artwork and clear actions.
- Playable playlist cards start playback; a distinct secondary action browses tracks without starting audio.
- Collection detail displays real artwork and track lists, a collection play action where supported, and local find within loaded tracks.
- Search displays compact playable song results and supports catalog discovery across songs, albums, artists and playlists, with clear filters and pagination.
- Home, backward and forward navigation preserve browsing/search context and scroll position; speaker selection returns to the previous music context.
- Playback remains tied to the selected Sonos coordinator and observed device state, including play/pause, previous/next, seek and volume.
- A real queue can be viewed and refreshed; supported Spotify items can be added or played next without replacing current audio. Queue state is never simulated in production.
- Shuffle and repeat controls reflect supported device state, respect grouping/disconnection guards and manual playback ownership.
- Phone and short tablet layouts preserve visible navigation, comfortable touch targets, readable song rows and persistent controls. Loading, empty, error, disabled and keyboard focus states remain usable.

## Current evidence

Home, direct playlist playback, Liked songs, collection actions, compact track rows and dialog-local history are live. The real queue, Spotify enqueue actions and observed shuffle/repeat controls are also live, verified in docs/canvas-qa/spotify-listening-2026-10-12.md.

The live frontend now supports All, Songs, Playlists, Albums and Artists, with grouped previews, category paging and restored search/filter context. The authenticated adapter is active and real responses are verified. Rich collection reads provide actual artists, duration and artwork, total/loaded counts, offset or cursor paging, and restored loaded ranges. Liked songs reports 765 saved tracks, with middle and final pages verified. See docs/canvas-qa/spotify-catalog-2026-10-12.md for release and rendered evidence.

Read-only live inspection confirms all four Sonos players advertise feature flags 8321599 and expose shuffle/repeat attributes. sonos.get_queue is registered; a call returned the real Living Room queue as an array of 50 entries at response[entityId]. Official integration supports media_player.play_media enqueue add/next for Spotify media, but arbitrary Sonos favourites must not inherit enqueue because their integration branch replaces playback.

The house_moods manual service-intent observer now handles shuffle/repeat so a manual gesture releases playback ownership. Existing queue/play_media calls also participate in that ownership handling.

Library edits are not currently available: the Home Assistant Spotify integration requests library read access. Any future save/unsave or playlist editing action needs a proven authorized API path; do not display a working-looking control that cannot persist its change.

## Catalog implementation brief

Pinned test runtime is Home Assistant2026.9.3 with spotifyaio2.0.2. Typed search accepts kind all/track/playlist/album/artist, preserving omitted-kind track compatibility. All shows grouped sections with independent totals and offsets; selected kinds paginate one category. Cache and in-flight identity must include authorized account and kind. Existing direct HTTP OAuth refresh avoids spotifyaio.search's missing offset support.

The server must generate album/playlist/artist browse IDs as spotify://<authorized-entry>/spotify:<kind>:<id> using the authorized config entry. Raw URIs can play through Sonos, but cannot browse via the HA Spotify bridge. Artists are browsing-only for Sonos. Normalize real artwork, title, artists and useful metadata; reject malformed or unplayable tracks. No client-supplied entry ID may select credentials.

The HA browse bridge omits artist/duration metadata and has no collection pagination contract. The bounded dashboard_spotify/collection endpoint now supplies that data for saved tracks/playlists/albums/followed artists, top tracks/artists, recent plays and playlist/album/artist details. Artist profiles list albums; artists remain browse-only. Unknown totals remain unknown. Native browse remains for unsupported folders such as podcasts. Development-mode third-party playlist detail may be restricted to owner/collaborator access; the interface preserves Play and reports unavailable detail clearly rather than displaying an empty playlist.

Primary references: [Spotify Search API](https://developer.spotify.com/documentation/web-api/reference/search), [2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [HA Spotify browse bridge](https://raw.githubusercontent.com/home-assistant/core/2026.9.3/homeassistant/components/spotify/browse_media.py), [Sonos media browser](https://raw.githubusercontent.com/home-assistant/core/2026.9.3/homeassistant/components/sonos/media_browser.py), [Sonos queue action](https://www.home-assistant.io/actions/sonos.get_queue/).

Typed search contract: kind omitted retains the legacy track page; an explicit single kind returns {kind,items,total,next_offset}; all returns {kind:"all",groups:{track,playlist,album,artist}} with independent category page metadata. Backend activation and frontend publication are complete; collection reads use the existing read permissions without new OAuth scopes.

## Completion evidence matrix

| Requirement | Current proof |
| --- | --- |
| Unified home, suggestions, library art and visible Liked songs | Live personal home has Playlists, Liked songs, Sonos favourites, Top Tracks, Recently played and Your library; real saved tracks and art verified in catalog QA. Existing home/playlist regressions pass in the final 694-test suite. |
| Primary playlist playback and distinct detail action | CanvasPlayer prioritizes can_play with confirmed speaker controller and original media ID/type; independent audit plus current player regression tests verify Play vs View tracks. Live View tracks reads actual seven-song own playlist without sending playback commands. |
| Artwork, real metadata, collection Play, filtering and complete supported collection reads | Live album 13 tracks, own playlist 7 tracks, artist 65 albums and Liked songs 765 total. Middle/final liked pages, 100 loaded rows and second-page filtering verified. Duplicate/cursor/error tests cover unsupported and restricted cases. |
| Broad catalog discovery and category paging | Live All groups and separate filters for Songs/Playlists/Albums/Artists; real search appended 18 song results. Typed backend and independent frontend reviews passed. |
| Home/Back/Forward, query/filter/page and scroll context | Live album Back restores Daft Punk/Albums; speaker Back restores 100 liked rows and scroll 3077; clearing a multi-category search restores the loaded library. Live Back/Forward also restore the real seven-song own playlist; current navigation tests cover category/page restoration. |
| Selected coordinator and observed transport/seek/volume | Current provider/controllers are unchanged from independently reviewed live listening verification; final integration/session tests pass. Actual footer follows paused music and subsequent TV/device volume changes. Seek stays conditional on actual track metadata. |
| Real queue, refresh and safe Spotify add/next | Listening QA proves real queue metadata and exact preserved queue before/after UI Add/Next; current provider/listening sources are unchanged, all relevant queue/controller tests pass in the final suite. |
| Observed shuffle/repeat, capability/grouping and manual ownership | Listening QA proves live on/off and off/all/one/off cycles and original restoration. Current listening/provider/house_moods implementations remain unchanged; source/capability and runtime manual-intent tests passed. |
| Compact responsive layouts and interaction states | Actual production 375×812, 656×926 and 960×540 measurements and screenshots; category and collection controls 44px; complete song row on short tablet, no phone overflow. Loading/error/retry/disabled/focus states verified by live/preview inspection and current regression tests. |

Read-only account access determines catalog availability. Library save/unsave and playlist editing are outside the authorized read scope; no simulated working controls are shown. Podcast folders use the native bridge. These boundaries preserve the user's requested compact music navigation and real search/suggestions without requesting additional access.
