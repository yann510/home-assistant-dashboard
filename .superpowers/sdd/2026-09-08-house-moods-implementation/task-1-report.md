# Task 1 implementation report

Implemented the standalone stdlib native bridge, response-service handlers,
minimal installed-integration patch, baseline hash manifest, and focused tests.
No live HA reads, writes, or MQTT mutations were performed in this task. Root's
fresh supplied `/tmp/lepro-installed-*` source was copied to ignored
`.local/lepro-baseline/`; hashes of all five supplied files are committed.
The original effect fixture was already present and is exercised byte-for-byte.

## Contract

NativeSnapshot exposes version/device_id/captured_at/fields/extra_observed and
JSON-compatible to_dict/from_dict. Capture/replay use one lock per device, a
registered waiter before get publishing, complete fresh getr only, and an overall
transaction timeout. Unsupported modes fail. d50/d60 remain opaque. d30 and all
nonallowlisted evidence cannot be replayed. Replay verifies independent readback
and propagates publication failures. Incremental rpt events feed observers without
being treated as a snapshot. close cancels pending waiters.

Patch setup creates native_state and stores it in entry data, observes rpt/getr
before existing lossy parsing, keeps existing entity code and callback, adds
response-only capture/restore services with configured-target and identity
validation, and closes the bridge on unload. Native publishes directly through
the connected MQTT client, avoiding the installed wrapper's offline queue.

## TDD evidence

1. Initial focused run: 9 FAIL assertions, each explicitly reporting
   `NativeStateBridge implementation is missing` (no syntax/import errors).
2. Bridge implementation: 9 PASS.
3. Service-handler regression: 1 FAIL `Native service handlers are missing`,
   existing 9 PASS. After implementation: 10 PASS.
4. Integration-patch regression: 1 FAIL `Integration patch is missing`, existing
   10 PASS. After patch generation: 11 PASS.
5. Final focused command:
   `python3 -m unittest discover -s home-assistant/tests -p test_native_state.py -v`:
   11 PASS. `git diff --check`: clean.

Patch test applies/reverses against actual installed-source baseline, compiles
patched Python, confirms ingest placement, response registration and existing SE1
customization, and verifies byte-identical restoration of all patched originals.

## Review and deployment limits

Root must request the planned independent review of freshness, opaque preservation,
and exception paths before proceeding. No subagents were spawned by this task.
Home Assistant runtime service registration has not been executed in a live HA
process; only isolated handlers and patched-source checks run here. No physical
capture/replay claim is made. Fixture evidence predates this implementation.

The wire report interface supplies no verified transaction-ID correlation;
freshness is monotonic receive time after a get request. A delayed prior getr
arriving in that interval cannot be distinguished without further protocol proof.
Captured monotonic timestamps are evidence, not UTC timestamps or reusable
freshness assertions after restart. Offline publishes fail instead of queueing.
Snapshots validate and compare every allowlisted captured writable field, stronger
than comparing only the active mode's minimum field set.
