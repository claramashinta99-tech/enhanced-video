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
    """Current YouTube fallbacks: mweb+PO first, cookie only when needed."""
    attempts = [
        # yt-dlp's current PO-token guide recommends mweb + a PO provider.
        {'name': 'mweb-pot-public', 'clients': ['mweb'], 'cookie': False},
        # `default` lets the current nightly pick its preferred public clients.
        {'name': 'default-public', 'clients': ['default'], 'cookie': False},
        {'name': 'embedded-public', 'clients': ['web_embedded'], 'cookie': False},
        {'name': 'android-vr-public', 'clients': ['android_vr'], 'cookie': False, 'selector': 'best/18'},
    ]
    if legacy.youtube_cookie_ready():
        # Recent yt-dlp guidance recommends default+web_embedded when cookies
        # are required; keep Safari as a last authenticated fallback.
        attempts.extend([
            {'name': 'default-embedded-cookie', 'clients': ['default', 'web_embedded'], 'cookie': True},
            {'name': 'safari-cookie', 'clients': ['web_safari'], 'cookie': True},
        ])
    return attempts


def base_opts(url=None, clients=None, use_cookie=True):
    clients = clients or ['mweb']
    opts = _ORIGINAL_BASE_OPTS(url, clients, use_cookie)
    # A blocked YouTube client must not hold the UI for tens of seconds before
    # trying the next route.
    opts['socket_timeout'] = 8
    opts['retries'] = 0
    opts['fragment_retries'] = 1
    opts['extractor_retries'] = 0
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


legacy.base_opts = base_opts
legacy.youtube_attempts = youtube_attempts
legacy.extract_info_sync = extract_info_sync
legacy.APP_VERSION = '1.15.1'
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
