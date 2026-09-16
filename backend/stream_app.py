import asyncio
import os
import re
import subprocess
import threading
import time
import urllib.request
import uuid
from pathlib import Path

import app as legacy
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

app = legacy.app
legacy.APP_VERSION = '2.0.0'
app.version = legacy.APP_VERSION

STREAM_TTL = int(os.getenv('STREAM_TOKEN_TTL', '180'))
STREAM_CONCURRENCY = max(1, int(os.getenv('MAX_CONCURRENT_STREAMS', '2')))
_stream_lock = threading.Lock()
_stream_tokens = {}
_stream_slots = threading.BoundedSemaphore(STREAM_CONCURRENCY)


def _purge_tokens():
    cutoff = time.time() - STREAM_TTL
    with _stream_lock:
        for token, item in list(_stream_tokens.items()):
            if item.get('created', 0) < cutoff:
                _stream_tokens.pop(token, None)


def _safe_name(title, ext):
    title = re.sub(r'[\\/:*?"<>|]+', ' ', str(title or 'RVL media'))
    title = re.sub(r'\s+', ' ', title).strip().strip('.')[:90] or 'RVL media'
    return f'{title}.{ext}'


def _headers_for(fmt):
    headers = dict(fmt.get('http_headers') or {}) if isinstance(fmt, dict) else {}
    headers.setdefault('User-Agent', legacy.YOUTUBE_UA)
    return {str(k): str(v) for k, v in headers.items() if v is not None}


def _ffmpeg_input(fmt):
    headers = _headers_for(fmt)
    args = []
    ua = headers.pop('User-Agent', legacy.YOUTUBE_UA)
    if ua:
        args += ['-user_agent', ua]
    referer = headers.pop('Referer', headers.pop('referer', None))
    if referer:
        args += ['-referer', referer]
    lines = []
    for key, value in headers.items():
        if key.lower() in {'host', 'content-length'}:
            continue
        if '\r' in value or '\n' in value:
            continue
        lines.append(f'{key}: {value}')
    if lines:
        args += ['-headers', '\r\n'.join(lines) + '\r\n']
    args += ['-i', fmt['url']]
    return args


def _rank_progressive(f):
    try:
        h = int(f.get('height') or 0)
    except (TypeError, ValueError):
        h = 0
    try:
        tbr = float(f.get('tbr') or f.get('vbr') or 0)
    except (TypeError, ValueError):
        tbr = 0
    mp4 = 1 if f.get('ext') in {'mp4', 'm4v'} else 0
    return h, mp4, legacy.format_size(f), tbr


def _progressive_format(info, target=None):
    candidates = []
    for f in info.get('formats') or []:
        if not isinstance(f, dict) or not f.get('url'):
            continue
        if f.get('vcodec') in {None, 'none'} or f.get('acodec') in {None, 'none'}:
            continue
        try:
            h = int(f.get('height') or 0)
        except (TypeError, ValueError):
            h = 0
        if target is not None and h != target:
            continue
        candidates.append(f)
    if not candidates:
        return None
    candidates.sort(key=_rank_progressive, reverse=True)
    mp4 = next((f for f in candidates if f.get('ext') in {'mp4', 'm4v'}), None)
    return mp4 or candidates[0]


def _audio_format(info):
    candidates = []
    for f in info.get('formats') or []:
        if not isinstance(f, dict) or not f.get('url'):
            continue
        a = f.get('acodec')
        if not a or a == 'none':
            continue
        video_none = f.get('vcodec') in {None, 'none'}
        try:
            abr = float(f.get('abr') or f.get('tbr') or 0)
        except (TypeError, ValueError):
            abr = 0
        ext_rank = 3 if f.get('ext') == 'm4a' else 2 if f.get('ext') == 'mp4' else 1
        candidates.append(((1 if video_none else 0, ext_rank, abr, legacy.format_size(f)), f))
    return max(candidates, key=lambda x: x[0])[1] if candidates else None


