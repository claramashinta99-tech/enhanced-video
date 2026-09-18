import asyncio
import json
import mimetypes
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import social_downloaders_app as social
import tiktok_engine_app as tiktok

app = social.app

CAROUSEL_CACHE_TTL = int(os.getenv('CAROUSEL_CACHE_TTL', '600'))
CAROUSEL_JOB_TTL = int(os.getenv('CAROUSEL_JOB_TTL', '1200'))
CAROUSEL_MAX_ITEMS = int(os.getenv('CAROUSEL_MAX_ITEMS', '35'))
CAROUSEL_MAX_TOTAL_BYTES = int(os.getenv('CAROUSEL_MAX_TOTAL_BYTES', str(500 * 1024 * 1024)))

_cache_lock = threading.Lock()
_cache = {}
_jobs_lock = threading.Lock()
_jobs = {}

_TIKTOK_MEDIA_ROOTS = (
    'tiktokcdn.com',
    'tiktokcdn-us.com',
    'muscdn.com',
    'byteoversea.com',
    'byteimg.com',
    'tikwm.com',
)


class CarouselURLBody(BaseModel):
    url: HttpUrl


class CarouselDownloadBody(BaseModel):
    url: HttpUrl
    item: int | None = None


def _host_matches(host, root):
    return host == root or host.endswith('.' + root)


def _platform_for_url(value):
    url = str(value)
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme not in {'http', 'https'}:
        raise HTTPException(400, 'Link harus pakai http/https.')
    if _host_matches(host, 'tiktok.com'):
        return 'tiktok', url
    if _host_matches(host, 'instagram.com'):
        return 'instagram', url
    raise HTTPException(400, 'Carousel hanya mendukung TikTok Photo/Slideshow dan Instagram Carousel.')


def _cache_get(url):
    now = time.monotonic()
    with _cache_lock:
        item = _cache.get(url)
        if not item:
            return None
        if now - item['ts'] > CAROUSEL_CACHE_TTL:
            _cache.pop(url, None)
            return None
        return item['info']


def _cache_put(url, info):
    with _cache_lock:
        if len(_cache) >= 40:
            oldest = min(_cache, key=lambda key: _cache[key]['ts'])
            _cache.pop(oldest, None)
        _cache[url] = {'ts': time.monotonic(), 'info': info}


def _safe_name(value, fallback='carousel'):
    value = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', str(value or '')).strip().strip('.')
    value = re.sub(r'\s+', ' ', value)
    return (value[:90] or fallback)


def _image_url(value):
    if isinstance(value, str) and value.startswith(('http://', 'https://')):
        return value
    if isinstance(value, dict):
        for key in ('url', 'display_image', 'image_url', 'download_url', 'origin_url'):
            found = _image_url(value.get(key))
            if found:
                return found
        for key in ('url_list', 'urls'):
            seq = value.get(key)
            if isinstance(seq, (list, tuple)):
                for item in seq:
                    found = _image_url(item)
                    if found:
                        return found
    return None


def _tikwm_photo_info(url):
    candidates = [str(url).split('#', 1)[0]]
    post_id = tiktok._video_id(url)
    if post_id:
        candidates += [post_id, f'https://www.tiktok.com/@tiktok/photo/{post_id}']

    last = None
    for candidate in candidates:
        try:
            endpoint = tiktok._TIKWM_API + '?' + urllib.parse.urlencode({'url': candidate, 'hd': '1'})
            request = urllib.request.Request(endpoint, headers=tiktok._TIKWM_HEADERS)
            with urllib.request.urlopen(request, timeout=12) as response:
                payload = json.loads(response.read().decode('utf-8', 'replace'))
            data = payload.get('data')
            if payload.get('code') != 0 or not isinstance(data, dict):
                last = payload.get('msg') or payload.get('message')
                continue
            detail = data.get('detail') if isinstance(data.get('detail'), dict) else data
            raw_images = detail.get('images')
            if not raw_images and isinstance(detail.get('image_post_info'), dict):
                raw_images = detail['image_post_info'].get('images')
            if not isinstance(raw_images, (list, tuple)):
                last = 'photo list unavailable'
                continue

            urls = []
            for raw in raw_images[:CAROUSEL_MAX_ITEMS]:
                media_url = _image_url(raw)
                if media_url and media_url not in urls:
                    urls.append(media_url)
            if not urls:
                last = 'photo URLs unavailable'
                continue

            author = detail.get('author') or {}
            music = detail.get('music_info') or detail.get('music') or {}
            music_url = _image_url(music.get('play') if isinstance(music, dict) else None)
            if not music_url and isinstance(music, dict):
                music_url = _image_url(music)

            title = detail.get('title') or detail.get('desc') or 'TikTok slideshow'
            items = [
                {
                    'index': index + 1,
                    'kind': 'image',
                    'thumbnail': media_url,
                    '_url': media_url,
                    '_ext': 'jpg',
                }
                for index, media_url in enumerate(urls)
            ]
            return {
                'platform': 'tiktok',
                'id': str(detail.get('id') or detail.get('video_id') or post_id or ''),
                'title': title,
                'uploader': author.get('unique_id') or author.get('nickname') or tiktok._username(url),
                'thumbnail': urls[0],
                'items': items,
                'music_url': music_url,
                'has_audio': bool(music_url),
            }
        except Exception as exc:
            last = f'{type(exc).__name__}: {str(exc)[-180:]}'
    raise DownloadError(f'TikTok slideshow unavailable: {last or "unknown"}')


