# Spotify catalog and complete collection browsing

Implementation `6d7fa77` adds compact All/Songs/Playlists/Albums/Artists search, four-item grouped previews, real category totals and pagination, real duration metadata, dialog-local category/page history and same-socket reconnection recovery. Fix `3c0ca07` clears all contiguous search-category history back to the originating home/collection and ignores whitespace-only new searches.

Backend `a1543af` and `19f04d7` add `dashboard_spotify/collection` version 1.2.0 using existing authorized Spotify read access. Account wrappers are validated and matched to a permitted loaded account before cache/token use; collection reads share bounded cache, concurrency, cooldown, timeout and shutdown handling with search. Reads recheck newly active cooldown before queued work and subsequent HTTP reads. No new scopes or library writes were added.

Frontend `407b477` connects real collection metadata and offset/cursor pagination, truthful loaded/total counts, safe text metadata, retained original artwork when metadata lacks a cover, and loaded-range restoration on Back/Forward. Row identities preserve repeated playlist tracks and recent plays. Native browse remains for unsupported sources; clear restricted/unavailable details retain the original supported Play action. Local-only preview `5aba97b` supplies the new contract and pagination; production uses actual Home Assistant/Spotify responses.

## Checks and review

- Final production frontend suite: 45 files, 694 tests passed; full ESLint and TypeScript/Vite build passed. Existing chunk-size warning remains.
- New local preview fixture suite: 7 tests passed; TypeScript and full lint passed after the fixture change.
- Backend: 33 Python tests and 9 installer tests passed, including real Home Assistant schema/authorization and matching multi-account tests, rich normalization, duplicate positions, page/cursor bounds, shared cooldown/concurrency/shutdown and installer rollback/refusal to overwrite.
- Independent frontend/backend task reviews, scoped fixes, whole-change review and final fixture review passed.

## Backend activation and live API

Installed four reviewed module files match `19f04d7` bytes. Upgrade used original byte/stat/symlink drift checks, exact private backups, staged permission/byte checks and atomic replacement. An initial backup-directory permission guard stopped before any runtime file change; explicit private directory permissions were corrected before successful activation. Backup: /config/codex-backups/spotify-collections-bb0bf603-4bea-486b-b1c1-812141cd8ff3. Configuration check returned valid.

One restart was requested. The HTTP connection ended during shutdown; no second restart was sent. After integration load, retained mood idle, Follow me off/empty source/off script, paused Living Room Know Some and Gym Favorite Place, volumes 30%/21%, shuffle false and repeat off matched the pre-restart snapshot.

Real reads confirmed Liked songs 765 total: offset 50 returns 50 tracks at positions 50–99, next offset 100; final offset 750 returns 15 tracks at positions 750–764, next offset null. All include actual artist/album/duration/artwork. Random Access Memories returns 13 tracks and real album release 2013-05-20; Daft Punk profile returns 65 albums with browse-only artist capability; daft punk vibes playlist returns 66 tracks and real owner/artwork. Recent reads have unknown total and real before cursors; a second cursor page returned subsequent distinct recent plays. Followed artists returned 4 total over 3+1 cursor pages; saved albums 4 total with album artists/artwork. Upstream pagination URLs are never fetched.

## Publication and rendered verification

Initial release spotify-catalog-20261012 verified/promoted; served HTML exactly matched dist/index.html. Compact collection follow-up `8d452ed` was independently reviewed, built and published as spotify-catalog-20261012-compact. All code was fast-forward pushed to origin/main.

- Real grouped Daft Punk search displays Songs/Playlists/Albums/Artists with actual artwork, artists/owners and durations; each category has its own See all and total. Albums filter then View tracks opened Random Access Memories with all 13 songs and real release date. Back restored query and selected Albums filter. Artist Open loaded 50 of 65 real albums with no artist Play button.
- Liked songs loaded 50 of 765 then 100 of 765 tracks. Filtering One Dance found a track from the second page. Opening speakers and Back to music restored 100 rows and scroll 3077 exactly. Song search started from that loaded library; next page appended 18 actual songs, and Clear search returned to the 100 loaded Liked songs rather than an earlier query.
- Actual viewport widths/heights were measured on the production tab. At 375×812 filters have 44px touch targets; Liked songs displays artwork/artist/duration rows and persistent controls. Rich album details have no horizontal overflow and the first complete 62px song row fits within content. At 656×926 footer and metadata columns have no horizontal overflow.
- At 960×540 added collection metadata initially hid most of the first song. The compact header places 44px Play beside metadata. Verified first 58px song row occupies 309.2–367.2 within content ending 368; title/artist/release/total remain visible.
- Real own playlist 5K — Build to the Finish opens 7 rich tracks with Play retained. The observed encoded ampersand prompted a pure frontend description-text fix `856c530`/`d7044b3`. This extracts markup and decodes common entities once without DOM parsing, network access or HTML insertion; unknown inherited names remain text. Independent review and 25 targeted tests passed.
- Later Living Room TV playback and volume 36% were observed during read-only browsing. The interface follows that current device state; no playback mutation or attempted restoration of the earlier track was made during these checks.

Final release spotify-catalog-20261012-final verified/promoted after the reviewed description fix. Served HTML exactly matches the final dist/index.html. Live seven-song playlist description now contains “drum & bass” without the encoded ampersand; Back and Forward restored its real details. Viewport overrides were reset and actual normal dimensions 656×853 confirmed. Final screenshot: spotify-catalog-live.jpg in the task visualization directory. Implementation and verified UI fixes are pushed to origin/main; this record and the parity completion matrix are committed with the final verification update.
