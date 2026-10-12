# Music navigation and collection details

Implementation e5e14d6 adds dialog-local Home/Back/Forward history, search context and scroll restoration, separate View tracks actions on playable collections, artwork/count/play headers, compact clickable song rows, and filtering within loaded collection songs. Home hierarchy and primary playlist playback remain intact.

Verification:
- Regression tests failed before implementation, then passed for history, collection browsing, rows and filtering. Review findings for pagination scroll jumps and repeated speaker entries were reproduced and fixed.
- Full suite:41 files649 tests passed. ESLint and production TypeScript/Vite build passed. Independent task review, scoped fix review and final review passed.
- CUA controlled preview: query Back returned to playlist; Forward restored query. Liked songs scroll1314 was restored across Back/Forward. Whole song rows retain primary playback guards.
- Phone375×812 and short tablet960×540 inspected. Compact tablet hero/filter/footer exposes a song immediately and retains seek, volume, transport, Follow me and speaker selection.
- Release spotify-navigation-20261012 verified and promoted; served HTML matches built dist/index.html exactly.
- Live production: View tracks opened 5K — Build to the Finish with7 real songs; Dust filtered to Rhyme Dust. Daft Punk catalog search returned real title/artist rows. Back returned to the playlist. Current paused audio was preserved; no live playback command was sent.

At this release, the broader Spotify interface goal was still active. Queue, shuffle/repeat, broader search categories and metadata-rich complete collection pagination were outstanding.

Subsequent completion evidence: the remaining catalog and collection work is verified in [Spotify catalog QA](spotify-catalog-2026-10-12.md). The current scope and evidence are tracked in [Spotify interface parity](../spotify-interface-parity.md).
