// this is an auto generated file, do not change this manually

import { ServiceFunction, ServiceFunctionTypes } from '@hakit/core';
declare module '@hakit/core' {
  export interface CustomSupportedServices<T extends ServiceFunctionTypes = 'target'> {
    persistentNotification: {
      // Shows a notification on the notifications panel.
      create: ServiceFunction<
        object,
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
      // Deletes a notification from the notifications panel.
      dismiss: ServiceFunction<
        object,
        T,
        {
          // ID of the notification to be deleted. @example 1234
          notification_id: string;
        }
      >;
      // Deletes all notifications from the notifications panel.
      dismissAll: ServiceFunction<object, T, object>;
    };
    homeassistant: {
      // Saves the persistent states immediately. Maintains the normal periodic saving interval.
      savePersistentStates: ServiceFunction<object, T, object>;
      // Generic action to turn devices off under any domain.
      turnOff: ServiceFunction<object, T, object>;
      // Generic action to turn devices on under any domain.
      turnOn: ServiceFunction<object, T, object>;
      // Generic action to toggle devices on/off under any domain.
      toggle: ServiceFunction<object, T, object>;
      // Stops Home Assistant.
      stop: ServiceFunction<object, T, object>;
      // Restarts Home Assistant.
      restart: ServiceFunction<object, T, object>;
      // Checks the Home Assistant YAML-configuration files for errors. Errors will be shown in the Home Assistant logs.
      checkConfig: ServiceFunction<object, T, object>;
      // Forces one or more entities to update its data.
      updateEntity: ServiceFunction<
        object,
        T,
        {
          // List of entities to force update.
          entity_id: string;
        }
      >;
      // Reloads the core configuration from the YAML-configuration.
      reloadCoreConfig: ServiceFunction<object, T, object>;
      // Updates the Home Assistant location.
      setLocation: ServiceFunction<
        object,
        T,
        {
          // Latitude of your location. @example 32.87336 @constraints  number: mode: box, min: -90, max: 90, step: any
          latitude: number;
          // Longitude of your location. @example 117.22743 @constraints  number: mode: box, min: -180, max: 180, step: any
          longitude: number;
          // Elevation of your location above sea level. @example 120 @constraints  number: mode: box, step: any
          elevation?: number;
        }
      >;
      // Reloads Jinja2 templates found in the `custom_templates` folder in your config. New values will be applied on the next render of the template.
      reloadCustomTemplates: ServiceFunction<object, T, object>;
      // Reloads the specified config entry.
      reloadConfigEntry: ServiceFunction<
        object,
        T,
        {
          // The configuration entry ID of the entry to be reloaded. @example 8955375327824e14ba89e4b29cc3ec9a
          entry_id?: string;
        }
      >;
      // Reload all YAML configuration that can be reloaded without restarting Home Assistant.
      reloadAll: ServiceFunction<object, T, object>;
    };
    systemLog: {
      // Deletes all log entries.
      clear: ServiceFunction<object, T, object>;
      // Write log entry.
      write: ServiceFunction<
        object,
        T,
        {
          // Message to log. @example Something went wrong
          message: string;
          // Log level.
          level?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
          // Logger name under which to log the message. Defaults to `system_log.external`. @example mycomponent.myplatform
          logger?: string;
        }
      >;
    };
    logger: {
      // Sets the default log level for integrations.
      setDefaultLevel: ServiceFunction<
        object,
        T,
        {
          // Default severity level for all integrations.
          level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal' | 'critical';
        }
      >;
      // Sets the log level for one or more integrations.
      setLevel: ServiceFunction<object, T, object>;
    };
    person: {
      // Reloads persons from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
    };
    frontend: {
      // Sets the default theme Home Assistant uses. Can be overridden by a user.
      setTheme: ServiceFunction<
        object,
        T,
        {
          // Name of a theme. @example default
          name: string;
          // Theme mode.
          mode?: 'dark' | 'light';
        }
      >;
      // Reloads themes from the YAML-configuration.
      reloadThemes: ServiceFunction<object, T, object>;
    };
    recorder: {
      // Starts purge task - to clean up old data from your database.
      purge: ServiceFunction<
        object,
        T,
        {
          // Number of days to keep the data in the database. Starting today, counting backward. A value of `7` means that everything older than a week will be purged. @constraints  number: min: 0, max: 365, unit_of_measurement: days
          keep_days?: number;
          // Attempt to save disk space by rewriting the entire database file.
          repack?: boolean;
          // Apply `entity_id` and `event_type` filters in addition to time-based purge.
          apply_filter?: boolean;
        }
      >;
      // Starts a purge task to remove the data related to specific entities from your database.
      purgeEntities: ServiceFunction<
        object,
        T,
        {
          // List of entities for which the data is to be removed from the recorder database.
          entity_id?: string;
          // List of domains for which the data needs to be removed from the recorder database. @example sun
          domains?: object;
          // List of glob patterns used to select the entities for which the data is to be removed from the recorder database. @example domain*.object_id*
          entity_globs?: object;
          // Number of days to keep the data for rows matching the filter. Starting today, counting backward. A value of `7` means that everything older than a week will be purged. The default of 0 days will remove all matching rows immediately. @constraints  number: min: 0, max: 365, unit_of_measurement: days
          keep_days?: number;
        }
      >;
      // Starts the recording of events and state changes.
      enable: ServiceFunction<object, T, object>;
      // Stops the recording of events and state changes.
      disable: ServiceFunction<object, T, object>;
    };
    hassio: {
      // Starts an add-on.
      addonStart: ServiceFunction<
        object,
        T,
        {
          // The add-on to start. @example core_ssh
          addon: string;
        }
      >;
      // Stops an add-on.
      addonStop: ServiceFunction<
        object,
        T,
        {
          // The add-on to stop. @example core_ssh
          addon: string;
        }
      >;
      // Restarts an add-on.
      addonRestart: ServiceFunction<
        object,
        T,
        {
          // The add-on to restart. @example core_ssh
          addon: string;
        }
      >;
      // Updates an add-on. This action should be used with caution since add-on updates can contain breaking changes. It is highly recommended that you review release notes/change logs before updating an add-on.
      addonUpdate: ServiceFunction<
        object,
        T,
        {
          // The add-on to update. @example core_ssh
          addon: string;
        }
      >;
      // Writes data to the add-on's standard input.
      addonStdin: ServiceFunction<
        object,
        T,
        {
          // The add-on to write to. @example core_ssh
          addon: string;
        }
      >;
      // Powers off the host system.
      hostShutdown: ServiceFunction<object, T, object>;
      // Reboots the host system.
      hostReboot: ServiceFunction<object, T, object>;
      // Creates a full backup.
      backupFull: ServiceFunction<
        object,
        T,
        {
          // Optional (default = current date and time). @example Backup 1
          name?: string;
          // Password to protect the backup with. @example password
          password?: string;
          // Compresses the backup files.
          compressed?: boolean;
          // Name of a backup network storage to host backups. @example my_backup_mount
          location?: string;
          // Exclude the Home Assistant database file from backup
          homeassistant_exclude_database?: boolean;
        }
      >;
      // Creates a partial backup.
      backupPartial: ServiceFunction<
        object,
        T,
        {
          // Includes Home Assistant settings in the backup.
          homeassistant?: boolean;
          // Exclude the Home Assistant database file from backup
          homeassistant_exclude_database?: boolean;
          // List of add-ons to include in the backup. Use the name slug of each add-on. @example core_ssh,core_samba,core_mosquitto
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
          location?: string;
        }
      >;
      // Restores from full backup.
      restoreFull: ServiceFunction<
        object,
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
        object,
        T,
        {
          // Slug of backup to restore from.
          slug: string;
          // Restores Home Assistant.
          homeassistant?: boolean;
          // List of directories to restore from the backup. @example homeassistant,share
          folders?: object;
          // List of add-ons to restore from the backup. Use the name slug of each add-on. @example core_ssh,core_samba,core_mosquitto
          addons?: object;
          // Optional password. @example password
          password?: string;
        }
      >;
    };
    update: {
      // Installs an update for a device or service.
      install: ServiceFunction<
        object,
        T,
        {
          // The version to install. If omitted, the latest version will be installed. @example 1.0.0
          version?: string;
          // If supported by the integration, this creates a backup before starting the update.
          backup?: boolean;
        }
      >;
      // Marks currently available update as skipped.
      skip: ServiceFunction<object, T, object>;
      // Removes the skipped version marker from an update.
      clearSkipped: ServiceFunction<object, T, object>;
    };
    cloud: {
      // Makes the instance UI accessible from outside of the local network by enabling your Home Assistant Cloud connection.
      remoteConnect: ServiceFunction<object, T, object>;
      // Disconnects the instance UI from Home Assistant Cloud. This disables access to it from outside your local network.
      remoteDisconnect: ServiceFunction<object, T, object>;
    };
    ffmpeg: {
      // Sends a start command to a ffmpeg based sensor.
      start: ServiceFunction<
        object,
        T,
        {
          // Name of entity that will start. Platform dependent.
          entity_id?: string;
        }
      >;
      // Sends a stop command to a ffmpeg based sensor.
      stop: ServiceFunction<
        object,
        T,
        {
          // Name of entity that will stop. Platform dependent.
          entity_id?: string;
        }
      >;
      // Sends a restart command to a ffmpeg based sensor.
      restart: ServiceFunction<
        object,
        T,
        {
          // Name of entity that will restart. Platform dependent.
          entity_id?: string;
        }
      >;
    };
    tts: {
      // Speaks something using text-to-speech on a media player.
      speak: ServiceFunction<
        object,
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
      clearCache: ServiceFunction<object, T, object>;
      // Say something using text-to-speech on a media player with cloud.
      cloudSay: ServiceFunction<
        object,
        T,
        {
          //
          entity_id: string;
          //  @example My name is hanna
          message: string;
          //
          cache?: boolean;
          //  @example ru
          language?: string;
          //  @example platform specific
          options?: object;
        }
      >;
    };
    scene: {
      // Reloads the scenes from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Activates a scene with configuration.
      apply: ServiceFunction<
        object,
        T,
        {
          // List of entities and their target state. @example light.kitchen: 'on' light.ceiling:   state: 'on'   brightness: 80
          entities: object;
          // Time it takes the devices to transition into the states defined in the scene. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          transition?: number;
        }
      >;
      // Creates a new scene.
      create: ServiceFunction<
        object,
        T,
        {
          // The entity ID of the new scene. @example all_lights
          scene_id: string;
          // List of entities and their target state. If your entities are already in the target state right now, use `snapshot_entities` instead. @example light.tv_back_light: 'on' light.ceiling:   state: 'on'   brightness: 200
          entities?: object;
          // List of entities to be included in the snapshot. By taking a snapshot, you record the current state of those entities. If you do not want to use the current state of all your entities for this scene, you can combine the `snapshot_entities` with `entities`. @example - light.ceiling - light.kitchen
          snapshot_entities?: string;
        }
      >;
      // Deletes a dynamically created scene.
      delete: ServiceFunction<object, T, object>;
      // Activates a scene.
      turnOn: ServiceFunction<
        object,
        T,
        {
          // Time it takes the devices to transition into the states defined in the scene. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          transition?: number;
        }
      >;
    };
    camera: {
      // Enables the motion detection.
      enableMotionDetection: ServiceFunction<object, T, object>;
      // Disables the motion detection.
      disableMotionDetection: ServiceFunction<object, T, object>;
      // Turns off the camera.
      turnOff: ServiceFunction<object, T, object>;
      // Turns on the camera.
      turnOn: ServiceFunction<object, T, object>;
      // Takes a snapshot from a camera.
      snapshot: ServiceFunction<
        object,
        T,
        {
          // Full path to filename. @example /tmp/snapshot_{{ entity_id.name }}.jpg
          filename: string;
        }
      >;
      // Plays the camera stream on a supported media player.
      playStream: ServiceFunction<
        object,
        T,
        {
          // Media players to stream to.
          media_player: string;
          // Stream format supported by the media player.
          format?: 'hls';
        }
      >;
      // Creates a recording of a live camera feed.
      record: ServiceFunction<
        object,
        T,
        {
          // Full path to filename. Must be mp4. @example /tmp/snapshot_{{ entity_id.name }}.mp4
          filename: string;
          // Planned duration of the recording. The actual duration may vary. @constraints  number: min: 1, max: 3600, unit_of_measurement: seconds
          duration?: number;
          // Planned lookback period to include in the recording (in addition to the duration). Only available if there is currently an active HLS stream. The actual length of the lookback period may vary. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          lookback?: number;
        }
      >;
    };
    inputSelect: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Selects the first option.
      selectFirst: ServiceFunction<object, T, object>;
      // Selects the last option.
      selectLast: ServiceFunction<object, T, object>;
      // Select the next option.
      selectNext: ServiceFunction<
        object,
        T,
        {
          // If the option should cycle from the last to the first option on the list.
          cycle?: boolean;
        }
      >;
      // Selects an option.
      selectOption: ServiceFunction<
        object,
        T,
        {
          // Option to be selected. @example 'Item A'
          option: string;
        }
      >;
      // Selects the previous option.
      selectPrevious: ServiceFunction<
        object,
        T,
        {
          // If the option should cycle from the last to the first option on the list.
          cycle?: boolean;
        }
      >;
      // Sets the options.
      setOptions: ServiceFunction<
        object,
        T,
        {
          // List of options. @example ['Item A', 'Item B', 'Item C']
          options: string;
        }
      >;
    };
    inputNumber: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Sets the value.
      setValue: ServiceFunction<
        object,
        T,
        {
          // The target value. @constraints  number: min: 0, max: 9223372036854776000, step: 0.001, mode: box
          value: number;
        }
      >;
      // Increments the current value by 1 step.
      increment: ServiceFunction<object, T, object>;
      // Decrements the current value by 1 step.
      decrement: ServiceFunction<object, T, object>;
    };
    group: {
      // Reloads group configuration, entities, and notify services from YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Creates/Updates a group.
      set: ServiceFunction<
        object,
        T,
        {
          // Object ID of this group. This object ID is used as part of the entity ID. Entity ID format: [domain].[object_id]. @example test_group
          object_id: string;
          // Name of the group. @example My test group
          name?: string;
          // Name of the icon for the group. @example mdi:camera
          icon?: string;
          // List of all members in the group. Cannot be used in combination with `Add entities` or `Remove entities`. @example domain.entity_id1, domain.entity_id2
          entities?: string;
          // List of members to be added to the group. Cannot be used in combination with `Entities` or `Remove entities`. @example domain.entity_id1, domain.entity_id2
          add_entities?: string;
          // List of members to be removed from a group. Cannot be used in combination with `Entities` or `Add entities`. @example domain.entity_id1, domain.entity_id2
          remove_entities?: string;
          // Enable this option if the group should only be used when all entities are in state `on`.
          all?: boolean;
        }
      >;
      // Removes a group.
      remove: ServiceFunction<
        object,
        T,
        {
          // Object ID of this group. This object ID is used as part of the entity ID. Entity ID format: [domain].[object_id]. @example test_group
          object_id: object;
        }
      >;
    };
    light: {
      // Turn on one or more lights and adjust properties of the light, even when they are turned on already.
      turnOn: ServiceFunction<
        object,
        T,
        {
          // Duration it takes to get to next state. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          transition?: number;
          // The color in RGB format. A list of three integers between 0 and 255 representing the values of red, green, and blue. @example [255, 100, 100]
          rgb_color?: [number, number, number];
          // Color temperature in Kelvin. @constraints  color_temp: unit: kelvin, min: 2000, max: 6500
          kelvin?: number | object;
          // Number indicating the percentage of full brightness, where 0 turns the light off, 1 is the minimum brightness, and 100 is the maximum brightness. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          brightness_pct?: number;
          // Change brightness by a percentage. @constraints  number: min: -100, max: 100, unit_of_measurement: %
          brightness_step_pct?: number;
          // Light effect.
          effect?: string;
          //  @example [255, 100, 100, 50]
          rgbw_color?: [number, number, number, number];
          //  @example [255, 100, 100, 50, 70]
          rgbww_color?: [number, number, number, number, number];
          //
          color_name?:
            | 'homeassistant'
            | 'aliceblue'
            | 'antiquewhite'
            | 'aqua'
            | 'aquamarine'
            | 'azure'
            | 'beige'
            | 'bisque'
            | 'blanchedalmond'
            | 'blue'
            | 'blueviolet'
            | 'brown'
            | 'burlywood'
            | 'cadetblue'
            | 'chartreuse'
            | 'chocolate'
            | 'coral'
            | 'cornflowerblue'
            | 'cornsilk'
            | 'crimson'
            | 'cyan'
            | 'darkblue'
            | 'darkcyan'
            | 'darkgoldenrod'
            | 'darkgray'
            | 'darkgreen'
            | 'darkgrey'
            | 'darkkhaki'
            | 'darkmagenta'
            | 'darkolivegreen'
            | 'darkorange'
            | 'darkorchid'
            | 'darkred'
            | 'darksalmon'
            | 'darkseagreen'
            | 'darkslateblue'
            | 'darkslategray'
            | 'darkslategrey'
            | 'darkturquoise'
            | 'darkviolet'
            | 'deeppink'
            | 'deepskyblue'
            | 'dimgray'
            | 'dimgrey'
            | 'dodgerblue'
            | 'firebrick'
            | 'floralwhite'
            | 'forestgreen'
            | 'fuchsia'
            | 'gainsboro'
            | 'ghostwhite'
            | 'gold'
            | 'goldenrod'
            | 'gray'
            | 'green'
            | 'greenyellow'
            | 'grey'
            | 'honeydew'
            | 'hotpink'
            | 'indianred'
            | 'indigo'
            | 'ivory'
            | 'khaki'
            | 'lavender'
            | 'lavenderblush'
            | 'lawngreen'
            | 'lemonchiffon'
            | 'lightblue'
            | 'lightcoral'
            | 'lightcyan'
            | 'lightgoldenrodyellow'
            | 'lightgray'
            | 'lightgreen'
            | 'lightgrey'
            | 'lightpink'
            | 'lightsalmon'
            | 'lightseagreen'
            | 'lightskyblue'
            | 'lightslategray'
            | 'lightslategrey'
            | 'lightsteelblue'
            | 'lightyellow'
            | 'lime'
            | 'limegreen'
            | 'linen'
            | 'magenta'
            | 'maroon'
            | 'mediumaquamarine'
            | 'mediumblue'
            | 'mediumorchid'
            | 'mediumpurple'
            | 'mediumseagreen'
            | 'mediumslateblue'
            | 'mediumspringgreen'
            | 'mediumturquoise'
            | 'mediumvioletred'
            | 'midnightblue'
            | 'mintcream'
            | 'mistyrose'
            | 'moccasin'
            | 'navajowhite'
            | 'navy'
            | 'navyblue'
            | 'oldlace'
            | 'olive'
            | 'olivedrab'
            | 'orange'
            | 'orangered'
            | 'orchid'
            | 'palegoldenrod'
            | 'palegreen'
            | 'paleturquoise'
            | 'palevioletred'
            | 'papayawhip'
            | 'peachpuff'
            | 'peru'
            | 'pink'
            | 'plum'
            | 'powderblue'
            | 'purple'
            | 'red'
            | 'rosybrown'
            | 'royalblue'
            | 'saddlebrown'
            | 'salmon'
            | 'sandybrown'
            | 'seagreen'
            | 'seashell'
            | 'sienna'
            | 'silver'
            | 'skyblue'
            | 'slateblue'
            | 'slategray'
            | 'slategrey'
            | 'snow'
            | 'springgreen'
            | 'steelblue'
            | 'tan'
            | 'teal'
            | 'thistle'
            | 'tomato'
            | 'turquoise'
            | 'violet'
            | 'wheat'
            | 'white'
            | 'whitesmoke'
            | 'yellow'
            | 'yellowgreen';
          //  @example [300, 70]
          hs_color?: [number, number];
          //  @example [0.52, 0.43]
          xy_color?: [number, number];
          //  @constraints  color_temp: unit: mired, min: 153, max: 500
          color_temp?: number | object;
          //  @constraints  number: min: 0, max: 255
          brightness?: number;
          //  @constraints  number: min: -225, max: 255
          brightness_step?: number;
          //
          white?: boolean;
          //  @example relax
          profile?: string;
          //
          flash?: 'long' | 'short';
        }
      >;
      // Turn off one or more lights.
      turnOff: ServiceFunction<
        object,
        T,
        {
          // Duration it takes to get to next state. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          transition?: number;
          //
          flash?: 'long' | 'short';
        }
      >;
      // Toggles one or more lights, from on to off, or, off to on, based on their current state.
      toggle: ServiceFunction<
        object,
        T,
        {
          // Duration it takes to get to next state. @constraints  number: min: 0, max: 300, unit_of_measurement: seconds
          transition?: number;
          // The color in RGB format. A list of three integers between 0 and 255 representing the values of red, green, and blue. @example [255, 100, 100]
          rgb_color?: [number, number, number];
          // Color temperature in Kelvin. @constraints  color_temp: unit: kelvin, min: 2000, max: 6500
          kelvin?: number | object;
          // Number indicating the percentage of full brightness, where 0 turns the light off, 1 is the minimum brightness, and 100 is the maximum brightness. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          brightness_pct?: number;
          // Light effect.
          effect?: string;
          //  @example [255, 100, 100, 50]
          rgbw_color?: [number, number, number, number];
          //  @example [255, 100, 100, 50, 70]
          rgbww_color?: [number, number, number, number, number];
          //
          color_name?:
            | 'homeassistant'
            | 'aliceblue'
            | 'antiquewhite'
            | 'aqua'
            | 'aquamarine'
            | 'azure'
            | 'beige'
            | 'bisque'
            | 'blanchedalmond'
            | 'blue'
            | 'blueviolet'
            | 'brown'
            | 'burlywood'
            | 'cadetblue'
            | 'chartreuse'
            | 'chocolate'
            | 'coral'
            | 'cornflowerblue'
            | 'cornsilk'
            | 'crimson'
            | 'cyan'
            | 'darkblue'
            | 'darkcyan'
            | 'darkgoldenrod'
            | 'darkgray'
            | 'darkgreen'
            | 'darkgrey'
            | 'darkkhaki'
            | 'darkmagenta'
            | 'darkolivegreen'
            | 'darkorange'
            | 'darkorchid'
            | 'darkred'
            | 'darksalmon'
            | 'darkseagreen'
            | 'darkslateblue'
            | 'darkslategray'
            | 'darkslategrey'
            | 'darkturquoise'
            | 'darkviolet'
            | 'deeppink'
            | 'deepskyblue'
            | 'dimgray'
            | 'dimgrey'
            | 'dodgerblue'
            | 'firebrick'
            | 'floralwhite'
            | 'forestgreen'
            | 'fuchsia'
            | 'gainsboro'
            | 'ghostwhite'
            | 'gold'
            | 'goldenrod'
            | 'gray'
            | 'green'
            | 'greenyellow'
            | 'grey'
            | 'honeydew'
            | 'hotpink'
            | 'indianred'
            | 'indigo'
            | 'ivory'
            | 'khaki'
            | 'lavender'
            | 'lavenderblush'
            | 'lawngreen'
            | 'lemonchiffon'
            | 'lightblue'
            | 'lightcoral'
            | 'lightcyan'
            | 'lightgoldenrodyellow'
            | 'lightgray'
            | 'lightgreen'
            | 'lightgrey'
            | 'lightpink'
            | 'lightsalmon'
            | 'lightseagreen'
            | 'lightskyblue'
            | 'lightslategray'
            | 'lightslategrey'
            | 'lightsteelblue'
            | 'lightyellow'
            | 'lime'
            | 'limegreen'
            | 'linen'
            | 'magenta'
            | 'maroon'
            | 'mediumaquamarine'
            | 'mediumblue'
            | 'mediumorchid'
            | 'mediumpurple'
            | 'mediumseagreen'
            | 'mediumslateblue'
            | 'mediumspringgreen'
            | 'mediumturquoise'
            | 'mediumvioletred'
            | 'midnightblue'
            | 'mintcream'
            | 'mistyrose'
            | 'moccasin'
            | 'navajowhite'
            | 'navy'
            | 'navyblue'
            | 'oldlace'
            | 'olive'
            | 'olivedrab'
            | 'orange'
            | 'orangered'
            | 'orchid'
            | 'palegoldenrod'
            | 'palegreen'
            | 'paleturquoise'
            | 'palevioletred'
            | 'papayawhip'
            | 'peachpuff'
            | 'peru'
            | 'pink'
            | 'plum'
            | 'powderblue'
            | 'purple'
            | 'red'
            | 'rosybrown'
            | 'royalblue'
            | 'saddlebrown'
            | 'salmon'
            | 'sandybrown'
            | 'seagreen'
            | 'seashell'
            | 'sienna'
            | 'silver'
            | 'skyblue'
            | 'slateblue'
            | 'slategray'
            | 'slategrey'
            | 'snow'
            | 'springgreen'
            | 'steelblue'
            | 'tan'
            | 'teal'
            | 'thistle'
            | 'tomato'
            | 'turquoise'
            | 'violet'
            | 'wheat'
            | 'white'
            | 'whitesmoke'
            | 'yellow'
            | 'yellowgreen';
          //  @example [300, 70]
          hs_color?: [number, number];
          //  @example [0.52, 0.43]
          xy_color?: [number, number];
          //  @constraints  color_temp: unit: mired, min: 153, max: 500
          color_temp?: number | object;
          //  @constraints  number: min: 0, max: 255
          brightness?: number;
          //
          white?: boolean;
          //  @example relax
          profile?: string;
          //
          flash?: 'long' | 'short';
        }
      >;
    };
    logbook: {
      // Creates a custom entry in the logbook.
      log: ServiceFunction<
        object,
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
    inputBoolean: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Turns on the helper.
      turnOn: ServiceFunction<object, T, object>;
      // Turns off the helper.
      turnOff: ServiceFunction<object, T, object>;
      // Toggles the helper on/off.
      toggle: ServiceFunction<object, T, object>;
    };
    inputButton: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Mimics the physical button press on the device.
      press: ServiceFunction<object, T, object>;
    };
    timer: {
      // Reloads timers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Starts a timer or restarts it with a provided duration.
      start: ServiceFunction<
        object,
        T,
        {
          // Custom duration to restart the timer with. @example 00:01:00 or 60
          duration?: string;
        }
      >;
      // Pauses a running timer, retaining the remaining duration for later continuation.
      pause: ServiceFunction<object, T, object>;
      // Resets a timer's duration to the last known initial value without firing the timer finished event.
      cancel: ServiceFunction<object, T, object>;
      // Finishes a running timer earlier than scheduled.
      finish: ServiceFunction<object, T, object>;
      // Changes a timer by adding or subtracting a given duration.
      change: ServiceFunction<
        object,
        T,
        {
          // Duration to add to or subtract from the running timer. @example 00:01:00, 60 or -60
          duration: string;
        }
      >;
    };
    script: {
      //
      stopTheLivingRoomBlinds: ServiceFunction<object, T, object>;
      //
      closeOpenBedroomBlindsBasedOnTemperature: ServiceFunction<object, T, object>;
      //
      closeOpenGymBlindsBasedOnTemperature: ServiceFunction<object, T, object>;
      //
      setRandomDeskStripColor: ServiceFunction<object, T, object>;
      //
      disableAllAutomations: ServiceFunction<object, T, object>;
      //
      enableAllAutomations: ServiceFunction<object, T, object>;
      // Reloads all the available scripts.
      reload: ServiceFunction<object, T, object>;
      // Runs the sequence of actions defined in a script.
      turnOn: ServiceFunction<object, T, object>;
      // Stops a running script.
      turnOff: ServiceFunction<object, T, object>;
      // Starts a script if it isn't running, stops it otherwise.
      toggle: ServiceFunction<object, T, object>;
    };
    zone: {
      // Reloads zones from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
    };
    conversation: {
      // Launches a conversation from a transcribed text.
      process: ServiceFunction<
        object,
        T,
        {
          // Transcribed text input. @example Turn all lights on
          text: string;
          // Language of text. Defaults to server language. @example NL
          language?: string;
          // Conversation agent to process your request. The conversation agent is the brains of your assistant. It processes the incoming text commands. @example homeassistant
          agent_id?: string;
          // ID of the conversation, to be able to continue a previous conversation @example my_conversation_1
          conversation_id?: string;
        }
      >;
      // Reloads the intent configuration.
      reload: ServiceFunction<
        object,
        T,
        {
          // Language to clear cached intents for. Defaults to server language. @example NL
          language?: string;
          // Conversation agent to reload. @example homeassistant
          agent_id?: string;
        }
      >;
    };
    counter: {
      // Increments a counter by its step size.
      increment: ServiceFunction<object, T, object>;
      // Decrements a counter by its step size.
      decrement: ServiceFunction<object, T, object>;
      // Resets a counter to its initial value.
      reset: ServiceFunction<object, T, object>;
      // Sets the counter to a specific value.
      setValue: ServiceFunction<
        object,
        T,
        {
          // The new counter value the entity should be set to. @constraints  number: min: 0, max: 9223372036854776000, mode: box
          value: number;
        }
      >;
    };
    inputDatetime: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Sets the date and/or time.
      setDatetime: ServiceFunction<
        object,
        T,
        {
          // The target date. @example '2019-04-20'
          date?: string;
          // The target time. @example '05:04:20'
          time?: string;
          // The target date & time. @example '2019-04-20 05:04:20'
          datetime?: string;
          // The target date & time, expressed by a UNIX timestamp. @constraints  number: min: 0, max: 9223372036854776000, mode: box
          timestamp?: number;
        }
      >;
    };
    cast: {
      // Shows a dashboard view on a Chromecast device.
      showLovelaceView: ServiceFunction<
        object,
        T,
        {
          // Media player entity to show the dashboard view on.
          entity_id: string;
          // The URL path of the dashboard to show. @example lovelace-cast
          dashboard_path: string;
          // The URL path of the dashboard view to show. @example downstairs
          view_path?: string;
        }
      >;
    };
    inputText: {
      // Reloads helpers from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
      // Sets the value.
      setValue: ServiceFunction<
        object,
        T,
        {
          // The target value. @example This is an example text
          value: string;
        }
      >;
    };
    pythonScript: {
      //
      toggleLightsBasedOnMotion: ServiceFunction<object, T, object>;
      //
      addSpeakerToGroup: ServiceFunction<object, T, object>;
      // Reloads all available Python scripts.
      reload: ServiceFunction<object, T, object>;
    };
    utilityMeter: {
      // Resets all counters of a utility meter.
      reset: ServiceFunction<object, T, object>;
    };
    schedule: {
      // Reloads schedules from the YAML-configuration.
      reload: ServiceFunction<object, T, object>;
    };
    notify: {
      // Sends a notification message.
      sendMessage: ServiceFunction<
        object,
        T,
        {
          // Your notification message.
          message: string;
          // Title for your notification message.
          title?: string;
        }
      >;
      // Sends a notification that is visible in the notifications panel.
      persistentNotification: ServiceFunction<
        object,
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
      // Sends a notification message using the mobile_app_pixel_6 integration.
      mobileAppPixel6: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_pixel_7a integration.
      mobileAppPixel7A: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_kftrwi integration.
      mobileAppKftrwi: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the mobile_app_iphone integration.
      mobileAppIphone: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the notify service.
      notify: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
      // Sends a notification message using the google_assistant_sdk service.
      googleAssistantSdk: ServiceFunction<
        object,
        T,
        {
          //  @example The garage door has been open for 10 minutes.
          message: string;
          //  @example Your Garage Door Friend
          title?: string;
          //  @example platform specific
          target?: object;
          //  @example platform specific
          data?: object;
        }
      >;
    };
    deviceTracker: {
      // Manually update the records of a seen legacy device tracker in the known_devices.yaml file.
      see: ServiceFunction<
        object,
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
          // Accuracy of the GPS coordinates. @constraints  number: min: 0, mode: box, unit_of_measurement: m
          gps_accuracy?: number;
          // Battery level of the device. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          battery?: number;
        }
      >;
    };
    switch: {
      // Turns a switch off.
      turnOff: ServiceFunction<object, T, object>;
      // Turns a switch on.
      turnOn: ServiceFunction<object, T, object>;
      // Toggles a switch on/off.
      toggle: ServiceFunction<object, T, object>;
    };
    remote: {
      // Sends the turn off command.
      turnOff: ServiceFunction<object, T, object>;
      // Sends the turn on command.
      turnOn: ServiceFunction<
        object,
        T,
        {
          // Activity ID or activity name to be started. @example BedroomTV
          activity?: string;
        }
      >;
      // Sends the toggle command.
      toggle: ServiceFunction<object, T, object>;
      // Sends a command or a list of commands to a device.
      sendCommand: ServiceFunction<
        object,
        T,
        {
          // Device ID to send command to. @example 32756745
          device?: string;
          // A single command or a list of commands to send. @example Play
          command: object;
          // The number of times you want to repeat the commands. @constraints  number: min: 0, max: 255
          num_repeats?: number;
          // The time you want to wait in between repeated commands. @constraints  number: min: 0, max: 60, step: 0.1, unit_of_measurement: seconds
          delay_secs?: number;
          // The time you want to have it held before the release is send. @constraints  number: min: 0, max: 60, step: 0.1, unit_of_measurement: seconds
          hold_secs?: number;
        }
      >;
      // Learns a command or a list of commands from a device.
      learnCommand: ServiceFunction<
        object,
        T,
        {
          // Device ID to learn command from. @example television
          device?: string;
          // A single command or a list of commands to learn. @example Turn on
          command?: object;
          // The type of command to be learned.
          command_type?: 'ir' | 'rf';
          // If code must be stored as an alternative. This is useful for discrete codes. Discrete codes are used for toggles that only perform one function. For example, a code to only turn a device on. If it is on already, sending the code won't change the state.
          alternative?: boolean;
          // Timeout for the command to be learned. @constraints  number: min: 0, max: 60, step: 5, unit_of_measurement: seconds
          timeout?: number;
        }
      >;
      // Deletes a command or a list of commands from the database.
      deleteCommand: ServiceFunction<
        object,
        T,
        {
          // Device from which commands will be deleted. @example television
          device?: string;
          // The single command or the list of commands to be deleted. @example Mute
          command: object;
        }
      >;
    };
    mediaPlayer: {
      // Turns on the power of the media player.
      turnOn: ServiceFunction<object, T, object>;
      // Turns off the power of the media player.
      turnOff: ServiceFunction<object, T, object>;
      // Toggles a media player on/off.
      toggle: ServiceFunction<object, T, object>;
      // Turns up the volume.
      volumeUp: ServiceFunction<object, T, object>;
      // Turns down the volume.
      volumeDown: ServiceFunction<object, T, object>;
      // Toggles play/pause.
      mediaPlayPause: ServiceFunction<object, T, object>;
      // Starts playing.
      mediaPlay: ServiceFunction<object, T, object>;
      // Pauses.
      mediaPause: ServiceFunction<object, T, object>;
      // Stops playing.
      mediaStop: ServiceFunction<object, T, object>;
      // Selects the next track.
      mediaNextTrack: ServiceFunction<object, T, object>;
      // Selects the previous track.
      mediaPreviousTrack: ServiceFunction<object, T, object>;
      // Removes all items from the playlist.
      clearPlaylist: ServiceFunction<object, T, object>;
      // Sets the volume level.
      volumeSet: ServiceFunction<
        object,
        T,
        {
          // The volume. 0 is inaudible, 1 is the maximum volume. @constraints  number: min: 0, max: 1, step: 0.01
          volume_level: number;
        }
      >;
      // Mutes or unmutes the media player.
      volumeMute: ServiceFunction<
        object,
        T,
        {
          // Defines whether or not it is muted.
          is_volume_muted: boolean;
        }
      >;
      // Allows you to go to a different part of the media that is currently playing.
      mediaSeek: ServiceFunction<
        object,
        T,
        {
          // Target position in the currently playing media. The format is platform dependent. @constraints  number: min: 0, max: 9223372036854776000, step: 0.01, mode: box
          seek_position: number;
        }
      >;
      // Groups media players together for synchronous playback. Only works on supported multiroom audio systems.
      join: ServiceFunction<
        object,
        T,
        {
          // The players which will be synced with the playback specified in `target`. @example - media_player.multiroom_player2 - media_player.multiroom_player3
          group_members: string[];
        }
      >;
      // Sends the media player the command to change input source.
      selectSource: ServiceFunction<
        object,
        T,
        {
          // Name of the source to switch to. Platform dependent. @example video1
          source: string;
        }
      >;
      // Selects a specific sound mode.
      selectSoundMode: ServiceFunction<
        object,
        T,
        {
          // Name of the sound mode to switch to. @example Music
          sound_mode?: string;
        }
      >;
      // Starts playing specified media.
      playMedia: ServiceFunction<
        object,
        T,
        {
          // The ID of the content to play. Platform dependent. @example https://home-assistant.io/images/cast/splash.png
          media_content_id: string | number;
          // The type of the content to play. Such as image, music, tv show, video, episode, channel, or playlist. @example music
          media_content_type: string;
          // If the content should be played now or be added to the queue.
          enqueue?: 'play' | 'next' | 'add' | 'replace';
          // If the media should be played as an announcement. @example true
          announce?: boolean;
        }
      >;
      // Playback mode that selects the media in randomized order.
      shuffleSet: ServiceFunction<
        object,
        T,
        {
          // Whether or not shuffle mode is enabled.
          shuffle: boolean;
        }
      >;
      // Removes the player from a group. Only works on platforms which support player groups.
      unjoin: ServiceFunction<object, T, object>;
      // Playback mode that plays the media in a loop.
      repeatSet: ServiceFunction<
        object,
        T,
        {
          // Repeat mode to set.
          repeat: 'off' | 'all' | 'one';
        }
      >;
    };
    hue: {
      // Activates a Hue scene with more control over the options.
      activateScene: ServiceFunction<
        object,
        T,
        {
          // Transition duration it takes to bring devices to the state defined in the scene. @constraints  number: min: 0, max: 3600, unit_of_measurement: seconds
          transition?: number;
          // Enable dynamic mode of the scene.
          dynamic?: boolean;
          // Speed of dynamic palette for this scene. @constraints  number: min: 0, max: 100
          speed?: number;
          // Set brightness for the scene. @constraints  number: min: 1, max: 255
          brightness?: number;
        }
      >;
      // Activates a Hue scene stored in the Hue hub.
      hueActivateScene: ServiceFunction<
        object,
        T,
        {
          // Name of Hue group/room from the Hue app. @example Living Room
          group_name?: string;
          // Name of Hue scene from the Hue app. @example Energize
          scene_name?: string;
          // Enable dynamic mode of the scene (V2 bridges and supported scenes only).
          dynamic?: boolean;
        }
      >;
    };
    weather: {
      // Get weather forecasts.
      getForecasts: ServiceFunction<
        object,
        T,
        {
          // Forecast type: daily, hourly or twice daily.
          type: 'daily' | 'hourly' | 'twice_daily';
        }
      >;
    };
    vacuum: {
      // Starts or resumes the cleaning task.
      start: ServiceFunction<object, T, object>;
      // Pauses the cleaning task.
      pause: ServiceFunction<object, T, object>;
      // Tells the vacuum cleaner to return to its dock.
      returnToBase: ServiceFunction<object, T, object>;
      // Tells the vacuum cleaner to do a spot clean-up.
      cleanSpot: ServiceFunction<object, T, object>;
      // Locates the vacuum cleaner robot.
      locate: ServiceFunction<object, T, object>;
      // Stops the current cleaning task.
      stop: ServiceFunction<object, T, object>;
      // Sets the fan speed of the vacuum cleaner.
      setFanSpeed: ServiceFunction<
        object,
        T,
        {
          // Fan speed. The value depends on the integration. Some integrations have speed steps, like 'medium'. Some use a percentage, between 0 and 100. @example low
          fan_speed: string;
        }
      >;
      // Sends a command to the vacuum cleaner.
      sendCommand: ServiceFunction<
        object,
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
        object,
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
        object,
        T,
        {
          // Name of the target entity @example media_player.tv
          entity_id: string;
        }
      >;
    };
    googleAssistantSdk: {
      // Sends a command as a text query to Google Assistant.
      sendTextCommand: ServiceFunction<
        object,
        T,
        {
          // Command(s) to send to Google Assistant. @example turn off kitchen TV
          command?: string;
          // Name(s) of media player entities to play response on. @example media_player.living_room_speaker
          media_player?: string;
        }
      >;
    };
    automation: {
      // Triggers the actions of an automation.
      trigger: ServiceFunction<
        object,
        T,
        {
          // Defines whether or not the conditions will be skipped.
          skip_condition?: boolean;
        }
      >;
      // Toggles (enable / disable) an automation.
      toggle: ServiceFunction<object, T, object>;
      // Enables an automation.
      turnOn: ServiceFunction<object, T, object>;
      // Disables an automation.
      turnOff: ServiceFunction<
        object,
        T,
        {
          // Stops currently running actions.
          stop_actions?: boolean;
        }
      >;
      // Reloads the automation configuration.
      reload: ServiceFunction<object, T, object>;
    };
    sonos: {
      // Takes a snapshot of the media player.
      snapshot: ServiceFunction<
        object,
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
        object,
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
        object,
        T,
        {
          // Number of seconds to set the timer. @constraints  number: min: 0, max: 7200, unit_of_measurement: seconds
          sleep_time?: number;
        }
      >;
      // Clears a Sonos timer.
      clearSleepTimer: ServiceFunction<object, T, object>;
      // Updates an alarm with new time and volume settings.
      updateAlarm: ServiceFunction<
        object,
        T,
        {
          // ID for the alarm to be updated. @constraints  number: min: 1, max: 1440, mode: box
          alarm_id: number;
          // Set time for the alarm. @example 07:00
          time?: string;
          // Set alarm volume level. @constraints  number: min: 0, max: 1, step: 0.01
          volume?: number;
          // Enable or disable the alarm.
          enabled?: boolean;
          // Enable or disable including grouped rooms.
          include_linked_zones?: boolean;
        }
      >;
      // Start playing the queue from the first item.
      playQueue: ServiceFunction<
        object,
        T,
        {
          // Position of the song in the queue to start playing from. @constraints  number: min: 0, max: 10000, mode: box
          queue_position?: number;
        }
      >;
      // Removes an item from the queue.
      removeFromQueue: ServiceFunction<
        object,
        T,
        {
          // Position in the queue to remove. @constraints  number: min: 0, max: 10000, mode: box
          queue_position?: number;
        }
      >;
      // Returns the contents of the queue.
      getQueue: ServiceFunction<object, T, object>;
    };
    number: {
      // Sets the value of a number.
      setValue: ServiceFunction<
        object,
        T,
        {
          // The target value to set. @example 42
          value?: string;
        }
      >;
    };
    climate: {
      // Turns climate device on.
      turnOn: ServiceFunction<object, T, object>;
      // Turns climate device off.
      turnOff: ServiceFunction<object, T, object>;
      // Toggles climate device, from on to off, or off to on.
      toggle: ServiceFunction<object, T, object>;
      // Sets HVAC operation mode.
      setHvacMode: ServiceFunction<
        object,
        T,
        {
          // HVAC operation mode.
          hvac_mode?: 'off' | 'auto' | 'cool' | 'dry' | 'fan_only' | 'heat_cool' | 'heat';
        }
      >;
      // Sets preset mode.
      setPresetMode: ServiceFunction<
        object,
        T,
        {
          // Preset mode. @example away
          preset_mode: string;
        }
      >;
      // Turns auxiliary heater on/off.
      setAuxHeat: ServiceFunction<
        object,
        T,
        {
          // New value of auxiliary heater.
          aux_heat: boolean;
        }
      >;
      // Sets the temperature setpoint.
      setTemperature: ServiceFunction<
        object,
        T,
        {
          // The temperature setpoint. @constraints  number: min: 0, max: 250, step: 0.1, mode: box
          temperature?: number;
          // The max temperature setpoint. @constraints  number: min: 0, max: 250, step: 0.1, mode: box
          target_temp_high?: number;
          // The min temperature setpoint. @constraints  number: min: 0, max: 250, step: 0.1, mode: box
          target_temp_low?: number;
          // HVAC operation mode.
          hvac_mode?: 'off' | 'auto' | 'cool' | 'dry' | 'fan_only' | 'heat_cool' | 'heat';
        }
      >;
      // Sets target humidity.
      setHumidity: ServiceFunction<
        object,
        T,
        {
          // Target humidity. @constraints  number: min: 30, max: 99, unit_of_measurement: %
          humidity: number;
        }
      >;
      // Sets fan operation mode.
      setFanMode: ServiceFunction<
        object,
        T,
        {
          // Fan operation mode. @example low
          fan_mode: string;
        }
      >;
      // Sets swing operation mode.
      setSwingMode: ServiceFunction<
        object,
        T,
        {
          // Swing operation mode. @example on
          swing_mode: string;
        }
      >;
      // Sets horizontal swing operation mode.
      setSwingHorizontalMode: ServiceFunction<
        object,
        T,
        {
          // Horizontal swing operation mode. @example on
          swing_horizontal_mode: string;
        }
      >;
    };
    button: {
      // Press the button entity.
      press: ServiceFunction<object, T, object>;
    };
    cover: {
      // Opens a cover.
      openCover: ServiceFunction<object, T, object>;
      // Closes a cover.
      closeCover: ServiceFunction<object, T, object>;
      // Moves a cover to a specific position.
      setCoverPosition: ServiceFunction<
        object,
        T,
        {
          // Target position. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          position: number;
        }
      >;
      // Stops the cover movement.
      stopCover: ServiceFunction<object, T, object>;
      // Toggles a cover open/closed.
      toggle: ServiceFunction<object, T, object>;
      // Tilts a cover open.
      openCoverTilt: ServiceFunction<object, T, object>;
      // Tilts a cover to close.
      closeCoverTilt: ServiceFunction<object, T, object>;
      // Stops a tilting cover movement.
      stopCoverTilt: ServiceFunction<object, T, object>;
      // Moves a cover tilt to a specific position.
      setCoverTiltPosition: ServiceFunction<
        object,
        T,
        {
          // Target tilt positition. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          tilt_position: number;
        }
      >;
      // Toggles a cover tilt open/closed.
      toggleCoverTilt: ServiceFunction<object, T, object>;
    };
    fan: {
      // Turns fan on.
      turnOn: ServiceFunction<
        object,
        T,
        {
          // Speed of the fan. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          percentage?: number;
          // Preset fan mode. @example auto
          preset_mode?: string;
        }
      >;
      // Turns fan off.
      turnOff: ServiceFunction<object, T, object>;
      // Toggles a fan on/off.
      toggle: ServiceFunction<object, T, object>;
      // Increases the speed of a fan.
      increaseSpeed: ServiceFunction<
        object,
        T,
        {
          // Percentage step by which the speed should be increased. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          percentage_step?: number;
        }
      >;
      // Decreases the speed of a fan.
      decreaseSpeed: ServiceFunction<
        object,
        T,
        {
          // Percentage step by which the speed should be decreased. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          percentage_step?: number;
        }
      >;
      // Controls the oscillation of a fan.
      oscillate: ServiceFunction<
        object,
        T,
        {
          // Turns oscillation on/off.
          oscillating: boolean;
        }
      >;
      // Sets a fan's rotation direction.
      setDirection: ServiceFunction<
        object,
        T,
        {
          // Direction of the fan rotation.
          direction: 'forward' | 'reverse';
        }
      >;
      // Sets the speed of a fan.
      setPercentage: ServiceFunction<
        object,
        T,
        {
          // Speed of the fan. @constraints  number: min: 0, max: 100, unit_of_measurement: %
          percentage: number;
        }
      >;
      // Sets preset fan mode.
      setPresetMode: ServiceFunction<
        object,
        T,
        {
          // Preset fan mode. @example auto
          preset_mode: string;
        }
      >;
    };
    lock: {
      // Unlocks a lock.
      unlock: ServiceFunction<
        object,
        T,
        {
          // Code used to unlock the lock. @example 1234
          code?: string;
        }
      >;
      // Locks a lock.
      lock: ServiceFunction<
        object,
        T,
        {
          // Code used to lock the lock. @example 1234
          code?: string;
        }
      >;
      // Opens a lock.
      open: ServiceFunction<
        object,
        T,
        {
          // Code used to open the lock. @example 1234
          code?: string;
        }
      >;
    };
    localtuya: {
      // Reload localtuya and reconnect to all devices.
      reload: ServiceFunction<object, T, object>;
      // Change the value of a datapoint (DP)
      setDp: ServiceFunction<
        object,
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
  }
  export interface CustomEntityNameContainer {
    names:
      | 'person.yann_thibodeau'
      | 'update.home_assistant_supervisor_update'
      | 'update.home_assistant_core_update'
      | 'update.advanced_ssh_web_terminal_update'
      | 'update.log_viewer_update'
      | 'update.nginx_home_assistant_ssl_proxy_update'
      | 'update.nginx_proxy_manager_update'
      | 'update.mariadb_update'
      | 'update.hakit_update'
      | 'update.home_assistant_operating_system_update'
      | 'binary_sensor.remote_ui'
      | 'stt.home_assistant_cloud'
      | 'tts.home_assistant_cloud'
      | 'light.all_lights_except_gym_and_bedroom_closet'
      | 'script.stop_the_living_room_blinds'
      | 'script.close_open_bedroom_blinds_based_on_temperature'
      | 'script.close_open_gym_blinds_based_on_temperature'
      | 'script.set_random_desk_strip_color'
      | 'script.disable_all_automations'
      | 'script.enable_all_automations'
      | 'zone.work'
      | 'zone.home'
      | 'conversation.home_assistant'
      | 'sun.sun'
      | 'sensor.sun_next_dawn'
      | 'sensor.sun_next_dusk'
      | 'sensor.sun_next_midnight'
      | 'sensor.sun_next_noon'
      | 'sensor.sun_next_rising'
      | 'sensor.sun_next_setting'
      | 'input_text.motion_front_door_off_time'
      | 'input_text.motion_kitchen_off_time'
      | 'input_text.motion_office_off_time'
      | 'input_text.motion_living_room_off_time'
      | 'input_text.motion_gym_off_time'
      | 'input_text.motion_toilet_off_time'
      | 'input_text.motion_bedroom_off_time'
      | 'input_text.motion_bedroom_closet_off_time'
      | 'device_tracker.pixel_6'
      | 'sensor.pixel_6_battery_level'
      | 'sensor.pixel_6_battery_state'
      | 'sensor.pixel_6_charger_type'
      | 'sensor.pixel_6_next_alarm'
      | 'device_tracker.pixel_7a'
      | 'sensor.pixel_7a_battery_level'
      | 'sensor.pixel_7a_battery_state'
      | 'sensor.pixel_7a_charger_type'
      | 'sensor.pixel_7a_next_alarm'
      | 'device_tracker.fire_hd_10_tablet'
      | 'sensor.kftrwi_battery_level'
      | 'sensor.kftrwi_battery_state'
      | 'sensor.kftrwi_charger_type'
      | 'binary_sensor.iphone_focus'
      | 'device_tracker.iphone'
      | 'sensor.iphone_battery_level'
      | 'sensor.iphone_connection_type'
      | 'sensor.iphone_sim_1'
      | 'sensor.iphone_battery_state'
      | 'sensor.iphone_storage'
      | 'sensor.iphone_ssid'
      | 'sensor.iphone_bssid'
      | 'sensor.iphone_last_update_trigger'
      | 'sensor.iphone_app_version'
      | 'sensor.iphone_location_permission'
      | 'sensor.iphone_geocoded_location'
      | 'sensor.iphone_sim_2'
      | 'sensor.iphone_activity'
      | 'sensor.iphone_distance'
      | 'sensor.iphone_floors_ascended'
      | 'sensor.iphone_floors_descended'
      | 'sensor.iphone_steps'
      | 'sensor.iphone_average_active_pace'
      | 'sensor.iphone_audio_output'
      | 'sensor.hilo_energy_total_medium_cost'
      | 'sensor.broadlink_rm4_remote_control_ir_rf_temperature'
      | 'sensor.broadlink_rm4_remote_control_ir_rf_humidity'
      | 'remote.broadlink_rm4_remote_control_ir_rf'
      | 'tts.google_en_com'
      | 'media_player.tv_2'
      | 'remote.tv'
      | 'media_player.bedroom_speaker'
      | 'binary_sensor.coda_4680_fiz_wan_status'
      | 'sensor.coda_4680_fiz_external_ip'
      | 'sensor.coda_4680_fiz_kib_s_received'
      | 'sensor.coda_4680_fiz_kib_s_sent'
      | 'media_player.tv'
      | 'binary_sensor.rpi_power_status'
      | 'binary_sensor.hue_motion_sensor_1_motion_2'
      | 'binary_sensor.hue_motion_sensor_2_motion'
      | 'binary_sensor.hue_motion_sensor_1_motion'
      | 'binary_sensor.hue_motion_sensor_1_motion_3'
      | 'sensor.hue_motion_sensor_2_temperature'
      | 'sensor.hue_motion_sensor_1_temperature_3'
      | 'sensor.hue_motion_sensor_1_temperature_2'
      | 'sensor.hue_motion_sensor_1_temperature'
      | 'sensor.hue_motion_sensor_1_illuminance'
      | 'sensor.hue_motion_sensor_2_illuminance'
      | 'sensor.hue_motion_sensor_1_illuminance_2'
      | 'sensor.hue_motion_sensor_1_illuminance_3'
      | 'sensor.hue_motion_sensor_1_battery'
      | 'sensor.hue_motion_sensor_2_battery'
      | 'sensor.hue_motion_sensor_1_battery_3'
      | 'sensor.hue_motion_sensor_1_battery_2'
      | 'switch.hue_motion_sensor_1_motion_2'
      | 'switch.hue_motion_sensor_2_motion'
      | 'switch.hue_motion_sensor_1_motion'
      | 'switch.hue_motion_sensor_1_motion_3'
      | 'switch.hue_motion_sensor_1_illuminance'
      | 'switch.hue_motion_sensor_2_illuminance'
      | 'switch.hue_motion_sensor_1_illuminance_2'
      | 'switch.hue_motion_sensor_1_illuminance_3'
      | 'weather.forecast_home'
      | 'binary_sensor.roomba_bin_full'
      | 'sensor.roomba_battery_level'
      | 'sensor.roomba_battery_cycles'
      | 'sensor.roomba_total_cleaning_time'
      | 'sensor.roomba_average_mission_time'
      | 'sensor.roomba_total_missions'
      | 'sensor.roomba_successful_missions'
      | 'sensor.roomba_canceled_missions'
      | 'sensor.roomba_failed_missions'
      | 'vacuum.roomba'
      | 'media_player.samsung_q60_series_85'
      | 'remote.samsung_q60_series_85'
      | 'media_player.tv_samsung_q60_series_85'
      | 'media_player.tv_3'
      | 'update.button_card_update'
      | 'update.samsungtv_smart_update'
      | 'update.hilo_update'
      | 'update.hacs_update'
      | 'update.rgb_light_card_update'
      | 'update.big_slider_card_update'
      | 'update.local_tuya_update'
      | 'update.mushroom_update'
      | 'sensor.smart_series_8000_d151_time'
      | 'sensor.smart_series_8000_d151_sector'
      | 'sensor.smart_series_8000_d151_number_of_sectors'
      | 'sensor.smart_series_8000_d151_toothbrush_state'
      | 'sensor.smart_series_8000_d151_pressure'
      | 'sensor.smart_series_8000_d151_mode'
      | 'sensor.smart_series_8000_d151_battery'
      | 'automation.start_roomba_when_at_work'
      | 'automation.close_bedroom_blind_when_too_hot'
      | 'automation.drop_temperature_when_at_work'
      | 'automation.increase_temperature_when_leaving_work'
      | 'automation.close_all_the_lights_when_leaving_home'
      | 'automation.play_music_set_lights_brightness_to_100_and_open_the_blinds_when_alarm_goes_off'
      | 'automation.dim_lights_to_25_at_10pm'
      | 'automation.group_sonos_on_spotify_play_with_movement'
      | 'automation.group_gym_sonos_speaker_if_music_is_playing_in_living_room'
      | 'automation.group_bedroom_sonos_speaker_if_music_is_playing_in_living_room'
      | 'automation.ungroup_all_speakers_from_living_room_when_tv_is_turned_on'
      | 'automation.test_kitchen_light_boom'
      | 'automation.toggle_front_door_lights'
      | 'automation.toggle_gym_light_on_motion'
      | 'automation.toggle_bedroom_light_on_motion'
      | 'automation.toggle_bedroom_closet_light'
      | 'automation.toggle_office_light_on_motion'
      | 'automation.toggle_toilet_light_on_motion'
      | 'automation.close_open_gym_blinds_based_on_temperature'
      | 'media_player.spotify_yann_luche_thibodeau'
      | 'sensor.meter00_power'
      | 'sensor.thermostat_office_temperature'
      | 'sensor.thermostat_office_power'
      | 'sensor.thermostat_office_target_temperature'
      | 'sensor.thermostat_gym_temperature'
      | 'sensor.thermostat_gym_power'
      | 'sensor.thermostat_gym_target_temperature'
      | 'sensor.thermostat_bedroom_temperature'
      | 'sensor.thermostat_bedroom_power'
      | 'sensor.thermostat_bedroom_target_temperature'
      | 'sensor.bedroom_closet_power'
      | 'sensor.gym_power'
      | 'sensor.switch_bedroom_lamp_power'
      | 'sensor.switch_office_power'
      | 'sensor.defi_hilo'
      | 'sensor.recompenses_hilo'
      | 'sensor.notifications_hilo'
      | 'sensor.outdoor_weather_hilo'
      | 'sensor.hilo_gateway'
      | 'climate.thermostat_office'
      | 'climate.thermostat_gym'
      | 'climate.thermostat_bedroom'
      | 'light.bedroom_closet'
      | 'light.gym'
      | 'switch.switch_bedroom_lamp'
      | 'switch.switch_office'
      | 'binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_1'
      | 'binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_2'
      | 'binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_3'
      | 'sensor.aqara_fp2_presence_motion_sensor_light_sensor_light_level'
      | 'button.aqara_fp2_presence_motion_sensor_identify'
      | 'sensor.samsung_q60_series_85_volume'
      | 'sensor.samsung_q60_series_85_media_input_source'
      | 'sensor.samsung_q60_series_85_media_playback_status'
      | 'sensor.samsung_q60_series_85_tv_channel'
      | 'sensor.samsung_q60_series_85_tv_channel_name'
      | 'sensor.samsung_q60_series_85_energy_meter'
      | 'sensor.samsung_q60_series_85_power_meter'
      | 'sensor.dryer_dryer_machine_state'
      | 'sensor.dryer_dryer_job_state'
      | 'sensor.dryer_dryer_completion_time'
      | 'sensor.dryer_energy'
      | 'sensor.dryer_power'
      | 'sensor.dryer_deltaenergy'
      | 'sensor.dryer_powerenergy'
      | 'sensor.dryer_energysaved'
      | 'sensor.dryer_energy_meter'
      | 'sensor.dryer_power_meter'
      | 'sensor.dishwasher_dishwasher_machine_state'
      | 'sensor.dishwasher_dishwasher_job_state'
      | 'sensor.dishwasher_dishwasher_completion_time'
      | 'sensor.dishwasher_energy'
      | 'sensor.dishwasher_power'
      | 'sensor.dishwasher_deltaenergy'
      | 'sensor.dishwasher_powerenergy'
      | 'sensor.dishwasher_energysaved'
      | 'sensor.dishwasher_energy_meter'
      | 'sensor.dishwasher_power_meter'
      | 'sensor.range_oven_mode'
      | 'sensor.range_oven_machine_state'
      | 'sensor.range_oven_job_state'
      | 'sensor.range_oven_completion_time'
      | 'sensor.range_oven_set_point'
      | 'sensor.range_temperature_measurement'
      | 'sensor.washer_energy'
      | 'sensor.washer_power'
      | 'sensor.washer_deltaenergy'
      | 'sensor.washer_powerenergy'
      | 'sensor.washer_energysaved'
      | 'sensor.washer_washer_machine_state'
      | 'sensor.washer_washer_job_state'
      | 'sensor.washer_washer_completion_time'
      | 'sensor.washer_energy_meter'
      | 'sensor.washer_power_meter'
      | 'switch.samsung_q60_series_85'
      | 'switch.dryer'
      | 'switch.dishwasher'
      | 'switch.washer'
      | 'binary_sensor.aqara_fp2_bathroom_presence_sensor_1'
      | 'sensor.aqara_fp2_bathroom_light_sensor_light_level'
      | 'button.aqara_fp2_bathroom_identify'
      | 'binary_sensor.bathroom_microphone'
      | 'media_player.bathroom'
      | 'number.bathroom_bass'
      | 'number.bathroom_balance'
      | 'number.bathroom_treble'
      | 'switch.bathroom_crossfade'
      | 'switch.bathroom_loudness'
      | 'binary_sensor.bedroom_microphone'
      | 'media_player.bedroom'
      | 'switch.bedroom_crossfade'
      | 'switch.bedroom_loudness'
      | 'number.bedroom_bass'
      | 'number.bedroom_balance'
      | 'number.bedroom_treble'
      | 'sensor.living_room_audio_input_format'
      | 'binary_sensor.living_room_microphone'
      | 'media_player.living_room'
      | 'number.living_room_audio_delay'
      | 'number.living_room_bass'
      | 'number.living_room_balance'
      | 'number.living_room_treble'
      | 'number.living_room_surround_level'
      | 'number.living_room_music_surround_level'
      | 'switch.living_room_crossfade'
      | 'switch.living_room_loudness'
      | 'switch.living_room_surround_music_full_volume'
      | 'switch.living_room_night_sound'
      | 'switch.living_room_speech_enhancement'
      | 'switch.living_room_surround_enabled'
      | 'binary_sensor.gym_microphone'
      | 'media_player.gym'
      | 'number.gym_bass'
      | 'number.gym_balance'
      | 'number.gym_treble'
      | 'switch.gym_crossfade'
      | 'switch.gym_loudness'
      | 'camera.camera_front_door'
      | 'event.camera_front_door_motion'
      | 'remote.tv_2'
      | 'sensor.brother_mfc_j425w_black_ink_cartridge'
      | 'sensor.brother_mfc_j425w_cyan_ink_cartridge'
      | 'sensor.brother_mfc_j425w_magenta_ink_cartridge'
      | 'sensor.brother_mfc_j425w_yellow_ink_cartridge'
      | 'sensor.brother_mfc_j425w'
      | 'sensor.mfc_j425w_status'
      | 'sensor.mfc_j425w_page_counter'
      | 'sensor.mfc_j425w_black_ink_remaining'
      | 'sensor.mfc_j425w_cyan_ink_remaining'
      | 'sensor.mfc_j425w_magenta_ink_remaining'
      | 'sensor.mfc_j425w_yellow_ink_remaining'
      | 'sensor.hilo_energy_total_low_cost'
      | 'script.set_random_light_color'
      | 'device_tracker.ekster_2e71'
      | 'sensor.ekster_2e71_estimated_distance'
      | 'light.office_bulbs'
      | 'light.light_living_room_bulbs'
      | 'light.living_room_led_strip'
      | 'light.light_laundry_room'
      | 'light.light_toilet'
      | 'light.light_bedroom'
      | 'light.light_front_door'
      | 'light.light_kitchen'
      | 'light.desk_led_strip';
  }
}
