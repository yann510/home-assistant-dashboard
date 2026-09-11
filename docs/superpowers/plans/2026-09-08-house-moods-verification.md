# House Moods implementation and verification

Implemented in the isolated `codex/house-moods` worktree at
`/Users/yann510/.codex/worktrees/house-moods-20260908`. The deployed dashboard's
editable source was verified as `/Users/yann510/github/home-assistant-dashboard`.
The initial `home-dashboard` folder was a starter, not the serving dashboard.

Feature changes are measured from **59f90db**, a snapshot preserving the actual
source's pre-existing dashboard/speaker changes. Do not merge a diff against main
blindly over that dirty source checkout. No original source files were overwritten.

## Delivered behavior

- House Mood card directly beneath Day/Night; Love, Unwind, Dinner and Party.
  Four columns on desktop, two on phones; active check/accent, pending lock,
  End mood and persistent recovery action. No details/settings panel.
- Server-owned fixed presets use the approved living-room/kitchen lighting and
  Office neon. The strip's HS-only capability and kitchen's 2702 K minimum were
  verified read-only. The neon already inherits the Office area in HA.
- Each preset starts its exact Sonos favorite from Living Room at the approved
  volume. Follow-me is music-only and is off for Dinner.
- Private durable original baseline across switches, journal before every device
  write, manual ownership relinquishment, independent restoration where possible,
  explicit recovery retry and restart reconciliation without automatic playback.
- Exact native effect snapshots preserve the recovered rainbow bytes. Generic RGB
  controls never replace native restoration. Party uses the approved Gradient.
- Mood-owned music stops at End; previous queues are not resumed. A confirmed stop
  boundary before each start prevents an old playing queue from falsely confirming
  a rejected music request. Unchanged Sonos groups are not torn down.
- Existing follow-me joins stay journaled while mood-owned and continue normally
  from the saved source after explicit manual takeover.

The authoritative lighting/music table remains in
[`2026-09-08-house-moods-design.md`](../specs/2026-09-08-house-moods-design.md).

## Offline verification

Verified against the final implementation at **0ecf5d3** (frontend unchanged from
its full passing run at 8f78928):

| Check | Result |
|---|---|
| `npm test` | 101 passed in 8 files |
| `python3 -m unittest discover -s home-assistant/tests -v` | 99 passed |
| `.venv-ha/bin/python -m unittest discover -s home-assistant/tests_ha -v` | 21 passed |
| `.venv-ha/bin/python -m unittest discover -s home-assistant/rollout/tests -v` | 5 passed |
| `npm run lint` | Passed |
| `npx tsc -b` | Passed |
| `npx vite build` | Passed; large-chunk advisory remains |
| `git diff --check` | Clean |

HA tests use the actual **Home Assistant 2025.5.3** runtime in an isolated Python
3.13 environment. Reproducible dependencies are pinned in
`home-assistant/tests_ha/requirements.txt`; no host upgrades were performed.
Tests exercise real service registration, responses, Store failures, script
execution/templates, area targeting, context ancestry, restart and shutdown.
Device I/O is fake. The native bridge patch is applied/reversed and compiled
against the downloaded matching installed source during its regression test.

UI visual checks used mocked states at desktop and phone widths, covering idle,
active, starting, disconnected and recovery; no live dashboard controls were used.
Regression fixes include absent sensor handling, service/sensor ordering, rejected
switch labels, stale transition reports, manual neon number controls, manual
follow takeover, and backup/collision failure paths.

Individual native, engine, lighting, Sonos, HA, UI and installer task reviews are
approved after fixes. The independent whole-feature review and scoped final
re-review are **approved**, with no remaining actionable findings. Its final
disconnect regression now retains volume, follow and group baselines through
End/restart/retry, while preserving later genuine manual changes.

Startup requires valid baselines for all four configured speakers. Missing or
inconsistent telemetry stops activation before commands; during recovery,
independent available lights/volumes can restore while unavailable controls keep
their saved return state. No synthetic singleton groups or unknown volumes are
treated as confirmed observations.

## Deployment state and remaining acceptance

Deployed **e94bb28** on 2026-09-08 using the reviewed installer against the actual
HA configuration tree. Private full backups and the installed manifest are at
`/share/house-moods-live-20260908/bundle`. HA 2025.5.3 configuration validation and
restart succeeded; House Moods and Lepro response services registered correctly.

