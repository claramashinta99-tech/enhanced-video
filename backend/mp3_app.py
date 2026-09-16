import asyncio
import json
import tempfile
import time
import urllib.parse
import urllib.request
import uuid

import app as legacy
from fastapi import HTTPException
from yt_dlp.utils import DownloadError

app = legacy.app
legacy.APP_VERSION = '1.10.0'
app.version = legacy.APP_VERSION


def youtube_id(url):
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or '').lower()
    if host == 'youtu.be':
        return parsed.path.strip('/').split('/')[0]
    query = urllib.parse.parse_qs(parsed.query)
    if query.get('v'):
        return query['v'][0]
    parts = [p for p in parsed.path.split('/') if p]
    if len(parts) >= 2 and parts[0] in {'shorts', 'embed', 'live'}:
        return parts[1]
    return None


def mp3_meta_sync(url):
    vid = youtube_id(url)
    fallback_thumb = f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg' if vid else None
    if not vid:
        return {'id': None, 'title': 'YouTube audio', 'uploader': None, 'thumbnail': None}
    watch = f'https://www.youtube.com/watch?v={vid}'
    endpoint = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode({'url': watch, 'format': 'json'})
    try:
        req = urllib.request.Request(endpoint, headers={'User-Agent': legacy.YOUTUBE_UA})
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8', 'replace'))
        return {
            'id': vid,
            'title': data.get('title') or 'YouTube audio',
            'uploader': data.get('author_name'),
            'thumbnail': data.get('thumbnail_url') or fallback_thumb,
        }
    except Exception:
        return {'id': vid, 'title': 'YouTube audio', 'uploader': None, 'thumbnail': fallback_thumb}


def fast_mp3_sync(url, workdir, job_id=None):
    cached = legacy.cache_get(url)
    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan audio')
    if cached:
        try:
            return legacy.download_from_info(url, 'audio', workdir, cached['info'], cached['strategy'], job_id)
        except Exception:
            pass

    errors = []
    attempts = legacy.youtube_attempts() if legacy.is_youtube(url) else [{'name': 'default', 'clients': None, 'cookie': False}]
    for strategy in attempts:
        try:
            legacy.clear_workdir(workdir)
            if job_id:
                legacy.job_update(job_id, state='working', progress=10, stage='Mengambil audio')
            opts = legacy.dl_opts(url, 'audio', workdir, strategy, None, job_id)
            opts.update({
                'socket_timeout': 12,
                'retries': 1,
                'fragment_retries': 1,
                'extractor_retries': 0,
                'cachedir': False,
            })
            with legacy.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
            path = legacy.find_output(workdir)
            if info:
                if info.get('entries'):
                    info = next((x for x in info['entries'] if x), info)
                try:
                    legacy.cache_put(url, info, strategy)
                except Exception:
                    pass
            return path
        except Exception as exc:
            errors.append(f"{strategy.get('name')}:{type(exc).__name__}")
    print(f"mp3 fast path failed attempts={','.join(errors)}", flush=True)
    raise DownloadError('mp3 download failed')


async def run_mp3_job(job_id, url):
    with legacy._jobs_lock:
        job = legacy._jobs.get(job_id)
        workdir = job.get('workdir') if job else None
    if not workdir:
        return
    try:
        async with legacy.DOWNLOAD_SLOTS:
            path = await asyncio.to_thread(fast_mp3_sync, url, workdir, job_id)
        legacy.job_update(job_id, state='ready', progress=100, stage='Siap', filename=path.name, path=str(path))
    except DownloadError as exc:
        legacy.job_update(job_id, state='error', progress=0, stage='Gagal', error=legacy.youtube_error(exc))
    except Exception as exc:
        print(f'mp3 job failed id={job_id} type={type(exc).__name__}', flush=True)
        legacy.job_update(job_id, state='error', progress=0, stage='Gagal', error=legacy.youtube_error(exc))


@app.post('/api/mp3/info')
async def mp3_info(body: legacy.URLBody):
    url = legacy.validate_url(body.url)
    if not legacy.is_youtube(url):
        raise HTTPException(400, 'Link harus dari YouTube.')
    meta = await asyncio.to_thread(mp3_meta_sync, url)
    return {
        'platform': 'youtube-mp3',
        'id': meta.get('id'),
        'title': meta.get('title') or 'YouTube audio',
        'thumbnail': meta.get('thumbnail'),
        'uploader': meta.get('uploader'),
        'format': 'MP3',
        'bitrate': 192,
    }


@app.post('/api/mp3/jobs')
async def create_mp3_job(body: legacy.DownloadBody):
    legacy.purge_jobs()
    url = legacy.validate_url(body.url)
    if not legacy.is_youtube(url):
        raise HTTPException(400, 'Link harus dari YouTube.')
    job_id = uuid.uuid4().hex
    workdir = tempfile.mkdtemp(prefix='rvl-mp3-')
    now = time.time()
    with legacy._jobs_lock:
        legacy._jobs[job_id] = {
            'id': job_id,
            'state': 'queued',
            'progress': 2,
            'stage': 'Antrean',
            'url': url,
            'quality': 'audio',
            'workdir': workdir,
            'path': None,
            'filename': None,
            'error': None,
            'created': now,
            'updated': now,
        }
    asyncio.create_task(run_mp3_job(job_id, url))
    return {'job_id': job_id, 'state': 'queued', 'progress': 2, 'fast_path': True}
