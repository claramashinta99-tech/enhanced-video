import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from fastapi import File, HTTPException, UploadFile

import social_downloaders_app as base

app = base.app

MEDIA_INSPECT_MAX_BYTES = int(os.getenv('MEDIA_INSPECT_MAX_BYTES', str(500 * 1024 * 1024)))


def _int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fps(stream):
    raw = stream.get('avg_frame_rate') or stream.get('r_frame_rate') or ''
    if not raw or raw in {'0/0', 'N/A'}:
        return 0
    try:
        value = float(Fraction(str(raw)))
        return round(value, 3) if value > 0 else 0
    except Exception:
        return 0


def _clean(value):
    if value in (None, '', 'N/A'):
        return None
    return value


def _probe(path):
    raw = subprocess.check_output(
        [
            'ffprobe', '-v', 'error',
            '-show_format', '-show_streams',
            '-of', 'json', str(path),
        ],
        text=True,
        timeout=30,
    )
    return json.loads(raw)


def _pick_stream(streams, codec_type):
    return next((item for item in streams if item.get('codec_type') == codec_type), {})


@app.get('/api/media/health')
async def media_health():
    return {'ok': True, 'max_bytes': MEDIA_INSPECT_MAX_BYTES, 'engine': 'ffprobe'}


@app.post('/api/media/inspect')
async def media_inspect(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, 'Nama file tidak valid.')

    workdir = tempfile.mkdtemp(prefix='rvl-media-info-')
    suffix = Path(file.filename).suffix[:12]
    path = Path(workdir) / ('media' + suffix)
    total = 0

    try:
        with path.open('wb') as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MEDIA_INSPECT_MAX_BYTES:
                    raise HTTPException(413, 'File terlalu besar untuk Media Inspector.')
                output.write(chunk)

        if total < 16:
            raise HTTPException(422, 'File kosong atau tidak valid.')

        try:
            data = await asyncio.to_thread(_probe, path)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(504, 'Metadata file terlalu lama dibaca.') from exc
        except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as exc:
            raise HTTPException(422, 'File media tidak bisa dibaca oleh ffprobe.') from exc

        streams = data.get('streams') or []
        fmt = data.get('format') or {}
        video = _pick_stream(streams, 'video')
        audio = _pick_stream(streams, 'audio')

        return {
            'filename': file.filename,
            'content_type': file.content_type,
            'size': total,
            'format': {
                'name': _clean(fmt.get('format_long_name') or fmt.get('format_name')),
                'duration': _float(fmt.get('duration')),
                'bit_rate': _int(fmt.get('bit_rate')),
            },
            'video': {
                'codec': _clean(video.get('codec_name')),
                'profile': _clean(video.get('profile')),
                'width': _int(video.get('width')),
                'height': _int(video.get('height')),
                'fps': _fps(video),
                'bit_rate': _int(video.get('bit_rate')),
                'pix_fmt': _clean(video.get('pix_fmt')),
                'color_space': _clean(video.get('color_space')),
                'color_transfer': _clean(video.get('color_transfer')),
                'color_primaries': _clean(video.get('color_primaries')),
            },
            'audio': {
                'codec': _clean(audio.get('codec_name')),
                'sample_rate': _int(audio.get('sample_rate')),
                'channels': _int(audio.get('channels')),
                'channel_layout': _clean(audio.get('channel_layout')),
                'bit_rate': _int(audio.get('bit_rate')),
            },
        }
    finally:
        try:
            await file.close()
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
