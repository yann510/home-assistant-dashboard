# Quiet Home proof of concept

User-approved scope: implement the refined Quiet Home information hierarchy with the existing Home Assistant dashboard theme on a new branch. Keep the original dashboard available and default. No merge to main or replacement deployment.

- [x] Add a URL-based Classic / Quiet Home switch with Classic as the default; preserve authentication and unrelated URL parameters.
- [x] Build the compact overview using existing theme tokens: active house mood, live outdoor weather, full speaker controls in a compact layout, and room-based lights/blinds shortcuts.
- [x] Reveal one secondary panel at a time for mood selection, forecasts, room controls, thermostat, appliances, and vacuum. Preserve reminder and running-activity navigation into these panels. Use inline panels so HAKit's existing light-detail overlays and speaker dialogs remain usable.
- [x] Use Home Assistant's supported forecast subscriptions, with hourly/daily availability, loading, empty, disconnect, failure, and retry states. Do not invent forecast entries or blind positions.
- [x] Test navigation, reminder routing, mood recovery, weather subscription lifecycle, unavailable states, and the Classic fallback. Verify the real connected preview without issuing physical-device commands.
- [x] Commit and push only codex/quiet-home-poc; deliver separate preview links and document the adoption/rollback choice.
