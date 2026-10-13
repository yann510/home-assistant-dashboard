# Five music motion prototypes — 2026-10-12

User selection playground on `codex/music-motion-prototypes`. Development-only files add Orbit, Aurora, Floating notes, On air, and Mixtape. A five-choice radio gallery changes the existing music card's decorative indicator; the default preview and production entry remain unchanged. Gallery samples represent playing; card samples stop when paused and all prototypes respect reduced motion. These are ambient playback cues, not audio analysis.

Open `http://127.0.0.1:8773/dev/canvas-preview/index.html?view=canvas&musicPrototypes=1&artwork=1` with the controlled preview server running. The page uses simulated entities and commands. No physical playback or household writes occur. Optional `musicPrototype=aurora|notes|on-air|cassette|orbit` selects an initial choice.

Verification: 139 focused tests, lint, and dashboard build passed. Picker keyboard/query tests passed; subsequent development CSS fixes passed lint. Independent review approved after pause-specificity and fieldset-overflow fixes. Real Chrome checks selected all five variants and confirmed all four indicator spans report paused after Pause in each variant. Phone 375 × 812 no longer overflows horizontally; its gallery scrolls internally and On air selection succeeds. Viewport override reset. The gallery scrollbar uses theme tokens. Screenshot retained with chat: `five-music-prototypes.jpg`.

Production was not deployed or changed. The local server remains running for the user's comparison.