def _build_plan(url, quality, info):
    title = info.get('title') or 'RVL media'
    if quality == 'audio':
        source = _audio_format(info)
        if not source:
            raise HTTPException(422, 'Audio tidak tersedia dari sumber ini.')
        return {
            'mode': 'ffmpeg-audio',
            'source': source,
            'filename': _safe_name(title, 'mp3'),
            'media_type': 'audio/mpeg',
        }

    target = None
    if quality in legacy.EXACT_QUALITIES:
        target = legacy.EXACT_QUALITIES[quality]
    elif quality == 'best':
        target = legacy.max_height(info) or None

    progressive = _progressive_format(info, target)
    if progressive and progressive.get('ext') in {'mp4', 'm4v'}:
        suffix = f' [{target}p]' if target else ''
        return {
            'mode': 'proxy',
            'source': progressive,
            'filename': _safe_name(f'{title}{suffix}', 'mp4'),
            'media_type': 'video/mp4',
        }

    video = audio = None
    if target:
        video, audio = legacy.exact_format_parts(info, target)
    if not video:
        heights = sorted(legacy.available_heights(info), reverse=True)
        for height in heights:
            video, audio = legacy.exact_format_parts(info, height)
            if video:
                target = height
                break
    if not video or not video.get('url'):
        raise HTTPException(422, 'Format video tidak tersedia dari sumber ini.')

    suffix = f' [{target}p]' if target else ''
    return {
        'mode': 'ffmpeg-video',
        'video': video,
        'audio': audio if audio and audio.get('url') else None,
        'filename': _safe_name(f'{title}{suffix}', 'mp4'),
        'media_type': 'video/mp4',
    }


def _open_source(fmt):
    req = urllib.request.Request(fmt['url'], headers=_headers_for(fmt))
    return urllib.request.urlopen(req, timeout=30)


def _proxy_iter(response):
    try:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            response.close()
        finally:
            _stream_slots.release()


def _ffmpeg_process(plan):
    cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error']
    if plan['mode'] == 'ffmpeg-audio':
        cmd += _ffmpeg_input(plan['source'])
        cmd += ['-vn', '-map', '0:a:0?', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1']
    else:
        video = plan['video']
        audio = plan.get('audio')
        cmd += _ffmpeg_input(video)
        if audio:
            cmd += _ffmpeg_input(audio)
            cmd += ['-map', '0:v:0', '-map', '1:a:0?']
        else:
            cmd += ['-map', '0:v:0', '-map', '0:a:0?']
        cmd += [
            '-c', 'copy',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            'pipe:1',
        ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)


def _process_iter(proc):
    try:
        if not proc.stdout:
            return
        while True:
            chunk = proc.stdout.read(1024 * 128)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.stdout:
            proc.stdout.close()
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        _stream_slots.release()


@app.post('/api/stream/prepare')
async def prepare_stream(body: legacy.DownloadBody):
    _purge_tokens()
    url = legacy.validate_url(body.url)
    quality = body.quality.lower().strip()
    if quality not in {'best', '2160', '1440', '1080', '720', 'audio'}:
        raise HTTPException(400, 'Pilihan kualitas tidak valid.')
    try:
        cached = legacy.cache_get(url)
        info = cached['info'] if cached else await asyncio.to_thread(legacy.extract_info_sync, url)
        plan = _build_plan(url, quality, info)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, legacy.youtube_error(exc) if legacy.is_youtube(url) else 'Media tidak bisa disiapkan.') from exc

    token = uuid.uuid4().hex
    with _stream_lock:
        _stream_tokens[token] = {'created': time.time(), 'plan': plan}
    return {
        'token': token,
        'filename': plan['filename'],
        'mode': plan['mode'],
        'stream_first': True,
    }


@app.get('/api/stream/{token}')
async def stream_file(token: str):
    _purge_tokens()
    with _stream_lock:
        item = _stream_tokens.pop(token, None)
    if not item:
        raise HTTPException(404, 'Link download sudah kedaluwarsa. Klik Download lagi.')
    plan = item['plan']

    await asyncio.to_thread(_stream_slots.acquire)
    headers = {
        'Content-Disposition': f'attachment; filename="{plan["filename"]}"',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
    }

    try:
        if plan['mode'] == 'proxy':
            response = await asyncio.to_thread(_open_source, plan['source'])
            length = response.headers.get('Content-Length')
            if length:
                headers['Content-Length'] = length
            content_type = response.headers.get('Content-Type') or plan['media_type']
            return StreamingResponse(_proxy_iter(response), media_type=content_type, headers=headers)

        proc = await asyncio.to_thread(_ffmpeg_process, plan)
        return StreamingResponse(_process_iter(proc), media_type=plan['media_type'], headers=headers)
    except Exception as exc:
        _stream_slots.release()
        raise HTTPException(502, 'Stream gagal dimulai. Coba ulangi download.') from exc