def _best_thumbnail(entry):
    if entry.get('thumbnail'):
        return entry['thumbnail']
    thumbs = [x for x in (entry.get('thumbnails') or []) if isinstance(x, dict) and x.get('url')]
    if not thumbs:
        return None

    def area(value):
        try:
            return int(value.get('width') or 0) * int(value.get('height') or 0)
        except Exception:
            return 0

    return max(thumbs, key=area).get('url')


def _instagram_item(entry, index):
    ext = str(entry.get('ext') or '').lower()
    formats = entry.get('formats') or []
    video_formats = [
        fmt for fmt in formats
        if isinstance(fmt, dict) and fmt.get('url') and fmt.get('vcodec') not in (None, 'none')
    ]
    kind = 'video' if video_formats or ext in {'mp4', 'mov', 'webm', 'mkv'} else 'image'

    direct_url = None
    direct_ext = ext
    if kind == 'video':
        combined = [
            fmt for fmt in video_formats
            if fmt.get('acodec') not in (None, 'none')
        ]
        candidates = combined or video_formats

        def rank(fmt):
            try:
                height = int(fmt.get('height') or 0)
            except Exception:
                height = 0
            try:
                size = int(fmt.get('filesize') or fmt.get('filesize_approx') or 0)
            except Exception:
                size = 0
            return height, size

        if candidates:
            chosen = max(candidates, key=rank)
            direct_url = chosen.get('url')
            direct_ext = chosen.get('ext') or 'mp4'
    else:
        direct_url = entry.get('url')
        if not direct_url and ext in {'jpg', 'jpeg', 'png', 'webp', 'avif'}:
            direct_url = _best_thumbnail(entry)
        direct_ext = direct_ext if direct_ext in {'jpg', 'jpeg', 'png', 'webp', 'avif'} else 'jpg'

    return {
        'index': index,
        'kind': kind,
        'thumbnail': _best_thumbnail(entry) or (direct_url if kind == 'image' else None),
        '_url': direct_url,
        '_ext': direct_ext or ('mp4' if kind == 'video' else 'jpg'),
        '_playlist_index': index,
    }


def _instagram_carousel_info(url):
    opts = social._base_opts('instagram')
    opts.update({
        'skip_download': True,
        'noplaylist': False,
        'extract_flat': False,
        'ignore_no_formats_error': True,
        'playlistend': CAROUSEL_MAX_ITEMS,
    })
    with YoutubeDL(opts) as ydl:
        raw = ydl.extract_info(url, download=False)

    entries = [entry for entry in (raw.get('entries') or []) if isinstance(entry, dict)]
    if len(entries) < 2:
        raise DownloadError('Instagram post is not a multi-item carousel')

    items = [_instagram_item(entry, index + 1) for index, entry in enumerate(entries[:CAROUSEL_MAX_ITEMS])]
    if len(items) < 2:
        raise DownloadError('Instagram carousel items unavailable')

    return {
        'platform': 'instagram',
        'id': raw.get('id'),
        'title': raw.get('title') or raw.get('description') or 'Instagram carousel',
        'uploader': raw.get('uploader') or raw.get('channel'),
        'thumbnail': raw.get('thumbnail') or items[0].get('thumbnail'),
        'items': items,
        'music_url': None,
        'has_audio': False,
    }


def extract_carousel_info(url, platform):
    cached = _cache_get(url)
    if cached:
        return cached
    if platform == 'tiktok':
        info = _tikwm_photo_info(url)
    else:
        info = _instagram_carousel_info(url)
    _cache_put(url, info)
    return info


