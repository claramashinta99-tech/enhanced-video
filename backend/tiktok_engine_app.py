import copy
import html
import json
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

from curl_cffi import requests as curl_requests
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

import youtube_engine_app as engine

app = engine.app
legacy = engine.legacy

_ORIGINAL_EXTRACT_INFO = legacy.extract_info_sync
_ORIGINAL_DOWNLOAD_SYNC = legacy.download_sync
_ORIGINAL_QUALITY_CHOICES = legacy.quality_choices
_TIKTOK_STRATEGY = {'name': 'tiktok-web', 'clients': None, 'cookie': False}
_TIKTOK_APP_STRATEGY = {'name': 'tiktok-app-api', 'clients': None, 'cookie': False}
_TIKWM_STRATEGY = {'name': 'tikwm-fallback', 'clients': None, 'cookie': False}
_TIKTOK_HD_SLOT = '2160'

_TIKDOWNLOADER_API = 'https://tikdownloader.io/api/ajaxSearch'
_TIKDOWNLOADER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://tikdownloader.io',
    'Referer': 'https://tikdownloader.io/en',
    'X-Requested-With': 'XMLHttpRequest',
}

_TIKWM_API = 'https://www.tikwm.com/api/'
_TIKWM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://tikwm.com',
    'Referer': 'https://tikwm.com/',
    'X-Requested-With': 'XMLHttpRequest',
}


def _is_tiktok(url):
    try:
        host = urllib.parse.urlparse(str(url)).hostname or ''
        return host.lower().rstrip('.').endswith('tiktok.com')
    except Exception:
        return False


def _video_id(url):
    m = re.search(r'/(?:video|photo)/(\d+)', str(url))
    return m.group(1) if m else None


def _username(url):
    m = re.search(r'tiktok\.com/@([\w.-]+)', str(url), re.I)
    return m.group(1) if m else ''


def _best_thumbnail(info):
    if info.get('thumbnail'):
        return info['thumbnail']
    thumbs = [x for x in (info.get('thumbnails') or []) if isinstance(x, dict) and x.get('url')]
    if not thumbs:
        return None

    def score(x):
        try:
            return int(x.get('width') or 0) * int(x.get('height') or 0)
        except Exception:
            return 0

    return max(thumbs, key=score).get('url')


def _tiktok_oembed_thumbnail(url):
    try:
        endpoint = 'https://www.tiktok.com/oembed?url=' + urllib.parse.quote(str(url), safe='')
        req = urllib.request.Request(endpoint, headers={'User-Agent': legacy.YOUTUBE_UA})
        with urllib.request.urlopen(req, timeout=6) as response:
            return json.loads(response.read().decode('utf-8', 'replace')).get('thumbnail_url') or None
    except Exception:
        return None


def _tiktok_opts(url, force_app=False):
    opts = legacy.base_opts(url, None, False)
    opts.update({
        'noplaylist': True,
        'retries': 1,
        'fragment_retries': 1,
        'extractor_retries': 1,
        'socket_timeout': 12,
    })
    if force_app:
        opts['extractor_args'] = {'tiktok': {'app_info': ['']}}
    return opts


