"""Bounded Spotify catalog reads and credential-free response normalization."""
import asyncio
from collections import OrderedDict
import re
from time import monotonic


class SearchError(Exception):
    def __init__(self, code, message, retry_after=None):
        super().__init__(message)
        self.code = code
        self.retry_after = retry_after


def validate_query(query, limit=10, offset=0):
    if (not isinstance(query, str) or not 1 <= len(query.strip()) <= 200
            or any(ord(c) < 32 for c in query)
            or type(limit) is not int or not 1 <= limit <= 10
            or type(offset) is not int or not 0 <= offset <= 1000):
        raise SearchError('invalid_query', 'Enter a search of 1–200 characters and a valid page.')
    return query.strip(), limit, offset


def normalize_search(payload, offset, limit):
    tracks = payload.get('tracks') or {}
    items = []
    for track in (tracks.get('items') or [])[:limit]:
        if (not isinstance(track, dict) or track.get('is_local')
                or track.get('is_playable') is False
                or not re.fullmatch(r'spotify:track:[A-Za-z0-9]{22}', track.get('uri', ''))
                or not isinstance(track.get('name'), str)):
            continue
        images = (track.get('album') or {}).get('images') or []
        image = next((image.get('url') for image in images
                      if isinstance(image, dict) and isinstance(image.get('url'), str)
                      and image['url'].startswith('https://')), None)
        artists = [artist['name'] for artist in track.get('artists', [])
                   if isinstance(artist, dict) and isinstance(artist.get('name'), str)]
        items.append({'title': track['name'], 'subtitle': ', '.join(artists),
                      'media_content_id': track['uri'], 'media_content_type': 'music',
                      'can_play': True, 'can_expand': False, 'thumbnail': image})
    total = tracks.get('total', 0)
    total = total if type(total) is int and total >= 0 else 0
    next_offset = offset + limit
    return {'items': items, 'total': total,
            'next_offset': next_offset if tracks.get('next') and next_offset < total and next_offset <= 1000 else None}


class SearchGateway:
    def __init__(self):
        self.cache = OrderedDict()
        self.inflight = {}
        self.cooldown_until = 0
        self.semaphore = asyncio.Semaphore(2)
        self.started = []

    async def search(self, account, query, limit, offset, fetch):
        query, limit, offset = validate_query(query, limit, offset)
        key = account, query, limit, offset
        now = monotonic()
        if now < self.cooldown_until:
            raise SearchError('rate_limited', 'Spotify is busy. Try again shortly.', max(1, int(self.cooldown_until - now + 1)))
        cached = self.cache.get(key)
        if cached and now - cached[0] < 60:
            self.cache.move_to_end(key)
            return cached[1]
        if key not in self.inflight:
            self.started = [time for time in self.started if now - time < 60]
            if len(self.inflight) >= 4 or len(self.started) >= 30:
                raise SearchError('rate_limited', 'Search is busy. Try again shortly.', 5)
            self.started.append(now)
            task = asyncio.create_task(self._fetch(key, query, limit, offset, fetch))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self.inflight.pop(key, None))
        return await asyncio.shield(self.inflight[key])

    async def _fetch(self, key, query, limit, offset, fetch):
        try:
            async with self.semaphore:
                async with asyncio.timeout(15):
                    result = normalize_search(await fetch(query, limit, offset), offset, limit)
            self.cache[key] = monotonic(), result
            self.cache.move_to_end(key)
            while len(self.cache) > 64:
                self.cache.popitem(last=False)
            return result
        except SearchError as error:
            if error.retry_after:
                self.cooldown_until = monotonic() + error.retry_after
            raise
        except Exception:
            raise SearchError('spotify_unavailable', 'Spotify search could not be loaded. Try again.') from None

    async def close(self):
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.inflight.clear()
        self.cache.clear()
