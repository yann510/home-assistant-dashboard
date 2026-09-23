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

## September 18 MQTT reconnect correction

The patched wrapper retains desired subscriptions across clean MQTT sessions and
reconnects after broker failures, resubscribing before exposing the connection.
The former wrapper exited on a broker error and cleared subscription/message
queues when a later command reconnected it. Publishing could then succeed while
all device replies were lost. Live logs recorded this failure on September 15 at
04:35:42 EDT; no incoming reports followed it before the repair.

Ordinary commands now wait up to 10 seconds for a subscribed connection in the
caller’s coroutine. Cancellation or timeout leaves no command queued for later.
Native snapshot/replay still fails immediately while disconnected and never queues
writes. Disconnect on integration unload cancels the retry loop.

Regression coverage: `python3 -m unittest discover -s home-assistant/tests_lepro`.
The fake broker drops a connection and verifies a replacement subscription and
incoming report without any user command; startup subscription retention,
cancelled offline commands, and unload are covered separately.

## September 22 startup DNS recovery

A DNS failure during the September 22 17:42 EDT cloud login escaped platform
setup before the MQTT reconnect loop existed. Home Assistant logged a generic
platform error, retained an unavailable restored entity, and never retried.
Reloading only Lepro at 22:33 EDT recovered fresh device reports. The installed
light.py hash still matched the September 18 repair exactly.

`startup-retry.patch` is a required second patch, applied **after**
`integration.patch`. Before applying it, verify all three staged files against
`startup-baseline-sha256.json`. This includes the installed `switch.py`, which
must also be included in the private baseline used by the Lepro tests. Stop on
any hash mismatch; never apply these patches blindly to an updated integration.

```sh
patch --dry-run -p1 -d /path/to/staged/lepro_led -i /absolute/path/to/startup-retry.patch
patch -p1 -d /path/to/staged/lepro_led -i /absolute/path/to/startup-retry.patch
```

For an existing September 18 installation, apply only this second patch to a
hash-verified staging copy. Back up the installed integration, deploy the three
changed platform files, validate HA configuration, and restart Home Assistant to load the changed
Python modules. Config-entry reload alone can retain cached modules. Rollback
restores those three files and restarts Home Assistant again.
Do not rerun the first-install House Moods installer on an existing installation.

The startup cloud session translates connection errors (including DNS errors)
and timeouts into `PlatformNotReady`. Home Assistant owns delayed retries and
cancels them on unload; no independent retry task or delayed lighting command is
created. Speed/sensitivity and power platforms also use `PlatformNotReady` while
waiting for the light platform, so they recover after a delayed cloud login.
Cancellation and programming errors are not translated into retry requests.
HTTP rejection responses, authentication failures, and firmware/network issues
inside the physical device remain outside this specific correction.

`test_startup_retry.py` executes the patched setup/login functions: DNS failure
followed by successful entity creation, timeouts and connection failures at all
four cloud API stages, certificate download connection failure, dependent control
recovery, and cancellation/programming-error propagation.

### September 22 deployment verification

- 18 Lepro regressions, 125 mood/backend tests, and 6 installer tests passed.
  The original startup code failed the new DNS/timeout and dependent-platform
  cases before the correction. Installer staging produced the exact three
  corrected files and rejects an incorrect intermediate source hash.
- Installed files were hash checked and backed up under
  `/share/neon-startup-20260922/backup`; `ha core check` passed.
- An isolated process in the actual HA 2026.9.3 container confirmed real aiohttp
  `ClientConnectorDNSError` and `TimeoutError` become HA `PlatformNotReady`.
  Network-failure injection was confined to tests, not the running household.
- Full HA restart completed: light initialization at 22:44:57 EDT; fresh device
  report at 22:44:59. Number and switch platforms requested HA-managed retries
  while the light loaded and automatically set up at 22:45:04.
- Fresh native readback after restart exactly matched the pre-deployment power,
  mode, brightness, and opaque effect fields. Light, speed, sensitivity, and
  power entities were available. No test lighting commands were issued.
- Existing custom-wave parser diagnostics remain: the opaque palette is retained
  correctly but the generic parser cannot name that effect. That separate display
  limitation is not a startup-recovery failure.
