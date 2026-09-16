import asyncio
import os
import shutil
import tempfile
from http.cookiejar import MozillaCookieJar, LoadError
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = FastAPI(title="RVL Media API", version="1.3.0")

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


def youtube_cookie_status() -> dict:
    status = {
        "exists": False,
        "valid": False,
        "count": 0,
        "size": 0,
    }
    try:
        if not YOUTUBE_COOKIE_FILE.is_file():
            return status
        status["exists"] = True
        status["size"] = YOUTUBE_COOKIE_FILE.stat().st_size
        if status["size"] <= 64:
            return status
        jar = MozillaCookieJar(str(YOUTUBE_COOKIE_FILE))
        jar.load(ignore_discard=True, ignore_expires=True)
        status["count"] = sum(1 for _ in jar)
        status["valid"] = status["count"] > 0
    except (OSError, LoadError, ValueError):
        pass
    return status


def youtube_cookie_ready() -> bool:
    return youtube_cookie_status()["valid"]


def base_opts(url: str | None = None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 25,
        "retries": 3,
        "fragment_retries": 3,
        "max_filesize": MAX_FILESIZE,
        "restrictfilenames": False,
        "extractor_args": {
            "youtube": {
                "player_client": ["mweb"],
            },
            "youtubepot-bgutilhttp": {
                "base_url": ["http://127.0.0.1:4416"],
            },
        },
    }
    if url and is_youtube(url) and youtube_cookie_ready():
        opts["cookiefile"] = str(YOUTUBE_COOKIE_FILE)
    return opts


def extract_info_sync(url: str) -> dict:
    opts = base_opts(url)
    opts["skip_download"] = True
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        raise RuntimeError("Media tidak ditemukan.")
    if "entries" in info and info.get("entries"):
        info = next((x for x in info["entries"] if x), info)
    return info


def format_selector(quality: str) -> tuple[str, bool]:
    quality = quality.lower().strip()
    if quality == "1080":
        return "bv*[height<=1080]+ba/b[height<=1080]/best[height<=1080]", False
    if quality == "720":
        return "bv*[height<=720]+ba/b[height<=720]/best[height<=720]", False
    if quality == "audio":
        return "ba/b", True
    return "bv*+ba/b", False


def download_sync(url: str, quality: str, workdir: str) -> Path:
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
    return "YouTube gagal dibaca. Cek Logs Render untuk error yt-dlp terbaru."


@app.get("/")
async def root():
    cookie = youtube_cookie_status()
    return {
        "name": "RVL Media API",
        "status": "ok",
        "version": "1.3.0",
        "youtube_auth": cookie["valid"],
    }


@app.get("/health")
async def health():
    cookie = youtube_cookie_status()
    return {
        "ok": True,
        "youtube_auth": cookie["valid"],
        "youtube_cookie": cookie,
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


@app.post("/api/download")
async def download_media(body: DownloadBody, request: Request):
    url = validate_url(body.url)
    quality = body.quality.lower().strip()
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
        background=BackgroundTask(cleanup, workdir),
    )
