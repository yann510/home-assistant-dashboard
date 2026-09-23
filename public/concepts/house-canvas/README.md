# House Canvas

A third dashboard direction alongside Classic and Quiet Home: a warm charcoal canvas, expressive geometric mood artwork, and direct room controls. This standalone interactive prototype uses sample data only. It never connects to Home Assistant or controls the house.

## Preview

Serve the repository's `public` directory:

```sh
python3 -m http.server 8772 --bind 127.0.0.1 --directory public
```

Open [House Canvas](http://127.0.0.1:8772/concepts/house-canvas/). Use HTTP: native JavaScript modules do not work consistently from `file://` URLs. The current development preview uses the same server with `Cache-Control: no-store` to avoid stale assets after edits.

The **Prototype** button opens Everyday, Busy evening, and Nighttime demo scenes and a reset action. Refresh restores Everyday. Data remains in memory, never in browser storage. Sample music transport produces no audio. The illustrated cover is original concept artwork, not the recording's actual cover.

## Try it

- Select Day/Night and any of the five moods; end a mood to see the neutral state.
- Choose a room in the Lights panel to toggle power or adjust room brightness. Individual lights opens detailed power, brightness, and colour controls.
- Open/stop/close blinds in Living room, Bedroom, and Gym. Buttons acknowledge the last command; they do not fabricate measured blind positions.
- Play/pause, skip, adjust volume, choose a room/source, or select a favourite in the music sheet.
- Tap weather for sample hourly/daily forecasts.
- Read or dismiss reminders. Busy evening also demonstrates running laundry and an unavailable Office light.
- Browse All devices by category, then room. Music and Climate open directly; Appliances includes laundry and vacuum. Optional search remains available. Back preserves search, scroll, and focus.

## Layout and verification

- The overview fits without page scrolling at **960 × 600** and **1280 × 800 CSS pixels**, including the busy scene. Room selectors and direct controls, mood choices, Day/Night, music, weather, and attention access are visible.
- Phone layouts checked at **375 × 812**, **393 × 852**, and **440 × 956**; no horizontal page overflow. A fixed compact player provides music access while the page scrolls.
- Visible overview button targets measured at least **44 × 44 CSS pixels** in the smallest phone and tablet checks. Supporting text is intentionally small; check comfort at the actual mounting distance before adoption.
- Verified grouped/individual light changes, zero brightness/volume, colour choice, blind commands, all mood choices/end, Day/Night independence, speaker/source/favourites, forecast tabs, empty search, directory back/filter preservation, reminders/empty state, unavailable light behavior, thermostat and vacuum.
- Verified Escape, modal keyboard containment, background scroll locking, and focus restoration. Ending a mood restores focus to the nearby mood picker.
- Independent read-only code review completed; its keyboard-focus finding was reproduced and fixed. Browser verification is by the implementing agent. No physical-device or screen-reader testing has been performed.
- JavaScript syntax checks and `git diff --check` pass. Existing dashboard regression tests: 190 passed across 16 files. Vite build passes with the existing large-chunk warning. No new dependencies.

The purchased device is a Fire HD 10; its generation and actual kiosk CSS viewport remain unmeasured. The tablet sizes above are conservative preview targets, not claims about its hardware resolution. The phone target is the smaller iPhone 16/17 Pro. Validate both actual devices before any live integration.

## Structure and scope

`state.js` owns fixtures and local commands. `overview.js` renders the overview, `details.js` renders secondary controls and search results, `art.js` provides local SVG artwork/icons, and `app.js` handles events and modal navigation. `style.css` contains responsive styling. Existing dashboard and earlier concept files remain unchanged.

No deployment or production adoption is included. This work stays on `codex/quiet-home-poc` until the user chooses a direction.

## September 23 revision

Replaced the seven-room grid with compact Lights and Blinds panels. Both have room selectors; Lights exposes grouped brightness and power, while Blinds exposes labelled Open/Stop/Close commands. Offline lights are excluded from grouped changes. Power-on after zero brightness restores a usable brightness.

Attention now appears in a contrasting banner immediately under the header, with a direct View action and access to all updates. It disappears when all reminders are dismissed. All devices now starts with five categories and room-based navigation, with search as a secondary option. Blinds open their own focused sheet.

Revision verified in the browser at 960×600 and 1280×800 (no scrolling) and 393×852 (no horizontal overflow). Checked room selection, grouped zero/full brightness, power restoration, unavailable lights, blind room commands, category/back navigation, optional search/empty results, and attention dismissal. JavaScript syntax and diff checks pass; earlier regression-suite results above belong to the initial prototype.

### Quick-access revision — September 23

- Home: All lights off; room power/brightness; All rooms blinds; Follow me; 44px volume −/percentage/+ controls.
- All lights: every room in one list, selected room first, jump buttons, room power and individual power without navigating. Light names open focused brightness/colour controls. Back restores list position.
- Player: Follow me, manual room grouping, actual speaker room names, individual speaker volume, group mute, seeking, sources and favourites. Follow locks manual grouping; disabling retains source; switching to manual preserves the current group.
- Climate: Office, Gym and Bedroom targets instead of a fictional whole-house thermostat.

#### Feature preservation checklist

| Existing area | Prototype access | Live integration still required |
| --- | --- | --- |
| Day/night, mood selection/end | Overview | Automation feedback, mood recovery/retry and persisted state |
| Weather | Header → forecast | Live current conditions and dated forecasts |
| Room/individual light power | Overview → All lights | Real capability-dependent colour/temperature/effects, command pending/error feedback |
| Brightness/colour | Light name → settings | Entity capability mapping; prototype offers sample colour presets |
| Blinds open/stop/close | Overview, room or All rooms | Confirmed service outcomes; no position is invented |
| Speaker transport/favourites/seek | Music → player | Audio, live duration/position, capability checks |
| Follow me and manual grouping | Overview / player | Motion automation, cleanup retry, unavailable speakers and conflicts |
| Group and individual volumes | Percentage / player | Real group coordinator, device mute states, individual mute and pending updates |
| Room temperature | All devices → Climate | Reported targets, capabilities, heating state and confirmation/errors |
| Appliance/attention/vacuum | Attention or All devices | Real cycle/energy details, reminder rules, vacuum capability/state mapping |

This remains a simulated design prototype, not a feature-complete production replacement. Existing live dashboard code is unchanged. The checklist is a migration gate before adopting this design.

Verification: `node --test scripts/check-house-canvas.mjs` covers global light off with an unavailable device, all-room blinds, Follow/manual grouping constraints and bounded relative volume changes. Browser interaction checks cover power versus detail navigation, brightness, global off, grouping, individual volume, seek and mute. Tablet overview fits at 960×600; phone checked at 393×852.

The existing application suite also passed: 190 tests across 16 files. Final browser checks found no console errors and confirmed no overview scroll at 960×600 and 1280×800. These checks do not verify physical Fire tablet/iPhone behaviour or Home Assistant integration.

### Landscape detail overlays — September 23

All lights now uses a wide, centred overlay with three room columns on landscape tablets (two on narrower widths). At 960×600 all seven rooms fit without scrolling. Individual light/volume settings use compact centred dialogs; Back restores the room overview and focus. Phones retain the list with room shortcuts.

Music has Player and Speakers views. Tablet Player places favourites beside transport; Speakers places grouping options beside room volumes. Both fit at 960×600, including all four joined speakers. Per-speaker sliders measure approximately 212px at that size. The active Follow me colour pair now uses charcoal/yellow rather than pale text on a pale background.

Verified in the browser: light details/back on tablet and phone, state retained between music views, Follow/manual switching, group and individual volume, no horizontal overflow at 393×852 and no console errors. Four existing prototype action checks passed. No live dashboard behaviour changed.

### House pulse — appliance activity

The attention bar now combines sage activity tiles with amber reminders. Washer, dryer and dishwasher running states show sample remaining time; Roomba shows Cleaning or Paused and disappears when docked. Each appliance opens its own detail view. House pulse opens the combined activity list; reminders remain separately reviewable/dismissible.

Local SVG drum, wash and vacuum animations run only for active states and are disabled by prefers-reduced-motion. Everyday includes a running dishwasher and a finished-dryer reminder; Busy evening shows all four appliances running alongside the offline-light reminder; Nighttime starts quiet. These are sample states, not a connection to appliance sensors.

Verified: all four active at 960×600 without page scroll; 393×852 without horizontal overflow; dishwasher detail routing; pause/dock/start transitions; activity shown with no reminders; quiet state hides the bar; animation styles present for running appliances. Four prototype action checks passed. Existing production dashboard unchanged.
