import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from urllib.parse import urlparse

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import shorts_app as base

app = base.app
legacy = base.legacy

_ORIGINAL_BASE_OPTS = legacy.base_opts
_ANSI = re.compile(r'\x1b\[[0-9;]*m')
_SELFTEST_URL = 'https://www.youtube.com/watch?v=Xh7I5J8eDQY'
_KNOWN_URL = _SELFTEST_URL


def _clean_text(value, limit=420):
    text = _ANSI.sub('', str(value or '')).replace('\n', ' ').replace('\r', ' ').strip()
    if len(text) > limit:
        text = text[-limit:]
    return text


def _clean_error(exc):
    return f'{type(exc).__name__}: {_clean_text(exc) or "no message"}'


def youtube_attempts():
    attempts = [
        {'name': 'mweb-pot-public', 'clients': ['mweb'], 'cookie': False},
        {'name': 'default-public', 'clients': ['default'], 'cookie': False},
        {'name': 'embedded-public', 'clients': ['web_embedded'], 'cookie': False},
        {'name': 'android-vr-public', 'clients': ['android_vr'], 'cookie': False, 'selector': 'best/18'},
    ]
    if legacy.youtube_cookie_ready():
        attempts.extend([
            {'name': 'default-embedded-cookie', 'clients': ['default', 'web_embedded'], 'cookie': True},
            {'name': 'safari-cookie', 'clients': ['web_safari'], 'cookie': True},
        ])
    return attempts


SELFTEST_STRATEGIES = [
    {'name': 'visionos-studio-skip', 'clients': ['visionos'], 'cookie': False, 'disable_plugins': True, 'player_skip': ['webpage', 'configs'], 'innertube_host': 'studio.youtube.com'},
    {'name': 'visionos-music-skip', 'clients': ['visionos'], 'cookie': False, 'disable_plugins': True, 'player_skip': ['webpage', 'configs'], 'innertube_host': 'music.youtube.com'},
    {'name': 'visionos-mobile-skip', 'clients': ['visionos'], 'cookie': False, 'disable_plugins': True, 'player_skip': ['webpage', 'configs'], 'innertube_host': 'm.youtube.com'},
    {'name': 'visionos-nocookie-skip', 'clients': ['visionos'], 'cookie': False, 'disable_plugins': True, 'player_skip': ['webpage', 'configs'], 'innertube_host': 'www.youtube-nocookie.com'},
    {'name': 'visionos-googleapis-skip', 'clients': ['visionos'], 'cookie': False, 'disable_plugins': True, 'player_skip': ['webpage', 'configs'], 'innertube_host': 'youtubei.googleapis.com'},
    {'name': 'web-cookie-test', 'clients': ['web'], 'cookie': True},
    {'name': 'mweb-cookie-test', 'clients': ['mweb'], 'cookie': True},
    {'name': 'safari-cookie-test', 'clients': ['web_safari'], 'cookie': True},
    {'name': 'creator-cookie-test', 'clients': ['web_creator'], 'cookie': True},
    {'name': 'music-cookie-test', 'clients': ['web_music'], 'cookie': True},
    {'name': 'tv-cookie-test', 'clients': ['tv'], 'cookie': True},
    {'name': 'ios-cookie-test', 'clients': ['ios'], 'cookie': True},
    {'name': 'android-cookie-test', 'clients': ['android'], 'cookie': True},
]


def base_opts(url=None, clients=None, use_cookie=True):
    clients = clients or ['mweb']
    opts = _ORIGINAL_BASE_OPTS(url, clients, use_cookie)
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
            opts = base_opts(url, strategy.get('clients'), strategy.get('cookie', False))
            opts['skip_download'] = True
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            if info:
                if info.get('entries'):
                    info = next((item for item in info['entries'] if item), info)
                legacy.cache_put(url, info, strategy)
                print(f'youtube info ok host={urlparse(url).hostname} strategy={strategy["name"]}', flush=True)
                return info
        except Exception as exc:
            detail = _clean_error(exc)
            errors.append(f'{strategy["name"]}={detail}')
            print(
                f'youtube attempt failed host={urlparse(url).hostname} '
                f'strategy={strategy["name"]} error={detail}',
                flush=True,
            )

    joined = ' | '.join(errors)
    print(f'media info failed host={urlparse(url).hostname} details={joined}', flush=True)
    raise DownloadError('media info failed')


def _strategy_by_name(name):
    all_strategies = [*SELFTEST_STRATEGIES, *youtube_attempts()]
    return next((item for item in all_strategies if item['name'] == name), None)


