import asyncio
import html
import json
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import tiktok_hd_app as base

app = base.app
legacy = base.legacy

SOCIAL_CACHE_TTL = int(os.getenv('SOCIAL_CACHE_TTL', '600'))
SOCIAL_JOB_TTL = int(os.getenv('SOCIAL_JOB_TTL', '1200'))
SOCIAL_MAX_FILESIZE = int(os.getenv('SOCIAL_MAX_FILESIZE', str(500 * 1024 * 1024)))
SOCIAL_UA = os.getenv(
    'SOCIAL_USER_AGENT',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
)

_PLATFORM_ROOTS = {
    'facebook': ('facebook.com', 'fb.watch'),
    'instagram': ('instagram.com',),
    'x': ('x.com', 'twitter.com'),
}
_COOKIE_FILES = {
    'facebook': Path(os.getenv('FACEBOOK_COOKIE_FILE', '/etc/secrets/facebook-cookies.txt')),
    'instagram': Path(os.getenv('INSTAGRAM_COOKIE_FILE', '/etc/secrets/instagram-cookies.txt')),
    'x': Path(os.getenv('X_COOKIE_FILE', '/etc/secrets/x-cookies.txt')),
}
_DIRECT_CDN_ROOTS = ('fbcdn.net', 'cdninstagram.com', 'instagram.com', 'facebook.com', 'twimg.com')

_cache_lock = threading.Lock()
_cache = {}
_jobs_lock = threading.Lock()
_jobs = {}

try:
    from curl_cffi import requests as curl_requests
except Exception:
    curl_requests = None

try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
except Exception:
    ImpersonateTarget = None


class SocialURLBody(BaseModel):
    url: HttpUrl


class SocialDownloadBody(BaseModel):
    url: HttpUrl
    quality: str = 'best'


def _host_matches(host, root):
    return host == root or host.endswith('.' + root)


def platform_for_url(value):
    url = str(value)
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme not in {'http', 'https'}:
        raise HTTPException(400, 'Link harus pakai http/https.')
    for platform, roots in _PLATFORM_ROOTS.items():
        if any(_host_matches(host, root) for root in roots):
            return platform, url
    raise HTTPException(400, 'Link harus dari Facebook, Instagram, atau X.')


def _cookie_file(platform):
    path = _COOKIE_FILES.get(platform)
    return str(path) if path and path.is_file() and path.stat().st_size > 64 else None


def _base_opts(platform, *, quality='best', workdir=None, job_id=None):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'socket_timeout': 25,
        'retries': 2,
        'fragment_retries': 2,
        'extractor_retries': 2,
        'max_filesize': SOCIAL_MAX_FILESIZE,
        'restrictfilenames': False,
        'windowsfilenames': True,
        'http_headers': {
            'User-Agent': SOCIAL_UA,
            'Accept-Language': 'en-US,en;q=0.9',
        },
    }
    cookie = _cookie_file(platform)
    if cookie:
        opts['cookiefile'] = cookie
    if ImpersonateTarget is not None:
        try:
            opts['impersonate'] = ImpersonateTarget.from_str('chrome')
        except Exception:
            pass
    if platform == 'x':
        opts['extractor_args'] = {'twitter': {'api': ['syndication']}}
    if workdir:
        height = None
        if quality != 'best':
            try:
                height = int(quality)
            except (TypeError, ValueError):
                height = None
        if platform == 'instagram':
            if height:
                opts['format'] = f'bestvideo[height={height}]+bestaudio/best[height={height}]/bestvideo+bestaudio/best'
            else:
                opts['format'] = 'bestvideo+bestaudio/best'
        elif height:
            opts['format'] = f'best[height={height}][ext=mp4]/best[height={height}]/best[height<={height}]'
        else:
            opts['format'] = 'best[ext=mp4]/best'
        opts['outtmpl'] = str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s')
        opts['merge_output_format'] = 'mp4'
        if job_id:
            def progress_hook(data):
                status = data.get('status')
                if status == 'downloading':
                    total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
                    done = data.get('downloaded_bytes') or 0
                    ratio = min(1.0, done / total) if total else 0
                    _job_update(job_id, state='working', progress=15 + int(ratio * 70), stage='Mengambil video')
                elif status == 'finished':
                    _job_update(job_id, state='working', progress=90, stage='Finalisasi')
            opts['progress_hooks'] = [progress_hook]
    return opts


