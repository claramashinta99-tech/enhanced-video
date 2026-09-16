import copy
import json
import re
import subprocess
import time
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
_ORIGINAL_QUALITY_CHOICES = legacy.quality_choices
_TIKTOK_STRATEGY = {'name': 'tiktok-fresh', 'clients': None, 'cookie': False}
_TIKWM_STRATEGY = {'name': 'tikwm-fallback', 'clients': None, 'cookie': False}
# The base API already whitelists 2160. TikTok exposes this slot in the UI as
# "HD" so we can add the mode without changing the shared YouTube API contract.
_TIKTOK_HD_SLOT = '2160'
_TIKWM_API = 'https://www.tikwm.com/api/'
_TIKWM_SUBMIT = 'https://tikwm.com/api/video/task/submit'
_TIKWM_RESULT = 'https://tikwm.com/api/video/task/result?task_id='
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


def _parse_tikwm_payload(payload, url):
    data = payload.get('data')
    if not isinstance(data, dict):
        return None
    detail = data.get('detail') if isinstance(data.get('detail'), dict) else data
    if not isinstance(detail, dict):
        return None

    hd_url = detail.get('hdplay') or detail.get('hd_play') or detail.get('hdplay_url')
    play_url = detail.get('play') or detail.get('play_url') or detail.get('url') or detail.get('wmplay')
    images = detail.get('images') or data.get('images') or []
    if not hd_url and not play_url and not images:
        return None

    author = detail.get('author') or data.get('author') or {}
    music = detail.get('music_info') or data.get('music_info') or {}
    vid = detail.get('id') or detail.get('video_id') or data.get('video_id') or _video_id(url) or ''
    if isinstance(vid, (int, float)):
        vid = str(int(vid))

    return {
        'id': str(vid),
        'title': detail.get('title') or detail.get('desc') or data.get('title') or 'TikTok video',
        'thumbnail': detail.get('origin_cover') or detail.get('cover') or detail.get('ai_dynamic_cover') or data.get('cover') or None,
        'duration': detail.get('duration') or data.get('duration'),
        'uploader': author.get('unique_id') or author.get('uniqueId') or author.get('nickname') or _username(url),
        'hd_url': hd_url,
        'play_url': play_url or hd_url,
        'music_url': music.get('play') if isinstance(music, dict) else None,
        'images': images if isinstance(images, list) else [],
    }


def _json_request(url, data=None, timeout=10):
    headers = dict(_TIKWM_HEADERS)
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8', 'replace'))


def _tikwm_quick(url):
    last_error = None
    # Ask for the higher-bitrate rendition explicitly. This remains a direct
    # download; there is no upscale/re-encode step.
    for candidate in _tikwm_candidates(url)[:3]:
        try:
            endpoint = _TIKWM_API + '?' + urllib.parse.urlencode({'url': candidate, 'hd': '1'})
            payload = _json_request(endpoint, timeout=8)
            if payload.get('code') == 0:
                item = _parse_tikwm_payload(payload, url)
                if item:
                    return item
            last_error = payload.get('msg') or payload.get('message') or f'code={payload.get("code")}'
        except Exception as exc:
            last_error = f'{type(exc).__name__}: {str(exc)[-180:]}'
    print(f'tikwm quick failed id={_video_id(url)} detail={last_error}', flush=True)
    return None


def _tikwm_task(url):
    last_error = None
    for candidate in _tikwm_candidates(url)[:3]:
        try:
            body = urllib.parse.urlencode({'web': '1', 'url': candidate}).encode()
            payload = _json_request(_TIKWM_SUBMIT, data=body, timeout=10)
            task_id = (payload.get('data') or {}).get('task_id') if isinstance(payload.get('data'), dict) else None
            if payload.get('code') != 0 or not task_id:
                last_error = payload.get('msg') or payload.get('message') or f'code={payload.get("code")}'
                continue
            for _ in range(10):
                time.sleep(0.7)
                result = _json_request(_TIKWM_RESULT + urllib.parse.quote(str(task_id)), timeout=8)
                if result.get('code') != 0 or not isinstance(result.get('data'), dict):
                    continue
                status = result['data'].get('status')
                if status == 3:
                    last_error = 'task failed'
                    break
                if status == 2:
                    item = _parse_tikwm_payload(result, url)
                    if item:
                        print(f'tikwm task ok id={_video_id(url)}', flush=True)
                        return item
                    last_error = 'task finished without media'
                    break
        except Exception as exc:
            last_error = f'{type(exc).__name__}: {str(exc)[-180:]}'
    print(f'tikwm task failed id={_video_id(url)} detail={last_error}', flush=True)
    return None


