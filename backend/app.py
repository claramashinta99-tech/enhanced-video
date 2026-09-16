import asyncio
import os
import shutil
import tempfile
import threading
from http.cookiejar import MozillaCookieJar, LoadError
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = FastAPI(title="RVL Media API", version="1.6.0")

origins = [x.strip() for x in os.getenv(
    "WEB_ORIGINS",
    "https://reyval.web.id,https://www.reyval.web.id,http://localhost:5500,http://127.0.0.1:5500",
).split(",") if x.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
    "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
}

MAX_FILESIZE = 500 * 1024 * 1024
DOWNLOAD_SLOTS = asyncio.Semaphore(int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "2")))
YOUTUBE_COOKIE_FILE = Path(os.getenv("YOUTUBE_COOKIE_FILE", "/etc/secrets/youtube-cookies.txt"))
YOUTUBE_COOKIE_WORK_FILE = Path("/tmp/rvl-youtube-cookies.txt")
YOUTUBE_UA = os.getenv(
    "YOUTUBE_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
)
_cookie_lock = threading.Lock()
_cookie_initialized = False


class URLBody(BaseModel):
    url: HttpUrl


class DownloadBody(BaseModel):
    url: HttpUrl
    quality: str = "best"


def validate_url(value: str) -> str:
    url = str(value)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"http", "https"} or host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="Link harus dari YouTube atau TikTok.")
    return url


def is_youtube(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return "youtu" in host


def cookie_file_status(path: Path) -> dict:
    status = {"exists": False, "valid": False, "count": 0, "size": 0}
    try:
        if not path.is_file():
            return status
        status["exists"] = True
        status["size"] = path.stat().st_size
        if status["size"] <= 64:
            return status
        jar = MozillaCookieJar(str(path))
        jar.load(ignore_discard=True, ignore_expires=True)
        status["count"] = sum(1 for _ in jar)
        status["valid"] = status["count"] > 0
    except (OSError, LoadError, ValueError):
        pass
    return status


def youtube_cookie_status() -> dict:
    return cookie_file_status(YOUTUBE_COOKIE_FILE)


def youtube_cookie_ready() -> bool:
    return youtube_cookie_status()["valid"]


def get_writable_youtube_cookie() -> Path | None:
    global _cookie_initialized
    if not youtube_cookie_ready():
        return None

    with _cookie_lock:
        if not _cookie_initialized:
            try:
                shutil.copyfile(YOUTUBE_COOKIE_FILE, YOUTUBE_COOKIE_WORK_FILE)
                os.chmod(YOUTUBE_COOKIE_WORK_FILE, 0o600)
                _cookie_initialized = True
            except OSError as exc:
                print(f"cookie copy error: {type(exc).__name__}: {exc}", flush=True)
                return None

    return YOUTUBE_COOKIE_WORK_FILE if YOUTUBE_COOKIE_WORK_FILE.is_file() else None


def base_opts(
    url: str | None = None,
    youtube_clients: list[str] | None = None,
    use_cookie: bool = True,
) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "max_filesize": MAX_FILESIZE,
        "restrictfilenames": False,
        "http_headers": {"User-Agent": YOUTUBE_UA},
    }

    if url and is_youtube(url):
        clients = youtube_clients or ["mweb", "web_safari"]
        opts["extractor_args"] = {
            "youtube": {
                "player_client": clients,
            },
            "youtubepot-bgutilhttp": {
                "base_url": ["http://127.0.0.1:4416"],
            },
        }
        if use_cookie:
            cookie = get_writable_youtube_cookie()
            if cookie:
                opts["cookiefile"] = str(cookie)

    return opts


def extract_info_sync(url: str) -> dict:
    # Metadata should not fail just because a client's default format selection
    # is unavailable. mweb + POT is preferred, Safari is a useful HLS fallback.
    last_error = None
    for clients, use_cookie in [
        (["mweb", "web_safari"], True),
        (["default", "mweb", "web_safari"], True),
        (["web_embedded"], False),
    ]:
        try:
            opts = base_opts(url, clients, use_cookie)
            opts["skip_download"] = True
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            if info:
                if "entries" in info and info.get("entries"):
                    info = next((x for x in info["entries"] if x), info)
                return info
        except Exception as exc:
            last_error = exc
            print(f"metadata attempt {clients} failed: {type(exc).__name__}: {exc}", flush=True)
    if last_error:
        raise last_error
    raise RuntimeError("Media tidak ditemukan.")


