# Desktop proportions and playback centering — 2026-10-06

Desktop devices with a fine primary pointer and hover now limit the overview's viewport expansion to 800px. The existing typography remains. Coarse touch tablets retain full viewport height; phone layouts remain content sized. Intrinsic grid rows can grow for long errors, with controls reachable through document scrolling.

At 1468×1354, the feature band changes from 619.6px to 317.5px and the lights/blinds row from 516.4px to 264.5px. The overview is 800px tall at all three desktop viewports: 1468×1354, 1440×900 and 1920×1080.

The tablet transport SVG was 23×23px inside a 20×20px animation wrapper, displacing its center by 1.5px horizontally and vertically. A shared size token now makes both 23×23px on tablet-sized overviews and preserves the existing 20×20px default. Settled SVG, wrapper and button centers match exactly, and the circular control remains 44×44px. The existing play triangle has an area centroid within 0.32px of the SVG center; its established optical geometry is retained. Pause and playback-change animation remain centered. The player dialog contains favourites and has no transport control.

Local Chromium checks cover everyday, busy, health and disconnected scenes at all three desktop sizes, coarse touch tablet viewports 960×540, 960×600, 1024×600, 1280×680, 1280×720, 1280×800 and 800×1280, and phones at 393×852 and 852×393. Settled screenshots and geometry verify compact desktop cards, tablet height preservation, no horizontal overflow, and centered transport controls. Playback transitions, dialog closing, document scrolling and long error growth are checked in the simulated preview.

Validation: all 506 tests in 35 files, lint and production dashboard build pass. The build retains its existing large chunk warning. Evidence scripts, screenshots, geometry and logs are under ignored `backups.local/desktop-proportions-2026-10-06/`. Physical Fire browser compatibility and touch behavior remain device checks.
