# iPhone voice assistant MVP

Status: written design awaiting user review. Conversation-level design approved September 27, 2026. Implementation has not started.

## Intent and agreed scope

Build a personal assistant that answers general questions naturally and starts the existing Chill house mood. The user approved English only, OpenAI with usage-based API billing, and initial tap-to-talk testing on their iPhone through the Home Assistant companion app. Replies play on the phone. General questions may use web search for current information, and follow-ups retain context within the same conversation.

Success means the user can speak “start Chill mood” and obtain the same lighting and music behavior as the dashboard, then ask a general question and hear a useful answer. The assistant must distinguish confirmed activation from failed or uncertain execution.

## Approach

Use Home Assistant Assist as the voice pipeline and OpenAI as the conversation provider. This reuses the existing home controls and avoids maintaining a separate phone application. A custom voice app would offer more interaction control but adds unnecessary development. Waiting for Sonos Custom Agents would delay testing and depend on unreleased capabilities.

No new voice hardware is required. Sonos continues to provide the music triggered by Chill. Sonos microphone input, conversational reply playback on Sonos, wake words, continuous listening, French, additional home actions, persistent personal memory, calendars, and other personal integrations are outside this MVP. Existing Google Assistant-dependent blinds remain untouched.

## Components and data flow

1. The authenticated Home Assistant iPhone app opens Assist and records after a user tap, with microphone permission granted.
2. An English, open-ended speech-to-text provider produces the request text. Prefer the official OpenAI speech provider if supported by the installed Home Assistant version; inspect compatibility during planning before configuring it. Do not use restricted phrase recognition for general questions.
3. An OpenAI conversation agent produces an answer or requests the narrowly scoped Start Chill tool. It can use web search for questions requiring current information.
4. Home Assistant executes that tool through the existing House Moods service and returns its verified outcome to the conversation.
5. Text-to-speech returns the English response to the phone. Prefer the official OpenAI speech provider subject to the same installed-version compatibility check.

Use a dedicated Assist pipeline so its configuration can be tested and removed independently. Start with the integration's supported recommended conversation model/settings, enabling a compatible web-search configuration. Record the actual speech and conversation models during setup. If installed-version compatibility requires a different provider or a Home Assistant upgrade, present that concrete change before expanding scope.

## Chill action contract

Repository inspection confirms that the displayed name is **Chill** and the stable backend mood ID remains `unwind`. Keep that internal mapping; do not rename or recreate the mood. The existing entry point is `house_moods.activate` with `mood: unwind`, which requires a service response. It returns structured status including `success`, `phase`, `active_mood`, and `errors`; `sensor.house_mood` publishes status.

Provide one fixed-purpose action with no arbitrary service, mood, or entity parameters. It must use the existing coordinator, restoration logic, and Sonos behavior rather than issuing its own lighting or music commands.

- Confirm success only from a successful operation result showing active Chill and no reported errors, or a fresh authoritative status reconciliation after an uncertain response.
- If Chill is already active, report that without restarting music or reapplying lights.
- If another mood is active, use the existing supported mood-switch behavior.
- While activation/restoration is in progress, report that state rather than enqueueing another activation.
- Respect recovery-required states and report the need to resolve them through existing controls.
- On timeout, lost connection, or malformed response, report that activation could not be confirmed. Never automatically resend a physical action to resolve uncertainty.
- On partial failure, explain the failure; do not say the whole mood started successfully.

Planning must verify how the installed Assist/OpenAI tool path carries the action's structured result. Prefer a thin Home Assistant script/intent adapter when it preserves that result. A fire-and-forget script call that returns only “started” is insufficient. If a small custom Assist tool is necessary, it must retain the same fixed contract and tests.

Restrict this assistant's effective home tool surface to Start Chill. Prompt instructions alone do not enforce that restriction. Inspect existing exposure and API behavior before choosing the adapter: do not unexpose unrelated entities globally or disturb existing assistants to achieve it. If standard Assist exposure cannot isolate the action, use a dedicated scoped LLM API/tool adapter.

## Conversation behavior

