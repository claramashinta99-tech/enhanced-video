"""
Photo Enhance Backend — RVL HD
Endpoints:
- POST /api/photo/remove-bg (rembg)
- POST /api/photo/upscale (AI Super-Resolution 2x/4x FSRCNN + Wink APP1 EXIF Injection)
"""

import datetime
import io
import os
import shutil
import struct
import tempfile
from pathlib import Path

import cv2
import numpy as np
from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

try:
    import social_downloaders_app as base
    app = base.app
except Exception:
    from fastapi import FastAPI
    app = FastAPI(title='Photo Enhance Backend')

PHOTO_MAX_BYTES = int(os.getenv('PHOTO_MAX_BYTES', str(25 * 1024 * 1024)))  # 25 MB

# Lazy-load rembg session
_rembg_session = None

# Model directory & cache
MODELS_DIR = Path(__file__).resolve().parent / 'models'
if not MODELS_DIR.exists():
    MODELS_DIR = Path('/app/models')

_sr_cache = {}


def _get_session():
    global _rembg_session
    if _rembg_session is None:
        try:
            from rembg import new_session
            _rembg_session = new_session('u2net')
        except Exception as exc:
            raise RuntimeError('rembg not available') from exc
    return _rembg_session


def _get_sr_model(multiplier: int):
    if multiplier not in (2, 4):
        multiplier = 4
    if multiplier in _sr_cache:
        return _sr_cache[multiplier]

    model_file = MODELS_DIR / f'FSRCNN_x{multiplier}.pb'
    if not model_file.exists():
        alt_paths = [
            Path('backend/models') / f'FSRCNN_x{multiplier}.pb',
            Path('models') / f'FSRCNN_x{multiplier}.pb',
        ]
        for p in alt_paths:
            if p.exists():
                model_file = p
                break

    if not model_file.exists():
        raise FileNotFoundError(f'Super-resolution model not found: FSRCNN_x{multiplier}.pb')

    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(str(model_file))
    sr.setModel('fsrcnn', multiplier)
    _sr_cache[multiplier] = sr
    return sr


def create_wink_app1_exif(width: int, height: int, dt: datetime.datetime = None) -> bytes:
    """
    Generate authentic 192-byte Wink APP1 EXIF structure:
    - 0xFFE1 marker (length 190)
    - Exif header (Big-Endian TIFF 'MM\x00*')
    - IFD0: ImageWidth, ImageLength, ExifIFDPointer, Orientation, DateTime
    - ExifIFD: DateTimeOriginal, LightSource
    - Interoperability / Wink 64-bit metadata tags
    """
    if dt is None:
        dt = datetime.datetime.now()
    date_str = dt.strftime('%Y:%m:%d %H:%M:%S').encode('ascii')[:19]

    buf = bytearray(192)
    struct.pack_into('>HH', buf, 0, 0xFFE1, 190)
    buf[4:10] = b'Exif\x00\x00'
    buf[10:14] = b'MM\x00*'
    struct.pack_into('>I', buf, 14, 8)

    # IFD0: 5 tags
    struct.pack_into('>H', buf, 18, 5)
    pos = 20
    # Tag 0x0100: ImageWidth
    struct.pack_into('>HHII', buf, pos, 0x0100, 4, 1, int(width)); pos += 12
    # Tag 0x0101: ImageLength (Height)
    struct.pack_into('>HHII', buf, pos, 0x0101, 4, 1, int(height)); pos += 12
    # Tag 0x8769: ExifIFDPointer (offset 0x5E = 94)
    struct.pack_into('>HHII', buf, pos, 0x8769, 4, 1, 0x5E); pos += 12
    # Tag 0x0112: Orientation (0 = Normal)
    struct.pack_into('>HHII', buf, pos, 0x0112, 4, 1, 0); pos += 12
    # Tag 0x0132: DateTime (offset 0x4A = 74 -> offset 84 from EXIF header)
    struct.pack_into('>HHII', buf, pos, 0x0132, 2, 20, 0x4A); pos += 12
    # Next IFD offset = 0
    struct.pack_into('>I', buf, pos, 0); pos += 4

    # Date string at offset 84
    buf[84:84+len(date_str)] = date_str

    # Exif IFD at offset 104
    pos = 104
    struct.pack_into('>H', buf, pos, 2); pos += 2
    # Tag 0x9003: DateTimeOriginal (offset 0x7C = 124 -> 134)
    struct.pack_into('>HHII', buf, pos, 0x9003, 2, 20, 0x7C); pos += 12
    # Tag 0x9208: LightSource (0)
    struct.pack_into('>HHII', buf, pos, 0x9208, 4, 1, 0); pos += 12
    struct.pack_into('>I', buf, pos, 0)

    # DateTimeOriginal string at offset 134
    buf[134:134+len(date_str)] = date_str

    # Additional metadata at offset 154
    pos = 154
    struct.pack_into('>H', buf, pos, 1); pos += 2
    struct.pack_into('>HHII', buf, pos, 0x0132, 2, 20, 0xA2); pos += 12
    struct.pack_into('>I', buf, pos, 0)

    # Timestamp at offset 172
    buf[172:172+len(date_str)] = date_str
    return bytes(buf)


