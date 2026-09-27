# Home AI voice setup

Use the existing Home Assistant host and the authenticated iPhone companion app. The display name is **Chill**; its House Mood ID is `unwind`. This setup offers one home action, Start Chill, through the `chill_assist` LLM API. It does not change other assistants or global entity exposure.

## Install the scoped API first

Before selecting `chill_assist` in OpenAI, make a private backup of the live Home Assistant configuration outside `/config/www` and other served directories. Keep the existing `house_moods` component, scripts, speaker helpers, and other integrations intact. Copy **only** this repository's `home-assistant/custom_components/chill_assist/` directory to `/config/custom_components/chill_assist/` on the Home Assistant host. Add this top-level entry once to `/config/configuration.yaml`:

```yaml
chill_assist: {}
```

Run Home Assistant's configuration check (`ha core check` on a supervised host, or the equivalent **Check configuration** control). If it passes, restart Home Assistant at an appropriate time and verify `chill_assist` appears among the available Home Assistant LLM APIs. Do not select it or create the Home AI pipeline before that registration is visible. This installation does not require editing `.storage` or upgrading Home Assistant.

For rollback, remove the new Home AI pipeline and OpenAI subentry if created, remove `chill_assist: {}` from `configuration.yaml`, check configuration, and restart Home Assistant. Then remove only `/config/custom_components/chill_assist/` or restore its private backup if it previously existed. Keep the existing House Moods installation and helpers untouched. Do not edit `.storage` by hand.

## Configure Home AI

1. In Home Assistant, open **Settings → Devices & services → Add Integration → OpenAI**. If the OpenAI integration is already configured, use it. Enter the API key privately in Home Assistant's integration configuration; keep it out of Git, dashboard files, and chat. OpenAI API usage is billed separately from ChatGPT subscriptions. Check usage and charges in the OpenAI platform billing and usage pages during the trial; no monthly cap is assumed.
2. Add a **conversation** subentry named **Home AI**. Select model `gpt-4o-mini`, standard service tier, request storage off, web search on with **small** search context, user-location sharing off, code interpreter off, image generation off, and a **600-token** response ceiling. Enable inline text citations if the integration offers the option. Select **only** `chill_assist` under the Home Assistant LLM APIs; remove the built-in Assist API and any other APIs. Disable recommended-settings mode only where needed to retain these explicit selections. Paste [prompt.txt](prompt.txt) into its instructions field.
3. Add speech-to-text with `gpt-4o-mini-transcribe`. Select English and give transcription vocabulary guidance for the word “Chill”. Add text-to-speech with `gpt-4o-mini-tts` at normal speed (1.0) and an available English voice. Record the voice selected during setup so it can be reproduced.
4. In **Settings → Voice assistants**, create a dedicated Assist pipeline named **Home AI**. Set its conversation agent, speech-to-text, and text-to-speech entities to the OpenAI entities configured above. Set **Prefer local intents** to **off** (`prefer_local_intents: false`), so local intents cannot bypass the scoped API. The preferred pipeline need not change.
5. On the iPhone, sign in to the Home Assistant companion app and allow microphone access. Open **Assist**, select **Home AI**, then tap to speak. Tap again for a follow-up when needed; continuous listening is not promised. Verify in a trial whether URLs in text citations are read aloud, and adjust citation behavior if speech is awkward. Do not assume separate speech and text rendering.

Try “Start Chill” and check that the reply reports success only after the action verifies the `unwind` state. Try a general question and a current-information question. A request to control another device should be declined. If action verification fails or times out, the assistant should say it could not verify success and should not repeat the physical action automatically.