def _cli_extract(strategy, url=_SELFTEST_URL, hard_timeout=24):
    clients = ','.join(strategy.get('clients') or ['default'])
    youtube_args = [f'player_client={clients}']
    if strategy.get('player_skip'):
        youtube_args.append('player_skip=' + ','.join(strategy['player_skip']))
    if strategy.get('innertube_host'):
        youtube_args.append('innertube_host=' + strategy['innertube_host'])
    cmd = [
        sys.executable, '-m', 'yt_dlp',
        '--dump-single-json', '--skip-download', '--no-playlist',
        '--quiet', '--no-warnings', '--no-config-locations',
        '--socket-timeout', '8', '--retries', '0', '--extractor-retries', '0',
        '--fragment-retries', '0', '--js-runtimes', 'node',
        '--user-agent', legacy.YOUTUBE_UA,
        '--extractor-args', 'youtube:' + ';'.join(youtube_args),
    ]
    if strategy.get('disable_plugins'):
        cmd.append('--no-plugin-dirs')
    else:
        cmd.extend(['--extractor-args', f'youtubepot-bgutilhttp:base_url={legacy.POT_URL}'])
    if strategy.get('cookie'):
        cookie = legacy.writable_cookie()
        if cookie:
            cmd.extend(['--cookies', str(cookie)])
    cmd.append(url)

    env = os.environ.copy()
    if strategy.get('disable_plugins'):
        env['YTDLP_NO_PLUGINS'] = '1'

    started = time.monotonic()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=hard_timeout, check=False, env=env)
    except subprocess.TimeoutExpired:
        return {
            'ok': False,
            'timeout': True,
            'seconds': round(time.monotonic() - started, 2),
            'error': f'hard timeout after {hard_timeout}s',
        }

    seconds = round(time.monotonic() - started, 2)
    if proc.returncode != 0:
        return {
            'ok': False,
            'timeout': False,
            'seconds': seconds,
            'returncode': proc.returncode,
            'error': _clean_text(proc.stderr or proc.stdout, 1000) or 'yt-dlp failed without message',
        }

    try:
        info = json.loads(proc.stdout)
    except Exception as exc:
        return {'ok': False, 'timeout': False, 'seconds': seconds, 'error': f'json parse failed: {_clean_text(exc)}'}

    heights = sorted({
        int(item.get('height') or 0)
        for item in (info.get('formats') or [])
        if isinstance(item, dict) and item.get('height')
    })
    return {
        'ok': True,
        'timeout': False,
        'seconds': seconds,
        'title': info.get('title'),
        'id': info.get('id'),
        'formats': len(info.get('formats') or []),
        'max_height': max(heights, default=0),
    }


def _timed_http(url, timeout=7):
    started = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': legacy.YOUTUBE_UA})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read(4096)
            return {
                'ok': 200 <= response.status < 400,
                'status': response.status,
                'seconds': round(time.monotonic() - started, 2),
                'bytes': len(data),
            }
    except Exception as exc:
        return {
            'ok': False,
            'seconds': round(time.monotonic() - started, 2),
            'error': _clean_error(exc),
        }


def _network_selftest():
    encoded = urllib.parse.quote(_KNOWN_URL, safe='')
    return {
        'youtube_watch': _timed_http(_KNOWN_URL),
        'youtube_oembed': _timed_http(f'https://www.youtube.com/oembed?url={encoded}&format=json'),
        'studio_root': _timed_http('https://studio.youtube.com/', timeout=7),
        'music_root': _timed_http('https://music.youtube.com/', timeout=7),
        'mobile_root': _timed_http('https://m.youtube.com/', timeout=7),
        'nocookie_root': _timed_http('https://www.youtube-nocookie.com/', timeout=7),
        'pot_provider': legacy.pot_provider_status(),
    }


legacy.base_opts = base_opts
legacy.youtube_attempts = youtube_attempts
legacy.extract_info_sync = extract_info_sync
legacy.APP_VERSION = '1.15.7'
app.version = legacy.APP_VERSION


@app.get('/api/youtube/engine')
async def youtube_engine_status():
    return {
        'version': legacy.APP_VERSION,
        'yt_dlp': legacy.package_version('yt-dlp'),
        'cookie_ready': legacy.youtube_cookie_ready(),
        'pot_provider': legacy.pot_provider_status(),
        'attempts': [item['name'] for item in youtube_attempts()],
        'selftest_attempts': [item['name'] for item in SELFTEST_STRATEGIES],
        'selftest_video': _SELFTEST_URL,
    }


@app.get('/api/youtube/selftest/{strategy_name}')
async def youtube_strategy_selftest(strategy_name: str, url: str = _SELFTEST_URL):
    strategy = _strategy_by_name(strategy_name)
    if not strategy:
        raise HTTPException(404, 'Unknown YouTube strategy')
    try:
        target = legacy.validate_url(url)
    except Exception as exc:
        raise HTTPException(400, 'Invalid YouTube URL') from exc
    if not legacy.is_youtube(target):
        raise HTTPException(400, 'YouTube URL required')
    result = await asyncio.to_thread(_cli_extract, strategy, target)
    return {'strategy': strategy_name, 'url': target, **result}


@app.get('/api/youtube/nettest')
async def youtube_network_selftest():
    return await asyncio.to_thread(_network_selftest)
