import asyncio
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

import mp3_app as base
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

app = base.app
legacy = base.legacy
legacy.APP_VERSION = '1.13.3'
app.version = legacy.APP_VERSION

# Preserve the MP3 module's own fallback before this module replaces the fast path.
_ORIGINAL_FAST_MP3_SYNC = base.fast_mp3_sync

# Use larger range/read chunks to reduce request and Python loop overhead while
# staying below the upstream range size that previously caused throttling.
UPSTREAM_CHUNK = int(os.getenv('YOUTUBE_HTTP_CHUNK', str(8 * 1024 * 1024)))
READ_CHUNK = 512 * 1024
UPSTREAM_RETRIES = 2


def _source_size(source):
    for key in ('filesize', 'filesize_approx'):
        try:
            value = int(source.get(key) or 0)
        except (TypeError, ValueError, AttributeError):
            value = 0
        if value > 0:
            return value
    try:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(source.get('url') or '').query)
        value = int((query.get('clen') or ['0'])[0])
        if value > 0:
            return value
    except (TypeError, ValueError):
        pass
    return 0


def _range_url(url, start, end):
    value = f'{int(start)}-{int(end)}'
    if re.search(r'([?&])range=[^&]*', url):
        return re.sub(r'([?&])range=[^&]*', lambda m: f'{m.group(1)}range={value}', url, count=1)
    return f'{url}{"&" if "?" in url else "?"}range={value}'


def _read_upstream_range(source, start, end):
    expected = end - start + 1
    last_error = None
    for attempt in range(UPSTREAM_RETRIES + 1):
        response = None
        try:
            req = urllib.request.Request(
                _range_url(source['url'], start, end),
                headers=base._source_headers(source),
            )
            response = urllib.request.urlopen(req, timeout=15)
            parts = []
            got = 0
            while got < expected:
                data = response.read(min(READ_CHUNK, expected - got))
                if not data:
                    break
                parts.append(data)
                got += len(data)
            if got <= 0:
                raise IOError('empty googlevideo range')
            return b''.join(parts)
        except Exception as exc:
            last_error = exc
            if attempt < UPSTREAM_RETRIES:
                time.sleep(0.12 * (attempt + 1))
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
    raise last_error or IOError('googlevideo range failed')


def _iter_upstream(source, start=0, end=None, release_slot=False):
    try:
        total = _source_size(source)
        if end is None and total > 0:
            end = total - 1
        pos = max(0, int(start or 0))
        while end is None or pos <= end:
            wanted_end = pos + UPSTREAM_CHUNK - 1
            if end is not None:
                wanted_end = min(wanted_end, end)
            data = _read_upstream_range(source, pos, wanted_end)
            if not data:
                break
            yield data
            pos += len(data)
            requested = wanted_end - (pos - len(data)) + 1
            if len(data) < requested:
                break
    finally:
        if release_slot:
            base._audio_stream_slots.release()


def _parse_client_range(value, total):
    if not value or total <= 0:
        return 0, total - 1 if total > 0 else None, False
    match = re.match(r'^bytes=(\d*)-(\d*)$', value.strip(), re.I)
    if not match:
        return 0, total - 1, False
    left, right = match.groups()
    if left:
        start = int(left)
        end = int(right) if right else total - 1
    elif right:
        length = min(int(right), total)
        start = total - length
        end = total - 1
    else:
        return 0, total - 1, False
    if start < 0 or start >= total:
        raise HTTPException(416, 'Range audio tidak valid.')
    end = min(max(start, end), total - 1)
    return start, end, True


def _content_disposition(filename):
    ascii_name = re.sub(r'[^A-Za-z0-9._ -]+', '_', filename)[:120] or 'audio.m4a'
    encoded = urllib.parse.quote(filename)
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


