# Quiet Home proof of concept

Branch: `codex/quiet-home-poc`. The production dashboard and `origin/main` are not replaced by this proof of concept.

## Try it

Use the existing local `.env` and Node 24, then run:

```sh
npm run dev -- --host 127.0.0.1 --port 8770
```

With the existing `VITE_FOLDER_NAME=dashboard` setting:

- Quiet Home: `http://127.0.0.1:8770/local/dashboard/?view=quiet`
- Classic: `http://127.0.0.1:8770/local/dashboard/`

The top navigation switches between the two. Classic is the default; unknown `view` parameters also fall back to Classic. Unrelated query parameters are preserved. This is a real Home Assistant connection, and action controls operate the real house.

No deployment is required for this local preview. Do not run the existing `npm run deploy` to publish a separate trial: that script targets the configured production directory. A later trial deployment would need its own folder and matching Vite base, without changing the production installation.

## What changed

Quiet Home reuses the current dashboard's HAKit theme, typography, blue accent, surfaces, borders, and 16px card corners. It prioritizes the active house mood, current outdoor weather, music, and room-based lights/blinds. Thermostat, appliance and vacuum controls are under All controls. Only actual running activities and applicable reminders appear on the overview.

- Mood selection, End, recovery/retry, pending states, and errors use the existing `useHouseMood` actions. The summary does not fabricate an active mood when none is active.
- Weather reads `weather.forecast_home`; the full forecast subscribes to the provider's supported daily, hourly, or twice-daily types. It displays all returned entries, not a fixed or invented seven-day forecast. Loading, empty, unsupported, missing entity, disconnect, timeout, error, and retry states are handled. Subscription cleanup also covers closing the panel before the subscription resolves.
- Music keeps the existing source/coordinator selection, transport, seek, room picker, grouped volume, favourites, and Follow me controls. Compact mode reduces artwork height and keeps idle favourites behind the existing picker.
- Lights use the existing light cards, grouped into the existing rooms. Blinds use the current room-level Google Assistant Open/Stop/Close commands; they have no position feedback. No fake slider or estimated position is shown.
- Details expand into one inline panel at a time. This deliberately preserves the existing light-detail overlays and native speaker dialogs; placing these controls inside a new native modal would interfere with HAKit's portalled overlays. Opening details scrolls and focuses the panel; closing returns focus to the originating shortcut.
- Reminders and running activities route to the appropriate hidden panel. Local reminder explanations remain with the reminder component; speaker reminders focus the player.

## Verification

- Baseline: 169 tests passed.
- POC: 189 tests passed, including layout/navigation, Classic fallback, forecast lifecycle/reconnect/retry, zero-degree values, mood recovery, activity navigation, and compact idle favourites.
- TypeScript and Vite production build pass. `npx eslint src` passes.
- Repository-wide `npm run lint` also scans existing ignored `.local` scratch previews. It reports two pre-existing errors in `.local/attention-implementation.tsx` and `.local/mood-review.tsx`, plus warnings there. Those unrelated local files were preserved.
- Real Home Assistant preview confirmed current weather, daily/hourly forecasts, mood status, music metadata, light count, reminders, and existing controls. Responsive layout was checked at 390, 768, and 1440px. Live verification used navigation and read-only state; device-changing actions were covered by tests, not sent to the house.

## Adoption or rejection

To keep the current dashboard, keep using the deployed dashboard or choose Classic. The POC can remain on its own branch with no production impact. If approved, review and merge the branch and separately decide whether Quiet Home should become the default before deploying. No Home Assistant configuration or automations were changed.