def inject_wink_exif(jpeg_bytes: bytes, width: int, height: int) -> bytes:
    """Inject Wink APP1 EXIF segment immediately after JPEG SOI marker (0xFFD8)."""
    exif = create_wink_app1_exif(width, height)
    if len(jpeg_bytes) < 4 or jpeg_bytes[0] != 0xFF or jpeg_bytes[1] != 0xD8:
        return jpeg_bytes

    pos = 2
    if jpeg_bytes[pos] == 0xFF and (jpeg_bytes[pos + 1] & 0xF0 == 0xE0):
        app_len = (jpeg_bytes[pos + 2] << 8) | jpeg_bytes[pos + 3]
        rest = jpeg_bytes[pos + 2 + app_len:]
    else:
        rest = jpeg_bytes[2:]

    return b'\xFF\xD8' + exif + rest


def process_ai_upscale(img_bgr: np.ndarray, multiplier: int = 4) -> np.ndarray:
    """
    Genuine AI Super-Resolution pipeline (Wink Bypass):
    1. Edge-preserving surface denoise/smoothing to remove JPEG compression blockiness without softening edges.
    2. Deep learning FSRCNN super-resolution inference (2x or 4x).
    3. Micro-contrast detail lift strictly on Luminance (LAB) to avoid chromatic halos.
    """
    h, w = img_bgr.shape[:2]

    # Guard: Clamp max input if already ultra high resolution to prevent OOM
    # If 4x would exceed 5120px max dimension, downscale input proportionally
    max_target_dim = 5120
    if max(h, w) * multiplier > max_target_dim:
        scale = max_target_dim / (max(h, w) * multiplier)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img_bgr = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Step 1: Gentle edge-preserving smoothing (eliminates JPEG block noise on skin/sky/surfaces)
    smooth = cv2.bilateralFilter(img_bgr, d=5, sigmaColor=18, sigmaSpace=18)

    # Step 2: FSRCNN Super-Resolution
    sr = _get_sr_model(multiplier)
    upscaled = sr.upsample(smooth)

    # Step 3: Subtle Micro-detail reconstruction in LAB luminance channel
    lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    blur_l = cv2.GaussianBlur(l, (0, 0), 1.8)
    detail = cv2.subtract(l, blur_l)
    l_sharp = cv2.addWeighted(l, 1.0, detail, 0.35, 0)

    final_bgr = cv2.cvtColor(cv2.merge([l_sharp, a, b]), cv2.COLOR_LAB2BGR)
    return final_bgr


@app.get('/api/photo/health')
async def photo_health():
    return {'ok': True, 'max_bytes': PHOTO_MAX_BYTES, 'features': ['remove-bg', 'upscale'], 'models': ['fsrcnn_x2', 'fsrcnn_x4']}


@app.post('/api/photo/remove-bg')
async def remove_background(file: UploadFile = File(...)):
    """
    Remove image background using rembg (u2net model).
    Accepts: JPEG, PNG, WebP, HEIC (anything Pillow can open).
    Returns: PNG with transparent background (image/png).
    """
    if not file.filename:
        raise HTTPException(400, 'Nama file tidak valid.')

    chunks = []
    total = 0
    try:
        while True:
            chunk = await file.read(512 * 1024)
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

    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        img = Image.open(io.BytesIO(raw)).convert('RGBA')
    except Exception:
        raise HTTPException(422, 'File bukan gambar yang valid (JPEG/PNG/WebP).')

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


@app.post('/api/photo/upscale')
async def upscale_image(
    file: UploadFile = File(...),
    multiplier: int = Form(4),
):
    """
    AI Super-Resolution Upscale (2x / 4x) with Wink Quality Restoration bypass.
    Accepts: JPEG, PNG, WebP.
    Returns: Ultra HD JPEG (Quality 98) with authentic Wink APP1 EXIF structure.
    """
    if not file.filename:
        raise HTTPException(400, 'Nama file tidak valid.')

    if multiplier not in (2, 4):
        multiplier = 4

    chunks = []
    total = 0
    try:
        while True:
            chunk = await file.read(512 * 1024)
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

    # Decode image with OpenCV / Pillow
    try:
        nparr = np.frombuffer(raw, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            # Fallback with PIL
            pil_img = Image.open(io.BytesIO(raw)).convert('RGB')
            img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception:
        raise HTTPException(422, 'File bukan gambar yang valid.')

    try:
        # Perform AI super-resolution
        enhanced_bgr = process_ai_upscale(img_bgr, multiplier=multiplier)
        out_h, out_w = enhanced_bgr.shape[:2]

        # Encode to studio JPEG Q98
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 98]
        success, enc = cv2.imencode('.jpg', enhanced_bgr, encode_params)
        if not success:
            raise RuntimeError('Gagal meng-encode JPEG.')

        # Inject authentic Wink APP1 EXIF metadata
        final_jpeg = inject_wink_exif(enc.tobytes(), out_w, out_h)
    except Exception as exc:
        raise HTTPException(500, f'Gagal memproses restorasi AI: {exc}') from exc

    base_name = Path(file.filename).stem
    safe_name = f'{base_name}_rvl-wink-bypass.jpg'

    return Response(
        content=final_jpeg,
        media_type='image/jpeg',
        headers={
            'Cache-Control': 'no-store',
            'Content-Disposition': f'attachment; filename="{safe_name}"',
            'X-Upscale-Multiplier': str(multiplier),
            'X-Upscale-Resolution': f'{out_w}x{out_h}',
        },
    )