The versioned live dashboard (`index.html?v=e94bb28`) loaded successfully. An
unversioned browser visit initially used cached pre-feature assets; refresh is
required for existing sessions.

Native replay matched fresh device readback, and the user visually confirmed the
recovered slow rainbow. Love started Crush Radio (user confirmed they manually
paused it), applied the requested living-room states, enabled follow-me and joined
Gym after motion. Later an office-light automation set neon brightness to 100%;
Lepro emitted mode 3 with its inactive special-effect payload. The user observed
intense rainbow flashing and confirmed they had not changed the neon. End returned
to idle; its ownership protection preserved the externally changed neon. Explicit
saved-native replay restored the original rainbow, visually confirmed again.

Lepro correction **66cf5c0** has eight additional passing regression tests, with
99 backend tests and five installer tests still passing. Independent scoped review
approved it. It preserves opaque native effect bytes for strip power/brightness
commands and prevents inactive effect registers from replacing the active effect.
The reviewed `light.py` was reconstructed from the verified original baseline;
the installed old file matched its expected hash before replacement. Its private
backup is `/share/house-moods-live-20260908/neon-fix/light.before.py`. Configuration
validation passed before the restart to load this correction.

Restart completed successfully with the mood sensor idle and the original
rainbow bytes still present. A direct neon-only test applied the Love recipe,
then the same `light.turn_on` with `brightness_pct: 100` used by the office
automation. Fresh device readback retained mode 2 and the exact rose `d50` recipe
at brightness 1000, instead of switching to mode 3. The test then returned to 35%.
The original custom rainbow also retained its exact mode and recipe through a
90% brightness command and a plain `light.turn_on`. The original full snapshot
was restored afterward with exact fresh readback, leaving no neon test state
active. The user subsequently confirmed the corrected rose appearance in a second
neon-only test (see visual acceptance below). The two
existing office/neon follow-light automations were initially unchanged; the
September 9 Unwind investigation below supersedes that decision.

[`home-assistant/rollout/README.md`](../../../home-assistant/rollout/README.md)
describes the concrete hash-guarded staging/install procedure, backups, file
rollback, required configuration and separate restart. Default installer mode
stages privately and does not modify deployed files. A whole-HA restart is never
hidden inside a dashboard upload.

Live acceptance remains: fresh full neon capture/replay with visual confirmation,
one short mood and End, switching, Sonos radio identity/timing, manual controls,
offline recovery and restart behavior on actual devices. Offline tests cannot
certify physical effect appearance or network/device timing. The native protocol
has no verified request-ID correlation; captures are serialized and require a
complete post-request report. Dynamic radio queue changes conservatively
relinquish playback ownership rather than overwrite an uncertain queue.

## Live Love visual acceptance

The user confirmed the corrected neon is rose breathing without rainbow flashing.
They found 35% too dim and approved the 65% preview; Love now uses native brightness
650. Living-room lighting and other presets retain their approved values.

## Unwind live rounding regression

The user's Unwind attempt entered recovery at the first living-room strip write:
requested HS `[32.727, 73.333]`, observed `[33, 73.3]`, brightness 64 in both. The
old 0.01 tolerance rejected legitimate device quantization. No subsequent mood
light/music commands were reached. Saved baseline was off; the strip was restored
to off and explicit Retry returned the engine to idle. The failed journal is
backed up privately at `/share/house-moods-live-20260908/unwind-failed-session.json`.

Fix `f85218a` permits circular hue rounding up to 0.5 degrees and saturation
rounding up to 0.05 percentage points, preserving native exactness and explicit
manual overrides. Standard-light timeouts now identify the failed target. The
ambiguous-recovery message is rewritten in plain language. Scoped tests: 60
passed; HA integration tests: 21 passed. Deployment files were hash-checked and
backed up in `/share/house-moods-live-20260908/unwind-fix` before replacement.
The first retest passed the rounded light command and rolled back cleanly after
a separate Sonos timeout: Living Room was playing TV input, which does not reach
the stopped music state. Fix `877fcc0` skips stop only for TV and requires confirmed
playing/buffering with queue source before acknowledging the favorite. Ordinary
music retains the confirmed stopped boundary. Empty timeout errors now have a
readable fallback. All 106 backend tests and 21 HA integration tests pass. The
Lepro patch roundtrip test was repaired with contextual hunks; generated production
source is byte-identical, and all eight focused Lepro tests pass.
Live retest after both corrections passed. Unwind became active without errors:
living strip HS `[33,73.3]`/brightness64, bulbs64, neon native amber250, Living Room
playing `GLY` at volume0.20, follow on. End returned idle with no errors. All tested
light states, speaker volumes/groups and follow/source values matched the fresh
pre-test baseline; neon writable fields matched exactly. Mood music was paused;
previous TV playback was not resumed, consistent with the no-resume End behavior.