def _extract_native_info(url, force_app=False):
    opts = _tiktok_opts(url, force_app)
    opts['skip_download'] = True
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if info and info.get('entries'):
        info = next((x for x in info['entries'] if x), info)
    if not info:
        raise DownloadError('TikTok metadata empty')
    info = copy.deepcopy(info)
    info['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(info)
    info['_rvl_tiktok_source'] = 'app-api' if force_app else 'web'
    return info


def _n(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _dims(fmt):
    try:
        w, h = int(fmt.get('width') or 0), int(fmt.get('height') or 0)
    except (TypeError, ValueError):
        w, h = 0, 0
    if not w or not h:
        text = ' '.join(str(fmt.get(k) or '') for k in ('format_id', 'format', 'resolution', 'url'))
        m = re.search(r'(?<!\d)(360|540|576|720|1080|1440|2160)p(?!\d)', text, re.I)
        if m:
            w = w or int(m.group(1))
            h = h or int(m.group(1))
    return w, h


def _rank(fmt):
    w, h = _dims(fmt)
    short = min(w, h) if w and h else max(w, h)
    long = max(w, h)
    fps = _n(fmt.get('fps'))
    tbr = _n(fmt.get('tbr') or fmt.get('vbr'))
    size = _n(fmt.get('filesize') or fmt.get('filesize_approx'))
    codec = str(fmt.get('vcodec') or '').lower()
    codec_score = 2 if any(x in codec for x in ('265', 'hevc', 'bytevc1')) else 1 if ('264' in codec or 'avc' in codec) else 0
    has_audio = 0 if str(fmt.get('acodec') or '').lower() == 'none' else 1
    return short, long, w * h, fps, tbr, size, codec_score, has_audio


def _hd_candidates(info):
    out = []
    for fmt in info.get('formats') or []:
        if not isinstance(fmt, dict) or not fmt.get('url'):
            continue
        vcodec = str(fmt.get('vcodec') or '').lower()
        note = str(fmt.get('format_note') or '').lower()
        fmt_id = str(fmt.get('format_id') or '').lower()
        if not vcodec or vcodec == 'none' or 'bytevc2' in vcodec or 'vvc' in vcodec:
            continue
        if 'unplayable' in note or 'watermark' in note or fmt_id in {'download', 'download_addr'}:
            continue
        out.append(fmt)
    if not out:
        return []
    muxed = [x for x in out if str(x.get('acodec') or '').lower() != 'none']
    return sorted(muxed or out, key=_rank, reverse=True)


def _tikwm_fetch(url):
    candidates = [str(url).split('#', 1)[0]]
    vid = _video_id(url)
    if vid:
        candidates += [vid, f'https://www.tiktok.com/@tiktok/video/{vid}']
    last = None
    for candidate in candidates:
        try:
            endpoint = _TIKWM_API + '?' + urllib.parse.urlencode({'url': candidate, 'hd': '1'})
            req = urllib.request.Request(endpoint, headers=_TIKWM_HEADERS)
            with urllib.request.urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8', 'replace'))
            data = payload.get('data')
            if payload.get('code') != 0 or not isinstance(data, dict):
                last = payload.get('msg') or payload.get('message')
                continue
            detail = data.get('detail') if isinstance(data.get('detail'), dict) else data
            hd = detail.get('hdplay') or detail.get('hd_play') or detail.get('hdplay_url')
            play = detail.get('play') or detail.get('play_url') or detail.get('url') or detail.get('wmplay')
            if not hd and not play:
                continue
            author = detail.get('author') or {}
            music = detail.get('music_info') or {}
            return {
                'id': str(detail.get('id') or detail.get('video_id') or vid or ''),
                'title': detail.get('title') or detail.get('desc') or 'TikTok video',
                'thumbnail': detail.get('origin_cover') or detail.get('cover'),
                'duration': detail.get('duration'),
                'uploader': author.get('unique_id') or author.get('nickname') or _username(url),
                'hd_url': hd,
                'play_url': play or hd,
                'music_url': music.get('play') if isinstance(music, dict) else None,
            }
        except Exception as exc:
            last = f'{type(exc).__name__}: {str(exc)[-160:]}'
    print(f'tikwm failed id={vid} detail={last}', flush=True)
    return None


def _tikwm_info(url, item):
    formats = []
    if item.get('play_url'):
        formats.append({'format_id': 'tikwm-best', 'url': item['play_url'], 'ext': 'mp4', 'vcodec': 'h264', 'acodec': 'aac'})
    if item.get('hd_url') and item.get('hd_url') != item.get('play_url'):
        formats.append({'format_id': 'tikwm-hd', 'url': item['hd_url'], 'ext': 'mp4', 'vcodec': 'h265', 'acodec': 'aac'})
    return {
        'id': item.get('id') or _video_id(url),
        'title': item.get('title') or 'TikTok video',
        'thumbnail': item.get('thumbnail'),
        'duration': item.get('duration'),
        'uploader': item.get('uploader') or _username(url),
        'webpage_url': str(url),
        'extractor': 'TikWM fallback',
        'formats': formats,
        '_rvl_tikwm': item,
    }


def extract_info_sync(url):
    if not _is_tiktok(url):
        return _ORIGINAL_EXTRACT_INFO(url)
    errors = []
    for force_app in (True, False):
        try:
            info = _extract_native_info(url, force_app)
            legacy.cache_put(url, info, _TIKTOK_APP_STRATEGY if force_app else _TIKTOK_STRATEGY)
            best = (_hd_candidates(info) or [None])[0]
            if best:
                print(f'tiktok info source={info.get("_rvl_tiktok_source")} id={info.get("id")} best={best.get("format_id")} rank={_rank(best)}', flush=True)
            return info
        except Exception as exc:
            errors.append(f'{"app" if force_app else "web"}:{type(exc).__name__}:{str(exc)[-160:]}')
    print(f'tiktok native info failed id={_video_id(url)} detail={" | ".join(errors)}', flush=True)
    item = _tikwm_fetch(url)
    if item:
        info = _tikwm_info(url, item)
        legacy.cache_put(url, info, _TIKWM_STRATEGY)
        return info
    raise DownloadError('TikTok media info failed')


def quality_choices(info, platform):
    if platform != 'tiktok':
        return _ORIGINAL_QUALITY_CHOICES(info, platform)
    return [
        {'id': 'best', 'label': 'Normal'},
        {'id': _TIKTOK_HD_SLOT, 'label': 'HD · Original source'},
    ]


def _safe_filename(value):
    name = re.sub(r'[\\/:*?"<>|]+', ' ', str(value or 'TikTok video'))
    return re.sub(r'\s+', ' ', name).strip()[:90] or 'TikTok video'


def _probe(path):
    try:
        raw = subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries',
            'format=size,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate',
            '-of', 'json', str(path),
        ], text=True, timeout=20)
        data = json.loads(raw)
    except Exception:
        return {}
    out = {
        'size': int((data.get('format') or {}).get('size') or path.stat().st_size),
        'bit_rate': int((data.get('format') or {}).get('bit_rate') or 0),
        'has_audio': False,
    }
    for stream in data.get('streams') or []:
        if stream.get('codec_type') == 'video' and 'video' not in out:
            rate = stream.get('avg_frame_rate') or stream.get('r_frame_rate') or '0/1'
            try:
                a, b = str(rate).split('/', 1)
                fps = float(a) / float(b) if float(b) else 0.0
            except Exception:
                fps = 0.0
            out['video'] = {
                'codec': stream.get('codec_name'),
                'width': int(stream.get('width') or 0),
                'height': int(stream.get('height') or 0),
                'fps': fps,
                'bit_rate': int(stream.get('bit_rate') or 0),
            }
        elif stream.get('codec_type') == 'audio':
            out['has_audio'] = True
    return out


