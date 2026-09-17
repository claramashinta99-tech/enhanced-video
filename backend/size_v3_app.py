import copy
import re
import urllib.request

from yt_dlp import YoutubeDL

import size_app as base
import tiktok_engine_app as tt

app = base.app
legacy = base.legacy


def _num(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _format_size(fmt, duration=0):
    if not isinstance(fmt, dict):
        return 0, False
    for key in ('filesize', 'filesize_approx'):
        try:
            value = int(fmt.get(key) or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value, key == 'filesize'
    rate = _num(fmt.get('tbr') or fmt.get('vbr') or fmt.get('abr'))
    if rate > 0 and duration > 0:
        return int(duration * rate * 1000 / 8), False
    return 0, False


def _remote_size(url, headers=None, timeout=12):
    if not url:
        return 0
    h = {
        'User-Agent': getattr(legacy, 'YOUTUBE_UA', 'Mozilla/5.0'),
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Range': 'bytes=0-0',
    }
    h.update({str(k): str(v) for k, v in (headers or {}).items() if v is not None})
    response = None
    try:
        req = urllib.request.Request(str(url), headers=h)
        response = urllib.request.urlopen(req, timeout=timeout)
        content_range = response.headers.get('Content-Range') or ''
        match = re.search(r'/(\d+)\s*$', content_range)
        if match:
            return int(match.group(1))
        length = int(response.headers.get('Content-Length') or 0)
        return length if length > 1 else 0
    except Exception:
        return 0
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass


def _selected_formats(info, spec):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'format': spec,
        'noplaylist': True,
    }
    with YoutubeDL(opts) as ydl:
        selected = ydl.process_ie_result(copy.deepcopy(info), download=False)
    items = []
    if isinstance(selected, dict):
        for key in ('requested_downloads', 'requested_formats'):
            values = selected.get(key) or []
            if isinstance(values, list):
                items.extend(x for x in values if isinstance(x, dict))
        if not items and selected.get('url'):
            items.append(selected)
    unique = []
    seen = set()
    for item in items:
        marker = (str(item.get('format_id') or ''), str(item.get('url') or ''))
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(item)
    return unique


def _selected_size(info, spec, probe_remote=True):
    duration = _num((info or {}).get('duration'))
    try:
        items = _selected_formats(info, spec)
    except Exception:
        items = []
    total = 0
    exact = True
    for item in items:
        size = 0
        is_exact = False
        if probe_remote and item.get('url'):
            size = _remote_size(item.get('url'), item.get('http_headers'), 10)
            is_exact = bool(size)
        if not size:
            size, is_exact = _format_size(item, duration)
        if size:
            total += size
            exact = exact and is_exact
        else:
            exact = False
    return total, bool(total and exact)


def _youtube_video_size(url, quality):
    cached = legacy.cache_get(url)
    if not cached:
        legacy.extract_info_sync(url)
        cached = legacy.cache_get(url)
    info = (cached or {}).get('info') if cached else None
    if not isinstance(info, dict):
        info = legacy.extract_info_sync(url)
        cached = legacy.cache_get(url)
    strategy = (cached or {}).get('strategy') or {}
    q = str(quality or 'best').lower().strip()

    if q in getattr(legacy, 'EXACT_QUALITIES', {}):
        spec = legacy.exact_selector(info, q)
        if not spec:
            spec = legacy.selector(q)[0]
    else:
        spec = strategy.get('selector') if q == 'best' else None
        if not spec:
            spec = legacy.selector(q)[0]

    size, exact = _selected_size(info, spec, True)
    if size:
        return size, exact

    if q in getattr(legacy, 'EXACT_QUALITIES', {}):
        try:
            size = int(legacy.estimated_quality_size(info, q) or 0)
        except Exception:
            size = 0
        return size, False
    return 0, False


def _tiktok_resolved_hd_size(url):
    session = None
    response = None
    try:
        session = tt.curl_requests.Session(impersonate='chrome')
        resolved = session.post(
            tt._TIKDOWNLOADER_API,
            data={'q': str(url), 'lang': 'en'},
            headers=tt._TIKDOWNLOADER_HEADERS,
            timeout=20,
        )
        if resolved.status_code != 200:
            return 0, False
        media_url = tt._tikdownloader_hd_link((resolved.json() or {}).get('data'))
        if not media_url:
            return 0, False
        headers = {
            'User-Agent': tt._TIKDOWNLOADER_HEADERS['User-Agent'],
            'Referer': 'https://tikdownloader.io/en',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Range': 'bytes=0-0',
        }
        response = session.get(
            media_url,
            headers=headers,
            allow_redirects=True,
            stream=True,
            timeout=20,
        )
        content_range = response.headers.get('Content-Range') or ''
        match = re.search(r'/(\d+)\s*$', content_range)
        if match:
            return int(match.group(1)), True
        length = int(response.headers.get('Content-Length') or 0)
        return (length, True) if length > 1 else (0, False)
    except Exception:
        return 0, False
    finally:
        try:
            if response is not None:
                response.close()
        except Exception:
            pass
        try:
            if session is not None:
                session.close()
        except Exception:
            pass


def _tiktok_normal_size(url):
    try:
        info = tt._extract_native_info(url, False)
        size, exact = _selected_size(info, 'best', True)
        if size:
            return size, exact
    except Exception:
        pass
    try:
        item = tt._tikwm_fetch(url)
    except Exception:
        item = None
    if isinstance(item, dict):
        media = item.get('play_url') or item.get('hd_url')
        size = _remote_size(media, tt._TIKWM_HEADERS, 10)
        if size:
            return size, True
    return 0, False


def _tiktok_hd_size(url):
    size, exact = _tiktok_resolved_hd_size(url)
    if size:
        return size, exact

    for force_app in (True, False):
        try:
            info = tt._extract_native_info(url, force_app)
            candidates = tt._hd_candidates(info)
        except Exception:
            candidates = []
        for fmt in candidates[:4]:
            size = _remote_size(fmt.get('url'), fmt.get('http_headers'), 10)
            if size:
                return size, True
            size, is_exact = _format_size(fmt, _num((info or {}).get('duration')))
            if size:
                return size, is_exact

    try:
        item = tt._tikwm_fetch(url)
    except Exception:
        item = None
    if isinstance(item, dict):
        media = item.get('hd_url') or item.get('play_url')
        size = _remote_size(media, tt._TIKWM_HEADERS, 10)
        if size:
            return size, True
    return 0, False


@app.post('/api/file-size-v3')
async def file_size_v3(body: legacy.DownloadBody):
    url = legacy.validate_url(body.url)
    quality = str(body.quality or 'best').lower().strip()
    try:
        if legacy.is_youtube(url):
            size, exact = _youtube_video_size(url, quality)
        else:
            hd_slot = str(getattr(tt, '_TIKTOK_HD_SLOT', '2160'))
            if quality == hd_slot:
                size, exact = _tiktok_hd_size(url)
            else:
                size, exact = _tiktok_normal_size(url)
    except Exception as exc:
        print(f'file size v3 failed quality={quality} type={type(exc).__name__}', flush=True)
        size, exact = 0, False
    return {
        'bytes': int(size) if size else None,
        'estimated': bool(size and not exact),
        'exact': bool(size and exact),
        'ready': bool(size),
        'quality': quality,
    }
