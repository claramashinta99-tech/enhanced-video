import asyncio
import os
import shutil
import tempfile
import threading
import urllib.request
from http.cookiejar import LoadError, MozillaCookieJar
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

APP_VERSION = "1.7.0"
app = FastAPI(title="RVL Media API", version=APP_VERSION)

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
POT_URL = os.getenv("YOUTUBE_POT_URL", "http://127.0.0.1:4416")
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
    return "youtu" in (urlparse(url).hostname or "").lower()


def package_version(name: str) -> str | None:
    try:
        return pkg_version(name)
    except PackageNotFoundError:
        return None


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


def pot_provider_status() -> bool:
    try:
        with urllib.request.urlopen(f"{POT_URL}/ping", timeout=2) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def base_opts(
    url: str | None = None,
    youtube_clients: list[str] | None = None,
    use_cookie: bool = True,
) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": False,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "max_filesize": MAX_FILESIZE,
        "restrictfilenames": False,
        "http_headers": {"User-Agent": YOUTUBE_UA},
    }

    if url and is_youtube(url):
        opts["js_runtimes"] = {"node": {}}
        clients = youtube_clients or ["mweb"]
        opts["extractor_args"] = {
            "youtube": {"player_client": clients},
            "youtubepot-bgutilhttp": {"base_url": [POT_URL]},
        }
        if use_cookie:
            cookie = get_writable_youtube_cookie()
            if cookie:
                opts["cookiefile"] = str(cookie)
    return opts


def extract_info_sync(url: str) -> dict:
    attempts = [
        ("mweb-pot-public", ["mweb"], False),
        ("mweb-pot-cookie", ["mweb"], True),
        ("default-cookie", ["default", "mweb"], True),
        ("safari-cookie", ["default", "web_safari"], True),
        ("embedded-public", ["web_embedded"], False),
    ] if is_youtube(url) else [("default", None, False)]

    last_error = None
    for name, clients, use_cookie in attempts:
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
            print(f"metadata attempt={name} failed: {type(exc).__name__}: {exc}", flush=True)
    if last_error:
        raise last_error
    raise RuntimeError("Media tidak ditemukan.")


def format_selector(quality: str) -> tuple[str, bool]:
    quality = quality.lower().strip()
    if quality == "1080":
        return "bv*[height<=1080]+ba/b[height<=1080]/best[height<=1080]/best", False
    if quality == "720":
        return "bv*[height<=720]+ba/b[height<=720]/best[height<=720]/best", False
    if quality == "audio":
        return "ba/bestaudio/best", True
    return "bv*+ba/bestvideo*+bestaudio/best", False


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
    attempts = [
        ("mweb-pot-public", ["mweb"], False, None),
        ("mweb-pot-cookie", ["mweb"], True, None),
        ("default-cookie", ["default", "mweb"], True, None),
        ("safari-cookie", ["default", "web_safari"], True, None),
        ("embedded-public", ["web_embedded"], False, None),
        ("android-vr", ["android_vr"], False, "best/18"),
    ]

    errors = []
    for name, clients, use_cookie, selector_override in attempts:
        clear_workdir(workdir)
        try:
            print(
                f"youtube attempt={name} quality={quality} clients={clients} "
                f"cookie={use_cookie} ejs={package_version('yt-dlp-ejs')}",
                flush=True,
            )
            path = run_download_attempt(
                url, quality, workdir, clients, use_cookie, selector_override,
            )
            print(f"youtube success attempt={name} file={path.name}", flush=True)
            return path
        except Exception as exc:
            error = f"{name}: {type(exc).__name__}: {exc}"
            errors.append(error)
            print(f"youtube attempt failed {error}", flush=True)

    raise DownloadError(" | ".join(errors[-6:]))


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
    if "no supported javascript runtime" in message or "challenge solving failed" in message:
        return "Engine JavaScript YouTube belum aktif di server."
    if not cookie["exists"]:
        return "Cookie YouTube belum kebaca di Render. Tambahkan Secret File youtube-cookies.txt."
    if not cookie["valid"]:
        return "Cookie YouTube ada, tapi formatnya tidak valid. Export ulang sebagai Netscape cookies.txt."
    if "confirm you’re not a bot" in message or "confirm you're not a bot" in message or "sign in" in message:
        return "YouTube masih menolak sesi server. Cookie terbaca, tapi challenge/login ditolak."
    if "requested format is not available" in message or "no video formats" in message:
        return "YouTube tidak mengirim format playable ke server untuk video ini."
    return "YouTube gagal menyiapkan file. Cek Logs Render untuk attempt terakhir."


@app.get("/")
async def root():
    cookie = youtube_cookie_status()
    return {
        "name": "RVL Media API",
        "status": "ok",
        "version": APP_VERSION,
        "youtube_auth": cookie["valid"],
    }


@app.get("/health")
async def health():
    cookie = youtube_cookie_status()
    working = cookie_file_status(YOUTUBE_COOKIE_WORK_FILE)
    return {
        "ok": True,
        "version": APP_VERSION,
        "youtube_auth": cookie["valid"],
        "youtube_cookie": cookie,
        "youtube_cookie_working": working,
        "yt_dlp": package_version("yt-dlp"),
        "yt_dlp_ejs": package_version("yt-dlp-ejs"),
        "js_runtime": "node",
        "pot_provider": pot_provider_status(),
        "youtube_strategy": "mweb-public>mweb-cookie>default-cookie>safari-cookie>embedded>android-vr",
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

    platform = "youtube" if is_youtube(url) else "tiktok"
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