def _stream(url, path, job_id=None, stage='Mengambil media', headers=None):
    h = {
        'User-Agent': _TIKWM_HEADERS['User-Agent'],
        'Referer': 'https://www.tiktok.com/',
        'Accept': '*/*',
    }
    h.update({str(k): str(v) for k, v in (headers or {}).items() if v})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=40) as response, open(path, 'wb') as out:
        total = int(response.headers.get('Content-Length') or 0)
        if total and total > legacy.MAX_FILESIZE:
            raise DownloadError('TikTok media exceeds server size limit')
        done = 0
        while True:
            chunk = response.read(512 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if done > legacy.MAX_FILESIZE:
                raise DownloadError('TikTok media exceeds server size limit')
            if job_id:
                progress = 15 + int(min(1, done / total) * 70) if total else min(80, 15 + done // (512 * 1024))
                legacy.job_update(job_id, state='working', progress=progress, stage=stage)
    if not path.is_file() or path.stat().st_size < 1024:
        raise DownloadError('TikTok media file empty')
    return path


def _tikdownloader_hd_link(fragment):
    anchors = []
    for match in re.finditer(r'<a\b([^>]*)>(.*?)</a>', str(fragment or ''), re.I | re.S):
        attrs, body = match.group(1), match.group(2)
        href_match = re.search(r'\bhref=["\']([^"\']+)', attrs, re.I)
        if not href_match:
            continue
        href = html.unescape(href_match.group(1)).strip()
        label = html.unescape(re.sub(r'<[^>]+>', ' ', body))
        label = re.sub(r'\s+', ' ', label).strip().lower()
        if href.startswith('//'):
            href = 'https:' + href
        elif href.startswith('/'):
            href = urllib.parse.urljoin('https://tikdownloader.io/', href)
        if href.startswith('http'):
            anchors.append((href, label))
    for href, label in anchors:
        if 'mp4' in label and 'hd' in label:
            return href
    return None


def _download_tikdownloader_hd(url, workdir, job_id=None):
    vid = _video_id(url) or 'tiktok'
    session = curl_requests.Session(impersonate='chrome')
    response = None
    try:
        if job_id:
            legacy.job_update(job_id, state='working', progress=11, stage='Mencari source original')
        resolved = session.post(
            _TIKDOWNLOADER_API,
            data={'q': str(url), 'lang': 'en'},
            headers=_TIKDOWNLOADER_HEADERS,
            timeout=35,
        )
        if resolved.status_code != 200:
            raise DownloadError(f'TikDownloader resolver HTTP {resolved.status_code}')
        payload = resolved.json()
        media_url = _tikdownloader_hd_link(payload.get('data'))
        if not media_url:
            raise DownloadError('TikDownloader original source link unavailable')

        legacy.clear_workdir(workdir)
        target = Path(workdir) / f'TikTok [{vid}]_hd.mp4'
        download_headers = {
            'User-Agent': _TIKDOWNLOADER_HEADERS['User-Agent'],
            'Referer': 'https://tikdownloader.io/en',
            'Accept': '*/*',
        }
        response = session.get(
            media_url,
            headers=download_headers,
            allow_redirects=True,
            stream=True,
            timeout=90,
        )
        if response.status_code != 200:
            raise DownloadError(f'TikDownloader media HTTP {response.status_code}')
        total = int(response.headers.get('Content-Length') or 0)
        if total and total > legacy.MAX_FILESIZE:
            raise DownloadError('TikTok original exceeds server size limit')
        done = 0
        with open(target, 'wb') as out:
            for chunk in response.iter_content(chunk_size=512 * 1024):
                if not chunk:
                    continue
                out.write(chunk)
                done += len(chunk)
                if done > legacy.MAX_FILESIZE:
                    raise DownloadError('TikTok original exceeds server size limit')
                if job_id:
                    progress = 15 + int(min(1, done / total) * 70) if total else min(84, 15 + done // (1024 * 1024))
                    legacy.job_update(job_id, state='working', progress=progress, stage='Mengambil source original')
        if target.stat().st_size < 100000:
            raise DownloadError('TikTok original file too small')
        probe = _probe(target)
        video = probe.get('video') or {}
        if not video.get('width') or not video.get('height') or not probe.get('has_audio'):
            raise DownloadError('TikTok original source is not a complete A/V file')
        print(
            f'tiktok original ok id={vid} final_host={urllib.parse.urlparse(response.url).hostname} '
            f'bytes={probe.get("size")} video={video}',
            flush=True,
        )
        return target
    finally:
        try:
            if response is not None:
                response.close()
        except Exception:
            pass
        try:
            session.close()
        except Exception:
            pass


def _download_native_hd(url, workdir, job_id=None):
    last = None
    for force_app in (True, False):
        try:
            info = _extract_native_info(url, force_app)
        except Exception as exc:
            last = f'extract:{type(exc).__name__}:{str(exc)[-160:]}'
            continue
        formats = _hd_candidates(info)
        if not formats:
            last = 'no playback formats'
            continue
        vid = info.get('id') or _video_id(url) or 'tiktok'
        for i, fmt in enumerate(formats[:4]):
            legacy.clear_workdir(workdir)
            fmt_id = str(fmt.get('format_id') or '')
            if not fmt_id:
                continue
            w, h = _dims(fmt)
            stage = f'Mengambil fallback {min(w, h) if w and h else "source"}p'
            if job_id:
                legacy.job_update(job_id, state='working', progress=12, stage=stage)
            try:
                opts = _tiktok_opts(url, force_app)
                opts.update({
                    'format': fmt_id,
                    'outtmpl': str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s'),
                    'windowsfilenames': True,
                })
                if job_id:
                    hooks, posts = legacy.make_progress_hooks(job_id, 'best')
                    opts['progress_hooks'] = hooks
                    opts['postprocessor_hooks'] = posts
                with YoutubeDL(opts) as ydl:
                    ydl.process_ie_result(copy.deepcopy(info), download=True)
                path = legacy.find_output(workdir)
                if path.suffix.lower() != '.mp3' and not path.stem.endswith('_hd'):
                    target = path.with_name(f'{path.stem}_hd{path.suffix}')
                    path.rename(target)
                    path = target
                probe = _probe(path)
                video = probe.get('video') or {}
                if not video.get('width') or not video.get('height') or not probe.get('has_audio'):
                    raise DownloadError('Native fallback is not a complete A/V file')
                legacy.cache_put(url, info, _TIKTOK_APP_STRATEGY if force_app else _TIKTOK_STRATEGY)
                print(
                    f'tiktok native fallback ok source={"app" if force_app else "web"} id={vid} '
                    f'format={fmt_id} actual={video} bytes={probe.get("size")} try={i + 1}',
                    flush=True,
                )
                return path
            except Exception as exc:
                last = f'{fmt_id}:{type(exc).__name__}:{str(exc)[-160:]}'
                print(f'tiktok native fallback failed id={vid} {last}', flush=True)
    raise DownloadError(f'TikTok native HD unavailable: {last}')


def _download_tikwm(url, quality, workdir, job_id=None):
    item = _tikwm_fetch(url)
    if not item:
        raise DownloadError('TikWM fallback unavailable')
    legacy.clear_workdir(workdir)
    title = _safe_filename(item.get('title'))
    vid = item.get('id') or _video_id(url) or 'tiktok'
    if quality == 'audio' and item.get('music_url'):
        source = Path(workdir) / f'{title} [{vid}].m4a'
        return _stream(item['music_url'], source, job_id, 'Mengambil audio')
    is_hd = quality == _TIKTOK_HD_SLOT
    media = (item.get('hd_url') or item.get('play_url')) if is_hd else (item.get('play_url') or item.get('hd_url'))
    if not media:
        raise DownloadError('TikWM video URL unavailable')
    target = Path(workdir) / f'{title} [{vid}]{"_hd" if is_hd else ""}.mp4'
    return _stream(media, target, job_id, 'Mengambil stream HD cadangan' if is_hd else 'Mengambil media')


def download_sync(url, quality, workdir, job_id=None):
    if not _is_tiktok(url):
        return _ORIGINAL_DOWNLOAD_SYNC(url, quality, workdir, job_id)

    requested = quality
    if job_id:
        legacy.job_update(job_id, state='working', progress=8, stage='Menyiapkan')
    legacy.clear_workdir(workdir)

    if requested == _TIKTOK_HD_SLOT:
        if job_id:
            legacy.job_update(job_id, state='working', progress=10, stage='Mencari source original')
        try:
            return _download_tikdownloader_hd(url, workdir, job_id)
        except Exception as exc:
            print(f'tiktok original resolver failed type={type(exc).__name__} detail={str(exc)[-350:]}', flush=True)
            legacy.clear_workdir(workdir)
        try:
            return _download_native_hd(url, workdir, job_id)
        except Exception as exc:
            print(f'tiktok native hd failed type={type(exc).__name__} detail={str(exc)[-350:]}', flush=True)
            legacy.clear_workdir(workdir)
        try:
            path = _download_tikwm(url, requested, workdir, job_id)
            print(f'tiktok hd tikwm fallback ok id={_video_id(url)} probe={_probe(path)}', flush=True)
            return path
        except Exception as exc:
            print(f'tiktok hd tikwm fallback failed type={type(exc).__name__} detail={str(exc)[-250:]}', flush=True)
            quality = 'best'
            legacy.clear_workdir(workdir)

    opts = _tiktok_opts(url, False)
    opts.update({
        'format': 'bestaudio/best' if quality == 'audio' else 'best',
        'outtmpl': str(Path(workdir) / '%(title).80B [%(id)s].%(ext)s'),
        'windowsfilenames': True,
    })
    if job_id:
        hooks, posts = legacy.make_progress_hooks(job_id, quality)
        opts['progress_hooks'] = hooks
        opts['postprocessor_hooks'] = posts
    if quality == 'audio':
        opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        path = legacy.find_output(workdir)
        if requested == _TIKTOK_HD_SLOT and path.suffix.lower() != '.mp3' and not path.stem.endswith('_hd'):
            target = path.with_name(f'{path.stem}_hd{path.suffix}')
            path.rename(target)
            path = target
        if info:
            fresh = copy.deepcopy(info)
            fresh['thumbnail'] = _tiktok_oembed_thumbnail(url) or _best_thumbnail(fresh)
            legacy.cache_put(url, fresh, _TIKTOK_STRATEGY)
        return path
    except Exception as exc:
        print(f'tiktok native download failed type={type(exc).__name__} detail={str(exc)[-450:]}', flush=True)

    if job_id:
        legacy.job_update(job_id, state='working', progress=12, stage='Mencoba jalur cadangan')
    return _download_tikwm(url, requested, workdir, job_id)


legacy.extract_info_sync = extract_info_sync
legacy.download_sync = download_sync
legacy.quality_choices = quality_choices
legacy.APP_VERSION = '1.18.0'
app.version = legacy.APP_VERSION
