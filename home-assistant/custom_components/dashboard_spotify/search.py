"""Bounded Spotify catalog reads and credential-free response normalization."""
import asyncio
from collections import OrderedDict
import re
from time import monotonic
from yarl import URL

SEARCH_KINDS = ("track", "playlist", "album", "artist")


class SearchError(Exception):
    def __init__(self, code, message, retry_after=None):
        super().__init__(message)
        self.code = code
        self.retry_after = retry_after


def validate_query(query, limit=10, offset=0, kind=None):
    if (not isinstance(query, str) or not 1 <= len(query.strip()) <= 200
            or any(ord(c) < 32 for c in query)
            or type(limit) is not int or not 1 <= limit <= 10
            or type(offset) is not int or not 0 <= offset <= 1000
            or (kind is not None and kind not in (*SEARCH_KINDS, "all"))):
        raise SearchError('invalid_query', 'Enter a search of 1–200 characters and a valid page.')
    return query.strip(), limit, offset


def _object(value):
    return value if isinstance(value, dict) else {}


def _text(value):
    return value[:300] if isinstance(value, str) else ""


def _artists(value):
    return ", ".join(_text(artist.get("name")) for artist in (value if isinstance(value, list) else [])[:20]
                     if isinstance(artist, dict) and isinstance(artist.get("name"), str))[:600]


def _image(images):
    for image in (images if isinstance(images, list) else [])[:20]:
        url = _object(image).get("url")
        if isinstance(url, str) and len(url) <= 2048:
            try:
                parsed = URL(url)
                if parsed.scheme == "https" and parsed.host and not parsed.user and not parsed.password:
                    return url
            except ValueError:
                pass
    return None


def normalize_search(payload, offset, limit, *, kind=None, account=None):
    """Allowlist public metadata; collection credentials always come from account."""
    if kind == "all":
        return {"kind": "all", "groups": {
            category: normalize_search(payload, offset, limit, kind=category, account=account)
            for category in SEARCH_KINDS}}
    category = kind or "track"
    page = _object(_object(payload).get(category + "s"))
    items = []
    source = page.get("items")
    for item in (source if isinstance(source, list) else [])[:limit]:
        if not isinstance(item, dict):
            continue
        uri = item.get("uri")
        if (not isinstance(uri, str)
                or not re.fullmatch(r"spotify:" + category + r":[A-Za-z0-9]{22}", uri)
                or not isinstance(item.get("name"), str)
                or (category == "track" and (item.get("is_local") or item.get("is_playable") is False))):
            continue
        album = _object(item.get("album"))
        subtitle = (_text(_object(item.get("owner")).get("display_name"))
                    or _text(_object(item.get("owner")).get("id"))) if category == "playlist" else (
                        _artists(item.get("artists")) if category in ("track", "album") else _text(item.get("name")))
        if category != "track" and not account:
            raise SearchError("unauthorized", "You do not have access to the Spotify account.")
        normalized = {
            "title": _text(item["name"]), "subtitle": subtitle,
            "media_content_id": uri if category == "track" else str(URL.build(scheme="spotify", host=account, path="/" + uri)),
            "media_content_type": "music" if category == "track" else "spotify://" + category,
            "can_play": category != "artist", "can_expand": category != "track",
            "thumbnail": _image(album.get("images") if category == "track" else item.get("images")),
        }
        if kind is not None:
            normalized["kind"] = category
            duration = item.get("duration_ms")
            if category == "track" and type(duration) is int and 0 <= duration <= 86400000:
                normalized["duration_ms"] = duration
            if category == "track" and _text(album.get("name")):
                normalized["album"] = _text(album["name"])
            if category == "track" and type(item.get("explicit")) is bool:
                normalized["explicit"] = item["explicit"]
        items.append(normalized)
    total = page.get("total", 0)
    total = total if type(total) is int and total >= 0 else 0
    next_offset = offset + limit
    result = {"items": items, "total": total,
              "next_offset": next_offset if page.get("next") and next_offset < total and next_offset <= 1000 else None}
    if kind is not None:
        result["kind"] = category
    return result


class SearchGateway:
    def __init__(self):
        self.cache = OrderedDict()
        self.inflight = {}
        self.cooldown_until = 0
        self.semaphore = asyncio.Semaphore(2)
        self.started = []
        self.closed = False

    async def search(self, account, query, limit, offset, fetch, *, kind=None):
        query, limit, offset = validate_query(query, limit, offset, kind)
        key = account, kind, query, limit, offset
        async def load():
            return normalize_search(await fetch(query, limit, offset), offset, limit, kind=kind, account=account)
        return await self.read(key, load)

    async def collection(self, account, media_id, limit, offset, cursor, fetch):
        from .collection import validate_collection, normalize_collection
        category, item_id, limit, offset, cursor = validate_collection(media_id, account, limit, offset, cursor)
        key = account, 'collection', category, item_id, limit, offset, cursor
        async def load():
            return normalize_collection(await fetch(category, item_id, limit, offset, cursor), category, item_id, account, offset, limit)
        return await self.read(key, load)

    async def read(self, key, load):
        if self.closed:
            raise SearchError('spotify_unavailable', 'Spotify is disconnected. Reconnect to browse music.')
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
            task = asyncio.create_task(self._fetch(key, load))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self.inflight.pop(key, None))
        return await asyncio.shield(self.inflight[key])

    async def _fetch(self, key, load):
        try:
            async with self.semaphore:
                async with asyncio.timeout(15):
                    result = await load()
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
        self.closed = True
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.inflight.clear()
        self.cache.clear()
