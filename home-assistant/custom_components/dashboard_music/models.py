"""Pure public models and validation; never carry provider profiles or tokens."""
from dataclasses import dataclass
import re

MESSAGES = {
    'not_configured': 'Spotify library is not configured.',
    'auth_required': 'Spotify authorization is required.',
    'forbidden': 'You do not have permission to use this Spotify account.',
    'rate_limited': 'Spotify is busy. Please try again later.',
    'unavailable': 'Spotify could not complete this request. Please try again.',
    'invalid_request': 'Invalid Spotify library request.',
}

class MusicError(Exception):
    def __init__(self, code, message=None, retry_after=None):
        self.code = code if code in MESSAGES else 'unavailable'
        self.retry_after = clamp_retry(retry_after) if self.code == 'rate_limited' else None
        super().__init__(message or MESSAGES[self.code])


def clamp_retry(value):
    try:
        return max(1, min(300, int(float(value))))
    except (ValueError, TypeError, OverflowError):
        return 1


def validate_uri(uri, kind):
    if not isinstance(uri, str) or re.fullmatch(r'spotify:' + kind + r':[A-Za-z0-9]{22}', uri) is None:
        raise MusicError('invalid_request')
    return uri


def validate_page(offset, limit):
    if type(offset) is not int or not 0 <= offset <= 100000 or type(limit) is not int or not 1 <= limit <= 50:
        raise MusicError('invalid_request')


@dataclass(frozen=True)
class PlaybackState:
    account_id: str | None = None
    device_id: str | None = None
    context_uri: str | None = None
    is_playing: bool | None = None
    is_connect: bool | None = None
