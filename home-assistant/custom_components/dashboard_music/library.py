"""Account-bound paginated library and confirmed track save state."""
import asyncio
from collections import OrderedDict
from contextlib import asynccontextmanager
import copy
import time
from .models import LIKED_SONGS_URI, validate_playback_context, MusicError, validate_page, validate_uri


class Library:
    def __init__(self, gateway, clock=time.monotonic):
        self.gateway = gateway
        self.clock = clock
        self.pages = OrderedDict()
        self.saved = OrderedDict()
        self.track_locks = {}
        self._page_lock = asyncio.Lock()

    async def page(self, offset: int, limit: int = 50, refresh: bool = False) -> dict:
        validate_page(offset, limit)
        if type(refresh) is not bool:
            raise MusicError('invalid_request')
        async with asyncio.timeout(30):
            async with self._page_lock:
                key = (offset, limit)
                cached = self.pages.get(key)
                if not refresh and cached and self.clock() - cached[0] < 60:
                    self.pages.move_to_end(key)
                    return copy.deepcopy(cached[1])
                result = await self.gateway.list_playlists(offset, limit)
                # A gateway supplies wire pages; de-duplicate by URI, never title.
                seen = set()
                result = copy.deepcopy(result)
                items = []
                for item in result['items']:
                    if item['uri'] not in seen:
                        seen.add(item['uri'])
                        items.append(item)
                result['items'] = items
                if refresh:
                    self.pages.clear()
                self.pages[key] = (self.clock(), result)
                self.pages.move_to_end(key)
                while len(self.pages) > 200:
                    self.pages.popitem(last=False)
                return copy.deepcopy(result)

    async def contains_playlist(self, uri: str) -> bool:
        validate_playback_context(uri)
        if uri == LIKED_SONGS_URI:
            self.gateway.verify_account()
            return True
        # Revalidate launch membership from the current library. A recent visible
        # page alone cannot establish that a playlist has not been unfollowed.
        try:
            async with asyncio.timeout(30):
                offset = 0
                for index in range(200):
                    page = await self.page(offset, 50, refresh=index == 0)
                    if any(item['uri'] == uri for item in page['items']):
                        return True
                    next_offset = page['nextOffset']
                    if next_offset is None:
                        return False
                    if type(next_offset) is not int or next_offset <= offset:
                        raise MusicError('unavailable')
                    offset = next_offset
                raise MusicError('unavailable', 'Playlist membership could not be established within 200 pages.')
        except TimeoutError:
            raise MusicError('unavailable') from None

    @asynccontextmanager
    async def _track_lock(self, uri):
        lock, count = self.track_locks.get(uri, (asyncio.Lock(), 0))
        self.track_locks[uri] = (lock, count + 1)
        try:
            async with lock:
                yield
        finally:
            _, count = self.track_locks[uri]
            if count == 1:
                del self.track_locks[uri]
            else:
                self.track_locks[uri] = (lock, count - 1)

    def _cache_saved(self, uri, value):
        if type(value) is not bool:
            raise MusicError('unavailable')
        self.saved[uri] = (self.clock(), value)
        self.saved.move_to_end(uri)
        while len(self.saved) > 500:
            self.saved.popitem(last=False)
        return {'track_uri': uri, 'saved': value}

    async def saved_track(self, uri: str) -> dict:
        validate_uri(uri, 'track')
        async with asyncio.timeout(30):
            async with self._track_lock(uri):
                cached = self.saved.get(uri)
                current = getattr(self.gateway, 'saved_state_current', lambda _uri: True)(uri)
                if cached and current and self.clock() - cached[0] < 30:
                    self.saved.move_to_end(uri)
                    return {'track_uri': uri, 'saved': cached[1]}
                self.saved.pop(uri, None)
                return self._cache_saved(uri, await self.gateway.track_saved(uri))

    async def set_saved_track(self, uri: str, saved: bool) -> dict:
        validate_uri(uri, 'track')
        if type(saved) is not bool:
            raise MusicError('invalid_request')
        async with asyncio.timeout(30):
            async with self._track_lock(uri):
                self.saved.pop(uri, None)
                await self.gateway.set_track_saved(uri, saved)
                return self._cache_saved(uri, await self.gateway.track_saved(uri))

    def clear(self):
        self.pages.clear()
        self.saved.clear()
