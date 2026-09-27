import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

import media_inspector_app as inspector

app = inspector.app

DOLBY_MAX_DURATION = float(os.getenv('DOLBY_MAX_DURATION', '30.5'))
DOLBY_MAX_FILESIZE = int(os.getenv('DOLBY_MAX_FILESIZE', str(200 * 1024 * 1024)))
DOLBY_JOB_TTL = int(os.getenv('DOLBY_JOB_TTL', '1800'))
DOLBY_CONCURRENCY = int(os.getenv('DOLBY_CONCURRENCY', '2'))

_dolby_slots = asyncio.Semaphore(DOLBY_CONCURRENCY)
_jobs_lock = threading.Lock()
_jobs = {}


def _clean_stem(name: str, fallback: str = 'video') -> str:
    stem = Path(name or '').stem
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', stem).strip().strip('.')
    cleaned = re.sub(r'\s+', '_', cleaned)
    cleaned = re.sub(r'(_compressbase|_rvl-hd|_rvl|_hd)+$', '', cleaned, flags=re.IGNORECASE)
    return (cleaned[:60] or fallback)


def _probe_duration(file_path: Path) -> float:
    try:
        raw = subprocess.check_output(
            [
                'ffprobe', '-v', 'error',
                '-show_entries', 'format=duration:stream=duration',
                '-of', 'json', str(file_path),
            ],
            text=True,
            timeout=15,
        )
        data = json.loads(raw)
        fmt_dur = data.get('format', {}).get('duration')
        if fmt_dur not in (None, '', 'N/A'):
            return float(fmt_dur)
        for s in data.get('streams', []):
            dur = s.get('duration')
            if dur not in (None, '', 'N/A'):
                return float(dur)
        return 0.0
    except Exception as exc:
        print(f'dolby ffprobe error: {type(exc).__name__}: {exc}', flush=True)
        return 0.0


def _job_update(job_id: str, **fields):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if 'progress' in fields:
            fields['progress'] = max(int(job.get('progress', 0)), min(100, int(fields['progress'])))
        job.update(fields)
        job['updated'] = time.time()


def _cleanup(workdir):
    if workdir:
        shutil.rmtree(workdir, ignore_errors=True)


def _purge_jobs():
    cutoff = time.time() - DOLBY_JOB_TTL
    stale = []
    with _jobs_lock:
        for job_id, job in list(_jobs.items()):
            if job.get('updated', job.get('created', 0)) < cutoff:
                stale.append(job.get('workdir'))
                _jobs.pop(job_id, None)
    for workdir in stale:
        _cleanup(workdir)


def _remove_job(job_id: str):
    workdir = None
    with _jobs_lock:
        job = _jobs.pop(job_id, None)
        if job:
            workdir = job.get('workdir')
    if workdir:
        _cleanup(workdir)