def _public_info(info):
    return {
        'platform': info.get('platform'),
        'id': info.get('id'),
        'title': info.get('title') or 'Carousel',
        'uploader': info.get('uploader'),
        'thumbnail': info.get('thumbnail'),
        'count': len(info.get('items') or []),
        'has_audio': bool(info.get('has_audio')),
        'items': [
            {
                'index': item.get('index'),
                'kind': item.get('kind'),
                'thumbnail': item.get('thumbnail'),
            }
            for item in (info.get('items') or [])
        ],
    }


def _url_allowed(url, platform):
    try:
        parsed = urllib.parse.urlparse(str(url))
        host = (parsed.hostname or '').lower().rstrip('.')
        if parsed.scheme not in {'http', 'https'}:
            return False
        if platform == 'instagram':
            return social._direct_url_allowed(url)
        return any(_host_matches(host, root) for root in _TIKTOK_MEDIA_ROOTS)
    except Exception:
        return False


def _download_direct(url, target, platform, referer, job_id=None, progress_base=10, progress_span=75):
    if not _url_allowed(url, platform):
        raise DownloadError('Direct carousel media host rejected')
    headers = {
        'User-Agent': social.SOCIAL_UA,
        'Accept': '*/*',
        'Referer': referer,
    }
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response, open(target, 'wb') as output:
        total = int(response.headers.get('Content-Length') or 0)
        done = 0
        while True:
            chunk = response.read(512 * 1024)
            if not chunk:
                break
            output.write(chunk)
            done += len(chunk)
            if done > CAROUSEL_MAX_TOTAL_BYTES:
                raise DownloadError('Carousel item too large')
            if job_id and total:
                ratio = min(1.0, done / total)
                _job_update(job_id, progress=progress_base + int(ratio * progress_span))
    if not target.is_file() or target.stat().st_size < 256:
        raise DownloadError('Carousel media file empty')
    return target


def _download_instagram_with_ytdlp(url, item_index, workdir, job_id=None):
    opts = social._base_opts('instagram', quality='best', workdir=workdir, job_id=job_id)
    opts['noplaylist'] = False
    opts['playlist_items'] = str(item_index)
    opts['outtmpl'] = str(Path(workdir) / f'{item_index:02d} - %(title).60B [%(id)s].%(ext)s')
    with YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)
    files = [
        path for path in Path(workdir).iterdir()
        if path.is_file() and not path.name.endswith(('.part', '.ytdl', '.temp', '.zip'))
    ]
    if not files:
        raise DownloadError('Instagram carousel item file unavailable')
    return max(files, key=lambda path: path.stat().st_mtime)


def _download_item(info, source_url, item, workdir, job_id=None):
    platform = info['platform']
    index = int(item['index'])
    kind = item['kind']
    ext = str(item.get('_ext') or ('mp4' if kind == 'video' else 'jpg')).lower().lstrip('.')
    ext = re.sub(r'[^a-z0-9]+', '', ext) or ('mp4' if kind == 'video' else 'jpg')
    target = Path(workdir) / f'{index:02d}.{ext}'

    direct = item.get('_url')
    if direct:
        referer = 'https://www.instagram.com/' if platform == 'instagram' else 'https://www.tiktok.com/'
        try:
            return _download_direct(direct, target, platform, referer, job_id)
        except Exception:
            if platform != 'instagram':
                raise

    if platform == 'instagram':
        return _download_instagram_with_ytdlp(source_url, index, workdir, job_id)
    raise DownloadError('TikTok carousel item unavailable')


def _bundle_zip(info, source_url, workdir, job_id=None):
    media_dir = Path(workdir) / 'media'
    media_dir.mkdir(parents=True, exist_ok=True)
    files = []
    total_bytes = 0
    items = info.get('items') or []

    for pos, item in enumerate(items, start=1):
        if job_id:
            _job_update(
                job_id,
                state='working',
                progress=8 + int(((pos - 1) / max(1, len(items))) * 72),
                stage=f'Mengambil item {pos}/{len(items)}',
            )
        path = _download_item(info, source_url, item, media_dir, None)
        total_bytes += path.stat().st_size
        if total_bytes > CAROUSEL_MAX_TOTAL_BYTES:
            raise DownloadError('Total carousel terlalu besar')
        files.append(path)

    if info.get('platform') == 'tiktok' and info.get('music_url'):
        audio_target = media_dir / 'audio-original.mp3'
        try:
            audio = _download_direct(
                info['music_url'],
                audio_target,
                'tiktok',
                'https://www.tiktok.com/',
                None,
            )
            total_bytes += audio.stat().st_size
            if total_bytes <= CAROUSEL_MAX_TOTAL_BYTES:
                files.append(audio)
            else:
                audio.unlink(missing_ok=True)
        except Exception as exc:
            print(f'carousel tiktok audio skipped type={type(exc).__name__}', flush=True)

    if job_id:
        _job_update(job_id, state='working', progress=86, stage='Membuat ZIP')

    title = _safe_name(info.get('title'), f'{info.get("platform", "carousel")} carousel')
    zip_path = Path(workdir) / f'{title}.zip'
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_STORED) as archive:
        for path in files:
            archive.write(path, arcname=path.name)
    if not zip_path.is_file() or zip_path.stat().st_size < 256:
        raise DownloadError('ZIP carousel gagal dibuat')
    return zip_path


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
    cutoff = time.time() - CAROUSEL_JOB_TTL
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


