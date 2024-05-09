// this is an auto generated file, do not change this manually

import { ServiceFunction, ServiceFunctionTypes } from "@hakit/core";
declare module "@hakit/core" {
  export interface CustomSupportedServices<
    T extends ServiceFunctionTypes = "target",
  > {
    persistentNotification: {
      // Shows a notification on the **Notifications** panel.
      create: ServiceFunction<
        T,
        {
          // Message body of the notification. @example Please check your configuration.yaml.
          message: string;
          // Optional title of the notification. @example Test notification
          title?: string;
          // ID of the notification. This new notification will overwrite an existing notification with the same ID. @example 1234
          notification_id?: string;
        }
      >;
      // Removes a notification from the **Notifications** panel.
      dismiss: ServiceFunction<
        T,
        {
          // ID of the notification to be removed. @example 1234
          notification_id: string;
        }
      >;
      // Removes all notifications from the **Notifications** panel.
      dismissAll: ServiceFunction<T, object>;
    };
    homeassistant: {
      // Saves the persistent states immediately. Maintains the normal periodic saving interval.
      savePersistentStates: ServiceFunction<T, object>;
      // Generic service to turn devices off under any domain.
      turnOff: ServiceFunction<T, object>;
      // Generic service to turn devices on under any domain.
      turnOn: ServiceFunction<T, object>;
      // Generic service to toggle devices on/off under any domain.
      toggle: ServiceFunction<T, object>;
      // Stops Home Assistant.
      stop: ServiceFunction<T, object>;
      // Restarts Home Assistant.
      restart: ServiceFunction<T, object>;
      // Checks the Home Assistant YAML-configuration files for errors. Errors will be shown in the Home Assistant logs.
      checkConfig: ServiceFunction<T, object>;
      // Forces one or more entities to update its data.
      updateEntity: ServiceFunction<T, object>;
      // Reloads the core configuration from the YAML-configuration.
      reloadCoreConfig: ServiceFunction<T, object>;
      // Updates the Home Assistant location.
      setLocation: ServiceFunction<
        T,
        {
          // Latitude of your location. @example 32.87336
          latitude: number;
          // Longitude of your location. @example 117.22743
          longitude: number;
          // Elevation of your location. @example 120
          elevation?: number;
        }
      >;
      // Reloads Jinja2 templates found in the `custom_templates` folder in your config. New values will be applied on the next render of the template.
      reloadCustomTemplates: ServiceFunction<T, object>;
      // Reloads the specified config entry.
      reloadConfigEntry: ServiceFunction<
        T,
        {
          // The configuration entry ID of the entry to be reloaded. @example 8955375327824e14ba89e4b29cc3ec9a
          entry_id?: string;
        }
      >;
      // Reload all YAML configuration that can be reloaded without restarting Home Assistant.
      reloadAll: ServiceFunction<T, object>;
    };
    systemLog: {
      // Clears all log entries.
      clear: ServiceFunction<T, object>;
      // Write log entry.
      write: ServiceFunction<
        T,
        {
          // Message to log. @example Something went wrong
          message: string;
          // Log level.
          level?: "debug" | "info" | "warning" | "error" | "critical";
          // Logger name under which to log the message. Defaults to `system_log.external`. @example mycomponent.myplatform
          logger?: string;
        }
      >;
    };
    logger: {
      // Sets the default log level for integrations.
      setDefaultLevel: ServiceFunction<
        T,
        {
          // Default severity level for all integrations.
          level?: "debug" | "info" | "warning" | "error" | "fatal" | "critical";
        }
      >;
      // Sets the log level for one or more integrations.
      setLevel: ServiceFunction<T, object>;
    };
    person: {
      // Reloads persons from the YAML-configuration.
      reload: ServiceFunction<T, object>;
    };
    frontend: {
      // Sets the default theme Home Assistant uses. Can be overridden by a user.
      setTheme: ServiceFunction<
        T,
        {
          // Name of a theme. @example default
          name: object;
          // Theme mode.
          mode?: "dark" | "light";
        }
      >;
      // Reloads themes from the YAML-configuration.
      reloadThemes: ServiceFunction<T, object>;
    };
    recorder: {
      // Starts purge task - to clean up old data from your database.
      purge: ServiceFunction<
        T,
        {
          // Number of days to keep the data in the database. Starting today, counting backward. A value of `7` means that everything older than a week will be purged.
          keep_days?: number;
          // Attempt to save disk space by rewriting the entire database file.
          repack?: boolean;
          // Applys `entity_id` and `event_type` filters in addition to time-based purge.
          apply_filter?: boolean;
        }
      >;
      // Starts a purge task to remove the data related to specific entities from your database.
      purgeEntities: ServiceFunction<
        T,
        {
          // List of domains for which the data needs to be removed from the recorder database. @example sun
          domains?: object;
          // List of glob patterns used to select the entities for which the data is to be removed from the recorder database. @example domain*.object_id*
          entity_globs?: object;
          // Number of days to keep the data for rows matching the filter. Starting today, counting backward. A value of `7` means that everything older than a week will be purged. The default of 0 days will remove all matching rows immediately.
          keep_days?: number;
        }
      >;
      // Starts the recording of events and state changes.
      enable: ServiceFunction<T, object>;
      // Stops the recording of events and state changes.
      disable: ServiceFunction<T, object>;
    };
    hassio: {
      // Starts an add-on.
      addonStart: ServiceFunction<
        T,
        {
          // The add-on slug. @example core_ssh
          addon: object;
        }
      >;
      // Stops an add-on.
      addonStop: ServiceFunction<
        T,
        {
          // The add-on slug. @example core_ssh
          addon: object;
        }
      >;
      // Restarts an add-on.
      addonRestart: ServiceFunction<
        T,
        {
          // The add-on slug. @example core_ssh
          addon: object;
        }
      >;
      // Updates an add-on. This service should be used with caution since add-on updates can contain breaking changes. It is highly recommended that you review release notes/change logs before updating an add-on.
      addonUpdate: ServiceFunction<
        T,
        {
          // The add-on slug. @example core_ssh
          addon: object;
        }
      >;
      // Writes data to add-on stdin.
      addonStdin: ServiceFunction<
        T,
        {
          // The add-on slug. @example core_ssh
          addon: object;
        }
      >;
      // Powers off the host system.
      hostShutdown: ServiceFunction<T, object>;
      // Reboots the host system.
      hostReboot: ServiceFunction<T, object>;
      // Creates a full backup.
      backupFull: ServiceFunction<
        T,
        {
          // Optional (default = current date and time). @example Backup 1
          name?: string;
          // Password to protect the backup with. @example password
          password?: string;
          // Compresses the backup files.
          compressed?: boolean;
          // Name of a backup network storage to host backups. @example my_backup_mount
          location?: object;
        }
      >;
      // Creates a partial backup.
      backupPartial: ServiceFunction<
        T,
        {
          // Includes Home Assistant settings in the backup.
          homeassistant?: boolean;
          // List of add-ons to include in the backup. Use the name slug of the add-on. @example core_ssh,core_samba,core_mosquitto
          addons?: object;
          // List of directories to include in the backup. @example homeassistant,share
          folders?: object;
          // Optional (default = current date and time). @example Partial backup 1
          name?: string;
          // Password to protect the backup with. @example password
          password?: string;
          // Compresses the backup files.
          compressed?: boolean;
          // Name of a backup network storage to host backups. @example my_backup_mount
          location?: object;
        }
      >;
      // Restores from full backup.
      restoreFull: ServiceFunction<
        T,
        {
          // Slug of backup to restore from.
          slug: string;
          // Optional password. @example password
          password?: string;
        }
      >;
      // Restores from a partial backup.
      restorePartial: ServiceFunction<
        T,
        {
          // Slug of backup to restore from.
          slug: string;
          // Restores Home Assistant.
          homeassistant?: boolean;
          // List of directories to include in the backup. @example homeassistant,share
          folders?: object;
          // List of add-ons to include in the backup. Use the name slug of the add-on. @example core_ssh,core_samba,core_mosquitto
          addons?: object;
          // Optional password. @example password
          password?: string;
        }
      >;
    };
    cloud: {
      // Makes the instance UI accessible from outside of the local network by using Home Assistant Cloud.
      remoteConnect: ServiceFunction<T, object>;
      // Disconnects the Home Assistant UI from the Home Assistant Cloud. You will no longer be able to access your Home Assistant instance from outside your local network.
      remoteDisconnect: ServiceFunction<T, object>;
    };
    tts: {
      // Speaks something using text-to-speech on a media player.
      speak: ServiceFunction<
        T,
        {
          // Media players to play the message.
          media_player_entity_id: string;
          // The text you want to convert into speech so that you can listen to it on your device. @example My name is hanna
          message: string;
          // Stores this message locally so that when the text is requested again, the output can be produced more quickly.
          cache?: boolean;
          // Language to use for speech generation. @example ru
          language?: string;
          // A dictionary containing integration-specific options. @example platform specific
          options?: object;
        }
      >;
      // Removes all cached text-to-speech files and purges the memory.
      clearCache: ServiceFunction<T, object>;
      // Say something using text-to-speech on a media player with cloud.
      cloudSay: ServiceFunction<
        T,
        {
          // undefined
          entity_id: string;
          // undefined @example My name is hanna
          message: string;
          // undefined
          cache?: boolean;
          // undefined @example ru
          language?: string;
          // undefined @example platform specific
          options?: object;
        }
      >;
    };
    update: {
      // Installs an update for this device or service.
      install: ServiceFunction<
        T,
        {
          // The version to install. If omitted, the latest version will be installed. @example 1.0.0
          version?: string;
          // If supported by the integration, this creates a backup before starting the update .
          backup?: boolean;
        }
      >;
      // Marks currently available update as skipped.
      skip: ServiceFunction<T, object>;
      // Removes the skipped version marker from an update.
      clearSkipped: ServiceFunction<T, object>;
    };
    localtuya: {
      // Reload localtuya and reconnect to all devices.
      reload: ServiceFunction<T, object>;
      // Change the value of a datapoint (DP)
      setDp: ServiceFunction<
        T,
        {
          // Device ID of device to change datapoint value for @example 11100118278aab4de001
          device_id?: object;
          // Datapoint index @example 1
          dp?: object;
          // New value to set
          value?: object;
        }
      >;
    };
    conversation: {
      // Launches a conversation from a transcribed text.
      process: ServiceFunction<
        T,
        {
          // Transcribed text input. @example Turn all lights on
          text: string;
          // Language of text. Defaults to server language. @example NL
          language?: string;
          // Conversation agent to process your request. The conversation agent is the brains of your assistant. It processes the incoming text commands. @example homeassistant
          agent_id?: object;
        }
      >;
      // Reloads the intent configuration.
      reload: ServiceFunction<
        T,
        {
          // Language to clear cached intents for. Defaults to server language. @example NL
          language?: string;
          // Conversation agent to reload. @example homeassistant
          agent_id?: object;
        }
      >;
    };
    logbook: {
      // Creates a custom entry in the logbook.
      log: ServiceFunction<
        T,
        {
          // Custom name for an entity, can be referenced using an `entity_id`. @example Kitchen
          name: string;
          // Message of the logbook entry. @example is being used
          message: string;
          // Entity to reference in the logbook entry.
          entity_id?: string;
          // Determines which icon is used in the logbook entry. The icon illustrates the integration domain related to this logbook entry. @example light
          domain?: string;
        }
      >;
    };
    schedule: {
      // Reloads schedules from the YAML-configuration.
      reload: ServiceFunction<T, object>;
    };
    timer: {
      // Reloads timers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Starts a timer.
      start: ServiceFunction<
        T,
        {
          // Duration the timer requires to finish. [optional]. @example 00:01:00 or 60
          duration?: string;
        }
      >;
      // Pauses a timer.
      pause: ServiceFunction<T, object>;
      // Cancels a timer.
      cancel: ServiceFunction<T, object>;
      // Finishes a timer.
      finish: ServiceFunction<T, object>;
      // Changes a timer.
      change: ServiceFunction<
        T,
        {
          // Duration to add or subtract to the running timer. @example 00:01:00, 60 or -60
          duration: string;
        }
      >;
    };
    inputButton: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Mimics the physical button press on the device.
      press: ServiceFunction<T, object>;
    };
    inputSelect: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Selects the first option.
      selectFirst: ServiceFunction<T, object>;
      // Selects the last option.
      selectLast: ServiceFunction<T, object>;
      // Select the next option.
      selectNext: ServiceFunction<
        T,
        {
          // If the option should cycle from the last to the first option on the list.
          cycle?: boolean;
        }
      >;
      // Selects an option.
      selectOption: ServiceFunction<
        T,
        {
          // Option to be selected. @example 'Item A'
          option: string;
        }
      >;
      // Selects the previous option.
      selectPrevious: ServiceFunction<
        T,
        {
          // If the option should cycle from the last to the first option on the list.
          cycle?: boolean;
        }
      >;
      // Sets the options.
      setOptions: ServiceFunction<
        T,
        {
          // List of options. @example ['Item A', 'Item B', 'Item C']
          options: object;
        }
      >;
    };
    inputNumber: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Sets the value.
      setValue: ServiceFunction<
        T,
        {
          // The target value.
          value: number;
        }
      >;
      // Increments the value by 1 step.
      increment: ServiceFunction<T, object>;
      // Decrements the current value by 1 step.
      decrement: ServiceFunction<T, object>;
    };
    inputBoolean: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Turns on the helper.
      turnOn: ServiceFunction<T, object>;
      // Turns off the helper.
      turnOff: ServiceFunction<T, object>;
      // Toggles the helper on/off.
      toggle: ServiceFunction<T, object>;
    };
    scene: {
      // Reloads the scenes from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Activates a scene with configuration.
      apply: ServiceFunction<
        T,
        {
          // List of entities and their target state. @example light.kitchen: 'on' light.ceiling:   state: 'on'   brightness: 80
          entities: object;
          // Time it takes the devices to transition into the states defined in the scene.
          transition?: number;
        }
      >;
      // Creates a new scene.
      create: ServiceFunction<
        T,
        {
          // The entity ID of the new scene. @example all_lights
          scene_id: string;
          // List of entities and their target state. If your entities are already in the target state right now, use `snapshot_entities` instead. @example light.tv_back_light: 'on' light.ceiling:   state: 'on'   brightness: 200
          entities?: object;
          // List of entities to be included in the snapshot. By taking a snapshot, you record the current state of those entities. If you do not want to use the current state of all your entities for this scene, you can combine the `snapshot_entities` with `entities`. @example - light.ceiling - light.kitchen
          snapshot_entities?: object;
        }
      >;
      // Activates a scene.
      turnOn: ServiceFunction<
        T,
        {
          // Time it takes the devices to transition into the states defined in the scene.
          transition?: number;
        }
      >;
    };
    counter: {
      // Increments a counter.
      increment: ServiceFunction<T, object>;
      // Decrements a counter.
      decrement: ServiceFunction<T, object>;
      // Resets a counter.
      reset: ServiceFunction<T, object>;
      // Sets the counter value.
      setValue: ServiceFunction<
        T,
        {
          // The new counter value the entity should be set to.
          value: number;
        }
      >;
      //
      configure: ServiceFunction<T, object>;
    };
    inputDatetime: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Sets the date and/or time.
      setDatetime: ServiceFunction<
        T,
        {
          // The target date. @example '2019-04-20'
          date?: string;
          // The target time. @example '05:04:20'
          time?: object;
          // The target date & time. @example '2019-04-20 05:04:20'
          datetime?: string;
          // The target date & time, expressed by a UNIX timestamp.
          timestamp?: number;
        }
      >;
    };
    inputText: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<T, object>;
      // Sets the value.
      setValue: ServiceFunction<
        T,
        {
          // The target value. @example This is an example text
          value: string;
        }
      >;
    };
    ffmpeg: {
      // Sends a start command to a ffmpeg based sensor.
      start: ServiceFunction<
        T,
        {
          // Name of entity that will start. Platform dependent.
          entity_id?: string;
        }
      >;
      // Sends a stop command to a ffmpeg based sensor.
      stop: ServiceFunction<
        T,
        {
          // Name of entity that will stop. Platform dependent.
          entity_id?: string;
        }
      >;
      // Sends a restart command to a ffmpeg based sensor.
      restart: ServiceFunction<
        T,
        {
          // Name of entity that will restart. Platform dependent.
          entity_id?: string;
        }
      >;
    };
    zone: {
      // Reloads zones from the YAML-configuration.
      reload: ServiceFunction<T, object>;
    };
    pythonScript: {
      //
      toggleLightsBasedOnMotion: ServiceFunction<T, object>;
      //
      addSpeakerToGroup: ServiceFunction<T, object>;
      // Reloads all available Python scripts.
      reload: ServiceFunction<T, object>;
    };
    script: {
      //
      stopTheLivingRoomBlinds: ServiceFunction<T, object>;
      //
      closeOpenBedroomBlindsBasedOnTemperature: ServiceFunction<T, object>;
      //
      setRandomDeskStripColor: ServiceFunction<T, object>;
      // Reloads all the available scripts.
      reload: ServiceFunction<T, object>;
      // Runs the sequence of actions defined in a script.
      turnOn: ServiceFunction<T, object>;
      // Stops a running script.
      turnOff: ServiceFunction<T, object>;
      // Toggle a script. Starts it, if isn't running, stops it otherwise.
      toggle: ServiceFunction<T, object>;
    };
    automation: {
      // Triggers the actions of an automation.
      trigger: ServiceFunction<
        T,
        {
          // Defines whether or not the conditions will be skipped.
          skip_condition?: boolean;
        }
      >;
      // Toggles (enable / disable) an automation.
      toggle: ServiceFunction<T, object>;
      // Enables an automation.
      turnOn: ServiceFunction<T, object>;
      // Disables an automation.
      turnOff: ServiceFunction<
        T,
        {
          // Stops currently running actions.
          stop_actions?: boolean;
        }
      >;
      // Reloads the automation configuration.
      reload: ServiceFunction<T, object>;
    };
    mediaPlayer: {
      // Turns on the power of the media player.
      turnOn: ServiceFunction<T, object>;
      // Turns off the power of the media player.
      turnOff: ServiceFunction<T, object>;
      // Toggles a media player on/off.
      toggle: ServiceFunction<T, object>;
      // Turns up the volume.
      volumeUp: ServiceFunction<T, object>;
      // Turns down the volume.
      volumeDown: ServiceFunction<T, object>;
      // Toggles play/pause.
      mediaPlayPause: ServiceFunction<T, object>;
      // Starts playing.
      mediaPlay: ServiceFunction<T, object>;
      // Pauses.
      mediaPause: ServiceFunction<T, object>;
      // Stops playing.
      mediaStop: ServiceFunction<T, object>;
      // Selects the next track.
      mediaNextTrack: ServiceFunction<T, object>;
      // Selects the previous track.
      mediaPreviousTrack: ServiceFunction<T, object>;
      // Clears the playlist.
      clearPlaylist: ServiceFunction<T, object>;
      // Sets the volume level.
      volumeSet: ServiceFunction<
        T,
        {
          // The volume. 0 is inaudible, 1 is the maximum volume.
          volume_level: number;
        }
      >;
      // Mutes or unmutes the media player.
      volumeMute: ServiceFunction<
        T,
        {
          // Defines whether or not it is muted.
          is_volume_muted: boolean;
        }
      >;
      // Allows you to go to a different part of the media that is currently playing.
      mediaSeek: ServiceFunction<
        T,
        {
          // Target position in the currently playing media. The format is platform dependent.
          seek_position: number;
        }
      >;
      // Groups media players together for synchronous playback. Only works on supported multiroom audio systems.
      join: ServiceFunction<
        T,
        {
          // The players which will be synced with the playback specified in `target`. @example - media_player.multiroom_player2 - media_player.multiroom_player3
          group_members: string[];
        }
      >;
      // Sends the media player the command to change input source.
      selectSource: ServiceFunction<
        T,
        {
          // Name of the source to switch to. Platform dependent. @example video1
          source: string;
        }
      >;
      // Selects a specific sound mode.
      selectSoundMode: ServiceFunction<
        T,
        {
          // Name of the sound mode to switch to. @example Music
          sound_mode?: string;
        }
      >;
      // Starts playing specified media.
      playMedia: ServiceFunction<
        T,
        {
          // The ID of the content to play. Platform dependent. @example https://home-assistant.io/images/cast/splash.png
          media_content_id: string;
          // The type of the content to play. Such as image, music, tv show, video, episode, channel, or playlist. @example music
          media_content_type: string;
          // If the content should be played now or be added to the queue.
          enqueue?: "play" | "next" | "add" | "replace";
          // If the media should be played as an announcement. @example true
          announce?: boolean;
        }
      >;
      // Playback mode that selects the media in randomized order.
      shuffleSet: ServiceFunction<
        T,
        {
          // Whether or not shuffle mode is enabled.
          shuffle: boolean;
        }
      >;
      // Removes the player from a group. Only works on platforms which support player groups.
      unjoin: ServiceFunction<T, object>;
      // Playback mode that plays the media in a loop.
      repeatSet: ServiceFunction<
        T,
        {
          // Repeat mode to set.
          repeat: "off" | "all" | "one";
        }
      >;
    };
    remote: {
      // Turns the device off.
      turnOff: ServiceFunction<T, object>;
      // Sends the power on command.
      turnOn: ServiceFunction<
        T,
        {
          // Activity ID or activity name to be started. @example BedroomTV
          activity?: string;
        }
      >;
      // Toggles a device on/off.
      toggle: ServiceFunction<T, object>;
      // Sends a command or a list of commands to a device.
      sendCommand: ServiceFunction<
        T,
        {
          // Device ID to send command to. @example 32756745
          device?: string;
          // A single command or a list of commands to send. @example Play
          command: object;
          // The number of times you want to repeat the commands.
          num_repeats?: number;
          // The time you want to wait in between repeated commands.
          delay_secs?: number;
          // The time you want to have it held before the release is send.
          hold_secs?: number;
        }
      >;
      // Learns a command or a list of commands from a device.
      learnCommand: ServiceFunction<
        T,
        {
          // Device ID to learn command from. @example television
          device?: string;
          // A single command or a list of commands to learn. @example Turn on
          command?: object;
          // The type of command to be learned.
          command_type?: "ir" | "rf";
          // If code must be stored as an alternative. This is useful for discrete codes. Discrete codes are used for toggles that only perform one function. For example, a code to only turn a device on. If it is on already, sending the code won't change the state.
          alternative?: boolean;
          // Timeout for the command to be learned.
          timeout?: number;
        }
      >;
      // Deletes a command or a list of commands from the database.
      deleteCommand: ServiceFunction<
        T,
        {
          // Device from which commands will be deleted. @example television
          device?: string;
          // The single command or the list of commands to be deleted. @example Mute
          command: object;
        }
      >;
    };
    light: {
      // Turn on one or more lights and adjust properties of the light, even when they are turned on already.
      turnOn: ServiceFunction<
        T,
        {
          // Duration it takes to get to next state.
          transition?: number;
          // The color in RGB format. A list of three integers between 0 and 255 representing the values of red, green, and blue.
          rgb_color?: [number, number, number];
          // The color in RGBW format. A list of four integers between 0 and 255 representing the values of red, green, blue, and white. @example [255, 100, 100, 50]
          rgbw_color?: [number, number, number, number];
          // The color in RGBWW format. A list of five integers between 0 and 255 representing the values of red, green, blue, cold white, and warm white. @example [255, 100, 100, 50, 70]
          rgbww_color?: [number, number, number, number, number];
          // A human-readable color name.
          color_name?:
            | "homeassistant"
            | "aliceblue"
            | "antiquewhite"
            | "aqua"
            | "aquamarine"
            | "azure"
            | "beige"
            | "bisque"
            | "blanchedalmond"
            | "blue"
            | "blueviolet"
            | "brown"
            | "burlywood"
            | "cadetblue"
            | "chartreuse"
            | "chocolate"
            | "coral"
            | "cornflowerblue"
            | "cornsilk"
            | "crimson"
            | "cyan"
            | "darkblue"
            | "darkcyan"
            | "darkgoldenrod"
            | "darkgray"
            | "darkgreen"
            | "darkgrey"
            | "darkkhaki"
            | "darkmagenta"
            | "darkolivegreen"
            | "darkorange"
            | "darkorchid"
            | "darkred"
            | "darksalmon"
            | "darkseagreen"
            | "darkslateblue"
            | "darkslategray"
            | "darkslategrey"
            | "darkturquoise"
            | "darkviolet"
            | "deeppink"
            | "deepskyblue"
            | "dimgray"
            | "dimgrey"
            | "dodgerblue"
            | "firebrick"
            | "floralwhite"
            | "forestgreen"
            | "fuchsia"
            | "gainsboro"
            | "ghostwhite"
            | "gold"
            | "goldenrod"
            | "gray"
            | "green"
            | "greenyellow"
            | "grey"
            | "honeydew"
            | "hotpink"
            | "indianred"
            | "indigo"
            | "ivory"
            | "khaki"
            | "lavender"
            | "lavenderblush"
            | "lawngreen"
            | "lemonchiffon"
            | "lightblue"
            | "lightcoral"
            | "lightcyan"
            | "lightgoldenrodyellow"
            | "lightgray"
            | "lightgreen"
            | "lightgrey"
            | "lightpink"
            | "lightsalmon"
            | "lightseagreen"
            | "lightskyblue"
            | "lightslategray"
            | "lightslategrey"
            | "lightsteelblue"
            | "lightyellow"
            | "lime"
            | "limegreen"
            | "linen"
            | "magenta"
            | "maroon"
            | "mediumaquamarine"
            | "mediumblue"
            | "mediumorchid"
            | "mediumpurple"
            | "mediumseagreen"
            | "mediumslateblue"
            | "mediumspringgreen"
            | "mediumturquoise"
            | "mediumvioletred"
            | "midnightblue"
            | "mintcream"
            | "mistyrose"
            | "moccasin"
            | "navajowhite"
            | "navy"
            | "navyblue"
            | "oldlace"
            | "olive"
            | "olivedrab"
            | "orange"
            | "orangered"
            | "orchid"
            | "palegoldenrod"
            | "palegreen"
            | "paleturquoise"
            | "palevioletred"
            | "papayawhip"
            | "peachpuff"
            | "peru"
            | "pink"
            | "plum"
            | "powderblue"
            | "purple"
            | "red"
            | "rosybrown"
            | "royalblue"
            | "saddlebrown"
            | "salmon"
            | "sandybrown"
            | "seagreen"
            | "seashell"
            | "sienna"
            | "silver"
            | "skyblue"
            | "slateblue"
            | "slategray"
            | "slategrey"
            | "snow"
            | "springgreen"
            | "steelblue"
            | "tan"
            | "teal"
            | "thistle"
            | "tomato"
            | "turquoise"
            | "violet"
            | "wheat"
            | "white"
            | "whitesmoke"
            | "yellow"
            | "yellowgreen";
          // Color in hue/sat format. A list of two integers. Hue is 0-360 and Sat is 0-100. @example [300, 70]
          hs_color?: [number, number];
          // Color in XY-format. A list of two decimal numbers between 0 and 1. @example [0.52, 0.43]
          xy_color?: object;
          // Color temperature in mireds.
          color_temp?: object;
          // Color temperature in Kelvin.
          kelvin?: number;
          // Number indicating brightness, where 0 turns the light off, 1 is the minimum brightness, and 255 is the maximum brightness.
          brightness?: number;
          // Number indicating the percentage of full brightness, where 0 turns the light off, 1 is the minimum brightness, and 100 is the maximum brightness.
          brightness_pct?: number;
          // Change brightness by an amount.
          brightness_step?: number;
          // Change brightness by a percentage.
          brightness_step_pct?: number;
          // Set the light to white mode.
          white?: object;
          // Name of a light profile to use. @example relax
          profile?: string;
          // Tell light to flash, can be either value short or long.
          flash?: "long" | "short";
          // Light effect.
          effect?: string;
        }
      >;
      // Turn off one or more lights.
      turnOff: ServiceFunction<
        T,
        {
          // Duration it takes to get to next state.
          transition?: number;
          // Tell light to flash, can be either value short or long.
          flash?: "long" | "short";
        }
      >;
      // Toggles one or more lights, from on to off, or, off to on, based on their current state.
      toggle: ServiceFunction<
        T,
        {
          // Duration it takes to get to next state.
          transition?: number;
          // The color in RGB format. A list of three integers between 0 and 255 representing the values of red, green, and blue. @example [255, 100, 100]
          rgb_color?: [number, number, number];
          // A human-readable color name.
          color_name?:
            | "homeassistant"
            | "aliceblue"
            | "antiquewhite"
            | "aqua"
            | "aquamarine"
            | "azure"
            | "beige"
            | "bisque"
            | "blanchedalmond"
            | "blue"
            | "blueviolet"
            | "brown"
            | "burlywood"
            | "cadetblue"
            | "chartreuse"
            | "chocolate"
            | "coral"
            | "cornflowerblue"
            | "cornsilk"
            | "crimson"
            | "cyan"
            | "darkblue"
            | "darkcyan"
            | "darkgoldenrod"
            | "darkgray"
            | "darkgreen"
            | "darkgrey"
            | "darkkhaki"
            | "darkmagenta"
            | "darkolivegreen"
            | "darkorange"
            | "darkorchid"
            | "darkred"
            | "darksalmon"
            | "darkseagreen"
            | "darkslateblue"
            | "darkslategray"
            | "darkslategrey"
            | "darkturquoise"
            | "darkviolet"
            | "deeppink"
            | "deepskyblue"
            | "dimgray"
            | "dimgrey"
            | "dodgerblue"
            | "firebrick"
            | "floralwhite"
            | "forestgreen"
            | "fuchsia"
            | "gainsboro"
            | "ghostwhite"
            | "gold"
            | "goldenrod"
            | "gray"
            | "green"
            | "greenyellow"
            | "grey"
            | "honeydew"
            | "hotpink"
            | "indianred"
            | "indigo"
            | "ivory"
            | "khaki"
            | "lavender"
            | "lavenderblush"
            | "lawngreen"
            | "lemonchiffon"
            | "lightblue"
            | "lightcoral"
            | "lightcyan"
            | "lightgoldenrodyellow"
            | "lightgray"
            | "lightgreen"
            | "lightgrey"
            | "lightpink"
            | "lightsalmon"
            | "lightseagreen"
            | "lightskyblue"
            | "lightslategray"
            | "lightslategrey"
            | "lightsteelblue"
            | "lightyellow"
            | "lime"
            | "limegreen"
            | "linen"
            | "magenta"
            | "maroon"
            | "mediumaquamarine"
            | "mediumblue"
            | "mediumorchid"
            | "mediumpurple"
            | "mediumseagreen"
            | "mediumslateblue"
            | "mediumspringgreen"
            | "mediumturquoise"
            | "mediumvioletred"
            | "midnightblue"
            | "mintcream"
            | "mistyrose"
            | "moccasin"
            | "navajowhite"
            | "navy"
            | "navyblue"
            | "oldlace"
            | "olive"
            | "olivedrab"
            | "orange"
            | "orangered"
            | "orchid"
            | "palegoldenrod"
            | "palegreen"
            | "paleturquoise"
            | "palevioletred"
            | "papayawhip"
            | "peachpuff"
            | "peru"
            | "pink"
            | "plum"
            | "powderblue"
            | "purple"
            | "red"
            | "rosybrown"
            | "royalblue"
            | "saddlebrown"
            | "salmon"
            | "sandybrown"
            | "seagreen"
            | "seashell"
            | "sienna"
            | "silver"
            | "skyblue"
            | "slateblue"
            | "slategray"
            | "slategrey"
            | "snow"
            | "springgreen"
            | "steelblue"
            | "tan"
            | "teal"
            | "thistle"
            | "tomato"
            | "turquoise"
            | "violet"
            | "wheat"
            | "white"
            | "whitesmoke"
            | "yellow"
            | "yellowgreen";
          // Color in hue/sat format. A list of two integers. Hue is 0-360 and Sat is 0-100. @example [300, 70]
          hs_color?: [number, number];
          // Color in XY-format. A list of two decimal numbers between 0 and 1. @example [0.52, 0.43]
          xy_color?: object;
          // Color temperature in mireds.
          color_temp?: object;
          // Color temperature in Kelvin.
          kelvin?: number;
          // Number indicating brightness, where 0 turns the light off, 1 is the minimum brightness, and 255 is the maximum brightness.
          brightness?: number;
          // Number indicating the percentage of full brightness, where 0 turns the light off, 1 is the minimum brightness, and 100 is the maximum brightness.
          brightness_pct?: number;
          // Set the light to white mode.
          white?: object;
          // Name of a light profile to use. @example relax
          profile?: string;
          // Tell light to flash, can be either value short or long.
          flash?: "long" | "short";
          // Light effect.
          effect?: string;
        }
      >;
    };
    weather: {
      // Get weather forecast.
      getForecast: ServiceFunction<
        T,
        {
          // Forecast type: daily, hourly or twice daily.
          type: "daily" | "hourly" | "twice_daily";
        }
      >;
    };
    utilityMeter: {
      // Resets all counters of a utility meter.
      reset: ServiceFunction<T, object>;
    };
    switch: {
      // Turns a switch off.
      turnOff: ServiceFunction<T, object>;
      // Turns a switch on.
      turnOn: ServiceFunction<T, object>;
      // Toggles a switch on/off.
      toggle: ServiceFunction<T, object>;
    };
    vacuum: {
      // Starts a new cleaning task.
      turnOn: ServiceFunction<T, object>;
      // Stops the current cleaning task and returns to its dock.
      turnOff: ServiceFunction<T, object>;
      //
      toggle: ServiceFunction<T, object>;
      // Starts, pauses, or resumes the cleaning task.
      startPause: ServiceFunction<T, object>;
      // Starts or resumes the cleaning task.
      start: ServiceFunction<T, object>;
      // Pauses the cleaning task.
      pause: ServiceFunction<T, object>;
      // Tells the vacuum cleaner to return to its dock.
      returnToBase: ServiceFunction<T, object>;
      // Tells the vacuum cleaner to do a spot clean-up.
      cleanSpot: ServiceFunction<T, object>;
      // Locates the vacuum cleaner robot.
      locate: ServiceFunction<T, object>;
      // Stops the current cleaning task.
      stop: ServiceFunction<T, object>;
      // Sets the fan speed of the vacuum cleaner.
      setFanSpeed: ServiceFunction<
        T,
        {
          // Fan speed. The value depends on the integration. Some integrations have speed steps, like 'medium'. Some use a percentage, between 0 and 100. @example low
          fan_speed: string;
        }
      >;
      // Sends a command to the vacuum cleaner.
      sendCommand: ServiceFunction<
        T,
        {
          // Command to execute. The commands are integration-specific. @example set_dnd_timer
          command: string;
          // Parameters for the command. The parameters are integration-specific. @example { 'key': 'value' }
          params?: object;
        }
      >;
    };
    samsungtvSmart: {
      // Send to samsung TV the command to change picture mode.
      selectPictureMode: ServiceFunction<
        T,
        {
          // Name of the target entity @example media_player.tv
          entity_id: string;
          // Name of the picture mode to switch to. Possible options can be found in the picture_mode_list state attribute. @example Standard
          picture_mode: string;
        }
      >;
      // Send to samsung TV the command to set art mode.
      setArtMode: ServiceFunction<
        T,
        {
          // Name of the target entity @example media_player.tv
          entity_id: string;
        }
      >;
    };
    notify: {
      // Sends a notification that is visible in the **Notifications** panel.
      persistentNotification: ServiceFunction<
        T,
        {
          // Message body of the notification. @example The garage door has been open for 10 minutes.
          message: string;
          // Title of the notification. @example Your Garage Door Friend
          title?: string;
          // Some integrations provide extended functionality. For information on how to use _data_, refer to the integration documentation.. @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the google_assistant_sdk service.
      googleAssistantSdk: ServiceFunction<
        T,
        {
          // undefined @example The garage door has been open for 10 minutes.
          message: string;
          // undefined @example Your Garage Door Friend
          title?: string;
          // undefined @example platform specific
          target?: object;
          // undefined @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_pixel_6 integration.
      mobileAppPixel6: ServiceFunction<
        T,
        {
          // undefined @example The garage door has been open for 10 minutes.
          message: string;
          // undefined @example Your Garage Door Friend
          title?: string;
          // undefined @example platform specific
          target?: object;
          // undefined @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_fire_hd_10_tablet integration.
      mobileAppFireHd10Tablet: ServiceFunction<
        T,
        {
          // undefined @example The garage door has been open for 10 minutes.
          message: string;
          // undefined @example Your Garage Door Friend
          title?: string;
          // undefined @example platform specific
          target?: object;
          // undefined @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_pixel_7a integration.
      mobileAppPixel7A: ServiceFunction<
        T,
        {
          // undefined @example The garage door has been open for 10 minutes.
          message: string;
          // undefined @example Your Garage Door Friend
          title?: string;
          // undefined @example platform specific
          target?: object;
          // undefined @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the notify service.
      notify: ServiceFunction<
        T,
        {
          // undefined @example The garage door has been open for 10 minutes.
          message: string;
          // undefined @example Your Garage Door Friend
          title?: string;
          // undefined @example platform specific
          target?: object;
          // undefined @example platform specific
          data?: object;
        }
      >;
    };
    deviceTracker: {
      // Records a seen tracked device.
      see: ServiceFunction<
        T,
        {
          // MAC address of the device. @example FF:FF:FF:FF:FF:FF
          mac?: string;
          // ID of the device (find the ID in `known_devices.yaml`). @example phonedave
          dev_id?: string;
          // Hostname of the device. @example Dave
          host_name?: string;
          // Name of the location where the device is located. The options are: `home`, `not_home`, or the name of the zone. @example home
          location_name?: string;
          // GPS coordinates where the device is located, specified by latitude and longitude (for example: [51.513845, -0.100539]). @example [51.509802, -0.086692]
          gps?: object;
          // Accuracy of the GPS coordinates.
          gps_accuracy?: number;
          // Battery level of the device.
          battery?: number;
        }
      >;
    };
    hue: {
      // Activates a Hue scene with more control over the options.
      activateScene: ServiceFunction<
        T,
        {
          // Transition duration it takes to bring devices to the state defined in the scene.
          transition?: number;
          // Enable dynamic mode of the scene.
          dynamic?: boolean;
          // Speed of dynamic palette for this scene.
          speed?: number;
          // Set brightness for the scene.
          brightness?: number;
        }
      >;
      // Activates a hue scene stored in the hue hub.
      hueActivateScene: ServiceFunction<
        T,
        {
          // Name of hue group/room from the hue app. @example Living Room
          group_name?: string;
          // Name of hue scene from the hue app. @example Energize
          scene_name?: string;
          // Enable dynamic mode of the scene (V2 bridges and supported scenes only).
          dynamic?: boolean;
        }
      >;
    };
    googleAssistantSdk: {
      // Sends a command as a text query to Google Assistant.
      sendTextCommand: ServiceFunction<
        T,
        {
          // Command(s) to send to Google Assistant. @example turn off kitchen TV
          command?: string;
          // Name(s) of media player entities to play response on. @example media_player.living_room_speaker
          media_player?: string;
        }
      >;
    };
    fan: {
      // Turns fan on.
      turnOn: ServiceFunction<
        T,
        {
          // Speed of the fan.
          percentage?: number;
          // Preset mode. @example auto
          preset_mode?: string;
        }
      >;
      // Turns fan off.
      turnOff: ServiceFunction<T, object>;
      // Toggles the fan on/off.
      toggle: ServiceFunction<T, object>;
      // Increases the speed of the fan.
      increaseSpeed: ServiceFunction<
        T,
        {
          // Increases the speed by a percentage step.
          percentage_step?: number;
        }
      >;
      // Decreases the speed of the fan.
      decreaseSpeed: ServiceFunction<
        T,
        {
          // Decreases the speed by a percentage step.
          percentage_step?: number;
        }
      >;
      // Controls oscillatation of the fan.
      oscillate: ServiceFunction<
        T,
        {
          // Turn on/off oscillation.
          oscillating: boolean;
        }
      >;
      // Sets the fan rotation direction.
      setDirection: ServiceFunction<
        T,
        {
          // Direction to rotate.
          direction: "forward" | "reverse";
        }
      >;
      // Sets the fan speed.
      setPercentage: ServiceFunction<
        T,
        {
          // Speed of the fan.
          percentage: number;
        }
      >;
      // Sets preset mode.
      setPresetMode: ServiceFunction<
        T,
        {
          // Preset mode. @example auto
          preset_mode: string;
        }
      >;
    };
    climate: {
      // Turns climate device on.
      turnOn: ServiceFunction<T, object>;
      // Turns climate device off.
      turnOff: ServiceFunction<T, object>;
      // Sets HVAC operation mode.
      setHvacMode: ServiceFunction<
        T,
        {
          // HVAC operation mode.
          hvac_mode?:
            | "off"
            | "auto"
            | "cool"
            | "dry"
            | "fan_only"
            | "heat_cool"
            | "heat";
        }
      >;
      // Sets preset mode.
      setPresetMode: ServiceFunction<
        T,
        {
          // Preset mode. @example away
          preset_mode: string;
        }
      >;
      // Turns auxiliary heater on/off.
      setAuxHeat: ServiceFunction<
        T,
        {
          // New value of auxiliary heater.
          aux_heat: boolean;
        }
      >;
      // Sets target temperature.
      setTemperature: ServiceFunction<
        T,
        {
          // Target temperature.
          temperature?: number;
          // High target temperature.
          target_temp_high?: number;
          // Low target temperature.
          target_temp_low?: number;
          // HVAC operation mode.
          hvac_mode?:
            | "off"
            | "auto"
            | "cool"
            | "dry"
            | "fan_only"
            | "heat_cool"
            | "heat";
        }
      >;
      // Sets target humidity.
      setHumidity: ServiceFunction<
        T,
        {
          // Target humidity.
          humidity: number;
        }
      >;
      // Sets fan operation mode.
      setFanMode: ServiceFunction<
        T,
        {
          // Fan operation mode. @example low
          fan_mode: string;
        }
      >;
      // Sets swing operation mode.
      setSwingMode: ServiceFunction<
        T,
        {
          // Swing operation mode. @example horizontal
          swing_mode: string;
        }
      >;
    };
    lock: {
      // Unlocks a lock.
      unlock: ServiceFunction<
        T,
        {
          // Code used to unlock the lock. @example 1234
          code?: string;
        }
      >;
      // Locks a lock.
      lock: ServiceFunction<
        T,
        {
          // Code used to lock the lock. @example 1234
          code?: string;
        }
      >;
      // Opens a lock.
      open: ServiceFunction<
        T,
        {
          // Code used to open the lock. @example 1234
          code?: string;
        }
      >;
    };
    cover: {
      // Opens a cover.
      openCover: ServiceFunction<T, object>;
      // Closes a cover.
      closeCover: ServiceFunction<T, object>;
      // Moves a cover to a specific position.
      setCoverPosition: ServiceFunction<
        T,
        {
          // Target position.
          position: number;
        }
      >;
      // Stops the cover movement.
      stopCover: ServiceFunction<T, object>;
      // Toggles a cover open/closed.
      toggle: ServiceFunction<T, object>;
      // Tilts a cover open.
      openCoverTilt: ServiceFunction<T, object>;
      // Tilts a cover to close.
      closeCoverTilt: ServiceFunction<T, object>;
      // Stops a tilting cover movement.
      stopCoverTilt: ServiceFunction<T, object>;
      // Moves a cover tilt to a specific position.
      setCoverTiltPosition: ServiceFunction<
        T,
        {
          // Target tilt positition.
          tilt_position: number;
        }
      >;
      // Toggles a cover tilt open/closed.
      toggleCoverTilt: ServiceFunction<T, object>;
    };
    camera: {
      // Enables the motion detection.
      enableMotionDetection: ServiceFunction<T, object>;
      // Disables the motion detection.
      disableMotionDetection: ServiceFunction<T, object>;
      // Turns off the camera.
      turnOff: ServiceFunction<T, object>;
      // Turns on the camera.
      turnOn: ServiceFunction<T, object>;
      // Takes a snapshot from a camera.
      snapshot: ServiceFunction<
        T,
        {
          // Template of a filename. Variable available is `entity_id`. @example /tmp/snapshot_{{ entity_id.name }}.jpg
          filename: string;
        }
      >;
      // Plays the camera stream on a supported media player.
      playStream: ServiceFunction<
        T,
        {
          // Media players to stream to.
          media_player: string;
          // Stream format supported by the media player.
          format?: "hls";
        }
      >;
      // Creates a recording of a live camera feed.
      record: ServiceFunction<
        T,
        {
          // Template of a filename. Variable available is `entity_id`. Must be mp4. @example /tmp/snapshot_{{ entity_id.name }}.mp4
          filename: string;
          // Planned duration of the recording. The actual duration may vary.
          duration?: number;
          // Planned lookback period to include in the recording (in addition to the duration). Only available if there is currently an active HLS stream. The actual length of the lookback period may vary.
          lookback?: number;
        }
      >;
    };
    cast: {
      // Shows a dashboard view on a Chromecast device.
      showLovelaceView: ServiceFunction<
        T,
        {
          // Media player entity to show the dashboard view on.
          entity_id: string;
          // The URL path of the dashboard to show. @example lovelace-cast
          dashboard_path: string;
          // The path of the dashboard view to show. @example downstairs
          view_path?: string;
        }
      >;
    };
    number: {
      // Sets the value of a number.
      setValue: ServiceFunction<
        T,
        {
          // The target value to set. @example 42
          value?: string;
        }
      >;
    };
    sonos: {
      // Takes a snapshot of the media player.
      snapshot: ServiceFunction<
        T,
        {
          // Name of entity that will be snapshot.
          entity_id?: string;
          // True or False. Also snapshot the group layout.
          with_group?: boolean;
        }
      >;
      // Restores a snapshot of the media player.
      restore: ServiceFunction<
        T,
        {
          // Name of entity that will be restored.
          entity_id?: string;
          // True or False. Also restore the group layout.
          with_group?: boolean;
        }
      >;
      // Sets a Sonos timer.
      setSleepTimer: ServiceFunction<
        T,
        {
          // Number of seconds to set the timer.
          sleep_time?: number;
        }
      >;
      // Clears a Sonos timer.
      clearSleepTimer: ServiceFunction<T, object>;
      // Updates an alarm with new time and volume settings.
      updateAlarm: ServiceFunction<
        T,
        {
          // ID for the alarm to be updated.
          alarm_id: number;
          // Set time for the alarm. @example 07:00
          time?: object;
          // Set alarm volume level.
          volume?: number;
          // Enable or disable the alarm.
          enabled?: boolean;
          // Enable or disable including grouped rooms.
          include_linked_zones?: boolean;
        }
      >;
      // Start playing the queue from the first item.
      playQueue: ServiceFunction<
        T,
        {
          // Position of the song in the queue to start playing from.
          queue_position?: number;
        }
      >;
      // Removes an item from the queue.
      removeFromQueue: ServiceFunction<
        T,
        {
          // Position in the queue to remove.
          queue_position?: number;
        }
      >;
    };
    button: {
      // Press the button entity.
      press: ServiceFunction<T, object>;
    };
  }
  export interface CustomEntityNameContainer {
    names:
      | "person.yann_thibodeau"
      | "binary_sensor.remote_ui"
      | "update.home_assistant_supervisor_update"
      | "update.home_assistant_core_update"
      | "update.advanced_ssh_web_terminal_update"
      | "update.log_viewer_update"
      | "update.nginx_home_assistant_ssl_proxy_update"
      | "update.nginx_proxy_manager_update"
      | "update.mariadb_update"
      | "update.hakit_update"
      | "update.home_assistant_operating_system_update"
      | "sun.sun"
      | "input_text.motion_front_door_off_time"
      | "input_text.motion_kitchen_off_time"
      | "input_text.motion_office_off_time"
      | "input_text.motion_living_room_off_time"
      | "input_text.motion_gym_off_time"
      | "input_text.motion_toilet_off_time"
      | "input_text.motion_bedroom_off_time"
      | "input_text.motion_bedroom_closet_off_time"
      | "zone.work"
      | "scene.late_night_tv"
      | "zone.home"
      | "automation.start_roomba_when_at_work"
      | "automation.close_bedroom_blind_when_too_hot"
      | "automation.drop_temperature_when_at_work"
      | "automation.increase_temperature_when_leaving_work"
      | "automation.close_all_the_lights_when_leaving_home"
      | "automation.play_music_set_lights_brightness_to_100_and_open_the_blinds_when_alarm_goes_off"
      | "automation.dim_lights_to_25_at_10pm"
      | "automation.group_sonos_on_spotify_play_with_movement"
      | "automation.group_gym_sonos_speaker_if_music_is_playing_in_living_room"
      | "automation.group_bedroom_sonos_speaker_if_music_is_playing_in_living_room"
      | "automation.ungroup_all_speakers_from_living_room_when_tv_is_turned_on"
      | "automation.test_kitchen_light_boom"
      | "automation.toggle_front_door_lights"
      | "automation.toggle_gym_light_on_motion"
      | "automation.toggle_bedroom_light_on_motion"
      | "automation.toggle_bedroom_closet_light"
      | "automation.toggle_office_light_on_motion"
      | "automation.toggle_toilet_light_on_motion"
      | "automation.turn_off_bedroom_charging_lamp_when_phone_is_above_80"
      | "automation.turn_on_bedroom_charging_lamp_when_phone_is_bellow_60"
      | "script.stop_the_living_room_blinds"
      | "script.close_open_bedroom_blinds_based_on_temperature"
      | "script.set_random_desk_strip_color"
      | "sensor.hilo_energy_total_medium_cost"
      | "sensor.sun_next_dawn"
      | "sensor.sun_next_dusk"
      | "sensor.sun_next_midnight"
      | "sensor.sun_next_noon"
      | "sensor.sun_next_rising"
      | "sensor.sun_next_setting"
      | "sensor.mfc_j425w_status"
      | "sensor.mfc_j425w_page_counter"
      | "sensor.mfc_j425w_black_ink_remaining"
      | "sensor.mfc_j425w_cyan_ink_remaining"
      | "sensor.mfc_j425w_magenta_ink_remaining"
      | "sensor.mfc_j425w_yellow_ink_remaining"
      | "binary_sensor.rpi_power_status"
      | "sensor.brother_mfc_j425w_black_ink_cartridge"
      | "sensor.brother_mfc_j425w_cyan_ink_cartridge"
      | "sensor.brother_mfc_j425w_magenta_ink_cartridge"
      | "sensor.brother_mfc_j425w_yellow_ink_cartridge"
      | "sensor.brother_mfc_j425w"
      | "remote.samsung_q60_series_85"
      | "media_player.tv_3"
      | "light.office_bulbs"
      | "light.light_toilet"
      | "light.light_laundry_room"
      | "light.light_front_door"
      | "light.light_bedroom"
      | "light.light_kitchen"
      | "light.living_room_led_strip"
      | "light.light_living_room_bulbs"
      | "light.desk_led_strip"
      | "weather.forecast_home"
      | "tts.google_en_com"
      | "media_player.tv_2"
      | "remote.tv"
      | "binary_sensor.hue_motion_sensor_1_motion_2"
      | "binary_sensor.hue_motion_sensor_2_motion"
      | "binary_sensor.hue_motion_sensor_1_motion"
      | "binary_sensor.hue_motion_sensor_1_motion_3"
      | "sensor.hue_motion_sensor_2_temperature"
      | "sensor.hue_motion_sensor_1_temperature_3"
      | "sensor.hue_motion_sensor_1_temperature_2"
      | "sensor.hue_motion_sensor_1_temperature"
      | "sensor.hue_motion_sensor_1_illuminance"
      | "sensor.hue_motion_sensor_2_illuminance"
      | "sensor.hue_motion_sensor_1_illuminance_2"
      | "sensor.hue_motion_sensor_1_illuminance_3"
      | "sensor.hue_motion_sensor_1_battery"
      | "sensor.hue_motion_sensor_2_battery"
      | "sensor.hue_motion_sensor_1_battery_3"
      | "sensor.hue_motion_sensor_1_battery_2"
      | "sensor.roomba_battery_level"
      | "binary_sensor.roomba_bin_full"
      | "switch.hue_motion_sensor_1_motion_2"
      | "switch.hue_motion_sensor_2_motion"
      | "switch.hue_motion_sensor_1_motion"
      | "switch.hue_motion_sensor_1_motion_3"
      | "switch.hue_motion_sensor_1_illuminance"
      | "switch.hue_motion_sensor_2_illuminance"
      | "switch.hue_motion_sensor_1_illuminance_2"
      | "switch.hue_motion_sensor_1_illuminance_3"
      | "vacuum.roomba"
      | "sensor.broadlink_rm4_remote_control_ir_rf_temperature"
      | "sensor.broadlink_rm4_remote_control_ir_rf_humidity"
      | "remote.broadlink_rm4_remote_control_ir_rf"
      | "binary_sensor.coda_4680_fiz_wan_status"
      | "sensor.coda_4680_fiz_external_ip"
      | "sensor.coda_4680_fiz_kib_s_received"
      | "sensor.coda_4680_fiz_kib_s_sent"
      | "sensor.hacs"
      | "sensor.pixel_6_battery_level"
      | "sensor.pixel_6_battery_state"
      | "sensor.pixel_6_charger_type"
      | "sensor.pixel_6_next_alarm"
      | "sensor.fire_hd_10_tablet_battery_level"
      | "sensor.fire_hd_10_tablet_battery_state"
      | "sensor.fire_hd_10_tablet_charger_type"
      | "sensor.pixel_7a_battery_level"
      | "sensor.pixel_7a_battery_state"
      | "sensor.pixel_7a_charger_type"
      | "sensor.pixel_7a_next_alarm"
      | "device_tracker.pixel_6"
      | "device_tracker.fire_hd_10_tablet"
      | "device_tracker.pixel_7a"
      | "switch.samsung_q60_series_85"
      | "switch.dryer"
      | "switch.washer"
      | "sensor.samsung_q60_series_85_volume"
      | "sensor.samsung_q60_series_85_media_input_source"
      | "sensor.samsung_q60_series_85_media_playback_status"
      | "sensor.samsung_q60_series_85_tv_channel"
      | "sensor.samsung_q60_series_85_tv_channel_name"
      | "sensor.samsung_q60_series_85_energy_meter"
      | "sensor.samsung_q60_series_85_power_meter"
      | "sensor.dryer_dryer_machine_state"
      | "sensor.dryer_dryer_job_state"
      | "sensor.dryer_dryer_completion_time"
      | "sensor.dryer_energy"
      | "sensor.dryer_power"
      | "sensor.dryer_deltaenergy"
      | "sensor.dryer_powerenergy"
      | "sensor.dryer_energysaved"
      | "sensor.dryer_energy_meter"
      | "sensor.dryer_power_meter"
      | "sensor.range_oven_mode"
      | "sensor.range_oven_machine_state"
      | "sensor.range_oven_job_state"
      | "sensor.range_oven_completion_time"
      | "sensor.range_oven_set_point"
      | "sensor.range_temperature_measurement"
      | "sensor.washer_energy"
      | "sensor.washer_power"
      | "sensor.washer_deltaenergy"
      | "sensor.washer_powerenergy"
      | "sensor.washer_energysaved"
      | "sensor.washer_washer_machine_state"
      | "sensor.washer_washer_job_state"
      | "sensor.washer_washer_completion_time"
      | "sensor.washer_energy_meter"
      | "sensor.washer_power_meter"
      | "media_player.spotify_yann_luche_thibodeau"
      | "media_player.samsung_q60_series_85"
      | "camera.camera_front_door"
      | "media_player.tv_samsung_q60_series_85"
      | "sensor.smart_series_8000_d151_time"
      | "sensor.smart_series_8000_d151_sector"
      | "sensor.smart_series_8000_d151_number_of_sectors"
      | "sensor.smart_series_8000_d151_toothbrush_state"
      | "sensor.smart_series_8000_d151_pressure"
      | "sensor.smart_series_8000_d151_mode"
      | "sensor.smart_series_8000_d151_battery"
      | "media_player.tv"
      | "media_player.bedroom_speaker"
      | "binary_sensor.gym_microphone"
      | "media_player.gym"
      | "number.gym_bass"
      | "number.gym_balance"
      | "number.gym_treble"
      | "switch.gym_crossfade"
      | "switch.gym_loudness"
      | "binary_sensor.bedroom_microphone"
      | "media_player.bedroom"
      | "sensor.aqara_fp2_presence_motion_sensor_light_sensor_light_level"
      | "number.bedroom_bass"
      | "number.bedroom_balance"
      | "number.bedroom_treble"
      | "switch.bedroom_crossfade"
      | "switch.bedroom_loudness"
      | "button.aqara_fp2_presence_motion_sensor_identify"
      | "sensor.aqara_fp2_bathroom_light_sensor_light_level"
      | "button.aqara_fp2_bathroom_identify"
      | "binary_sensor.aqara_fp2_bathroom_presence_sensor_1"
      | "binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_1"
      | "media_player.bathroom"
      | "binary_sensor.bathroom_microphone"
      | "binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_2"
      | "binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_3"
      | "number.bathroom_bass"
      | "number.bathroom_balance"
      | "number.bathroom_treble"
      | "switch.bathroom_crossfade"
      | "switch.bathroom_loudness"
      | "sensor.living_room_audio_input_format"
      | "binary_sensor.living_room_microphone"
      | "media_player.living_room"
      | "number.living_room_audio_delay"
      | "number.living_room_bass"
      | "number.living_room_balance"
      | "number.living_room_treble"
      | "number.living_room_surround_level"
      | "number.living_room_music_surround_level"
      | "switch.living_room_crossfade"
      | "switch.living_room_loudness"
      | "switch.living_room_surround_music_full_volume"
      | "switch.living_room_night_sound"
      | "switch.living_room_speech_enhancement"
      | "switch.living_room_surround_enabled"
      | "sensor.hilo_energy_total_low_cost"
      | "sensor.meter00_power"
      | "sensor.thermostat_office_temperature"
      | "sensor.thermostat_office_power"
      | "sensor.thermostat_gym_temperature"
      | "sensor.thermostat_gym_power"
      | "sensor.thermostat_bedroom_temperature"
      | "sensor.thermostat_bedroom_power"
      | "sensor.defi_hilo"
      | "sensor.recompenses_hilo"
      | "sensor.notifications_hilo"
      | "sensor.hilo_gateway"
      | "climate.thermostat_office"
      | "climate.thermostat_gym"
      | "climate.thermostat_bedroom"
      | "script.set_random_light_color"
      | "switch.switch_bedroom_lamp"
      | "sensor.switch_bedroom_lamp_power"
      | "switch.switch_office"
      | "sensor.switch_office_power"
      | "light.bedroom_closet"
      | "sensor.bedroom_closet_power"
      | "light.gym"
      | "sensor.gym_power"
      | "sensor.thermostat_office_target_temperature"
      | "sensor.thermostat_gym_target_temperature"
      | "sensor.thermostat_bedroom_target_temperature"
      | "device_tracker.ekster_2e71"
      | "sensor.ekster_2e71_estimated_distance"
      | "sensor.outdoor_weather_hilo";
  }
}
