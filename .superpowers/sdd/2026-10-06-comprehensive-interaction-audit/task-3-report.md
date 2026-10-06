# Task 3 implementation report

Implemented specific speaker, thermostat and appliance directory destinations. Each opens its full existing category, scrolls the matching row into view, focuses that read-only row and highlights it with the existing lilac token. Navigation never invokes row device controls. The empty-query directory now shows six category shortcuts followed by the full individual inventory; category entries are excluded from that inventory. Existing trimmed/case-insensitive search, clear recovery and retained query remain.

Added a focused useCanvasNavigation helper. Records are stored under history.state.__canvasNavigation, preserving other state fields and the complete current URL. Each open pushes one entry after saving source focus and dialog scroll; browser Back/Forward and in-app Back share those entries. Close/Escape travel directly to the overview ancestor and legitimate Forward remains available. Repeated Back is suppressed while traversal is pending. A Close issued during pending Back is completed after that traversal. Each dashboard mount gets a fresh session, so reload renders overview and old records cannot reopen stale panels.

Selectors for browser acceptance: `[data-canvas-destination="media_player.living_room"]` (and other configured speaker IDs), `[data-canvas-destination="climate.thermostat_office"]` (gym/bedroom also), `[data-canvas-destination="washer"]` (dryer/dishwasher also). Selected row has `data-canvas-highlighted="true"` and `tabindex="-1"`; document.activeElement is the row. Directory navigation labels remain `Device categories`, `Device directory`, `Find a device or room`, `Back`, `Close details`.

## Verification

- Focused initial run exposed synchronous-history assumptions in existing tests; those tests now wait for real popstate traversal.
- `npx vitest run src/canvas/CanvasDashboard.test.tsx src/canvas/CanvasSecondary.test.tsx src/canvas/CanvasDialog.test.tsx`: 81/81 passing.
- `npx vitest run src/canvas/CanvasIntegration.test.tsx`: 21/21 passing.
- `npx vitest run src`: final full frontend run 31 files, 486/486 passing (12.61s). Prior full run exposed seven integration tests needing asynchronous traversal waits; corrected them.
- After rapid Back/Close amendment, `npx vitest run src/canvas/CanvasSecondary.test.tsx`: 72/72 passing.
- `npx tsc -b`: passing.
- Scoped ESLint across all changed TypeScript/TSX files: passing, no warnings.
- `git diff --check`: passing.
- New behavioral regressions assert individual read-only destination focus/highlight, zero service writes, browser Back/Forward, same-session Forward after Close, rapid repeated Back, rapid Back/Close, preserved host history state/URL and stale-record rejection after remount.

## Files / self-review

Changed CanvasDashboard, CanvasDevices, CanvasDialog, routes, CanvasSpeakers, CanvasThermostats (row markers only; HVAC/power untouched), AppliancesCard (row marker only), canvas-secondary.css, the focused history helper, and three existing navigation test files. Reused existing row/control styling and 44px control rules. Self-review simplified visible inventory calculation and fixed Close during pending Back. No dependencies, router, deploy, push or real device commands. Controller-owned plan and QA ledger remain unstaged.

Real Chromium history/reload and viewport acceptance are assigned to the controller, which owns the shared preview browser; I did not operate its page. No known implementation concerns.
