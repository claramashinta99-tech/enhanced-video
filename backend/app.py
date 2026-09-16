import asyncio
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = FastAPI(title="RVL Media API", version="1.0.0")

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


def base_opts() -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "retries": 2,
        "fragment_retries": 2,
        "max_filesize": MAX_FILESIZE,
        "restrictfilenames": False,
    }


def extract_info_sync(url: str) -> dict:
    opts = base_opts()
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
    opts = base_opts()
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


@app.get("/")
async def root():
    return {"name": "RVL Media API", "status": "ok"}


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/api/info")
async def media_info(body: URLBody):
    url = validate_url(body.url)
    try:
        info = await asyncio.to_thread(extract_info_sync, url)
    except DownloadError as exc:
        raise HTTPException(status_code=422, detail="Media tidak bisa dibaca. Coba link lain.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Gagal membaca media.") from exc

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
        cleanup(workdir)
        raise HTTPException(status_code=422, detail="Download gagal. Video mungkin private, dibatasi, atau butuh login.") from exc
    except Exception as exc:
        cleanup(workdir)
        raise HTTPException(status_code=500, detail="Gagal menyiapkan file.") from exc

    media_type = "audio/mpeg" if path.suffix.lower() == ".mp3" else "video/mp4"
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type=media_type,
        background=BackgroundTask(cleanup, workdir),
    )
