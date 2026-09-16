import re
from urllib.parse import urlparse

import diagnostic_app as base

app = base.app
legacy = base.legacy

_ORIGINAL_VALIDATE_URL = legacy.validate_url
_YOUTUBE_HOSTS = {
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'music.youtube.com', 'youtu.be'
}
_SHORT_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')


def canonicalize_youtube_url(value):
    """Normalize Shorts URLs before yt-dlp/cache/job processing."""
    url = str(value)
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower().rstrip('.')
        if host not in _YOUTUBE_HOSTS:
            return url

        parts = [p for p in parsed.path.split('/') if p]
        if len(parts) >= 2 and parts[0].lower() == 'shorts':
            video_id = parts[1]
            if _SHORT_ID.fullmatch(video_id):
                return f'https://www.youtube.com/watch?v={video_id}'
    except Exception:
        return url
    return url


def validate_url(value):
    return _ORIGINAL_VALIDATE_URL(canonicalize_youtube_url(value))


# Existing FastAPI handlers resolve app.py globals at request time, while
# mp3_app explicitly calls legacy.validate_url. Patching this module function
# keeps existing APIs intact and makes Shorts use the stable watch URL.
legacy.validate_url = validate_url
legacy.APP_VERSION = '1.14.0'
app.version = legacy.APP_VERSION


@app.get('/api/shorts/normalize')
async def shorts_normalize(url: str):
    normalized = canonicalize_youtube_url(url)
    parsed = urlparse(str(url))
    parts = [p for p in parsed.path.split('/') if p]
    is_short = len(parts) >= 2 and parts[0].lower() == 'shorts' and bool(_SHORT_ID.fullmatch(parts[1]))
    return {'is_short': is_short, 'url': normalized}
