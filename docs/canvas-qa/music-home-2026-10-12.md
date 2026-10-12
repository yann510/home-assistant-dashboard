# Unified music home — 2026-10-12

Source `97f033c`, with the final playlist action alignment in `16ed61d`, is published as `music-home-20261012-polish` at the existing dashboard destination. The music refinement was integrated with the newer Roomba room-selection and device-category changes from main; those changes were preserved. A subsequent concurrent All rooms selection update was also integrated and published by its workstream. The final combined build retains these music refinements and its served HTML matches the freshly verified build (index-BPFSGYeC.js).

## Result

The music card has a visible **Browse music** control instead of the icon-only favourites entrance. The dialog has one home and ordinary song search, without the Home/Search/Your library sidebar. Home orders real Spotify playlists, Sonos favourites, Top Tracks, Recently played and integrated library collections. Clearing search restores home; folders have Back and breadcrumbs. Cover art and titles are clickable together, with separate collection Play actions. Long playlist titles remain readable and their Play buttons align at a shared row bottom.

Library collection artwork uses existing thumbnails, bounded real cover collages, or designed theme illustrations when imagery is absent. No production demo data is introduced. One failed personal collection does not remove successfully loaded playlists or other library entrances; failures have per-section retry feedback. Confirmed playback remains shared with the existing mood/group guards, and its status/errors sit next to the persistent player.

Canvas document and music scrollbars use the current neutral line colour with lilac hover. Existing theme tokens, interaction states and minimum 44px controls are retained. The music implementation requires no Home Assistant backend change or restart.

## Verification

- Integrated full suite: 40 files, 637 tests passed. Lint, TypeScript, production dashboard build and diff checks passed.
- Independent review approved the collection failure isolation, compact tablet layout and final CSS-only action alignment. New behavior tests failed before implementation and passed after it.
- CUA phone 375×812: player y593–792, 44px targets, no horizontal overflow.
- CUA tablet 960×640: player y395–600; section order verified and no sidebar.
- CUA short tablet 960×540: overview home controls finish at y536, music card height220; dialog player y303–500. Browse music remains visible without an extra full row.
- Computed music scrollbar colour: rgb(72,68,78), matching the canvas line token; document styles resolve the same palette with lilac hover.
- Live dashboard: Browse music opens the unified view; seven real playlists load first, followed by the real personal sections and library collections. Live Daft Punk search returns actual Spotify tracks with paging controls. Search/clear and collection navigation were checked without starting music.
- Final live first-row playlist Play controls all measure y730.234–774.234 (44px), despite different title lengths.
- The atomic publisher verified and promoted the final release; public HTML exactly matches the verified production build. The previous release remains available through the existing rollback command.
