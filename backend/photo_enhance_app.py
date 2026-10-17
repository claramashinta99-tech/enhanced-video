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
_realesr_model_instance = None


def _get_session():
    global _rembg_session
    if _rembg_session is None:
        try:
            from rembg import new_session
            _rembg_session = new_session('u2net')
        except Exception as exc:
            raise RuntimeError('rembg not available') from exc
    return _rembg_session


def _get_realesr_model():
    """Load Real-ESRGAN v3 ONNX model (preferred) via ONNX Runtime or OpenCV DNN."""
    global _realesr_model_instance
    if _realesr_model_instance is not None:
        return _realesr_model_instance

    model_file = MODELS_DIR / 'realesr-general-x4v3.onnx'
    if not model_file.exists():
        for p in [Path('backend/models/realesr-general-x4v3.onnx'), Path('models/realesr-general-x4v3.onnx')]:
            if p.exists():
                model_file = p
                break

    if not model_file.exists():
        return None

    # Try ONNX Runtime first on Linux (optimized CPU inference)
    import sys
    if sys.platform != 'win32':
        try:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = max(1, os.cpu_count() or 2)
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            session = ort.InferenceSession(str(model_file), sess_options=opts, providers=['CPUExecutionProvider'])
            _realesr_model_instance = session
            return _realesr_model_instance
        except Exception:
            pass

    # OpenCV DNN (works on both Windows and Linux, rock solid)
    try:
        net = cv2.dnn.readNetFromONNX(str(model_file))
        net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        _realesr_model_instance = net
        return _realesr_model_instance
    except Exception:
        return None


def _forward_realesr_tile(tile_bgr: np.ndarray, model) -> np.ndarray:
    """Forward a single tile through Real-ESRGAN (BGR in [0..255] -> 4x BGR in [0..255])."""
    th, tw = tile_bgr.shape[:2]
    if hasattr(model, 'run'):
        # ONNX Runtime InferenceSession
        tile_rgb = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(tile_rgb, (2, 0, 1))[np.newaxis, ...]
        input_name = model.get_inputs()[0].name
        out = model.run(None, {input_name: blob})[0]
        out_rgb = out.squeeze(0).transpose(1, 2, 0)
        out_rgb = np.clip(out_rgb * 255.0, 0, 255).astype(np.uint8)
        return cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)
    else:
        # OpenCV DNN Net
        blob = cv2.dnn.blobFromImage(tile_bgr, scalefactor=1.0 / 255.0, size=(tw, th), swapRB=True, crop=False)
        model.setInput(blob)
        out = model.forward()
        out_rgb = out.squeeze(0).transpose(1, 2, 0)
        out_rgb = np.clip(out_rgb * 255.0, 0, 255).astype(np.uint8)
        return cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)


def upscale_with_realesr(img_bgr: np.ndarray, model, tile_size: int = 256, tile_pad: int = 16) -> np.ndarray:
    """Run Real-ESRGAN with memory-safe tiling to prevent OOM on server."""
    h, w = img_bgr.shape[:2]
    scale = 4
    out_h, out_w = h * scale, w * scale

    if w <= (tile_size + tile_pad * 2) and h <= (tile_size + tile_pad * 2):
        return _forward_realesr_tile(img_bgr, model)

    output = np.zeros((out_h, out_w, 3), dtype=np.uint8)
    tiles_x = int(np.ceil(w / tile_size))
    tiles_y = int(np.ceil(h / tile_size))

    for y in range(tiles_y):
        for x in range(tiles_x):
            ofs_x = x * tile_size
            ofs_y = y * tile_size

            in_x0 = ofs_x
            in_x1 = min(ofs_x + tile_size, w)
            in_y0 = ofs_y
            in_y1 = min(ofs_y + tile_size, h)

            pad_x0 = max(0, in_x0 - tile_pad)
            pad_x1 = min(w, in_x1 + tile_pad)
            pad_y0 = max(0, in_y0 - tile_pad)
            pad_y1 = min(h, in_y1 + tile_pad)

            tile_in = img_bgr[pad_y0:pad_y1, pad_x0:pad_x1]
            tile_out = _forward_realesr_tile(tile_in, model)

            crop_x0 = (in_x0 - pad_x0) * scale
            crop_x1 = crop_x0 + (in_x1 - in_x0) * scale
            crop_y0 = (in_y0 - pad_y0) * scale
            crop_y1 = crop_y0 + (in_y1 - in_y0) * scale

            out_x0 = in_x0 * scale
            out_x1 = in_x1 * scale
            out_y0 = in_y0 * scale
            out_y1 = in_y1 * scale

            output[out_y0:out_y1, out_x0:out_x1] = tile_out[crop_y0:crop_y1, crop_x0:crop_x1]

    return output


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
    Genuine AI Super-Resolution pipeline (Real-ESRGAN v3 GAN + Wink Bypass):
    1. Edge-preserving surface denoise/smoothing to eliminate compression noise while preserving sharpness.
    2. Deep learning Real-ESRGAN v3 super-resolution inference (4x native, with Lanczos downscale to 2x for ultra-sharp 2x).
    3. Micro-contrast detail lift strictly on Luminance (LAB) to avoid chromatic halos.
    """
    h, w = img_bgr.shape[:2]

    # Guard: Clamp max input to prevent OOM on server.
    # Max target dimension is 3840 (4K UHD)
    max_target_dim = 3840
    if max(h, w) * multiplier > max_target_dim:
        scale = max_target_dim / (max(h, w) * multiplier)
        new_w = max(64, int(w * scale))
        new_h = max(64, int(h * scale))
        img_bgr = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w = img_bgr.shape[:2]

    # Step 1: Gentle edge-preserving smoothing
    smooth = cv2.bilateralFilter(img_bgr, d=5, sigmaColor=15, sigmaSpace=15)

    # Step 2: Super-Resolution (Real-ESRGAN v3 with fallback to FSRCNN)
    upscaled = None
    realesr = _get_realesr_model()
    if realesr is not None:
        try:
            res_4x = upscale_with_realesr(smooth, realesr, tile_size=256, tile_pad=16)
            if multiplier == 2:
                # Downsampling 4x GAN output to 2x via area interpolation gives crystal clarity with zero aliasing
                upscaled = cv2.resize(res_4x, (w * 2, h * 2), interpolation=cv2.INTER_AREA)
            else:
                upscaled = res_4x
        except Exception:
            upscaled = None

    if upscaled is None:
        # Fallback to FSRCNN
        try:
            sr = _get_sr_model(multiplier)
            upscaled = sr.upsample(smooth)
        except Exception:
            # Fallback to Lanczos
            upscaled = cv2.resize(smooth, (w * multiplier, h * multiplier), interpolation=cv2.INTER_LANCZOS4)

    # Step 3: Subtle Micro-detail reconstruction in LAB luminance channel
    lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    blur_l = cv2.GaussianBlur(l, (0, 0), 1.5)
    detail = cv2.subtract(l, blur_l)
    l_sharp = cv2.addWeighted(l, 1.0, detail, 0.30, 0)

    final_bgr = cv2.cvtColor(cv2.merge([l_sharp, a, b]), cv2.COLOR_LAB2BGR)
    return final_bgr


@app.get('/api/photo/health')
async def photo_health():
    models = ['realesr-general-x4v3', 'fsrcnn_x2', 'fsrcnn_x4']
    return {'ok': True, 'max_bytes': PHOTO_MAX_BYTES, 'features': ['remove-bg', 'upscale'], 'models': models}


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
