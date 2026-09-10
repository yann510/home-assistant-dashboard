# House Moods rollout

The feature was deployed on 2026-09-08; live acceptance is in progress. The private
installation backup is `/share/house-moods-live-20260908/bundle` on the HA host.
See the verification report for confirmed results and remaining live checks.
The neon already belongs to Office in Home Assistant; its entity inherits that area.

## Contents

- `custom_components/house_moods/`: single-house YAML integration, durable journal,
  standard/native lighting, Sonos favorites, services and public status sensor.
- `lepro-extension/`: hash-guarded patch and two native protocol modules for the
  installed Lepro 1.4.1 integration. Native capture/replay must work before moods.
- `speaker-follow.json`: existing script with a narrow mood-owned join branch;
  the three existing automation configurations and their enabled states are unchanged.
- Dashboard build: compact four-preset card beneath Day/Night controls.

The minimal new top-level configuration is:

```yaml
house_moods: {}
```

Before starting a mood, the backend requires valid volume and consistent group
reports from all four configured speakers so their original state can be saved.
It refuses incomplete snapshots. During restoration, unavailable controls retain
their baseline for Retry while independent available lights and volumes can return.

The source configuration already uses `script: !include scripts.yaml`. The
installer intentionally refuses other layouts, modified follow scripts, modified
Lepro source, existing House Moods installations, or changed files after staging.
It does not perform upgrades or silently merge drift.

## Prepare and review

Build from the feature worktree, preserving the existing dashboard improvements:

```sh
npm test
npm run lint
npx tsc -b
npx vite build
python3 -m unittest discover -s home-assistant/tests -v
.venv-ha/bin/python -m unittest discover -s home-assistant/tests_ha -v
```

The compatibility tests use Python 3.13 with the pinned offline requirements in
`home-assistant/tests_ha/requirements.txt`. Install these only in a local virtual
environment; they are not a Home Assistant host upgrade. Also run the local
installer exercise with `.venv-ha/bin/python -m unittest discover -s home-assistant/rollout/tests -v`.

Use Python with PyYAML (the isolated HA environment includes it). First copy the
verified HA config tree to a **private directory outside `www`**, or use a private
mount. The default command stages a bundle and writes nothing to that config tree:

```sh
.venv-ha/bin/python home-assistant/rollout/install.py \
  --config-root /private/path/to/ha-config \
  --bundle /private/path/to/mood-install-bundle
```

Review `staged/configuration.yaml` and `staged/scripts.yaml` against the originals;
PyYAML preserves script values but rewrites formatting. Review the patched Lepro
files, component files and built dashboard as well. `manifest.json` records the
original and staged hashes. Bundles include private configuration and must remain
private; do not commit, serve or share them.

If staging used a copy, **do not copy its manifest onto a different target**. Stage
again against the actual mounted deployment tree and review its matching diff.
The recorded absolute config root is where `--apply` writes.

When the concrete staged result and restart window are agreed:

```sh
.venv-ha/bin/python home-assistant/rollout/install.py \
  --bundle /private/path/to/mood-install-bundle --apply
```

This takes a complete backup of the affected config, script, integrations and
serving dashboard before installing any files. It rechecks deployment and staged
hashes first. Assets are copied before one atomic `index.html` replacement; old
assets remain so existing browser sessions keep working. It never removes the
serving dashboard directory. Backend files and YAML are installed for the next
coordinated restart; there is no claim of an atomic whole-HA rollout.

**Validate Home Assistant configuration, then arrange the restart separately.**
The installer never restarts HA, reloads scripts, sends music, or changes a light.
Do not run the repository's older `npm run deploy` for this rollout: it clears the
serving directory and does not install the required backend.

## Live acceptance still required

1. Validate configuration against HA **2025.5.3**, restart in the agreed window,
   and confirm `sensor.house_mood` is idle with response services registered.
2. Capture the Office neon through `lepro_led.capture_native_state`, save the
   private response, replay it, and confirm independent device readback **and the
   actual slow rainbow appearance**. A generic RGB/effect attribute is insufficient.
3. Start one short Love mood. Confirm the specified lights, Crush Radio favorite,
   Living Room volume, and music-only follow-me; then End. Confirm the rainbow and
   previous still-owned lighting, volumes, groups and follow state return. Old
   playback is not resumed.
4. Check Love→Dinner→Party switching and original-baseline restoration. Confirm
   Party uses the approved Gradient effect, not a generated multicolor guess.
5. Change a light/volume/playlist/follow control manually while active. End must
   preserve those changes. Verify a motion join is restored only while still owned.
6. Check one unavailable target and explicit Retry restoration, then restart or
   refresh during a pending operation. No automatic music replay on restart.

Offline fake-device tests cannot certify physical colors, radio queue behavior,
Lepro report timing, or Sonos grouping latency. Full native `getr` readback is
required. The report API has no verified request-ID correlation: it serializes
transactions and requires a complete response after each request. Manual queue
replacement is distinguished using queue/source identity and HA command context;
changes indistinguishable from the existing queue cannot always be identified,
and dynamic radio queue appends conservatively relinquish playback ownership.

## Roll back files

Keep the bundle's `backup/` and `manifest.json`. If application stops partway, its
status says `partial`; do not start moods or rerun `--apply` over the partial state.
Restore original configuration, scripts, and the complete Lepro directory from
`backup/`. Remove only the newly installed `custom_components/house_moods` if it
was absent in the original manifest. For the dashboard, restore backup assets
first, then atomically replace `index.html`; extra newly added hashed assets may
remain until no old browser sessions need them. Validate configuration and perform
one separately coordinated restart. Do not delete `.storage/house_moods.session`
while an unresolved mood owns device state: that file is the recovery evidence.

File rollback is not device restoration. If a live test changed devices, use End
or its retained recovery journal before removing the integration. The saved original
neon fixture is an emergency recipe for the confirmed earlier rainbow, not a
substitute for capturing the actual baseline of every new session.


## Office neon follow automations

The two existing office-light follow automations must include the idle condition
recorded in `../office-neon-follow.json`: `sensor.house_mood == idle`. Apply the
condition to the existing automation IDs through Home Assistant's automation
editor/configuration API, preserving their triggers and actions. These guards
were deployed on September 9, 2026. They prevent office automation commands from
relinquishing neon ownership during a mood, so End can restore the original
native effect after any preset sequence. Keep the condition during future edits;
the initial file installer does not manage these existing automations.
