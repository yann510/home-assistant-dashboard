# Dashboard decluttering concepts

Three exploratory, interactive prototypes for comparing information hierarchy before choosing a production direction. They use representative sample rooms and device states, with the dashboard's existing mood artwork. They make no Home Assistant requests and cannot control real devices.

## Preview

From the repository root:

```sh
python3 -m http.server 8768 --bind 127.0.0.1 --directory public
```

Open `http://127.0.0.1:8768/concepts/`. The files also work directly from `index.html`, without a build or external dependencies. Vite includes this independent page under `concepts/` in its build; the production dashboard entry point is unchanged.

## Directions

1. **Quiet Home** (`#quiet`): a prominent active mood, current outdoor weather with a forecast drawer, a direct music player, and two room-based shortcuts for lights and blinds. Thermostat controls live under All controls; appliance activity appears only while running. Calmer at first glance, at the cost of one more tap for device controls.
2. **Room by Room** (`#rooms`): stable room navigation with lighting, blinds, temperature, and music grouped by space. Easier local control, with more navigation for whole-house tasks.
3. **Right Now** (`#now`): actionable reminders and active devices earn screen space. Idle devices live in All controls. Lowest passive clutter, with an overview that changes as activity changes.

All concepts share sample state when switching tabs. Selecting Quiet afternoon, Busy evening, or Bedtime resets that state. Reset restores the selected scenario. Refresh returns to Quiet afternoon. Controls simulate brightness, light power, blind position, temperature, mood selection, single-room playback, and reminder completion. Playback can move to the selected room from its player. Weather and appliance progress are fixed examples; room data are illustrative, not a verified inventory of available entities. Mood and day/night selection illustrate visual state, not the production automation sequence.

## Verification

Browser checks cover three concepts × three scenarios × desktop (1440px), tablet (768px), and phone (390px), with no page overflow. Checked room navigation, mood selection, brightness and disabled state, blind position, temperature, player controls, clearing reminders, reset, keyboard focus containment, Escape dismissal, and unique element IDs with the drawer open. Desktop and mobile screenshots were visually inspected. JavaScript syntax and the existing TypeScript/Vite build were checked.

These are design exploration assets. No production dashboard components, entity mappings, backend automations, or deployment configuration were changed.

## Quiet Home refinement · September 20

Priorities come from the user's stated preferences, not measured usage: mood, current weather and forecasts, music, then quick room-based lights and blinds. Thermostat controls remain available under All controls. Duplicate light and temperature summaries and idle appliance summaries were removed. Weather opens a clearly labeled sample forecast with six hourly entries and seven daily entries, temperatures in Celsius, high/low values, and rain probabilities. The other concepts remain available for comparison.
