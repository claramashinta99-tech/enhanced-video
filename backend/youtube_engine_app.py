import asyncio
import json
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
_SELFTEST_URL = 'https://www.youtube.com/watch?v=hLKiVtoD83k'
_KNOWN_URL = 'https://www.youtube.com/watch?v=9_0Dk2B2zmA'


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
    return next((item for item in youtube_attempts() if item['name'] == name), None)


def _cli_extract(strategy, url=_SELFTEST_URL, hard_timeout=12):
    clients = ','.join(strategy.get('clients') or ['default'])
    cmd = [
        sys.executable, '-m', 'yt_dlp',
        '--dump-single-json', '--skip-download', '--no-playlist',
        '--quiet', '--no-warnings', '--no-config-locations',
        '--socket-timeout', '7', '--retries', '0', '--extractor-retries', '0',
        '--fragment-retries', '0', '--js-runtimes', 'node',
        '--user-agent', legacy.YOUTUBE_UA,
        '--extractor-args', f'youtube:player_client={clients}',
        '--extractor-args', f'youtubepot-bgutilhttp:base_url={legacy.POT_URL}',
    ]
    if strategy.get('cookie'):
        cookie = legacy.writable_cookie()
        if cookie:
            cmd.extend(['--cookies', str(cookie)])
    cmd.append(url)

    started = time.monotonic()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=hard_timeout, check=False)
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
            'error': _clean_text(proc.stderr or proc.stdout, 700) or 'yt-dlp failed without message',
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
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, '-m', 'yt_dlp', '--version'],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        startup = {
            'ok': proc.returncode == 0,
            'seconds': round(time.monotonic() - started, 2),
            'value': _clean_text(proc.stdout or proc.stderr, 80),
        }
    except Exception as exc:
        startup = {'ok': False, 'seconds': round(time.monotonic() - started, 2), 'error': _clean_error(exc)}

    encoded = urllib.parse.quote(_KNOWN_URL, safe='')
    return {
        'yt_dlp_startup': startup,
        'youtube_watch': _timed_http(_KNOWN_URL),
        'youtube_oembed': _timed_http(f'https://www.youtube.com/oembed?url={encoded}&format=json'),
        'pot_provider': legacy.pot_provider_status(),
    }


legacy.base_opts = base_opts
legacy.youtube_attempts = youtube_attempts
legacy.extract_info_sync = extract_info_sync
legacy.APP_VERSION = '1.15.3'
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


@app.get('/api/youtube/selftest/{strategy_name}')
async def youtube_strategy_selftest(strategy_name: str):
    strategy = _strategy_by_name(strategy_name)
    if not strategy:
        raise HTTPException(404, 'Unknown YouTube strategy')
    result = await asyncio.to_thread(_cli_extract, strategy)
    return {'strategy': strategy_name, **result}


@app.get('/api/youtube/nettest')
async def youtube_network_selftest():
    return await asyncio.to_thread(_network_selftest)