## Dinner kitchen mapping regression

Dinner failed because the preexisting LocalTuya kitchen dimmer configuration
mapped both brightness and color temperature to DP26. The device is a 3-Way
Smart Dimmer with DP20 power, DP22 brightness (reported1000), DP26 reported0.
The incorrect mapping made HA report on/brightness0/color-temperature support;
the physical dimmer does not provide the requested color-temperature control.

The supported LocalTuya options flow corrected brightness to DP22 and refreshed
its actual brightness255 in HA. That flow reinserts existing optional defaults,
so it could not clear the old color_temp mapping by omission. A stopped-core
configuration edit removes only the unsupported color-temperature settings.
Private pre-change entry/registry backups are in
`/share/house-moods-live-20260908/kitchen-fix`. Other LocalTuya device data was
verified unchanged. Preset correction `90ca463` uses kitchen brightness140 for
Dinner and102 for Party, with no color-temperature write. 107 backend tests and
21 HA integration tests pass. Live Dinner → Party → End passed with no errors. Kitchen confirmed brightness140
for Dinner and102 for Party; the respective playlists played at0.20 and0.40 volume.
The same session persisted across the switch. End restored every checked light,
speaker volume/group and follow value to the captured baseline with zero differences;
neon native fields matched exactly, music stopped, sensor returned idle. Kitchen
now advertises brightness-only support. Its registry identity and area/device/name
metadata are unchanged, and unrelated LocalTuya device configurations are unchanged.

## Neon brightness preference

The user subsequently requested 100% neon brightness across all moods. Love,
Unwind, Dinner and Party now use native brightness1000, retaining each recipe.
All15 lighting tests pass, including exact original-state restoration. The live
neon was raised to100% through native replay, with effect fields preserved.
The previous preset file is backed up at
`/share/house-moods-live-20260908/neon-fix/presets.before-all100.py`.

## September 9 rainbow restoration investigation

The user reported the neon remained rose after a mood sequence. HA history shows
Love at20:52:57 UTC September8, Dinner at20:53:20, and successful End/idle at20:56:45.
No recovery errors or retained session remained. The current native payload was
the exact Love rose recipe at1000 brightness.

Saved test evidence shows the cause of the rose default: the neon-only visual test
started from the original rainbow, but its rose preview was left running after
brightness approval. Subsequent Unwind and Dinner/Party test baseline snapshots
contain that rose recipe (650 and1000 respectively). Those tests restored rose
correctly as their captured baseline. This strongly explains the user's later
return to rose; the completed user session's journal has been cleared, so its exact
captured baseline cannot be independently reconstructed. There is no evidence of
an unresolved mood or a new restoration-code failure.

Restored the original saved rainbow recipe on September9, preserving other native
fields, and verified exact fresh readback at brightness1000. No music commands were
sent. Future standalone effect previews must restore their pre-preview state after
approval; approval changes the preset, not the user's everyday baseline.

## September 9 header and Love bulb refinement

Approved refinement: End mood moved beside the title; redundant active text/footer
removed. Starting progress remains on the selected preset and accessible live
status, restoration uses the disabled header action, recovery stays visible below.
Rendered 620px and340px cards retain identical heights across idle/active/starting/
restoring states (144px and210px respectively). Love excludes living-room bulbs
entirely; other presets still control them. Tests cover direct exclusion and
Dinner→Love restoration while preserving manual adjustments.

101 frontend and108 backend tests passed; lint, TypeScript and Vite build passed
(existing bundle-size advisory). Deployment backup is
`/share/house-moods-live-20260908/header-update/backup`. Assets were copied before
atomic index replacement; old assets retained. Preset deployment was checked to
remove only Love's bulb entry.

