# Local dashboard preview

Open `/dev/canvas-preview/index.html?view=canvas&scene=busy` on the local Vite preview server. All entities and service responses are simulated; this page never controls the real house.

Use **Preview tools** in the bottom corner to select a scenario or reset local changes:

- **Everyday**: normal interactive controls, idle appliances.
- **Active appliances** (`scene=busy`): normal interactive controls plus appliance activity and a reminder in House Pulse.
- **Command failures** (`scene=failure`): deliberately rejects commands and forecast requests.
- **Mood recovery** (`scene=mood-recovery`): starts with a restoration problem; retry can recover.
- **Disconnected** (`scene=offline`): disconnected control states.

Selecting a scenario clears fault flags and resets simulated state. Refreshing resets the current scene. For focused tests, `fail=commands`, `fail=forecast`, and `unconfirmed` remain available as URL options.

This is an interaction preview, not a hardware emulator. Blind commands are accepted without fabricated position readings; appliance cycle timing, actual audio playback, physical motion-following, and real mood snapshot restoration require live hardware/backend testing.

## Tablet layout experiment

Use the **Tablet layout** button in Preview tools, or append `tablet=1`, to opt into the local tablet layout prototype, for example:

- `/dev/canvas-preview/index.html?tablet=1&scene=everyday` — quiet House Pulse hidden.
- `/dev/canvas-preview/index.html?tablet=1&scene=everyday&pulse=art` — illustrated quiet House Pulse.
- `/dev/canvas-preview/index.html?tablet=1&scene=busy` — reminders and appliance activity.

Compare the same URLs without `tablet=1` for the existing layout. The preview entry alone imports `tablet-layout.css` and toggles the `preview-tablet-layout` root class; production entry points and styles are unchanged. Scenario changes preserve this URL option.

The experiment activates at widths of at least 800px and heights of at least 540px, excluding ordinary phone portrait and short phone landscape viewports. It increases rem-based typography by 15%, enlarges key icons, and shares available vertical space between the feature cards and controls. At heights of 720px and above, larger controls and vertically arranged blind-room illustrations use the extra space. The short-tablet variant retains comfortable 44px touch targets. Content can still grow and scroll for errors, enlarged accessibility text, or unusually long content; there is no viewport clipping or scroll lock.

Check 960×600, 1280×800, a taller tablet, and a phone with quiet, illustrated quiet, and busy pulse scenes. Verify room selection, quick light toggles/settings, brightness, blind commands, mood changes, playback, favourites, and dialogs; include disconnected and command-failure scenes for disabled and error states.

Verified prototype results:

- Busy scenes at 800×600, 960×600, and 1024×600 fit the 600px viewport.
- Quiet, illustrated quiet, and busy scenes at 1280×800 fill the 800px viewport.
- The 800×1280 portrait layout fills the viewport; the 393px phone layout remains unchanged.
- Typecheck, production build, and lint pass. The production build excludes the tablet prototype; its stylesheet is imported only by this local preview.

These checks use simulated devices. Verification on the physical tablet, including its browser chrome and safe-area behavior, and live hardware interactions remain pending.
