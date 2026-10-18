## Prerequisites
Node version manager - [NVM](https://github.com/nvm-sh/nvm) to easily install and manage node versions

## Local Development
Simply, run `nvm use && npm i && npm run dev` and it will start a local server for you to develop on, it will also watch for changes and reload the page for you. 

## Dependencies

```json
Node.js >=18.0.0
npm >=7.0.0
```

## Building
Run `npm run build` and it will build the files for you, you can then upload them to your home assistant instance using the deploy script mentioned below.

## Spotify playlists and Liked Songs

The speaker card's **Playlists** button opens **Your Spotify playlists**: playlists owned or followed by Yann's configured Spotify account, in the provider's order. Pages load explicitly, the name filter searches loaded playlists, and a failed later page keeps earlier choices available. This replaces the dashboard's Sonos favourites chooser; House Mood presets keep their existing favourites and playback behavior. Liked Songs is managed through the song heart, rather than offered as a playlist to launch.

A playlist tap starts that exact Spotify context through the configured account and a private local relay, then transfers the verified Connect session to the selected Sonos coordinator. A selected follower resolves to its coordinator. The launch preserves the current group, per-room volume and Follow me state/source. The chooser closes only after fresh target/context confirmation; a failed or uncertain launch stays available for an explicit retry. The backend never substitutes a Sonos local queue. Spotify on Yann's phone can control the confirmed session; start and share a Jam inside Spotify.

The separate song heart saves or removes the identified current Spotify track in Yann's **Liked Songs**, including while paused. Filled means confirmed saved; outline means confirmed unsaved. Unknown, unavailable and pending states disable the action; an error retains the last confirmed state. A confirmed save has a small heart pop and sparkles (420 ms); removal softly shrinks and settles (240 ms). Reduced motion updates the state immediately. Saving a track preserves playback, grouping and Follow me, and a late response for an earlier track cannot update the new track's heart.

The account is fixed on the HA backend through `media_player.spotifyplus_yann_luche_thibodeau`; there is no dashboard account selector. Sonos remains responsible for grouping, transport and room volume. Manual grouping keeps the existing handoff from Follow me to manual mode. A manual playlist launch releases affected House Mood playback ownership, so ending that mood cannot stop the manual session; mood lighting ownership remains intact.

### Setup and authorization refresh

The verified runtime uses SpotifyPlus **1.0.224**, `spotifywebapipython` **1.0.296**, and the local **Dashboard Spotify Relay 1.0.0** add-on. The relay reuses an immutable arm64 librespot **0.8.0** image and sends audio only to its private, paced PulseAudio null sink. See the [relay setup and pinned source](home-assistant/addons/dashboard_spotify_relay/README.md) and [compatibility, acceptance and protected backup record](home-assistant/spotify-connect-verification.md) before changing this installation.

Use Node 24 and a protected, ignored environment file containing the existing SSH/HA credentials. Inspection is read-only by default; installation, start and YAML configuration are separate explicit operations:

```sh
node scripts/configure-dashboard-music.mjs --env /protected/setup.env
node scripts/configure-dashboard-music.mjs --env /protected/setup.env --install
node scripts/configure-spotify-relay.mjs --env /protected/setup.env
node scripts/configure-spotify-relay.mjs --env /protected/setup.env --install
node scripts/configure-spotify-relay.mjs --env /protected/setup.env --start /homeassistant/backups.local/dashboard-spotify-relay-TIMESTAMP
node scripts/configure-dashboard-music.mjs --env /protected/setup.env --configure-component media_player.spotifyplus_yann_luche_thibodeau --relay-device VERIFIED_40_CHARACTER_CONNECT_ID
```

These are setup templates, not commands to rerun over the configured installation. The installers refuse uncertain ownership or existing configuration. Copy the reviewed `dashboard_music` component and current `house_moods` integration into HA separately, check configuration, and restart HA as part of the controlled setup. Configure SpotifyPlus OAuth for the canonical account with private/collaborative playlist reads, library read/modify and required playback/profile scopes. Complete its separate [Spotify Desktop authorization](https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki/Device-Configuration-Options#spotify-desktop-player-authentication-configuration) with human consent. Privately bootstrap the relay, verify its exact account/device identity, and set that identity in backend-only `relay_device_id`. Without a configured relay, library and song-save operations remain usable while playlist playback fails closed.

SpotifyPlus's supported SDK handles normal Desktop token refresh; normal refresh, relay restart and HA Core restart recovery have live verification. If authorization is revoked or refresh fails, repeat the appropriate SpotifyPlus/Desktop consent for the same canonical account and verify a fresh account/relay/target/context before accepting playback. Token-file presence alone is insufficient. Relay credential rotation or a merge into SpotifyPlus's separate credential store is a protected setup action that must preserve other account entries. Keep tokens out of source, frontend variables, command arguments, logs and Git. A naturally expired Desktop cache has been observed; its automatic recovery remains a distinct pending acceptance check in the [verification record](home-assistant/spotify-connect-verification.md).

### Release and targeted rollback

Use the existing atomic release tools with a unique timestamped release ID for each publication:

```sh
npm run build:canvas-trial
npm run deploy:canvas-trial -- UNIQUE_RELEASE_ID
npm run build:dashboard
npm run deploy:dashboard -- UNIQUE_RELEASE_ID
npm run rollback:dashboard
```

The release tools stage and verify uploaded file hashes before promotion and retain the previous dashboard for rollback. Complete live acceptance and independent review before production publication; [dated QA](docs/canvas-qa/spotify-connect-2026-10-17.md) distinguishes preview and household evidence from remaining release gates.

Backend rollback is separate from dashboard rollback. Restore only reviewed task-owned runtime files from the recorded runtime backup; use `--rollback-component BACKUP` to remove only the exact unchanged owned YAML stanza. Relay `--rollback BACKUP` removes only its unchanged owned add-on/source and its private account data. SpotifyPlus `--rollback BACKUP` requires an installation ownership record and no configured task entry; the historical pre-fix backups lack that record and require manual review. Remove any task-created HA config entry/application credential individually if abandoning setup. Preserve existing Spotify, Sonos, catalog-read integrations and other accounts; never restore a shared `.storage` snapshot wholesale. Exact protected backup paths and ownership limits are in the [verification record](home-assistant/spotify-connect-verification.md#current-installation-and-protected-recovery-records).

## Speaker motion following

The speaker card's **Follow me** switch enables motion following without immediately grouping any speakers. Motion in the bathroom, bedroom, or gym joins only that room to the saved original Sonos speaker. It works with any playing audio source, without playlist, queue-size, or content-type restrictions. A paused source can be armed; rooms join once it is playing. When a room light turns off, that room leaves the group. The existing light automations determine the absence delay (bathroom: five minutes; bedroom and gym: three minutes), and manually switching off the light also removes its follower. The saved original speaker always keeps playing, including when its own room light turns off.

Switching it off disables motion following and unjoins the followers, leaving playback on the original speaker. The original speaker and enabled state are stored in Home Assistant, so following works with the dashboard closed and survives dashboard reloads. Playback controls target only the actual group. Failed cleanup retains the original source and offers **Retry ungrouping**; it cannot be overwritten by re-enabling the switch.

Commands use the dashboard's authenticated Home Assistant WebSocket connection. The queued Home Assistant script serializes enable, motion joins, light-off departures, and disable. Each departure rechecks that Follow me is enabled, the light is still off, and the room is a follower of the saved original speaker. It never removes the original speaker or a speaker in another group. Active house moods journal departures so automatic following preserves mood ownership and restoration. Service errors are shown with their actual message. Sonos device timeouts during motion appear in that room automation's trace; another room's motion does not request the failing speaker.

Before installing the follow configuration, deploy the updated `home-assistant/custom_components/house_moods/` integration to Home Assistant's `custom_components/house_moods/` directory and restart Home Assistant. Confirm that the `house_moods.follow_leave` service is available: active mood departures use it to preserve group ownership and restoration. Then install the follow configuration before deploying the dashboard, using Node.js 24 and the existing `.env` credentials:

```sh
node scripts/configure-speaker-follow.mjs
```

The installer backs up the current configuration under `backups.local/`, creates `input_boolean.speaker_follow_motion` and `input_text.speaker_follow_source`, installs `script.speaker_follow_motion`, and replaces these existing automations using [speaker-follow.json](home-assistant/speaker-follow.json):

- `automation.group_sonos_on_spotify_play_with_movement`
- `automation.group_gym_sonos_speaker_if_music_is_playing_in_living_room`
- `automation.group_bedroom_sonos_speaker_if_music_is_playing_in_living_room`

The three automations remain enabled but only act while **Follow me** is on. Their existing room sensors are preserved. Each room automation queues motion and light events in order, using `light.light_toilet`, `light.light_bedroom`, and `light.gym` for departures; no separate no-motion timer is added. There is no living-room motion mapping in this configuration; Living Room can be the original source. The separate TV-triggered ungrouping automation remains in place.

## Deploy to Home Assistant via SSH
1. Replace the values in the .env file provided with your `VITE_SSH_USERNAME`, `VITE_SSH_HOSTNAME` and `VITE_SSH_PASSWORD`.
2. To automatically deploy to your home assistant instance, you can run `npm run deploy` after you've retrieved the SSH information specified [here](https://shannonhochkins.github.io/ha-component-kit/?path=/docs/introduction-deploying--docs), NOTE! The script has already been created for you, you just need to run it after you've updated the .env values.
3. The `VITE_FOLDER_NAME` is the folder that will be created on your home assistant instance, this is where the files will be uploaded to.

## Folder name & Vite
The `VITE_FOLDER_NAME` is the folder that will be created on your home assistant instance, this is where the files will be uploaded to. If you change the `VITE_FOLDER_NAME` variable, it will also update the `vite.config.ts` value named `base` to the same value so that when deployed using the deployment script the pathname's are correct.

## Typescript Sync

1. Replace the values in the .env file provided with your own!
2. The `VITE_HA_URL` should be a https url if you want to sync your types successfully.
3. The `VITE_HA_TOKEN` instructions can be found [here](https://shannonhochkins.github.io/ha-component-kit/?path=/docs/introduction-typescriptsync--docs) under the pre-requisites section.

Once you have both the above environment variables set, you can run `npm run sync` and it will create a file for you, you then just have to add it to the tsconfig.json.

## Further documentation
For further documentation, please visit the [documentation website](https://shannonhochkins.github.io/ha-component-kit/) for more information.



# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
