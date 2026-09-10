# Dashboard attention implementation plan

Goal: deliver the approved attention strip with persistent HA events and strictly same-page View actions.
Architecture: dashboard_attention YAML integration owns state, conditions, episodes, acknowledgment and snooze. React subscribes to sensor.dashboard_attention; bounded target IDs select local dashboard regions or inline explanation. No navigation URLs are accepted from backend data.
Spec: docs/superpowers/specs/2026-09-10-attention.md; accepted prototype .local/attention-preview.tsx. Latest constraint: View must never leave this dashboard page.

- [x] Backend: pure rule engine, persistent HA runtime, tests under home-assistant/tests_attention; frontend contract agreed with backend worker. Tests capture short finish pulses, cancellation, restart, dedup, unknowns and condition dwell/recovery. No production device actions or notifications.
- [x] Frontend: src/attention.ts parses trusted shape with allowlisted targets; src/useAttention.ts subscribes, delays visible disconnect banner, sends episode-specific actions with failure feedback; src/AttentionStrip.tsx renders two rows, expansion, snoozed items, reduced-motion entrance and inline details.
- [x] Navigation: Dashboard wraps existing cards with fixed IDs; AttentionStrip only calls scrollIntoView and focus on allowlisted IDs. Recovery uses existing controls. Details use text and buttons only. Test every target, URL remains unchanged, no anchors; View does not dismiss or send services.
- [x] Verification: run frontend tests, engine/runtime tests, production lint, tsc/vite build; browser tablet check with production UI fixture then real local app. Document runtime installation and leave deployment as a separate operation unless requested.

Interface: sensor.dashboard_attention attributes {ready,items}. Each item {id,episode,title,detail,tone,icon,target,occurred_at,kind,snoozed_until,snooze_seconds}. Targets appliances/vacuum/temperature/mood/speaker/details. Services dismiss/snooze/unsnooze with id and episode. Only completion can dismiss; unknown targets become inline details. Backend includes snoozed items; frontend splits them by timestamp.

Verification: 134 frontend tests and 23 backend tests; actual Home Assistant 2025.5.3 API tests and private history replay. Tablet/phone checks exercised production components. The matching live HA version was read via API. Backend and dashboard deployment remain separate from this implementation request.
