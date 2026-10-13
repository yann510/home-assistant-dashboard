# Five music motion prototypes — 2026-10-12

User selection playground on `codex/music-motion-prototypes`. Development-only files add Orbit, Aurora, Floating notes, On air, and Mixtape. A five-choice radio gallery changes the existing music card's decorative indicator; the default preview and production entry remain unchanged. Gallery samples represent playing; card samples stop when paused and all prototypes respect reduced motion. These are ambient playback cues, not audio analysis.

Open `http://127.0.0.1:8773/dev/canvas-preview/index.html?view=canvas&musicPrototypes=1&artwork=1` with the controlled preview server running. The page uses simulated entities and commands. No physical playback or household writes occur. Optional `musicPrototype=aurora|notes|on-air|cassette|orbit` selects an initial choice.

Verification: 139 focused tests, lint, and dashboard build passed. Picker keyboard/query tests passed; subsequent development CSS fixes passed lint. Independent review approved after pause-specificity and fieldset-overflow fixes. Real Chrome checks selected all five variants and confirmed all four indicator spans report paused after Pause in each variant. Phone 375 × 812 no longer overflows horizontally; its gallery scrolls internally and On air selection succeeds. Viewport override reset. The gallery scrollbar uses theme tokens. Screenshot retained with chat: `five-music-prototypes.jpg`.

Production was not deployed or changed. The local server remains running for the user's comparison.

## Aurora transport and progress refinement

User requested Aurora inside the play/pause button with the pause symbol retained, plus livelier progress. Commit `4a571be` adds development-only `?auroraControls=1&artwork=1` gallery with Comet, Light stream, and Halo choices. The button's animated ribbons appear only during active playing with an enabled control; paused and disabled buttons retain their normal treatment. The native slider and `--speaker-range-fill` remain the position source; decorations never run their own progress clock. The old five-concept gallery remains available.

128 focused tests, lint, and dashboard build passed. Independent review approved after fixing the disabled-Pause activation selector. Chrome confirmed Aurora pseudo-element animation names while playing and `none` when paused; native keyboard seeking updated position/fill/time labels, and selecting different styles did not jump the position. Phone 375 × 812 had no horizontal overflow; central button stayed 44 × 44 and gallery selection worked. Viewport reset. Screenshot retained with chat: `aurora-controls-prototypes.jpg`. Production remains unchanged.

## Playing-only background artwork

Commit `70161ce` refines both opt-in prototype pages: inactive playback restores the original cream background and control colors and hides the full-card atmosphere, retaining the small cover thumbnail and current Spotify links. Playing restores the existing artwork treatment. Only development CSS changed; production/default preview remain unchanged. Lint and diff checks passed; independent review approved. Chrome Pause/Resume checks confirmed `display:none` with cream `rgb(230,220,188)` while paused, then visible atmosphere on play. The original five-concept page also hides its background on pause. Screenshot retained with chat: `aurora-paused-plain-card.jpg`.

## Warm music-card palette

Commit `874b5c8` keeps Comet as the default, removes the visually similar Light stream option, and retains Halo for comparison. Aurora controls and gallery samples use the existing music card's cream/copper/ink/taupe palette rather than mood lilac. Retired `progressPrototype=flow` falls back to Comet. Five focused picker tests, lint, and diff checks passed; independent review approved. Chrome confirmed two choices, the warm active button/marker, and cream background with hidden atmosphere after Pause. Screenshot retained with chat: `warm-aurora-comet-preview.jpg`. Development files only; production remains unchanged.
