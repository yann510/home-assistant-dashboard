"""Read-only Spotify collections using the existing authorized account."""
import re
from yarl import URL
from .search import SearchError, normalize_search, _object, _text

COLLECTIONS = {
    'current_user_saved_tracks': ('me/tracks', 'track', 'Liked songs', 'track'),
    'current_user_playlists': ('me/playlists', 'playlist', 'Playlists', None),
    'current_user_saved_albums': ('me/albums', 'album', 'Albums', 'album'),
    'current_user_followed_artists': ('me/following', 'artist', 'Artists', None),
    'current_user_top_tracks': ('me/top/tracks', 'track', 'Top tracks', None),
    'current_user_top_artists': ('me/top/artists', 'artist', 'Top artists', None),
    'current_user_recently_played': ('me/player/recently-played', 'track', 'Recently played', 'track'),
}
MAX_OFFSET = 10000
ID_PATTERN = r'[A-Za-z0-9]{22}'


def collection_account(media_id):
    """Validate the complete wrapper before using its account for permission lookup."""
    if not isinstance(media_id, str) or len(media_id) > 300:
        raise SearchError('invalid_collection', 'Choose a valid Spotify collection.')
    match = re.fullmatch(r'spotify://([A-Za-z0-9_-]+)/([A-Za-z0-9_:]+)', media_id)
    if not match:
        raise SearchError('invalid_collection', 'Choose a valid Spotify collection.')
    return match.group(1).lower(), match.group(2)


def validate_collection(media_id, account, limit=50, offset=0, cursor=None):
    wrapped_account, target = collection_account(media_id)
    if wrapped_account != account.lower():
        raise SearchError('unauthorized', 'You do not have access to this Spotify account.')
    match = re.fullmatch(r'spotify:(playlist|album|artist):(' + ID_PATTERN + ')', target)
    if target in COLLECTIONS:
        category, item_id = target, None
    elif match:
        category, item_id = match.groups()
    else:
        raise SearchError('invalid_collection', 'This Spotify collection is not supported.')
    valid_cursor = cursor is None
    if category == 'current_user_followed_artists':
        valid_cursor = cursor is None or (isinstance(cursor, str) and re.fullmatch(ID_PATTERN, cursor) is not None)
    elif category == 'current_user_recently_played':
        valid_cursor = cursor is None or (isinstance(cursor, str) and re.fullmatch(r'[0-9]{1,16}', cursor) is not None)
    if (type(limit) is not int or not 1 <= limit <= 50 or type(offset) is not int
            or not 0 <= offset <= MAX_OFFSET or not valid_cursor
            or (category in ('current_user_followed_artists', 'current_user_recently_played') and offset != 0)):
        raise SearchError('invalid_collection', 'Choose a valid Spotify collection page.')
    return category, item_id, limit, offset, cursor


async def fetch_collection(category, item_id, limit, offset, cursor, get):
    """Fixed server paths only; never follow upstream pagination URLs."""
    if category in COLLECTIONS:
        path = COLLECTIONS[category][0]
        params = {'limit': limit, 'offset': offset}
        if category == 'current_user_followed_artists':
            params = {'type': 'artist', 'limit': limit}
            if cursor is not None: params['after'] = cursor
        elif category == 'current_user_recently_played':
            params = {'limit': limit}
            if cursor is not None: params['before'] = cursor
        payload = await get(path, params)
        page = _object(payload).get('artists') if category == 'current_user_followed_artists' else payload
        return {'page': page}
    metadata = await get(category + 's/' + item_id, {})
    if category == 'playlist':
        # Dev mode returns metadata only for playlists outside owner/collaborator access.
        if not isinstance(_object(metadata).get('items'), dict) and not isinstance(_object(metadata).get('tracks'), dict):
            raise SearchError('spotify_collection_restricted', 'Spotify limits playlist details to playlists you own or collaborate on. You can still play this playlist.')
        path = 'playlists/' + item_id + '/items'
    elif category == 'album':
        path = 'albums/' + item_id + '/tracks'
    else:
        # Artist top-tracks was removed in development mode; albums remain supported.
        path = 'artists/' + item_id + '/albums'
    return {'metadata': metadata, 'page': await get(path, {'limit': limit, 'offset': offset})}


def normalize_collection(payload, category, item_id, account, offset, limit):
    payload = _object(payload)
    page = payload.get('page')
    if not isinstance(page, dict) or not isinstance(page.get('items'), list):
        code = 'spotify_collection_restricted' if category == 'playlist' else 'spotify_unavailable'
        raise SearchError(code, 'Spotify collection details are unavailable. You can still play supported collections.')
    metadata = _object(payload.get('metadata'))
    kind = COLLECTIONS[category][1] if category in COLLECTIONS else ('album' if category == 'artist' else 'track')
    wrapper = COLLECTIONS[category][3] if category in COLLECTIONS else None
    items = []
    for index, source in enumerate(page['items'][:limit]):
        item = _object(source)
        if category == 'playlist': item = _object(item.get('item', item.get('track')))
        elif wrapper: item = _object(item.get(wrapper))
        if category == 'album' and item:
            item = {**item, 'album': metadata}
        row = normalize_search({kind + 's': {'items': [item]}}, 0, 1, kind=kind, account=account)['items']
        if row:
            row[0]['position'] = offset + index
            if category == 'current_user_recently_played' and _text(_object(source).get('played_at')):
                row[0]['played_at'] = _text(source['played_at'])
            items.append(row[0])
    total = page.get('total')
    total = total if type(total) is int and total >= 0 else None
    cursor_category = category in ('current_user_followed_artists', 'current_user_recently_played')
    next_offset = offset + limit
    next_cursor = None
    if cursor_category and page.get('next'):
        candidate = _object(page.get('cursors')).get('after' if category == 'current_user_followed_artists' else 'before')
        pattern = ID_PATTERN if category == 'current_user_followed_artists' else r'[0-9]{1,16}'
        if isinstance(candidate, str) and re.fullmatch(pattern, candidate): next_cursor = candidate
    target = category if category in COLLECTIONS else 'spotify:' + category + ':' + item_id
    media_id = str(URL.build(scheme='spotify', host=account, path='/' + target))
    if category in COLLECTIONS:
        collection = {'title': COLLECTIONS[category][2], 'subtitle': '', 'thumbnail': None,
                      'media_content_id': media_id, 'media_content_type': 'spotify://' + category,
                      'can_play': False, 'can_expand': True}
    else:
        rows = normalize_search({category + 's': {'items': [metadata]}}, 0, 1, kind=category, account=account)['items']
        if not rows:
            raise SearchError('spotify_unavailable', 'Spotify collection metadata could not be loaded.')
        collection = rows[0]
        if category == 'playlist' and _text(metadata.get('description')):
            collection['description'] = _text(metadata['description'])
        if category == 'album' and _text(metadata.get('release_date')):
            collection['release_date'] = _text(metadata['release_date'])
    return {'items': items, 'total': total,
            'next_offset': next_offset if not cursor_category and page.get('next') and total is not None and next_offset < total and next_offset <= MAX_OFFSET else None,
            'next_cursor': next_cursor, 'collection': collection}
