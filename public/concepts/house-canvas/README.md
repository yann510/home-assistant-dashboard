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
- Toggle room lights directly, or tap a room for individual brightness, power, and supported colour choices.
- Open/stop/close blinds in Living room, Bedroom, and Gym. Buttons acknowledge the last command; they do not fabricate measured blind positions.
- Play/pause, skip, adjust volume, choose a room/source, or select a favourite in the music sheet.
- Tap weather for sample hourly/daily forecasts.
- Read or dismiss reminders. Busy evening also demonstrates running laundry and an unavailable Office light.
- Search and filter All devices; inspect climate, appliances, and simulated vacuum controls. Back preserves directory query, filters, scroll, and focus.

## Layout and verification

- The overview fits without page scrolling at **960 × 600** and **1280 × 800 CSS pixels**, including the busy scene. All seven rooms, mood choices, Day/Night, music, weather, and attention access are visible.
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
