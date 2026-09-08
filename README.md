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

## Speaker motion following

The speaker card's **Follow me** switch enables motion following without immediately grouping any speakers. Motion in the bathroom, bedroom, or gym joins only that room to the saved original Sonos speaker. It works with any playing audio source, without playlist, queue-size, or content-type restrictions. A paused source can be armed; rooms join once it is playing. Rooms stay grouped until Follow me is turned off.

Switching it off disables motion following and unjoins the followers, leaving playback on the original speaker. The original speaker and enabled state are stored in Home Assistant, so following works with the dashboard closed and survives dashboard reloads. Playback controls target only the actual group. Failed cleanup retains the original source and offers **Retry ungrouping**; it cannot be overwritten by re-enabling the switch.

Commands use the dashboard's authenticated Home Assistant WebSocket connection. The queued Home Assistant script serializes enable, motion joins, and disable, and re-checks the enabled state before each join. Service errors are shown with their actual message. Sonos device timeouts during motion appear in that room automation's trace; another room's motion does not request the failing speaker.

Install the backend before deploying the dashboard, using Node.js 24 and the existing `.env` credentials:

```sh
node scripts/configure-speaker-follow.mjs
```

The installer backs up the current configuration under `backups.local/`, creates `input_boolean.speaker_follow_motion` and `input_text.speaker_follow_source`, installs `script.speaker_follow_motion`, and replaces these existing automations using [speaker-follow.json](home-assistant/speaker-follow.json):

- `automation.group_sonos_on_spotify_play_with_movement`
- `automation.group_gym_sonos_speaker_if_music_is_playing_in_living_room`
- `automation.group_bedroom_sonos_speaker_if_music_is_playing_in_living_room`

The three automations remain enabled but only act while **Follow me** is on. Their existing room sensors are preserved. There is no living-room motion mapping in this configuration; Living Room can be the original source. The separate TV-triggered ungrouping automation remains in place.

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
