import copy
import re
import urllib.request

from yt_dlp import YoutubeDL

try:
    import tiktok_hd_app as runtime
except Exception:
    import tiktok_engine_app as runtime
import tiktok_engine_app as tt
import mp3_app as mp3

app = runtime.app
legacy = runtime.legacy


def _num(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _fmt_bytes(fmt, duration=0):
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


def _selected_formats(info, spec):
    opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'format': spec, 'noplaylist': True}
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
    unique, seen = [], set()
    for item in items:
        marker = (str(item.get('format_id') or ''), str(item.get('url') or ''))
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(item)
    return unique


def _selected_size(info, spec):
    duration = _num(info.get('duration'))
    try:
        items = _selected_formats(info, spec)
    except Exception:
        items = []
    total, exact = 0, True
    for item in items:
        size, is_exact = _fmt_bytes(item, duration)
        total += size
        exact = exact and is_exact and size > 0
    return total, bool(total and exact)


def _remote_size(url, headers=None, timeout=12):
    if not url:
        return 0
    h = {
        'User-Agent': getattr(legacy, 'YOUTUBE_UA', 'Mozilla/5.0'),
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Range': 'bytes=0-0',
    }
    h.update({str(k): str(v) for k, v in (headers or {}).items() if v})
    response = None
    try:
        req = urllib.request.Request(str(url), headers=h)
        response = urllib.request.urlopen(req, timeout=timeout)
        cr = response.headers.get('Content-Range') or ''
        m = re.search(r'/(\d+)\s*$', cr)
        if m:
            return int(m.group(1))
        value = int(response.headers.get('Content-Length') or 0)
        return value if value > 1 else 0
    except Exception:
        return 0
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass


def _youtube_size(url, quality):
    cached = legacy.cache_get(url)
    info = (cached or {}).get('info') if cached else None
    if not isinstance(info, dict):
        info = legacy.extract_info_sync(url)
    q = str(quality or 'best').lower().strip()
    if q in getattr(legacy, 'EXACT_QUALITIES', {}):
        spec = legacy.exact_selector(info, q)
        if spec:
            size, exact = _selected_size(info, spec)
            if size:
                return size, exact
        try:
            size = int(legacy.estimated_quality_size(info, q) or 0)
        except Exception:
            size = 0
        return size, False
    return _selected_size(info, 'bv*+ba/bestvideo*+bestaudio/best')


def _mp3_size(url, quality):
    q = str(quality or 'mp3').lower().strip()
    if q in {'mp3', 'audio'}:
        try:
            state, _ = mp3._get_final_mp3(url, False)
            if state and state.get('state') == 'ready' and state.get('path'):
                p = mp3.Path(state['path'])
                if p.is_file() and p.stat().st_size > 0:
                    return p.stat().st_size, True
        except Exception:
            pass
    try:
        state, _ = mp3._get_source_state(url, False)
    except Exception:
        state = None
    if state and state.get('state') == 'ready' and state.get('source'):
        source_data = state['source']
        source = source_data.get('source') or {}
        duration = _num(source_data.get('duration') or source.get('duration'))
        if q == 'fast':
            remote = _remote_size(source.get('url'), mp3._source_headers(source), 10)
            if remote:
                return remote, True
            return _fmt_bytes(source, duration)
        if duration > 0:
            return int(duration * 192000 / 8 * 1.01), False
    cached = legacy.cache_get(url)
    info = (cached or {}).get('info') if cached else None
    duration = _num((info or {}).get('duration'))
    if q in {'mp3', 'audio'} and duration > 0:
        return int(duration * 192000 / 8 * 1.01), False
    return 0, False


def _tiktok_hd_size(url):
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
        if resolved.status_code == 200:
            payload = resolved.json()
            media_url = tt._tikdownloader_hd_link(payload.get('data'))
            if media_url:
                response = session.get(
                    media_url,
                    headers={
                        'User-Agent': tt._TIKDOWNLOADER_HEADERS['User-Agent'],
                        'Referer': 'https://tikdownloader.io/en',
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity',
                        'Range': 'bytes=0-0',
                    },
                    allow_redirects=True,
                    stream=True,
                    timeout=20,
                )
                cr = response.headers.get('Content-Range') or ''
                m = re.search(r'/(\d+)\s*$', cr)
                if m:
                    return int(m.group(1)), True
                value = int(response.headers.get('Content-Length') or 0)
                if value > 1:
                    return value, True
    except Exception:
        pass
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
    return 0, False


def _tiktok_size(url, quality):
    q = str(quality or 'best').lower().strip()
    hd_slot = str(getattr(tt, '_TIKTOK_HD_SLOT', '2160'))
    if q == hd_slot:
        size, exact = _tiktok_hd_size(url)
        if size:
            return size, exact
    cached = legacy.cache_get(url)
    info = (cached or {}).get('info') if cached else None
    if not isinstance(info, dict):
        info = tt.extract_info_sync(url)
    if q == hd_slot:
        try:
            candidates = tt._hd_candidates(info)
        except Exception:
            candidates = []
        for fmt in candidates[:3]:
            remote = _remote_size(fmt.get('url'), fmt.get('http_headers'), 10)
            if remote:
                return remote, True
            size, exact = _fmt_bytes(fmt, _num(info.get('duration')))
            if size:
                return size, exact
    item = info.get('_rvl_tikwm') if isinstance(info, dict) else None
    if isinstance(item, dict):
        media = item.get('play_url') or item.get('hd_url')
        remote = _remote_size(media, tt._TIKWM_HEADERS, 10)
        if remote:
            return remote, True
    return _selected_size(info, 'best')


@app.post('/api/file-size-v2')
async def file_size_v2(body: legacy.DownloadBody):
    url = legacy.validate_url(body.url)
    quality = str(body.quality or 'best').lower().strip()
    try:
        if legacy.is_youtube(url):
            if quality in {'mp3', 'audio', 'fast'}:
                size, exact = _mp3_size(url, quality)
            else:
                size, exact = _youtube_size(url, quality)
        else:
            size, exact = _tiktok_size(url, quality)
    except Exception as exc:
        print(f'file size v2 failed type={type(exc).__name__}', flush=True)
        size, exact = 0, False
    return {
        'bytes': int(size) if size else None,
        'estimated': bool(size and not exact),
        'exact': bool(size and exact),
        'ready': bool(size),
        'quality': quality,
    }
