"""Authenticated catalog reads using Home Assistant's existing Spotify OAuth."""
from .search import SearchError, SearchGateway, validate_query, SEARCH_KINDS
from .collection import collection_account, validate_collection, fetch_collection


async def async_setup(hass, config):
    import voluptuous as vol
    from aiohttp import ClientTimeout
    from homeassistant.components import websocket_api
    from homeassistant.config_entries import ConfigEntryState
    from homeassistant.const import EVENT_HOMEASSISTANT_STOP
    from homeassistant.helpers import entity_registry as er
    from homeassistant.helpers import aiohttp_client
    from homeassistant.auth.permissions.const import POLICY_READ

    gateway = SearchGateway()
    hass.data['dashboard_spotify'] = gateway
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, lambda event: hass.async_create_task(gateway.close()))

    @websocket_api.websocket_command({
        vol.Required('type'): 'dashboard_spotify/search',
        vol.Required('query'): str,
        vol.Optional('limit', default=10): int,
        vol.Optional('offset', default=0): int,
        vol.Optional('kind'): vol.In((*SEARCH_KINDS, 'all')),
    })
    @websocket_api.async_response
    async def search(connection_hass, connection, msg):
        try:
            query, limit, offset = validate_query(msg['query'], msg['limit'], msg['offset'], msg.get('kind'))
            entries = [entry for entry in hass.config_entries.async_entries('spotify')
                       if entry.state is ConfigEntryState.LOADED and getattr(entry, 'runtime_data', None)]
            if not entries:
                raise SearchError('spotify_not_configured', 'Connect Spotify in Home Assistant to search music.')
            registry = er.async_get(hass)
            entry = next((entry for entry in entries if any(
                entity.domain == 'media_player' and not entity.disabled
                and connection.user.permissions.check_entity(entity.entity_id, POLICY_READ)
                for entity in er.async_entries_for_config_entry(registry, entry.entry_id))), None)
            if entry is None:
                raise SearchError('unauthorized', 'You do not have access to the Spotify account.')

            async def fetch(query, limit, offset):
                session = entry.runtime_data.session
                await session.async_ensure_token_valid()
                gateway.check_available()
                async with aiohttp_client.async_get_clientsession(hass).get(
                    'https://api.spotify.com/v1/search',
                    params={'q': query, 'type': ','.join(SEARCH_KINDS) if msg.get('kind') == 'all' else msg.get('kind', 'track'), 'limit': limit, 'offset': offset},
                    headers={'Authorization': 'Bearer ' + session.token['access_token']},
                    timeout=ClientTimeout(total=12),
                ) as response:
                    if response.status == 429:
                        try:
                            delay = max(1, min(300, int(response.headers.get('Retry-After', '5'))))
                        except (TypeError, ValueError):
                            delay = 5
                        raise SearchError('rate_limited', 'Spotify is busy. Try again shortly.', delay)
                    if response.status in (401, 403):
                        raise SearchError('spotify_auth_required', 'Spotify access needs attention in Home Assistant.')
                    if response.status != 200:
                        raise SearchError('spotify_unavailable', 'Spotify search could not be loaded. Try again.')
                    return await response.json()

            connection.send_result(msg['id'], await gateway.search(entry.entry_id, query, limit, offset, fetch, kind=msg.get("kind")))
        except SearchError as error:
            response = websocket_api.error_message(msg['id'], error.code, str(error))
            if error.retry_after is not None:
                response['error']['retry_after'] = error.retry_after
            connection.send_message(response)
        except Exception:
            connection.send_error(msg['id'], 'spotify_unavailable', 'Spotify search could not be loaded. Try again.')

    @websocket_api.websocket_command({
        vol.Required('type'): 'dashboard_spotify/collection',
        vol.Required('media_content_id'): str,
        vol.Optional('limit', default=50): int,
        vol.Optional('offset', default=0): int,
        vol.Optional('cursor'): str,
    })
    @websocket_api.async_response
    async def collection(connection_hass, connection, msg):
        try:
            account, _ = collection_account(msg['media_content_id'])
            # Validate the entire request before any credential access or cached read.
            validate_collection(msg['media_content_id'], account, msg['limit'], msg['offset'], msg.get('cursor'))
            entries = [entry for entry in hass.config_entries.async_entries('spotify')
                       if entry.state is ConfigEntryState.LOADED and getattr(entry, 'runtime_data', None)]
            if not entries:
                raise SearchError('spotify_not_configured', 'Connect Spotify in Home Assistant to browse music.')
            registry = er.async_get(hass)
            permitted = [entry for entry in entries if any(
                entity.domain == 'media_player' and not entity.disabled
                and connection.user.permissions.check_entity(entity.entity_id, POLICY_READ)
                for entity in er.async_entries_for_config_entry(registry, entry.entry_id))]
            entry = next((entry for entry in permitted if entry.entry_id.lower() == account), None)
            if entry is None:
                raise SearchError('unauthorized', 'You do not have access to this Spotify account.')

            async def get(path, params):
                gateway.check_available()
                session = entry.runtime_data.session
                await session.async_ensure_token_valid()
                gateway.check_available()
                async with aiohttp_client.async_get_clientsession(hass).get(
                    'https://api.spotify.com/v1/' + path,
                    params=params,
                    headers={'Authorization': 'Bearer ' + session.token['access_token']},
                    timeout=ClientTimeout(total=12),
                ) as response:
                    if response.status == 429:
                        try:
                            delay = max(1, min(300, int(response.headers.get('Retry-After', '5'))))
                        except (TypeError, ValueError):
                            delay = 5
                        raise SearchError('rate_limited', 'Spotify is busy. Try again shortly.', delay)
                    if response.status == 401:
                        raise SearchError('spotify_auth_required', 'Spotify access needs attention in Home Assistant.')
                    if response.status == 403:
                        if path.startswith('playlists/'):
                            raise SearchError('spotify_collection_restricted', 'Spotify limits playlist details to playlists you own or collaborate on. You can still play this playlist.')
                        raise SearchError('spotify_auth_required', 'Spotify has not granted access to this collection. Check the existing account permissions in Home Assistant.')
                    if response.status == 404:
                        raise SearchError('spotify_collection_unavailable', 'This Spotify collection is unavailable for this account. You can still try playing supported collections.')
                    if response.status != 200:
                        raise SearchError('spotify_unavailable', 'Spotify collection could not be loaded. Try again.')
                    return await response.json()

            async def fetch(category, item_id, limit, offset, cursor):
                return await fetch_collection(category, item_id, limit, offset, cursor, get)
            result = await gateway.collection(entry.entry_id, msg['media_content_id'], msg['limit'], msg['offset'], msg.get('cursor'), fetch)
            connection.send_result(msg['id'], result)
        except SearchError as error:
            response = websocket_api.error_message(msg['id'], error.code, str(error))
            if error.retry_after is not None:
                response['error']['retry_after'] = error.retry_after
            connection.send_message(response)
        except Exception:
            connection.send_error(msg['id'], 'spotify_unavailable', 'Spotify collection could not be loaded. Try again.')

    websocket_api.async_register_command(hass, collection)
    websocket_api.async_register_command(hass, search)
    return True