def _carousel_error(platform, exc):
    message = str(exc).lower()
    if 'multi-item carousel' in message or 'carousel items unavailable' in message:
        return 'Post Instagram ini bukan carousel multi-item atau item-nya tidak tersedia.'
    if any(token in message for token in ('login', 'cookie', 'private', 'protected', 'not authorized')):
        return 'Post ini butuh login/cookie atau bukan post publik.'
    if platform == 'tiktok':
        return 'TikTok Photo/Slideshow publik ini belum bisa dibaca.'
    return 'Instagram Carousel publik ini belum bisa dibaca.'


async def _run_job(job_id, url, platform, item_index):
    with _jobs_lock:
        job = _jobs.get(job_id)
        workdir = job.get('workdir') if job else None
    if not workdir:
        return
    try:
        info = await asyncio.to_thread(extract_carousel_info, url, platform)
        items = info.get('items') or []
        if item_index is not None:
            selected = next((item for item in items if int(item.get('index') or 0) == item_index), None)
            if not selected:
                raise DownloadError('Carousel item index invalid')
            _job_update(job_id, state='working', progress=12, stage=f'Mengambil item {item_index}')
            path = await asyncio.to_thread(_download_item, info, url, selected, workdir, job_id)
        else:
            path = await asyncio.to_thread(_bundle_zip, info, url, workdir, job_id)
        _job_update(job_id, state='ready', progress=100, stage='Siap', filename=path.name, path=str(path))
    except Exception as exc:
        print(f'carousel job failed platform={platform} type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)
        _job_update(job_id, state='error', progress=0, stage='Gagal', error=_carousel_error(platform, exc))


@app.get('/api/carousel/health')
async def carousel_health():
    return {
        'ok': True,
        'platforms': ['tiktok', 'instagram'],
        'types': ['tiktok-photo-slideshow', 'instagram-carousel'],
        'cache': len(_cache),
    }


@app.post('/api/carousel/info')
async def carousel_info(body: CarouselURLBody):
    platform, url = _platform_for_url(body.url)
    try:
        info = await asyncio.to_thread(extract_carousel_info, url, platform)
    except Exception as exc:
        raise HTTPException(422, _carousel_error(platform, exc)) from exc
    return _public_info(info)


@app.post('/api/carousel/jobs')
async def carousel_create_job(body: CarouselDownloadBody):
    _purge_jobs()
    platform, url = _platform_for_url(body.url)
    info = _cache_get(url)
    if info is None:
        try:
            info = await asyncio.to_thread(extract_carousel_info, url, platform)
        except Exception as exc:
            raise HTTPException(422, _carousel_error(platform, exc)) from exc

    item_index = body.item
    if item_index is not None:
        if item_index < 1 or item_index > len(info.get('items') or []):
            raise HTTPException(400, 'Index item carousel tidak valid.')

    job_id = uuid.uuid4().hex
    workdir = tempfile.mkdtemp(prefix=f'rvl-carousel-{platform}-')
    now = time.time()
    with _jobs_lock:
        _jobs[job_id] = {
            'id': job_id,
            'state': 'queued',
            'progress': 2,
            'stage': 'Antrean',
            'url': url,
            'platform': platform,
            'item': item_index,
            'workdir': workdir,
            'path': None,
            'filename': None,
            'error': None,
            'created': now,
            'updated': now,
        }
    asyncio.create_task(_run_job(job_id, url, platform, item_index))
    return {'job_id': job_id, 'state': 'queued', 'progress': 2}


@app.get('/api/carousel/jobs/{job_id}')
async def carousel_get_job(job_id: str):
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


@app.get('/api/carousel/jobs/{job_id}/file')
async def carousel_get_file(job_id: str):
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
    media_type = mimetypes.guess_type(filename)[0] or ('application/zip' if path.suffix.lower() == '.zip' else 'application/octet-stream')
    return FileResponse(
        str(path),
        filename=filename,
        media_type=media_type,
        headers={'Cache-Control': 'no-store'},
        background=BackgroundTask(_remove_job, job_id),
    )
