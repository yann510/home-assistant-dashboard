# Overview blinds balance — October 6, 2026

The overview room toggles and Open/Stop/Close rows now divide spare card height equally. Intrinsic room labels, captions, and errors retain space; at the shortest viewport the room row remains slightly taller to preserve its existing minimum. Room icon and label groups are centered horizontally and vertically, using the existing stacked portrait layout. Pending action labels may wrap beneath their nonshrinking icon in narrow tiles.

Measured with local simulated Chromium preview at coarse/touch 960×540, 960×600, 1280×680, 1280×800, 800×1280; fine-pointer 1468×1354 and 1440×900; and touch phone 393×852. Each viewport was checked in everyday, busy, health, and disconnected scenes. All 32 cases passed full icon/label bounds, 44px minimum controls, horizontal overflow checks, and overview content centering. Normal tablet content fits its viewport; desktop overview retains its 800px height cap. Phone normal rows retain 66px room toggles and 48px command buttons.

| Everyday viewport | Room row | Command row |
| --- | ---: | ---: |
| 960×540 | 66px | 56px |
| 960×600 | 73px | 73px |
| 1280×680 | 82.27px | 82.28px |
| 1280×800 | 89.27px | 89.27px |
| 800×1280 | 198.36px | 198.38px |
| 1468×1354 / 1440×900 desktop | 89.27px | 89.27px |
| 393×852 phone | 66px | 48px |

Interaction checks at 960×540, 800×1280, 1468×1354, and 393×852 covered room selection and clearing, disabled commands without selection, selected and keyboard focus appearance, simulated accepted Open/Stop/Close, delayed pending labels, failed Close, visible retry controls, and long error content. Long errors grow the layout naturally and remain scrollable when exceeding the viewport. Pending labels and icons stay inside their controls, including narrow portrait and phone widths.

Validation: full test suite (35 files, 506 tests), lint, dashboard production build, and diff whitespace check passed. Build retains the existing large-chunk advisory. Browser evidence and reproducible scripts: `backups.local/blinds-balance-2026-10-06/` (local ignored artifacts). These checks simulate commands and do not establish physical blind movement.

## Production release

Independent specification/quality and whole-branch reviews approved `e2a561b..732c9c8` without findings. Guarded deployment staged, hash-verified and promoted release `732c9c8`, retaining the previous dashboard for rollback. Fresh HTTP checks confirmed the release ID and exact local-build/manifest SHA-256 matches for the page and all 67 build assets (68 files). No real blind commands, backend updates or Home Assistant restart occurred.

The source and release notes are pushed directly to `origin/main` as a normal fast-forward after fetching; other checkouts remain untouched. [Refresh the dashboard](http://homeassistant.local:8123/local/dashboard/index.html?release=732c9c8) to load the balanced blinds layout.
