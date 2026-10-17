# Room lights controls — 2026-10-17

The Fire HD 10 landscape dashboard keeps its Canvas layout. The home lights header has two rows: Lights / All lights, then the room artwork and picker. Individual power buttons use the room accent when on and a distinct neutral fill when off, with separate muted, icon-only Settings actions on the home card. Visible status is simply On or Off; accessible names retain the Turn on/off action. All lights in the selected room are shown; one spans the width, two share the row, and additional lights wrap. Tiles stretch into spare card height while retaining touch targets in shorter viewports. Grouped room power remains available in All lights, alongside the whole-house All off action.

Room brightness and colour presets appear together. Brightness retains its existing on-only behavior. Room colour turns on and colours available colour-capable lights in the selected room, including lights currently off; white-only and unavailable lights are excluded. Compatibility counts are omitted; a concise Mixed indicator appears when the known colours differ. A custom colour input complements the presets.

Individual settings retains the in-card editor, scoped to that light. Brightness, colour presets, and the colour wheel are visible together; supported warmth and effects remain available without switching adjustment tabs. Longer settings content scrolls within its panel.

## Verification

- Baseline: 39 test files, 665 passing tests.
- Updated suite: 39 files, 670 passing tests. Focused light suite: 64 passing tests, with failing-before-implementation evidence for the new behavior.
- TypeScript, ESLint, and production dashboard build passed. The existing large bundle advisory remains.
- Independent task review and whole-branch review approved the implementation with no actionable findings.
- Simulated preview interactions verified room/individual targeting, off-light activation, unsupported-light exclusion, custom RGB, disconnected controls, command errors, Escape, and return focus. No physical devices were operated during these checks.
- Icon-only Settings checks at 1280×800, 1024×600, and 393×852 confirmed 44px-wide touch targets, accessible per-light names, visible keyboard focus, editor opening and return focus. Expanded All lights retains its text labels. Independent review, lint, and production build passed.
- Filled-button refinement checks verified distinct On/Off backgrounds, text contrast above 4.5:1 in both states, and a visible dark keyboard-focus ring on the pastel On surface. Main-card room power is removed; grouped power controls remain in All lights.

## Browser geometry

The Lights room icon and picker align with the top edge of the Blinds room buttons, using the same heading gap while retaining each control’s natural height. Browser checks confirmed exact top-edge alignment at 1280×800, 1280×680, 1024×600, 960×540, and 800×1280. The standard two-light room fits the overview at both 1280px landscape sizes and 1024×600. The shortest 960×540 simulation uses 18px of natural vertical scrolling. Effective power, settings, swatch, and custom-colour targets measured at least 44px in both dimensions. Phone layouts have natural vertical scrolling and no horizontal overflow.

| CSS viewport | Lights card height | Individual tile height | Document height |
| --- | ---: | ---: | ---: |
| 1280×800 | 264.5px | 62.5px | 800px |
| 1280×680 | 234.5px | 68.5px | 680px |
| 1024×600 | 218px | 52px | 600px |
| 960×540 | 206px | 52px | 558px |

Earlier inventory checks confirmed a single light spans the grid width and four lights wrap into two rows with at least 52px tiles; All lights retains actions for all four. The alignment refinement leaves that grid unchanged. Phone alignment rules remain unchanged; the 393×852 layout was rechecked for touch targets and horizontal overflow. Earlier phone checks also covered 320×740.

These are Chromium checks using the repository's simulated preview and current capability fixture. They do not establish the physical tablet's effective CSS viewport, browser chrome, Android scaling, or hardware command delivery. See the existing Fire HD 10 QA notes for device validation limits.

## Production release

Release `d0a983c` was published to the main dashboard on October 17, 2026 using guarded staging, uploaded-file hash verification, and promotion with the previous release retained for rollback. The full 670-test suite and fresh TypeScript/production build passed before publication; lint and independent implementation review passed for the final refinement.

Independent LAN HTTP verification confirmed release `d0a983c`, all 68 current build files (index and 67 assets) matching local SHA-256 hashes and the release manifest, and all 244 manifest entries matching their fetched bytes, including retained assets and metadata. The live index returns HTTP 200. No household commands or Home Assistant restart were required. Physical tablet acceptance remains a device check.

[Refresh the deployed dashboard](http://homeassistant.local:8123/local/dashboard/index.html?release=d0a983c). The existing `npm run rollback:dashboard` command retains the previous release recovery path.