def _select_video_entry(info):
    if not isinstance(info, dict):
        return None
    entries = info.get('entries')
    if entries:
        for entry in entries:
            chosen = _select_video_entry(entry)
            if chosen:
                return chosen
    formats = info.get('formats') or []
    if any(isinstance(fmt, dict) and fmt.get('vcodec') not in (None, 'none') for fmt in formats):
        return info
    ext = str(info.get('ext') or '').lower()
    if info.get('url') and ext in {'mp4', 'mov', 'webm', 'mkv'}:
        return info
    return None


def _extract_ydl(url, platform):
    errors = []
    attempts = [None]
    if platform == 'x':
        attempts = ['syndication', 'default']
    for attempt in attempts:
        opts = _base_opts(platform)
        opts['skip_download'] = True
        if platform == 'x' and attempt == 'default':
            opts.pop('extractor_args', None)
        try:
            with YoutubeDL(opts) as ydl:
                raw = ydl.extract_info(url, download=False)
            info = _select_video_entry(raw)
            if info:
                return info
            errors.append(f'{attempt or "default"}:no-video')
        except Exception as exc:
            errors.append(f'{attempt or "default"}:{type(exc).__name__}:{str(exc)[-180:]}')
    raise DownloadError(' | '.join(errors) or 'social extraction failed')