def _tikwm_fetch(url):
    return _tikwm_quick(url) or _tikwm_task(url)


def _tikwm_as_info(url, item):
    formats = []
    if item.get('play_url'):
        formats.append({'format_id': 'tikwm-best', 'url': item['play_url'], 'ext': 'mp4', 'vcodec': 'h264', 'acodec': 'aac', 'protocol': 'https'})
    if item.get('hd_url') and item.get('hd_url') != item.get('play_url'):
        formats.append({'format_id': 'tikwm-hd', 'url': item['hd_url'], 'ext': 'mp4', 'vcodec': 'h264', 'acodec': 'aac', 'protocol': 'https'})
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
    opts.update({'skip_download': True, 'noplaylist': True, 'retries': 1, 'fragment_retries': 1, 'extractor_retries': 1, 'socket_timeout': 10})
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


def quality_choices(info, platform):
    if platform != 'tiktok':
        return _ORIGINAL_QUALITY_CHOICES(info, platform)
    # "Normal" keeps the native TikTok path. "HD" intentionally uses an
    # existing whitelisted quality id internally; download_sync maps that id
    # to TikTok's higher-bitrate source instead of pretending it is 2160p.
    return [
        {'id': 'best', 'label': 'Normal'},
        {'id': _TIKTOK_HD_SLOT, 'label': 'HD · Highest bitrate'},
    ]


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

    is_hd = quality == _TIKTOK_HD_SLOT
    media_url = (item.get('hd_url') or item.get('play_url')) if is_hd else (item.get('play_url') or item.get('hd_url'))
    if not media_url:
        raise DownloadError('TikWM video URL unavailable')
    suffix = '_hd' if is_hd else ''
    target = Path(workdir) / f'{title} [{vid}]{suffix}.mp4'
    stage = 'Mengambil stream HD' if is_hd else 'Mengambil media'
    return _stream_url_to_file(media_url, target, job_id, stage)


def _rename_hd(path):
    if not path or path.suffix.lower() == '.mp3' or path.stem.endswith('_hd'):
        return path
    target = path.with_name(f'{path.stem}_hd{path.suffix}')
    if target != path:
        path.rename(target)
    return target


def download_sync(url, quality, workdir, job_id=None):
    if not _is_tiktok(url):
        return _ORIGINAL_DOWNLOAD_SYNC(url, quality, workdir, job_id)

    requested_quality = quality
    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan')
    legacy.clear_workdir(workdir)

    # HD path: request the high-bitrate rendition first and stream it as-is.
    # No FFmpeg transcode/upscale is performed here.
    if requested_quality == _TIKTOK_HD_SLOT:
        if job_id:
            legacy.job_update(job_id, state='working', progress=10, stage='Mencari stream HD')
        try:
            path = _download_tikwm(url, requested_quality, workdir, job_id)
            print(f'tiktok hd direct ok id={_video_id(url)} bytes={path.stat().st_size}', flush=True)
            return path
        except Exception as exc:
            print(f'tiktok hd direct failed type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)
            # Fall back to the best native TikTok rendition instead of failing.
            quality = 'best'
            legacy.clear_workdir(workdir)
            if job_id:
                legacy.job_update(job_id, state='working', progress=12, stage='Mencoba kualitas terbaik TikTok')

    opts = legacy.base_opts(url, None, False)
    opts.update({'format': _tiktok_format(quality), 'outtmpl': str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s'), 'windowsfilenames': True, 'noplaylist': True, 'retries': 1, 'fragment_retries': 1, 'extractor_retries': 1, 'socket_timeout': 12})
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
        if requested_quality == _TIKTOK_HD_SLOT:
            path = _rename_hd(path)
        if info:
            fresh = copy.deepcopy(info)
            fresh['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(fresh)
            legacy.cache_put(url, fresh, _TIKTOK_STRATEGY)
        return path
    except Exception as exc:
        print(f'tiktok native download failed type={type(exc).__name__} detail={str(exc)[-500:]}', flush=True)

    if job_id:
        legacy.job_update(job_id, state='working', progress=12, stage='Mencoba jalur cadangan')
    path = _download_tikwm(url, requested_quality, workdir, job_id)
    print(f'tiktok download fallback ok id={_video_id(url)}', flush=True)
    return path


legacy.extract_info_sync = extract_info_sync
legacy.download_sync = download_sync
legacy.quality_choices = quality_choices
legacy.APP_VERSION = '1.16.0'
app.version = legacy.APP_VERSION
