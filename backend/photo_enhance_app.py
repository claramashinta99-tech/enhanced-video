"""
Photo Enhance Backend — RVL HD
Endpoint: POST /api/photo/remove-bg
"""

import io
import os
import shutil
import tempfile

from fastapi import File, HTTPException, UploadFile
from fastapi.responses import Response

import social_downloaders_app as base

app = base.app

PHOTO_MAX_BYTES = int(os.getenv('PHOTO_MAX_BYTES', str(20 * 1024 * 1024)))  # 20 MB default

# Lazy-load rembg session so it doesn't slow cold start for other features
_rembg_session = None


def _get_session():
    global _rembg_session
    if _rembg_session is None:
        try:
            from rembg import new_session
            _rembg_session = new_session('u2net')
        except Exception as exc:
            raise RuntimeError('rembg not available') from exc
    return _rembg_session


@app.get('/api/photo/health')
async def photo_health():
    return {'ok': True, 'max_bytes': PHOTO_MAX_BYTES, 'features': ['remove-bg']}


@app.post('/api/photo/remove-bg')
async def remove_background(file: UploadFile = File(...)):
    """
    Remove image background using rembg (u2net model).
    Accepts: JPEG, PNG, WebP, HEIC (anything Pillow can open).
    Returns: PNG with transparent background (image/png).
    """
    if not file.filename:
        raise HTTPException(400, 'Nama file tidak valid.')

    # Read & size-check
    chunks = []
    total = 0
    try:
        while True:
            chunk = await file.read(512 * 1024)  # 512 KB chunks
            if not chunk:
                break
            total += len(chunk)
            if total > PHOTO_MAX_BYTES:
                raise HTTPException(413, f'Ukuran file melebihi batas {PHOTO_MAX_BYTES // (1024*1024)} MB.')
            chunks.append(chunk)
    finally:
        await file.close()

    if total < 64:
        raise HTTPException(422, 'File terlalu kecil atau kosong.')

    raw = b''.join(chunks)

    # Validate it's a real image via Pillow
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.verify()  # fast header check
        img = Image.open(io.BytesIO(raw)).convert('RGBA')
    except Exception:
        raise HTTPException(422, 'File bukan gambar yang valid (JPEG/PNG/WebP).')

    # Run rembg background removal
    try:
        from rembg import remove as rembg_remove
        session = _get_session()
        out_bytes = rembg_remove(raw, session=session)
    except RuntimeError as exc:
        raise HTTPException(503, f'Fitur background removal tidak tersedia: {exc}') from exc
    except Exception as exc:
        raise HTTPException(500, f'Gagal memproses gambar: {exc}') from exc

    return Response(
        content=out_bytes,
        media_type='image/png',
        headers={
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="bg-removed.png"',
        },
    )
