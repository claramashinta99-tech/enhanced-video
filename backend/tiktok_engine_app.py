import copy
import json
import urllib.parse
import urllib.request
from pathlib import Path

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import youtube_engine_app as engine

app = engine.app
legacy = engine.legacy

_ORIGINAL_EXTRACT_INFO = legacy.extract_info_sync
_ORIGINAL_DOWNLOAD_SYNC = legacy.download_sync
_TIKTOK_STRATEGY = {'name': 'tiktok-fresh', 'clients': None, 'cookie': False}


def _is_tiktok(url):
    try:
        host = urllib.parse.urlparse(str(url)).hostname or ''
        return host.lower().rstrip('.').endswith('tiktok.com')
    except Exception:
        return False


def _best_thumbnail(info):
    direct = info.get('thumbnail')
    if direct:
        return direct
    thumbs = [x for x in (info.get('thumbnails') or []) if isinstance(x, dict) and x.get('url')]
    if not thumbs:
        return None
    def score(item):
        try:
            return int(item.get('width') or 0) * int(item.get('height') or 0)
        except Exception:
            return 0
    return max(thumbs, key=score).get('url')


def _tiktok_oembed_thumbnail(url):
    try:
        endpoint = 'https://www.tiktok.com/oembed?url=' + urllib.parse.quote(str(url), safe='')
        req = urllib.request.Request(endpoint, headers={'User-Agent': legacy.YOUTUBE_UA})
        with urllib.request.urlopen(req, timeout=6) as response:
            payload = json.loads(response.read().decode('utf-8', 'replace'))
        return payload.get('thumbnail_url') or None
    except Exception:
        return None


def extract_info_sync(url):
    if not _is_tiktok(url):
        return _ORIGINAL_EXTRACT_INFO(url)

    # TikTok CDN URLs are short lived. Always refresh metadata instead of serving
    # stale cached extractor results. process=True also fills thumbnails/formats.
    opts = legacy.base_opts(url, None, False)
    opts.update({
        'skip_download': True,
        'noplaylist': True,
        'retries': 1,
        'fragment_retries': 1,
        'extractor_retries': 1,
        'socket_timeout': 12,
    })
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info and info.get('entries'):
            info = next((item for item in info['entries'] if item), info)
        if not info:
            raise DownloadError('TikTok metadata empty')
        info = copy.deepcopy(info)
        # Prefer official oEmbed cover for browser display. It is generally more
        # suitable for hotlinking than an extractor-internal poster URL.
        info['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(info)
        legacy.cache_put(url, info, _TIKTOK_STRATEGY)
        return info
    except Exception as exc:
        print(f'tiktok info failed type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)
        raise DownloadError('TikTok media info failed') from exc


def _tiktok_format(quality):
    if quality == 'audio':
        return 'bestaudio/best'
    if quality in legacy.EXACT_QUALITIES:
        target = legacy.EXACT_QUALITIES[quality]
        return f'best[height<={target}]/best'
    # TikTok normally exposes a ready-to-download muxed MP4. Do not use the
    # YouTube bv+ba selector here.
    return 'best'


def download_sync(url, quality, workdir, job_id=None):
    if not _is_tiktok(url):
        return _ORIGINAL_DOWNLOAD_SYNC(url, quality, workdir, job_id)

    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan')
    legacy.clear_workdir(workdir)

    opts = legacy.base_opts(url, None, False)
    opts.update({
        'format': _tiktok_format(quality),
        'outtmpl': str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s'),
        'windowsfilenames': True,
        'noplaylist': True,
        'retries': 1,
        'fragment_retries': 1,
        'extractor_retries': 1,
        'socket_timeout': 15,
    })
    if job_id:
        hooks, posts = legacy.make_progress_hooks(job_id, quality)
        opts['progress_hooks'] = hooks
        opts['postprocessor_hooks'] = posts
    if quality == 'audio':
        opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]

    try:
        # Fresh extraction + download in one YoutubeDL call prevents us from
        # reusing an expired TikTok CDN URL from /api/info.
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        path = legacy.find_output(workdir)
        if info:
            fresh = copy.deepcopy(info)
            fresh['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(fresh)
            legacy.cache_put(url, fresh, _TIKTOK_STRATEGY)
        return path
    except Exception as exc:
        print(f'tiktok download failed type={type(exc).__name__} detail={str(exc)[-500:]}', flush=True)
        raise DownloadError('TikTok download failed') from exc


legacy.extract_info_sync = extract_info_sync
legacy.download_sync = download_sync
legacy.APP_VERSION = '1.15.7'
app.version = legacy.APP_VERSION