def _convert_dolby_sync(input_path: Path, output_path: Path, mode: str, job_id: str):
    _job_update(job_id, state='working', progress=25, stage='Meng-encode 10-bit HEVC & menyuntikkan profil HDR')

    # Color space & mastering parameters
    # Mode 'pq': HDR10 PQ (SMPTE ST 2084) - Maximum peak brightness boost
    # Mode 'hlg' (default): Dolby Vision Profile 8.4 / Apple HLG (BT.2020 HLG) - Auto-glow & backward compatible
    is_pq = (mode.lower() == 'pq')

    if is_pq:
        color_args = [
            '-color_primaries', 'bt2020',
            '-color_trc', 'smpte2084',
            '-colorspace', 'bt2020nc',
            '-x265-params', (
                'hdr-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:'
                'master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50):'
                'max-cll=1000,400'
            ),
        ]
    else:
        color_args = [
            '-color_primaries', 'bt2020',
            '-color_trc', 'arib-std-b67',
            '-colorspace', 'bt2020nc',
            '-x265-params', 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:repeat-headers=1',
        ]

    cmd = [
        'ffmpeg', '-y',
        '-i', str(input_path),
        '-t', str(DOLBY_MAX_DURATION),
        '-c:v', 'libx265',
        '-profile:v', 'main10',
        '-preset', 'veryfast',
        '-crf', '19',
        '-pix_fmt', 'yuv420p10le',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        *color_args,
        '-tag:v', 'hvc1',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        str(output_path),
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    _, stderr = process.communicate(timeout=180)
    if process.returncode != 0:
        lines = [line.strip() for line in (stderr or '').splitlines() if line.strip()]
        err_candidates = [
            line for line in lines
            if any(token in line.lower() for token in ('error', 'failed', 'invalid', 'unable to parse', 'unrecognized', 'cannot'))
            and not line.startswith(('frame=', 'size=', 'Stream #'))
        ]
        err_msg = ' | '.join(err_candidates[-3:]) if err_candidates else ('\n'.join(lines[-4:]) if lines else 'Unknown FFmpeg error')
        print(f'dolby ffmpeg error: {err_msg}\nfull stderr:\n{stderr}', flush=True)
        raise RuntimeError(f'FFmpeg encoding failed: {err_msg}')

    if not output_path.is_file() or output_path.stat().st_size < 1024:
        raise RuntimeError('File output Dolby Vision kosong atau gagal dibuat.')


async def _run_dolby_job(job_id: str, input_path: Path, output_path: Path, mode: str):
    try:
        async with _dolby_slots:
            _job_update(job_id, state='working', progress=15, stage='Memulai engine FFmpeg')
            await asyncio.to_thread(_convert_dolby_sync, input_path, output_path, mode, job_id)

        _job_update(
            job_id,
            state='ready',
            progress=100,
            stage='Selesai · RVL HD Ready',
            filename=output_path.name,
            path=str(output_path),
        )
    except subprocess.TimeoutExpired:
        _job_update(job_id, state='error', progress=0, stage='Gagal', error='Proses melebihi batas waktu (timeout).')
    except Exception as exc:
        print(f'dolby job error id={job_id} exc={type(exc).__name__}: {exc}', flush=True)
        _job_update(job_id, state='error', progress=0, stage='Gagal', error=str(exc))


@app.get('/api/dolby/health')
async def dolby_health():
    with _jobs_lock:
        active = sum(1 for j in _jobs.values() if j.get('state') in {'queued', 'working'})
    return {
        'ok': True,
        'feature': 'TikTok Dolby Vision / HDR 10-bit',
        'max_duration': 30,
        'max_filesize_mb': DOLBY_MAX_FILESIZE // (1024 * 1024),
        'active_jobs': active,
        'profiles': ['hlg', 'pq'],
    }


@app.post('/api/dolby/jobs')
async def create_dolby_job(file: UploadFile = File(...), mode: str = Form('hlg')):
    _purge_jobs()

    if not file.filename:
        raise HTTPException(400, 'Nama file video tidak valid.')

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {'.mp4', '.mov', '.m4v', '.webm', '.mkv'}:
        raise HTTPException(400, 'Format tidak didukung. Gunakan file video MP4 atau MOV.')

    workdir = tempfile.mkdtemp(prefix='rvl-dolby-')
    input_path = Path(workdir) / f'input{suffix}'
    total_bytes = 0

    try:
        with input_path.open('wb') as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > DOLBY_MAX_FILESIZE:
                    raise HTTPException(413, f'Ukuran file melebihi batas maksimal {DOLBY_MAX_FILESIZE // (1024 * 1024)} MB.')
                out_f.write(chunk)

        if total_bytes < 1024:
            raise HTTPException(422, 'File kosong atau tidak valid.')

        # Validate duration (max 30 seconds)
        duration = await asyncio.to_thread(_probe_duration, input_path)
        if duration > DOLBY_MAX_DURATION:
            raise HTTPException(
                422,
                f'Durasi video ({round(duration, 1)} detik) melebihi batas maksimal 30 detik untuk TikTok Dolby Vision. '
                f'Silakan potong video Anda dan coba lagi.',
            )

        clean_name = _clean_stem(file.filename)
        output_filename = f'{clean_name}_hdr-dolby_rvl-hd.mp4'
        output_path = Path(workdir) / output_filename

        job_id = uuid.uuid4().hex
        now = time.time()
        with _jobs_lock:
            _jobs[job_id] = {
                'id': job_id,
                'state': 'queued',
                'progress': 5,
                'stage': 'Antrean proses',
                'mode': mode,
                'workdir': workdir,
                'path': None,
                'filename': output_filename,
                'duration': round(duration, 1),
                'error': None,
                'created': now,
                'updated': now,
            }

        asyncio.create_task(_run_dolby_job(job_id, input_path, output_path, mode))
        return {
            'job_id': job_id,
            'state': 'queued',
            'progress': 5,
            'filename': output_filename,
            'duration': round(duration, 1),
        }
    except HTTPException:
        _cleanup(workdir)
        raise
    except Exception as exc:
        _cleanup(workdir)
        raise HTTPException(500, f'Gagal menyiapkan video: {str(exc)}') from exc
    finally:
        await file.close()


@app.get('/api/dolby/jobs/{job_id}')
async def get_dolby_job(job_id: str):
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


@app.get('/api/dolby/jobs/{job_id}/file')
async def get_dolby_job_file(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, 'Job tidak ditemukan atau sudah kedaluwarsa.')
        if job.get('state') != 'ready' or not job.get('path'):
            raise HTTPException(409, 'File belum selesai diproses.')
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