def format_selector(quality: str) -> tuple[str, bool]:
    quality = quality.lower().strip()
    if quality == "1080":
        return "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best", False
    if quality == "720":
        return "bestvideo*[height<=720]+bestaudio/best[height<=720]/best", False
    if quality == "audio":
        return "bestaudio/best", True
    return "bestvideo*+bestaudio/best", False


def clear_workdir(workdir: str) -> None:
    root = Path(workdir)
    if not root.exists():
        return
    for p in root.iterdir():
        try:
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
        except OSError:
            pass


def run_download_attempt(
    url: str,
    quality: str,
    workdir: str,
    clients: list[str] | None,
    use_cookie: bool,
    selector_override: str | None = None,
) -> Path:
    selector, audio_only = format_selector(quality)
    if selector_override:
        selector = selector_override

    opts = base_opts(url, clients, use_cookie)
    opts.update({
        "format": selector,
        "outtmpl": str(Path(workdir) / "%(title).80B [%(id)s].%(ext)s"),
        "merge_output_format": "mp4",
        "windowsfilenames": True,
    })

    if audio_only:
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]

    with YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)

    files = [
        p for p in Path(workdir).iterdir()
        if p.is_file() and not p.name.endswith((".part", ".ytdl"))
    ]
    if not files:
        raise RuntimeError("File hasil tidak ditemukan.")
    return max(files, key=lambda p: p.stat().st_mtime)


def download_youtube_sync(url: str, quality: str, workdir: str) -> Path:
    # Each row is a genuinely different YouTube extraction path. If one client
    # returns metadata but no playable formats, move to the next client instead
    # of retrying the same broken selector.
    attempts = [
        ("mweb-pot", ["mweb"], True, None),
        ("safari-hls", ["web_safari"], True, None),
        ("combined", ["default", "mweb", "web_safari"], True, None),
        ("embedded", ["web_embedded"], False, None),
    ]

    # Last-resort path for public videos. Current YouTube behavior commonly
    # leaves format 18 available to android_vr even when higher formats are
    # restricted. It is enough to produce a working MP4 or extract MP3 audio.
    attempts.append(("android-vr-18", ["android_vr"], False, "18/best"))

    errors = []
    for name, clients, use_cookie, selector_override in attempts:
        clear_workdir(workdir)
        try:
            print(
                f"youtube download attempt={name} quality={quality} clients={clients} cookie={use_cookie}",
                flush=True,
            )
            path = run_download_attempt(
                url,
                quality,
                workdir,
                clients,
                use_cookie,
                selector_override,
            )
            print(f"youtube download success attempt={name} file={path.name}", flush=True)
            return path
        except Exception as exc:
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
            print(f"youtube attempt failed {errors[-1]}", flush=True)

    raise DownloadError(" | ".join(errors[-5:]))


