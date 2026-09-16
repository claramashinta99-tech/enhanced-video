import copy
import json
import re
import subprocess
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
_TIKWM_STRATEGY = {'name': 'tikwm-fallback', 'clients': None, 'cookie': False}
_TIKWM_API = 'https://www.tikwm.com/api/'
_TIKWM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://tikwm.com',
    'Referer': 'https://tikwm.com/',
    'X-Requested-With': 'XMLHttpRequest',
}


def _is_tiktok(url):
    try:
        host = urllib.parse.urlparse(str(url)).hostname or ''
        return host.lower().rstrip('.').endswith('tiktok.com')
    except Exception:
        return False


def _normalized_tiktok(url):
    raw = str(url).strip().split('#', 1)[0].split('?', 1)[0].rstrip('/')
    if raw.startswith('http://'):
        raw = 'https://' + raw[7:]
    return raw


def _video_id(url):
    match = re.search(r'/(?:video|photo)/(\d+)', str(url))
    return match.group(1) if match else None


def _username(url):
    match = re.search(r'tiktok\.com/@([\w.-]+)', str(url), re.I)
    return match.group(1) if match else ''


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


def _tikwm_candidates(url):
    normalized = _normalized_tiktok(url)
    vid = _video_id(normalized)
    out = [normalized]
    if vid:
        for candidate in (
            vid,
            f'https://www.tiktok.com/video/{vid}',
            f'https://www.tiktok.com/@tiktok/video/{vid}',
            f'https://m.tiktok.com/v/{vid}.html',
            f'https://www.tiktok.com/@/video/{vid}',
        ):
            if candidate not in out:
                out.append(candidate)
    return out


def _tikwm_fetch(url):
    last_error = None
    for candidate in _tikwm_candidates(url):
        try:
            endpoint = _TIKWM_API + '?' + urllib.parse.urlencode({'url': candidate, 'hd': '1'})
            req = urllib.request.Request(endpoint, headers=_TIKWM_HEADERS)
            with urllib.request.urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode('utf-8', 'replace'))
            if payload.get('code') != 0 or not isinstance(payload.get('data'), dict):
                last_error = payload.get('msg') or payload.get('message') or f'code={payload.get("code")}'
                continue
            data = payload['data']
            play = data.get('hdplay') or data.get('play') or data.get('wmplay')
            images = data.get('images') or []
            if not play and not images:
                last_error = 'no media URL'
                continue
            author = data.get('author') or {}
            return {
                'id': str(data.get('id') or _video_id(url) or ''),
                'title': data.get('title') or data.get('desc') or 'TikTok video',
                'thumbnail': data.get('origin_cover') or data.get('cover') or data.get('ai_dynamic_cover') or None,
                'duration': data.get('duration'),
                'uploader': author.get('unique_id') or author.get('uniqueId') or author.get('nickname') or _username(url),
                'play_url': play,
                'music_url': (data.get('music_info') or {}).get('play') if isinstance(data.get('music_info'), dict) else None,
                'images': images if isinstance(images, list) else [],
            }
        except Exception as exc:
            last_error = f'{type(exc).__name__}: {str(exc)[-240:]}'
    print(f'tikwm fallback failed id={_video_id(url)} detail={last_error}', flush=True)
    return None


def _tikwm_as_info(url, item):
    formats = []
    if item.get('play_url'):
        formats.append({'format_id': 'tikwm-best', 'url': item['play_url'], 'ext': 'mp4', 'vcodec': 'h264', 'acodec': 'aac', 'protocol': 'https'})
    if item.get('music_url'):
        formats.append({'format_id': 'tikwm-audio', 'url': item['music_url'], 'ext': 'mp3', 'vcodec': 'none', 'acodec': 'mp3', 'protocol': 'https'})
    return {
        'id': item.get('id') or _video_id(url),
        'title': item.get('title') or 'TikTok video',
        'thumbnail': item.get('thumbnail'),
        'duration': item.get('duration'),
        'uploader': item.get('uploader') or _username(url),
        'webpage_url': str(url),
        'extractor': 'TikWM fallback',
        'formats': formats,
        '_rvl_tikwm': item,
    }


