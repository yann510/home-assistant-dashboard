# Home AI verification

Status: implementation under final review; production deployment and cloud/iPhone acceptance remain pending.

## Environment and preserved configuration

Read-only discovery on September 27, 2026 confirmed Home Assistant Core 2026.9.3 on the existing Raspberry Pi 4 host. House Moods was idle without errors at the last pre-deployment check. No OpenAI integration was configured at the last check.

Existing Assist pipelines are Home Assistant (preferred) and Home Assistant Cloud. The latter uses English-Canada cloud speech. Global conversation exposure includes 58 entities; the new assistant uses its own LLM API rather than changing that exposure.

The existing production configuration passed `ha core check`. Private backup: `/share/voice-assistant-20260927`, containing `configuration.yaml`, pipeline and exposure snapshots, and a SHA-256 manifest. The directory is private and outside the served web directory. Snapshot files are not committed.

## Automated evidence

- Existing backend baseline: 164 tests ran successfully, including one optional skip.
- Task 1: 16 real-HA action tests cover result validation, repeated calls, completion-window overlap, timeout, caller cancellation, stale events, sensor removal, and shutdown. Independent review findings were fixed and re-reviewed.
- Task 2: 3 scoped API tests verify registration, fixed tool arguments, context propagation, failure propagation, shared action, and shutdown. Independent review passed; its exposure-test limitation was covered by Task 3's real entity registry.
- Task 3: 7 official OpenAI conversation tests use mocked provider streams. They verify action success/errors, uncertain dispatch, actual entity-exposure isolation, follow-ups, new-conversation isolation, provider timeout, and hostile tool arguments. These do not prove real model adherence to instructions or actual web retrieval.
- Latest complete HA-suite run before the additional uncertainty transport test: 80 tests passed. The final integration run will be recorded after whole-change review.
- No live OpenAI calls or API charges were incurred by these automated tests. Expected custom-integration warnings and the intentionally mocked provider timeout are not live failures.

## Production and iPhone acceptance

| Check | Status |
| --- | --- |
| New component installed and loaded | Pending final review and deployment |
| Existing pipelines and exposure preserved | Baseline captured; post-deployment comparison pending |
| Official OpenAI integration authenticated | Pending private API-key entry |
| Home AI configured with only Chill API and local intent routing off | Pending OpenAI integration |
| English STT/TTS and chosen voice | Pending configuration; no voice claimed as selected |
| General question, follow-up, and current-information search | Pending live cloud trial |
| iPhone tap-to-talk and spoken replies | Pending user-side trial |
| Real Chill lighting/music and repeated request | Pending coordinated iPhone trial; no mood started for automated tests |
| Phone transcription/playback failure behavior | Pending controlled phone checks |
| Response timing and API usage | Not measured; cloud pipeline has not run |

## Rollback

Follow [setup.md](setup.md). Remove only the feature-created Home AI pipeline and unused feature-created OpenAI configuration through supported UI. Remove the `chill_assist` YAML entry and component, validate configuration, and restart when House Moods is stable. Preserve House Moods, its helpers, existing assistants, and current entity exposure. Restore only affected files from the private backup when appropriate; do not overwrite `.storage` snapshots or subsequent user changes.