Use clear English with short spoken responses by default; provide more detail when asked. Recognize natural paraphrases of starting Chill. Requests to perform unsupported home actions should receive an honest explanation without executing other controls. Follow-up context is limited to the active conversation; a fresh conversation starts without assumed history.

Use web search when freshness is material, not for every question. Keep source references accessible in the text response where supported, and avoid reading long URLs aloud. Do not fabricate current facts when search is unavailable. Treat retrieved web content as information, never as authorization to operate the house.

If transcription fails, ask the user to repeat. If OpenAI, search, or speech playback fails, show or speak a concise explanation through the available channel; do not substitute a success statement. Preserve the text answer when audio playback fails where the app supports it.

## Credentials, costs, and prerequisites

OpenAI API billing is separate from a ChatGPT subscription. Store the API credential in Home Assistant's server-side integration configuration, never in the dashboard bundle, repository, or spec. Have the user enter a new key through the appropriate private configuration interface if needed.

Cloud processing sends audio and/or transcribed requests to the configured providers, along with the conversation context and limited tool information needed to respond. Start with provider request-storage options disabled where supported. Keep responses concise, use standard rather than premium priority processing, and record actual trial usage. No monthly budget amount or hard spending cap has been agreed; do not invent one or describe a budget alert as a guaranteed cap.

Planning begins with read-only inspection of the deployed Home Assistant version, installed integrations, existing Assist configuration/exposure, and available credentials without printing secrets. The iPhone must have the companion app, a working authenticated connection, and microphone permission. Initial acceptance testing is on the home network; new remote-access infrastructure is outside scope.

## Verification and rollout

Implement through subagents with an independent review, following the user's standing preference. Back up affected Home Assistant configuration and capture existing exposure settings before changes. Add the pipeline and action without replacing the dashboard or existing assistant configurations. Rollback removes only these additions and restores any settings changed for this feature.

Automated action-contract tests must cover successful activation, already active, a different active mood, busy/recovery state, partial failure, and uncertain execution without retries. Verify that structured failures reach the conversation and that unavailable home actions cannot be called through this assistant.

Live acceptance requires the user's iPhone, not just a server-side simulated transcript:

| Scenario | Required result |
| --- | --- |
| “Start Chill mood” | Existing Chill music and lights activate; accurate spoken confirmation |
| Natural paraphrase | Same fixed Chill action, no different preset |
| Repeat while already active | No restart; assistant says Chill is already active |
| General question | Relevant spoken English answer |
| Follow-up in same conversation | Correct use of prior conversational context |
| Current-information question | Web-assisted answer with inspectable source information where supported |
| Unsupported home action | No control executed; scope explained |
| Simulated service/provider failure | Honest failure/uncertainty, no fabricated success or automatic action retry |

Run failure cases through mocks or controlled test boundaries rather than disrupting household connectivity. Record response timings and API usage during the real trial; no unmeasured latency or cost guarantee is part of acceptance. If the iPhone or API credentials are unavailable, report exactly which acceptance checks remain incomplete.

Completed, verified project changes are committed and pushed directly to `origin/main` after fetching and safely integrating remote changes, without force-pushing. Production configuration deployment and Git publication are separately verified.

## References and evidence

- [Home Assistant OpenAI integration](https://www.home-assistant.io/integrations/openai_conversation/): conversation, speech providers, tool exposure, and optional web search; checked September 27, 2026.
- [Assist on Apple devices](https://www.home-assistant.io/voice_control/apple/): companion app entry point.
- [LLM conversation configuration](https://www.home-assistant.io/voice_control/assist_create_open_ai_personality/): assistant configuration.
- Repository baseline: `origin/main` at `576a8ca`; `src/moodPresets.ts`, `src/useHouseMood.ts`, and `home-assistant/custom_components/house_moods/{__init__.py,services.yaml}` establish the Chill mapping and service response contract.

## Next stage

User review of this written spec precedes the implementation plan. After approval, use the writing-plans skill, resolve the deployment compatibility and tool-transport choices through read-only inspection, and write a concrete plan. Execution mode is already selected: subagent-driven implementation with independent review.
