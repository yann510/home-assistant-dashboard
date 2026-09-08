# Lossless Lepro native state extension

This extension supports native modes 2 (`d50`) and 3 (`d60`). Effect strings are
opaque and survive JSON round trips unchanged, including a retained effect while
power is off. `d30` is unverified evidence, stored in `extra_observed` and never
written. Unknown fields and transport metadata are also evidence only.

`NativeStateBridge(publish, clock=time.monotonic)` exposes async `capture` and
`replay`, synchronous `ingest`, `subscribe`, and `close`. The publisher accepts
(topic, JSON payload string). Call all methods on the Home Assistant event loop.
An observer receives `(device_id, message_type, fields, received_at)`; it receives
individual `rpt` and `getr` reports, never outbound `set` echoes. Unsubscribe using
the returned callable. Observers must be synchronous and nonblocking.

Snapshots serialize with `to_dict` / `from_dict` and contain `version`,
`device_id`, `captured_at`, `fields`, and `extra_observed`. `captured_at` is in the
injected monotonic clock's domain, for same-process freshness; it is not a UTC
timestamp. Persisting it preserves evidence, but it cannot establish freshness
across a process restart. Each capture always requests a new report.

Each device has one transaction lock; replay holds it through set and independent
get/readback. Only a complete fresh `getr` can finish capture. Partial responses
are never combined with one another or cached state. Timeouts cover publishing,
lock acquisition, and readback. A rejected or mismatching replay raises; a set
echo cannot prove success. No protocol request-ID matching is available through
the confirmed report interface, so freshness means arrival after the get request,
not a proven device-generated transaction identifier.

## Installation artifact

`integration.patch` extends the native bridge and fixes effect preservation against the supplied installed
source captured on 2026-09-08. `baseline-sha256.json` records hashes of light.py,
__init__.py, number.py, services.yaml, and manifest.json. The supplied originals
are copied to ignored `.local/lepro-baseline/` in the implementation worktree.
No live Home Assistant writes or MQTT calls were made while building this patch.

Before deployment, back up the entire installed `custom_components/lepro_led`
directory and compare those five file hashes to `baseline-sha256.json`. Stop and
regenerate/review the patch if any differ. Against a verified staging copy:

```sh
patch --dry-run -p1 -d /path/to/staged/lepro_led -i /absolute/path/to/integration.patch
patch -p1 -d /path/to/staged/lepro_led -i /absolute/path/to/integration.patch
cp /absolute/path/to/native_state.py /absolute/path/to/native_services.py /path/to/staged/lepro_led/
```

Deploy the staged files through the normal Home Assistant deployment workflow,
validate configuration, and reload/restart the integration. Roll back by restoring
the complete backup. The patch parses only the active effect register and retains opaque strip recipes
for power and brightness commands. B-series bulb command routing is unchanged.
Its native publisher bypasses offline
queuing and propagates broker publish errors so timed-out commands cannot remain
queued for later delivery. This cannot cancel a command already sent to a broker.

Response-only services:

- `lepro_led.capture_native_state`: `entity_id` (main light) or native Lepro
  `device_id`, plus optional `entry_id`; returns the snapshot dictionary directly.
- `lepro_led.restore_native_state`: same target plus `snapshot`; returns independent
  readback. It rejects wrong-device snapshots and unverified writable fields.

When calling via `/api/services/lepro_led/...`, request a service response using
`?return_response`. When calling internally, use `blocking=True` and
`return_response=True`. Entity and device selectors must resolve to exactly one
configured main light; segment entities cannot target the raw protocol.

## Verification

```sh
python3 -m unittest discover -s home-assistant/tests -p test_native_state.py -v
```

The integration patch regression applies and reverses the patch and compiles the
result when `/tmp/lepro-installed-*` baseline files are available. Otherwise that
one regression is skipped. Standalone bridge and service-handler tests need only
Python 3.11+ standard library. Home Assistant runtime and physical readback remain
deployment validations.

### Strip effect regression

Live testing exposed an existing Lepro parser/control bug: mode 2 reports retained
`d60` music settings alongside the active `d50` palette. Parsing `d60` last selected
the inactive music effect; a later office automation brightness command then
activated mode 3 at full brightness. The patch caches both opaque recipes but
selects only the active mode for display and power/brightness commands. It also
preserves recipes the generic parser cannot decode, including the original wave.

The focused suite applies the patch to the captured baseline, executes the actual
light class and MQTT report processing with lightweight Home Assistant stubs, and
asserts outgoing commands without connecting to a device:

```sh
LEPRO_BASELINE_DIR=/path/to/original/lepro_led python3 -m unittest discover -s home-assistant/tests_lepro -v
```

The default baseline directory is `.local/lepro-baseline` in the worktree. The
suite fails if that private baseline is missing. Device readback and visual
confirmation remain separate live checks.