def _request_page(url, platform):
    headers = {
        'User-Agent': SOCIAL_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    if platform == 'facebook':
        headers['Referer'] = 'https://www.facebook.com/'
    elif platform == 'instagram':
        headers['Referer'] = 'https://www.instagram.com/'
    if curl_requests is not None:
        response = curl_requests.get(url, headers=headers, timeout=20, impersonate='chrome', allow_redirects=True)
        if 200 <= response.status_code < 300 and response.text:
            return response.text
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode('utf-8', 'replace')


def _meta(page, key):
    escaped = re.escape(key)
    patterns = (
        rf'<meta[^>]+(?:property|name)=["\']{escaped}["\'][^>]+content=["\']([^"\']+)',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{escaped}["\']',
    )
    for pattern in patterns:
        match = re.search(pattern, page, re.I | re.S)
        if match:
            return html.unescape(match.group(1)).strip()
    return None


def _decode_escaped_url(raw):
    value = html.unescape(str(raw or '')).strip()
    if not value:
        return None
    try:
        value = json.loads('"' + value.replace('"', '\\"') + '"')
    except Exception:
        value = value.replace('\\/', '/').replace('\\u0026', '&').replace('\\u003d', '=')
    value = value.replace('\\/', '/')
    return value if value.startswith(('http://', 'https://')) else None


def _direct_format(url, format_id, height=0, headers=None):
    if not url:
        return None
    return {
        'format_id': format_id,
        'url': url,
        'height': int(height or 0),
        'ext': 'mp4',
        'vcodec': 'unknown',
        'acodec': 'unknown',
        'http_headers': headers or {},
    }


def _facebook_fallback(url):
    page = _request_page(url, 'facebook')
    title = _meta(page, 'og:title') or _meta(page, 'twitter:title') or 'Facebook video'
    thumb = _meta(page, 'og:image')
    patterns = (
        ('hd', 1080, r'hd_src_no_ratelimit["\']?\s*[:=]\s*["\']([^"\']+)'),
        ('hd', 1080, r'playable_url_quality_hd["\']?\s*:\s*["\']([^"\']+)'),
        ('hd', 1080, r'browser_native_hd_url["\']?\s*:\s*["\']([^"\']+)'),
        ('sd', 480, r'sd_src_no_ratelimit["\']?\s*[:=]\s*["\']([^"\']+)'),
        ('sd', 480, r'playable_url["\']?\s*:\s*["\']([^"\']+)'),
        ('sd', 480, r'browser_native_sd_url["\']?\s*:\s*["\']([^"\']+)'),
    )
    formats = []
    seen = set()
    for fmt_id, height, pattern in patterns:
        for raw in re.findall(pattern, page, re.I):
            media_url = _decode_escaped_url(raw)
            if not media_url or media_url in seen:
                continue
            seen.add(media_url)
            fmt = _direct_format(media_url, fmt_id, height, {'User-Agent': SOCIAL_UA, 'Referer': 'https://www.facebook.com/'})
            if fmt:
                formats.append(fmt)
    og_video = _meta(page, 'og:video') or _meta(page, 'og:video:url') or _meta(page, 'og:video:secure_url')
    if og_video and og_video not in seen:
        formats.append(_direct_format(og_video, 'og-video', 0, {'User-Agent': SOCIAL_UA, 'Referer': 'https://www.facebook.com/'}))
    formats = [x for x in formats if x]
    if not formats:
        raise DownloadError('Facebook public video URL not found')
    video_id_match = re.search(r'(\d{8,})', url)
    return {
        'id': video_id_match.group(1) if video_id_match else 'facebook',
        'title': title,
        'thumbnail': thumb,
        'uploader': 'Facebook',
        'formats': formats,
        '_rvl_direct': True,
    }


def _instagram_fallback(url):
    page = _request_page(url, 'instagram')
    video_url = _meta(page, 'og:video') or _meta(page, 'og:video:secure_url') or _meta(page, 'og:video:url')
    if not video_url:
        raise DownloadError('Instagram public video URL not found')
    title = _meta(page, 'og:title') or _meta(page, 'twitter:title') or 'Instagram video'
    thumb = _meta(page, 'og:image')
    shortcode = None
    match = re.search(r'instagram\.com/(?:p|reel|reels|tv)/([^/?#]+)', url, re.I)
    if match:
        shortcode = match.group(1)
    return {
        'id': shortcode or 'instagram',
        'title': title,
        'thumbnail': thumb,
        'uploader': 'Instagram',
        'formats': [_direct_format(video_url, 'og-video', 0, {'User-Agent': SOCIAL_UA, 'Referer': 'https://www.instagram.com/'})],
        '_rvl_direct': True,
    }


def _fallback_extract(url, platform):
    if platform == 'facebook':
        return _facebook_fallback(url)
    if platform == 'instagram':
        return _instagram_fallback(url)
    raise DownloadError('No direct fallback for this platform')


def _cache_get(url):
    now = time.monotonic()
    with _cache_lock:
        item = _cache.get(url)
        if not item:
            return None
        if now - item['ts'] > SOCIAL_CACHE_TTL:
            _cache.pop(url, None)
            return None
        return item['info']


def _cache_put(url, info):
    with _cache_lock:
        if len(_cache) >= 40:
            oldest = min(_cache, key=lambda key: _cache[key]['ts'])
            _cache.pop(oldest, None)
        _cache[url] = {'ts': time.monotonic(), 'info': info}


def extract_social_info(url, platform):
    cached = _cache_get(url)
    if cached:
        return cached
    errors = []
    try:
        info = _extract_ydl(url, platform)
        info['_rvl_direct'] = False
        _cache_put(url, info)
        return info
    except Exception as exc:
        errors.append(f'yt-dlp:{type(exc).__name__}:{str(exc)[-220:]}')
    try:
        info = _fallback_extract(url, platform)
        _cache_put(url, info)
        return info
    except Exception as exc:
        errors.append(f'fallback:{type(exc).__name__}:{str(exc)[-220:]}')
    print(f'social info failed platform={platform} detail={" | ".join(errors)[-800:]}', flush=True)
    raise DownloadError('social media info failed')


def _height(fmt):
    try:
        return int(fmt.get('height') or 0)
    except (TypeError, ValueError, AttributeError):
        return 0


def _video_formats(info):
    formats = []
    for fmt in info.get('formats') or []:
        if not isinstance(fmt, dict) or not fmt.get('url'):
            continue
        if fmt.get('vcodec') == 'none':
            continue
        formats.append(fmt)
    return formats


def _combined_video_formats(info):
    return [fmt for fmt in _video_formats(info) if fmt.get('acodec') not in (None, 'none')]


def quality_choices(info):
    combined = _combined_video_formats(info)
    heights = sorted({_height(fmt) for fmt in combined if _height(fmt) > 0}, reverse=True)
    out = [{'id': 'best', 'label': 'Best quality'}]
    for height in heights[:5]:
        out.append({'id': str(height), 'label': f'{height}p'})
    return out


def max_height(info):
    combined = _combined_video_formats(info) or _video_formats(info)
    return max((_height(fmt) for fmt in combined), default=0)


def _safe_name(value, fallback='video'):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', str(value or '')).strip().strip('.')
    name = re.sub(r'\s+', ' ', name)
    return (name[:100] or fallback)


def _direct_url_allowed(url):
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower().rstrip('.')
        return parsed.scheme in {'http', 'https'} and any(_host_matches(host, root) for root in _DIRECT_CDN_ROOTS)
    except Exception:
        return False


def _pick_direct_format(info, quality):
    formats = _combined_video_formats(info) or _video_formats(info)
    if not formats:
        raise DownloadError('No direct video format')
    formats.sort(key=lambda fmt: (_height(fmt), int(fmt.get('filesize') or fmt.get('filesize_approx') or 0)), reverse=True)
    if quality == 'best':
        return formats[0]
    try:
        target = int(quality)
    except (TypeError, ValueError):
        return formats[0]
    exact = [fmt for fmt in formats if _height(fmt) == target]
    if exact:
        return exact[0]
    eligible = [fmt for fmt in formats if _height(fmt) and _height(fmt) <= target]
    return eligible[0] if eligible else formats[-1]


def _direct_download(info, quality, workdir, job_id=None):
    fmt = _pick_direct_format(info, quality)
    media_url = fmt.get('url')
    if not _direct_url_allowed(media_url):
        raise DownloadError('Direct media host rejected')
    headers = {'User-Agent': SOCIAL_UA, **(fmt.get('http_headers') or {})}
    request = urllib.request.Request(media_url, headers=headers)
    title = _safe_name(info.get('title'), 'video')
    suffix = f' [{info.get("id")}]' if info.get('id') else ''
    path = Path(workdir) / f'{title}{suffix}.mp4'
    with urllib.request.urlopen(request, timeout=40) as response, path.open('wb') as output:
        total = int(response.headers.get('Content-Length') or 0)
        done = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            done += len(chunk)
            if done > SOCIAL_MAX_FILESIZE:
                raise DownloadError('File too large')
            if job_id:
                ratio = min(1.0, done / total) if total else 0
                _job_update(job_id, state='working', progress=15 + int(ratio * 75), stage='Mengambil video')
    if not path.is_file() or path.stat().st_size < 1024:
        raise DownloadError('Direct media download empty')
    return path


def _find_output(workdir):
    files = [
        path for path in Path(workdir).iterdir()
        if path.is_file() and not path.name.endswith(('.part', '.ytdl', '.temp'))
    ]
    if not files:
        raise DownloadError('File hasil tidak ditemukan')
    return max(files, key=lambda path: path.stat().st_mtime)


def download_social_sync(url, platform, quality, workdir, job_id=None):
    if job_id:
        _job_update(job_id, state='working', progress=8, stage='Membaca sumber')
    info = _cache_get(url)
    if info and info.get('_rvl_direct'):
        return _direct_download(info, quality, workdir, job_id)

    opts = _base_opts(platform, quality=quality, workdir=workdir, job_id=job_id)
    try:
        with YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
        path = _find_output(workdir)
        if path.stat().st_size > SOCIAL_MAX_FILESIZE:
            raise DownloadError('File too large')
        return path
    except Exception as first_exc:
        print(f'social yt-dlp download retry platform={platform} type={type(first_exc).__name__}', flush=True)
        try:
            info = _fallback_extract(url, platform)
            _cache_put(url, info)
            return _direct_download(info, quality, workdir, job_id)
        except Exception:
            raise first_exc


def _job_update(job_id, **fields):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if 'progress' in fields:
            fields['progress'] = max(int(job.get('progress', 0)), min(100, int(fields['progress'])))
        job.update(fields)
        job['updated'] = time.time()


def _cleanup(workdir):
    shutil.rmtree(workdir, ignore_errors=True)


def _purge_jobs():
    cutoff = time.time() - SOCIAL_JOB_TTL
    stale = []
    with _jobs_lock:
        for job_id, job in list(_jobs.items()):
            if job.get('updated', job.get('created', 0)) < cutoff:
                stale.append(job.get('workdir'))
                _jobs.pop(job_id, None)
    for workdir in stale:
        if workdir:
            _cleanup(workdir)


def _remove_job(job_id):
    workdir = None
    with _jobs_lock:
        job = _jobs.pop(job_id, None)
        if job:
            workdir = job.get('workdir')
    if workdir:
        _cleanup(workdir)


def _social_error(platform, exc):
    message = str(exc).lower()
    if any(token in message for token in ('login', 'cookie', 'private', 'protected', 'not authorized')):
        return 'Video ini butuh login/cookie atau bukan video publik.'
    labels = {'facebook': 'Facebook', 'instagram': 'Instagram', 'x': 'X'}
    return f'{labels.get(platform, "Social media")} gagal membaca video publik ini.'


async def _run_job(job_id, url, platform, quality):
    with _jobs_lock:
        job = _jobs.get(job_id)
        workdir = job.get('workdir') if job else None
    if not workdir:
        return
    try:
        async with legacy.DOWNLOAD_SLOTS:
            path = await asyncio.to_thread(download_social_sync, url, platform, quality, workdir, job_id)
        _job_update(job_id, state='ready', progress=100, stage='Siap', filename=path.name, path=str(path))
    except Exception as exc:
        print(f'social job failed platform={platform} type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)
        _job_update(job_id, state='error', progress=0, stage='Gagal', error=_social_error(platform, exc))


@app.get('/api/social/health')
async def social_health():
    return {
        'ok': True,
        'platforms': ['facebook', 'instagram', 'x'],
        'cache': len(_cache),
        'facebook_cookie': bool(_cookie_file('facebook')),
        'instagram_cookie': bool(_cookie_file('instagram')),
        'x_cookie': bool(_cookie_file('x')),
    }


@app.post('/api/social/info')
async def social_info(body: SocialURLBody):
    platform, url = platform_for_url(body.url)
    try:
        info = await asyncio.to_thread(extract_social_info, url, platform)
    except Exception as exc:
        raise HTTPException(422, _social_error(platform, exc)) from exc
    return {
        'platform': platform,
        'id': info.get('id'),
        'title': info.get('title') or 'Untitled',
        'thumbnail': info.get('thumbnail'),
        'duration': info.get('duration'),
        'uploader': info.get('uploader') or info.get('channel'),
        'max_height': max_height(info),
        'choices': quality_choices(info),
        'cached': True,
    }


@app.post('/api/social/jobs')
async def social_create_job(body: SocialDownloadBody):
    _purge_jobs()
    platform, url = platform_for_url(body.url)
    quality = body.quality.lower().strip()
    if quality != 'best':
        try:
            height = int(quality)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, 'Pilihan kualitas tidak valid.') from exc
        if height < 100 or height > 4320:
            raise HTTPException(400, 'Pilihan kualitas tidak valid.')
    job_id = uuid.uuid4().hex
    workdir = tempfile.mkdtemp(prefix=f'rvl-{platform}-')
    now = time.time()
    with _jobs_lock:
        _jobs[job_id] = {
            'id': job_id,
            'state': 'queued',
            'progress': 2,
            'stage': 'Antrean',
            'url': url,
            'platform': platform,
            'quality': quality,
            'workdir': workdir,
            'path': None,
            'filename': None,
            'error': None,
            'created': now,
            'updated': now,
        }
    asyncio.create_task(_run_job(job_id, url, platform, quality))
    return {'job_id': job_id, 'state': 'queued', 'progress': 2}


@app.get('/api/social/jobs/{job_id}')
async def social_get_job(job_id: str):
    _purge_jobs()
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, 'Job tidak ditemukan atau sudah kedaluwarsa.')
        return {
            'job_id': job_id,
            'state': job.get('state'),
            'progress': int(job.get('progress', 0)),
            'stage': job.get('stage') or '',
            'filename': job.get('filename'),
            'error': job.get('error'),
        }


@app.get('/api/social/jobs/{job_id}/file')
async def social_get_file(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, 'Job tidak ditemukan atau sudah kedaluwarsa.')
        if job.get('state') != 'ready' or not job.get('path'):
            raise HTTPException(409, 'File belum siap.')
        path = Path(job['path'])
        filename = job.get('filename') or path.name
    if not path.is_file():
        _remove_job(job_id)
        raise HTTPException(410, 'File sudah tidak tersedia.')
    return FileResponse(
        str(path),
        filename=filename,
        media_type='video/mp4',
        headers={'Cache-Control': 'no-store'},
        background=BackgroundTask(_remove_job, job_id),
    )