@app.get('/api/audio/chunked/{token}')
async def stream_chunked_audio(token: str, request: Request):
    base._purge_audio_tokens()
    # Keep token for its TTL so the browser can reconnect/resume instead of
    # receiving 404 after the first interrupted request.
    with base._audio_token_lock:
        item = base._audio_tokens.get(token)
    if not item:
        raise HTTPException(404, 'Link audio sudah kedaluwarsa. Klik Download lagi.')

    source = item['source']
    total = _source_size(source)
    start, end, partial = _parse_client_range(request.headers.get('range'), total)

    await asyncio.to_thread(base._audio_stream_slots.acquire)
    headers = {
        'Content-Disposition': _content_disposition(item['filename']),
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        'Accept-Ranges': 'bytes',
    }
    status = 200
    if total > 0 and end is not None:
        length = end - start + 1
        headers['Content-Length'] = str(length)
        if partial:
            status = 206
            headers['Content-Range'] = f'bytes {start}-{end}/{total}'

    return StreamingResponse(
        _iter_upstream(source, start, end, release_slot=True),
        media_type=item['media_type'],
        headers=headers,
        status_code=status,
    )


def _download_chunked_source(source_data, workdir, job_id=None):
    source = source_data['source']
    ext = base._audio_ext(source)
    source_path = Path(workdir) / f'source.{ext}'
    total = _source_size(source)
    done = 0
    if job_id:
        legacy.job_update(job_id, state='working', progress=12, stage='Mengambil audio')
    with source_path.open('wb') as out:
        for data in _iter_upstream(source, 0, total - 1 if total > 0 else None, release_slot=False):
            out.write(data)
            done += len(data)
            if job_id and total > 0:
                ratio = min(1.0, done / total)
                legacy.job_update(job_id, state='working', progress=12 + int(ratio * 43), stage='Mengambil audio')
    if not source_path.is_file() or source_path.stat().st_size <= 1024:
        raise RuntimeError('audio source download failed')
    return source_path


def _convert_local_to_mp3(source_path, source_data, workdir, job_id=None):
    title = base._safe_title(source_data.get('title'))
    duration = float(source_data.get('duration') or 0)
    output = Path(workdir) / f'{title}.mp3'
    cmd = [
        'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(source_path),
        '-vn', '-map', '0:a:0?',
        '-c:a', 'libmp3lame', '-b:a', '192k', '-compression_level', '0',
        '-progress', 'pipe:1', '-nostats', str(output),
    ]
    if job_id:
        legacy.job_update(job_id, state='working', progress=58, stage='Convert MP3')
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    try:
        if proc.stdout:
            for raw in proc.stdout:
                line = raw.strip()
                if line.startswith('out_time_ms=') and duration > 0 and job_id:
                    try:
                        micros = int(line.split('=', 1)[1])
                        seconds = micros / 1_000_000
                        ratio = max(0.0, min(1.0, seconds / duration))
                        legacy.job_update(job_id, state='working', progress=58 + int(ratio * 38), stage='Convert MP3')
                    except (TypeError, ValueError):
                        pass
        code = proc.wait(timeout=max(120, int(duration * 2 + 30) if duration else 180))
    except Exception:
        if proc.poll() is None:
            proc.kill()
        raise
    if code != 0 or not output.is_file() or output.stat().st_size <= 1024:
        raise RuntimeError('MP3 conversion failed')
    try:
        source_path.unlink(missing_ok=True)
    except OSError:
        pass
    if job_id:
        legacy.job_update(job_id, state='working', progress=98, stage='Finalisasi')
    return output


def chunked_mp3_sync(url, workdir, job_id=None):
    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan audio')
    try:
        source_data = base._wait_source(url)
        source_path = _download_chunked_source(source_data, workdir, job_id)
        return _convert_local_to_mp3(source_path, source_data, workdir, job_id)
    except Exception as exc:
        print(f'mp3 chunked path fallback type={type(exc).__name__}', flush=True)
        return _ORIGINAL_FAST_MP3_SYNC(url, workdir, job_id)


# The job runner in mp3_app resolves this global at request time, so replacing
# it keeps the existing API/UI while retaining the original downloader as a fallback.
base.fast_mp3_sync = chunked_mp3_sync
