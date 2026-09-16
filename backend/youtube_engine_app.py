import re
from urllib.parse import urlparse

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import shorts_app as base

app = base.app
legacy = base.legacy

_ORIGINAL_BASE_OPTS = legacy.base_opts
_ANSI = re.compile(r'\x1b\[[0-9;]*m')


def _clean_error(exc):
    text = _ANSI.sub('', str(exc)).replace('\n', ' ').replace('\r', ' ').strip()
    if len(text) > 420:
        text = text[-420:]
    return f'{type(exc).__name__}: {text or "no message"}'


def youtube_attempts():
    """Use current yt-dlp clients first, with cookie and public fallbacks."""
    public = [
        {'name': 'visionos-web-public', 'clients': ['visionos', 'web'], 'cookie': False},
        {'name': 'tv-public', 'clients': ['tv', 'tv_downgraded'], 'cookie': False},
        {'name': 'embedded-public', 'clients': ['web_embedded'], 'cookie': False},
        {'name': 'android-vr-public', 'clients': ['android_vr'], 'cookie': False, 'selector': 'best/18'},
    ]
    if legacy.youtube_cookie_ready():
        return [
            {'name': 'web-cookie', 'clients': ['web'], 'cookie': True},
            {'name': 'mweb-cookie', 'clients': ['mweb'], 'cookie': True},
            *public,
        ]
    return public


def base_opts(url=None, clients=None, use_cookie=True):
    clients = clients or ['visionos', 'web']
    opts = _ORIGINAL_BASE_OPTS(url, clients, use_cookie)
    # Fail over quickly when a YouTube client is blocked instead of making the
    # user wait through long retries on the same broken route.
    opts['socket_timeout'] = 12
    opts['retries'] = 1
    opts['fragment_retries'] = 1
    opts['extractor_retries'] = 1
    return opts


def extract_info_sync(url):
    cached = legacy.cache_get(url)
    if cached:
        return cached['info']

    attempts = youtube_attempts() if legacy.is_youtube(url) else [
        {'name': 'default', 'clients': None, 'cookie': False}
    ]
    errors = []

    for strategy in attempts:
        try:
            opts = base_opts(
                url,
                strategy.get('clients'),
                strategy.get('cookie', False),
            )
            opts['skip_download'] = True
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            if info:
                if info.get('entries'):
                    info = next((item for item in info['entries'] if item), info)
                legacy.cache_put(url, info, strategy)
                print(
                    'youtube info ok '
                    f'host={urlparse(url).hostname} strategy={strategy["name"]}',
                    flush=True,
                )
                return info
        except Exception as exc:
            detail = _clean_error(exc)
            errors.append(f'{strategy["name"]}={detail}')
            print(
                'youtube attempt failed '
                f'host={urlparse(url).hostname} strategy={strategy["name"]} error={detail}',
                flush=True,
            )

    joined = ' | '.join(errors)
    print(
        f'media info failed host={urlparse(url).hostname} details={joined}',
        flush=True,
    )
    raise DownloadError('media info failed')


# app.py handlers resolve these globals at request time, so patching the legacy
# module upgrades both ordinary YouTube videos and the dedicated Shorts route
# without duplicating the downloader implementation.
legacy.base_opts = base_opts
legacy.youtube_attempts = youtube_attempts
legacy.extract_info_sync = extract_info_sync
legacy.APP_VERSION = '1.15.0'
app.version = legacy.APP_VERSION


@app.get('/api/youtube/engine')
async def youtube_engine_status():
    return {
        'version': legacy.APP_VERSION,
        'yt_dlp': legacy.package_version('yt-dlp'),
        'cookie_ready': legacy.youtube_cookie_ready(),
        'pot_provider': legacy.pot_provider_status(),
        'attempts': [item['name'] for item in youtube_attempts()],
    }