def extract_info_sync(url):
    if not _is_tiktok(url):
        return _ORIGINAL_EXTRACT_INFO(url)

    opts = legacy.base_opts(url, None, False)
    opts.update({'skip_download': True, 'noplaylist': True, 'retries': 1, 'fragment_retries': 1, 'extractor_retries': 1, 'socket_timeout': 12})
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info and info.get('entries'):
            info = next((item for item in info['entries'] if item), info)
        if not info:
            raise DownloadError('TikTok metadata empty')
        info = copy.deepcopy(info)
        info['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(info)
        legacy.cache_put(url, info, _TIKTOK_STRATEGY)
        return info
    except Exception as exc:
        print(f'tiktok native info failed type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)

    fallback = _tikwm_fetch(url)
    if fallback:
        info = _tikwm_as_info(url, fallback)
        legacy.cache_put(url, info, _TIKWM_STRATEGY)
        print(f'tiktok info fallback ok id={info.get("id")}', flush=True)
        return info
    raise DownloadError('TikTok media info failed')


def _tiktok_format(quality):
    if quality == 'audio':
        return 'bestaudio/best'
    if quality in legacy.EXACT_QUALITIES:
        target = legacy.EXACT_QUALITIES[quality]
        return f'best[height<={target}]/best'
    return 'best'


def _safe_filename(value):
    name = re.sub(r'[\\/:*?"<>|]+', ' ', str(value or 'TikTok video'))
    name = re.sub(r'\s+', ' ', name).strip()[:90]
    return name or 'TikTok video'


def _stream_url_to_file(media_url, path, job_id=None, stage='Mengambil media'):
    headers = {'User-Agent': _TIKWM_HEADERS['User-Agent'], 'Referer': 'https://www.tiktok.com/', 'Accept': '*/*'}
    req = urllib.request.Request(media_url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response, open(path, 'wb') as out:
        total = int(response.headers.get('Content-Length') or 0)
        done = 0
        while True:
            chunk = response.read(512 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if job_id:
                progress = 15 + int(min(1, done / total) * 70) if total else min(80, 15 + done // (512 * 1024))
                legacy.job_update(job_id, state='working', progress=progress, stage=stage)
    if not path.is_file() or path.stat().st_size < 1024:
        raise DownloadError('TikWM media file empty')
    return path


def _download_tikwm(url, quality, workdir, job_id=None):
    item = _tikwm_fetch(url)
    if not item:
        raise DownloadError('TikWM fallback unavailable')
    legacy.clear_workdir(workdir)
    title = _safe_filename(item.get('title'))
    vid = item.get('id') or _video_id(url) or 'tiktok'

    if quality == 'audio' and item.get('music_url'):
        ext = '.mp3' if '.mp3' in item['music_url'].lower() else '.m4a'
        source = Path(workdir) / f'{title} [{vid}]{ext}'
        _stream_url_to_file(item['music_url'], source, job_id, 'Mengambil audio')
        if source.suffix.lower() == '.mp3':
            return source
        target = Path(workdir) / f'{title} [{vid}].mp3'
        if job_id:
            legacy.job_update(job_id, state='working', progress=88, stage='Convert MP3')
        subprocess.run(['ffmpeg', '-y', '-i', str(source), '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', str(target)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        return target

    media_url = item.get('play_url')
    if not media_url:
        raise DownloadError('TikWM video URL unavailable')
    target = Path(workdir) / f'{title} [{vid}].mp4'
    return _stream_url_to_file(media_url, target, job_id, 'Mengambil media')


def download_sync(url, quality, workdir, job_id=None):
    if not _is_tiktok(url):
        return _ORIGINAL_DOWNLOAD_SYNC(url, quality, workdir, job_id)

    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan')
    legacy.clear_workdir(workdir)

    opts = legacy.base_opts(url, None, False)
    opts.update({'format': _tiktok_format(quality), 'outtmpl': str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s'), 'windowsfilenames': True, 'noplaylist': True, 'retries': 1, 'fragment_retries': 1, 'extractor_retries': 1, 'socket_timeout': 15})
    if job_id:
        hooks, posts = legacy.make_progress_hooks(job_id, quality)
        opts['progress_hooks'] = hooks
        opts['postprocessor_hooks'] = posts
    if quality == 'audio':
        opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        path = legacy.find_output(workdir)
        if info:
            fresh = copy.deepcopy(info)
            fresh['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(fresh)
            legacy.cache_put(url, fresh, _TIKTOK_STRATEGY)
        return path
    except Exception as exc:
        print(f'tiktok native download failed type={type(exc).__name__} detail={str(exc)[-500:]}', flush=True)

    if job_id:
        legacy.job_update(job_id, state='working', progress=12, stage='Mencoba jalur cadangan')
    path = _download_tikwm(url, quality, workdir, job_id)
    print(f'tiktok download fallback ok id={_video_id(url)}', flush=True)
    return path


legacy.extract_info_sync = extract_info_sync
legacy.download_sync = download_sync
legacy.APP_VERSION = '1.15.8'
app.version = legacy.APP_VERSION
