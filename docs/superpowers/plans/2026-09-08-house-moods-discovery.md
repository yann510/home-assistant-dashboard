# House Moods Implementation Discovery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this discovery plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify the deployed dashboard source and installed Home Assistant interfaces so a file-specific mood implementation plan can be written without inventing deployment details.

**Architecture:** The approved UI is a thin client of a persisted Home Assistant-side mood coordinator. The neon needs a full native-effect snapshot adapter. This prerequisite plan is read-only against the running house and produces documentation rather than deployed code.

**Tech Stack:** Existing HAKit React/TypeScript dashboard; Home Assistant WebSocket/REST APIs; installed Lepro custom integration; existing Sonos integration and automations.

**Spec:** `docs/superpowers/specs/2026-09-08-house-moods-design.md`

## Global Constraints

- Four curated presets: Love, Unwind, Dinner, and Party.
- Every preset starts an existing Sonos favorite.
- Follow-me moves music only; lighting remains fixed in the selected rooms.
- There is no details control.
- Production must not depend on scraping logs.
- Preserve the current rainbow effect while investigating; do not run additional physical previews during this discovery phase.
- Do not overwrite the deployed dashboard with the local starter.
- Never print tokens or account credentials while examining configuration.
- This folder is not a Git repository. Do not claim commits or invent a remote.

## Files and artifacts

- Read: `ha-dashboard/src/Dashboard.tsx`, `ha-dashboard/src/App.tsx`, `ha-dashboard/package.json`, `ha-dashboard/scripts/deploy.ts`.
- Read: `office-neon-original-effect.json`; keep its confirmed recovery payload unchanged.
- Update: the Verified environment and implementation prerequisites sections of the design spec with verified source locations and interface evidence.
- Create after discovery: `docs/superpowers/plans/2026-09-08-house-moods-implementation.md`, containing concrete file paths, interface signatures, focused failing tests, implementation steps, and validation commands against the actual codebase.

## Task 1: Locate the editable dashboard

**Consumes:** The verified custom panel route `/hakit-dashboard`, module `/local/hakit-panel.js?v=1`, and iframe entry `/local/dashboard/index.html`.

**Produces:** A verified source directory, frontend entry component, current music/follow-me controls, style conventions, build commands, and deployment destination recorded in the spec.

- [x] Read `get_panels`; identify `hakit-dashboard` and its module URL.
- [x] Read the module and confirm it loads `/local/dashboard/index.html`.
- [x] Inspect the local frontend and confirm it is a starter screen, not the deployed UI.
- [ ] Inspect the served index and referenced asset paths for source-map links or source identifiers without executing downloaded JavaScript. Use the existing authenticated HA connection; do not copy secrets into the plan or output.
- [ ] Resolve the editable source from those references or the user's source-folder answer. If only compiled assets are available, record that limitation and request the source location rather than treating the assets as a maintainable project.
- [ ] Read the source's project instructions, frontend entry, music controls, styling, package scripts, and deployment script. Record exact paths and existing test tooling.
- [ ] Verify the source matches the deployed UI by comparing distinctive labels and its route/asset deployment configuration. A shared React/HAKit dependency alone is insufficient evidence.

## Task 2: Verify the neon snapshot boundary

**Consumes:** Confirmed original effect payload in `office-neon-original-effect.json` and the installed `lepro_led` integration.

**Produces:** The installed integration version and source path, incoming-report handler, raw-state storage location, and precise adapter extension points documented in the spec.

- [ ] Locate the installed custom integration through available authenticated Home Assistant administration access. Read its manifest and source without modifying configuration or restarting Home Assistant.
- [ ] Compare its incoming device report handling with the examined upstream `light.py`. Record whether raw `d50`/`d60` and mode-specific fields survive parsing, and whether outgoing command echoes are incorrectly treated as confirmed state.
- [ ] Trace `request_debug_state` and `send_debug_command`. Identify how to expose a fresh complete report to a coordinator without scraping logs or sending credentials to the browser.
- [ ] Define the snapshot's exact stored fields, freshness/timeout rules, and replay verification from the installed code. Include the recovered rainbow string as a regression fixture for opaque preservation; do not assume a single RGB value represents its palette.
- [ ] Record whether access or a source checkout is missing. Do not substitute a guessed upstream revision for the deployed code.

## Task 3: Verify follow-me and finish the implementation plan

**Consumes:** The three exact automation entity IDs, preset favorite IDs, and agreed UI/session behavior in the spec.

**Produces:** A complete implementation plan targeting the verified source and backend packaging, with tests for all acceptance scenarios.

- [ ] Read the configuration of the Bathroom, Gym, and Bedroom follow-me automations. Record join/leave behavior, volume writes, trigger conditions, and whether context identifies mood-owned changes.
- [ ] Identify any existing grouping and session controls in the deployed frontend/backend before adding a second mechanism.
- [ ] Choose the Home Assistant-side coordinator packaging using the verified installed environment. Specify durable storage, service/status interface, adapter boundaries, and session reconciliation after restart.
- [ ] Write concrete implementation tasks in dependency order: native snapshot adapter, preset/coordinator lifecycle, Sonos ownership and follow-me integration, approved card UI, and full restoration validation. Each coding task must include exact files, consumed/produced signatures, a focused failing test, minimal implementation guidance, and the corresponding verification command.
- [ ] Cover manual overrides, switch baselines, rollback failures, device rounding, stale reports, favorite resolution, playback replacement, grouping restoration, refresh/restart, and persistent recovery UI in those tasks.
- [ ] Self-review the implementation plan against every acceptance scenario in the spec and scan for undefined interfaces or placeholder steps.

## Discovery outcome (2026-09-08)

Completed using read-only inspection and subagent review:

- Source located at `/Users/yann510/github/home-assistant-dashboard`; its built main asset exactly matches the deployed SHA-256.
- Installed Lepro 1.4.1 source downloaded from `/config/custom_components/lepro_led`. Authoritative raw-report collection and propagated replay errors identified as required extension points.
- Live follow-me configurations match the source after Home Assistant key normalization. Reuse the shared script and its helpers; do not toggle the three automations.
- Full implementation plan written to `2026-09-08-house-moods-implementation.md` and reviewed. No live lights, music, integration source or configuration were changed during this discovery.

## Completion condition

Discovery is complete only when the actual dashboard source, installed Lepro adapter boundary, and existing follow-me behavior are verified and the implementation plan names real integration points. This discovery document is not a claim that the full implementation plan or mood feature is complete.