The deployed browser loaded the new hashed asset and header with no console errors.
The first restart left LocalTuya UNLOAD_IN_PROGRESS, with its lights unavailable;
an explicit reload was refused by HA in that state. A second core restart was
initiated to recover the integration. No Tuya configuration was changed by this
UI/preset deployment.

The second restart recovered LocalTuya: kitchen on, living-room strip off, bulbs
off, and mood sensor idle. No physical mood preview was started for this update.


## September 9 Unwind restoration and office automation conflict

The reported amber neon after End had a separate cause from the earlier rose
preview baseline. HA history and native write logs show Unwind started at
18:57 local, then the office-follow automation powered the neon off at 19:16
while the mood was active. That external command relinquished mood ownership,
so End at 19:34 preserved the changed light instead of restoring its recipe.
The office automation later powered it on with the retained amber recipe.

Both existing office/neon follow automations now require sensor.house_mood to
be idle. This prevents automatic office on/off events from taking control during
starting, active, restoring or recovery. Ordinary manual-change protection is
unchanged. The supported HA automation configuration API saved and reloaded both
updates; fresh reads verified the conditions and enabled states, without a core
restart. The deployed configurations are recorded in
home-assistant/office-neon-follow.json. Private originals are saved in
.local/live/office-neon-automations-before.json.

Restored the saved original rainbow at brightness1000 and confirmed exact native
readback before testing. Regression coverage now exercises 36 mood activations
across three initial power/brightness states, with session reloads and an exact
original baseline assertion. All 109 backend tests pass.

Live verification completed Love → Unwind → Dinner → Party → Love → Unwind → End.
Every activation succeeded in the same session. During every preset, explicit
execution of both office automations with skip_condition=False left all native
fields unchanged. End returned success/idle with no errors and exact equality
against the complete original rainbow native snapshot. The test runner retries
only the coordinator's transient Operation in progress response; the initial
attempt stopped safely after encountering that response during observation.
Evidence: .local/live/multiswitch-test.log and multiswitch-rainbow-baseline.json.


## September 11 Gym and photo tiles

Approved addition: Gym turns on light.gym at 100%, starts the exact Sonos favorite
Bangers Workout Mix (FV:2/2) on media_player.gym alone, leaves its volume unchanged,
and disables follow-me. Gym does not apply neon or other lighting recipes. Source
playback ownership now includes Gym; switches restore dropped controls before
applying the next preset. Restoration comparisons use the safe restored state
(off lights / stopped playback), preventing retained brightness or queue metadata
from replacing the original baseline during repeated switches.

The approved photographs replace icons for all five mood tiles. Assets are bundled
locally (source references in src/assets/moods/README.md), labels use dark gradient
overlays, and selection retains accent outline and checkmark. End stays beside the
header. Five columns collapse to two, with Gym spanning the last row. The actual
mobile dashboard has no horizontal overflow; active and idle card heights are stable.

Verification before rollout: 135 frontend tests, 114 backend tests and 21 HA
integration tests pass; changed-file ESLint, TypeScript and Vite build pass
(existing bundle-size advisory). Independent review verified actual HA queue reads
use the Sonos group coordinator. It identified a new Gym-light availability
dependency; a regression test now proves the other moods work when only the gym
light is unavailable. Gym captures its light baseline when first included.

Deployment backup/staging location: /share/house-moods-gym-20260911. Before backend
replacement, all twelve live integration files matched expected original hashes.
The integration and dashboard were backed up. Frontend rollout copies assets first
and replaces index atomically, retaining previous assets.

Live test completed Gym → Love → Gym → Dinner → Gym → Party → Gym → Unwind → Gym
→ End, retaining one session throughout. Each Gym activation independently confirmed
solo Gym playback, original volume, light brightness255, follow off, and exact
original neon fields. End returned success/idle with no errors. All checked light
states/brightness, four speaker groups/volumes, follow switch/source and full native
neon payload matched their captured starting values. Evidence is stored privately
in .local/live/gym-live-baseline.json and gym-live-test.log. Configuration check
passed before the restart. The restart's startup was delayed by the unrelated
Brother printer integration; required mood devices loaded successfully.