def download_sync(url: str, quality: str, workdir: str) -> Path:
    if is_youtube(url):
        return download_youtube_sync(url, quality, workdir)

    selector, audio_only = format_selector(quality)
    opts = base_opts(url)
    opts.update({
        "format": selector,
        "outtmpl": str(Path(workdir) / "%(title).80B [%(id)s].%(ext)s"),
        "merge_output_format": "mp4",
        "windowsfilenames": True,
    })
    if audio_only:
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]

    with YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)

    files = [p for p in Path(workdir).iterdir() if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
    if not files:
        raise RuntimeError("File hasil tidak ditemukan.")
    return max(files, key=lambda p: p.stat().st_mtime)


def cleanup(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


def youtube_error_detail(exc: Exception) -> str:
    cookie = youtube_cookie_status()
    message = str(exc).lower()
    if not cookie["exists"]:
        return "Cookie YouTube belum kebaca di Render. Tambahkan Secret File youtube-cookies.txt."
    if not cookie["valid"]:
        return "Cookie YouTube ada, tapi formatnya tidak valid. Export ulang sebagai Netscape cookies.txt."
    if "confirm you’re not a bot" in message or "confirm you're not a bot" in message or "sign in" in message:
        return "Cookie YouTube terbaca, tapi ditolak/expired. Export cookie baru lalu ganti Secret File di Render."
    if "requested format is not available" in message or "no video formats" in message:
        return "YouTube tidak memberi format playable dari semua client fallback. Cek Logs Render."
    return "YouTube gagal menyiapkan file. Cek Logs Render untuk attempt terakhir."


@app.get("/")
async def root():
    cookie = youtube_cookie_status()
    return {
        "name": "RVL Media API",
        "status": "ok",
        "version": "1.6.0",
        "youtube_auth": cookie["valid"],
    }


@app.get("/health")
async def health():
    cookie = youtube_cookie_status()
    working = cookie_file_status(YOUTUBE_COOKIE_WORK_FILE)
    return {
        "ok": True,
        "version": "1.6.0",
        "youtube_auth": cookie["valid"],
        "youtube_cookie": cookie,
        "youtube_cookie_working": working,
        "youtube_strategy": "mweb-pot>safari-hls>combined>embedded>android-vr-18",
    }


@app.post("/api/info")
async def media_info(body: URLBody):
    url = validate_url(body.url)
    try:
        info = await asyncio.to_thread(extract_info_sync, url)
    except DownloadError as exc:
        print(f"yt-dlp info error for {url}: {exc}", flush=True)
        detail = youtube_error_detail(exc) if is_youtube(url) else "Media tidak bisa dibaca. Coba link lain."
        raise HTTPException(status_code=422, detail=detail) from exc
    except Exception as exc:
        print(f"info error for {url}: {type(exc).__name__}: {exc}", flush=True)
        detail = youtube_error_detail(exc) if is_youtube(url) else "Gagal membaca media."
        raise HTTPException(status_code=500, detail=detail) from exc

    host = (urlparse(url).hostname or "").lower()
    platform = "youtube" if "youtu" in host else "tiktok"
    return {
        "platform": platform,
        "id": info.get("id"),
        "title": info.get("title") or "Untitled",
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
        "choices": [
            {"id": "best", "label": "Best quality"},
            {"id": "1080", "label": "Up to 1080p"},
            {"id": "720", "label": "Up to 720p"},
            {"id": "audio", "label": "MP3 192 kbps"},
        ],
    }


async def make_download_response(url: str, quality: str):
    url = validate_url(url)
    quality = quality.lower().strip()
    if quality not in {"best", "1080", "720", "audio"}:
        raise HTTPException(status_code=400, detail="Pilihan kualitas tidak valid.")

    workdir = tempfile.mkdtemp(prefix="rvl-")
    try:
        async with DOWNLOAD_SLOTS:
            path = await asyncio.to_thread(download_sync, url, quality, workdir)
    except DownloadError as exc:
        print(f"yt-dlp download error for {url}: {exc}", flush=True)
        cleanup(workdir)
        detail = youtube_error_detail(exc) if is_youtube(url) else "Download gagal. Video mungkin private, dibatasi, atau butuh login."
        raise HTTPException(status_code=422, detail=detail) from exc
    except Exception as exc:
        print(f"download error for {url}: {type(exc).__name__}: {exc}", flush=True)
        cleanup(workdir)
        detail = youtube_error_detail(exc) if is_youtube(url) else "Gagal menyiapkan file."
        raise HTTPException(status_code=500, detail=detail) from exc

    media_type = "audio/mpeg" if path.suffix.lower() == ".mp3" else "video/mp4"
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
        background=BackgroundTask(cleanup, workdir),
    )


@app.post("/api/download")
async def download_media(body: DownloadBody):
    return await make_download_response(str(body.url), body.quality)


@app.get("/api/download")
async def download_media_direct(url: str, quality: str = "best"):
    return await make_download_response(url, quality)
