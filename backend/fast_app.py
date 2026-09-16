import asyncio
import json
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request

import stream_app as base

app = base.app
legacy = base.legacy
legacy.APP_VERSION = '2.1.0'
app.version = legacy.APP_VERSION

_original_extract = legacy.extract_info_sync
_scan_lock = threading.Lock()
_scan_states = {}
_scan_slots = threading.BoundedSemaphore(max(1, int(os.getenv('FAST_SCAN_CONCURRENCY', '2'))))
_last_good_lock = threading.Lock()
_last_good_strategy = None
SCAN_TTL = int(os.getenv('FAST_SCAN_TTL', '900'))
FAST_SOCKET_TIMEOUT = float(os.getenv('FAST_SCAN_SOCKET_TIMEOUT', '6'))


def _purge_scans():
    cutoff = time.time() - SCAN_TTL
    with _scan_lock:
        for url, state in list(_scan_states.items()):
            if state.get('updated', state.get('created', 0)) < cutoff:
                _scan_states.pop(url, None)


def _get_state(url, create=False):
    _purge_scans()
    with _scan_lock:
        state = _scan_states.get(url)
        if state or not create:
            return state, False
        state = {
            'state': 'pending',
            'event': threading.Event(),
            'created': time.time(),
            'updated': time.time(),
            'error': None,
            'strategy': None,
        }
        _scan_states[url] = state
        return state, True


def _ordered_attempts():
    attempts = legacy.youtube_attempts()
    with _last_good_lock:
        preferred = _last_good_strategy
    if preferred:
        attempts.sort(key=lambda x: 0 if x.get('name') == preferred else 1)
    fast_names = {'mweb-cookie', 'default-cookie', 'safari-cookie', 'mweb-public'}
    fast = [x for x in attempts if x.get('name') in fast_names]
    return fast[:3] or attempts[:2]


def _fast_extract_uncached(url):
    cached = legacy.cache_get(url)
    if cached:
        return cached['info']

    started = time.monotonic()
    errors = []
    for strategy in _ordered_attempts():
        try:
            opts = legacy.base_opts(url, strategy.get('clients'), strategy.get('cookie', False))
            opts.update({
                'skip_download': True,
                'socket_timeout': FAST_SOCKET_TIMEOUT,
                'retries': 0,
                'fragment_retries': 0,
                'extractor_retries': 0,
                'cachedir': False,
            })
            with legacy.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            if info and info.get('entries'):
                info = next((x for x in info['entries'] if x), info)
            if info:
                legacy.cache_put(url, info, strategy)
                global _last_good_strategy
                with _last_good_lock:
                    _last_good_strategy = strategy.get('name')
                ms = int((time.monotonic() - started) * 1000)
                print(f'fast scan ok strategy={strategy.get("name")} ms={ms}', flush=True)
                return info
        except Exception as exc:
            errors.append(f'{strategy.get("name")}:{type(exc).__name__}')

    # Reliability fallback. This only runs after the short fast attempts fail.
    info = _original_extract(url)
    ms = int((time.monotonic() - started) * 1000)
    print(f'fast scan fallback ms={ms} prior={",".join(errors)}', flush=True)
    return info


def _scan_worker(url, state):
    with _scan_slots:
        try:
            info = _fast_extract_uncached(url)
            cached = legacy.cache_get(url)
            strategy = cached.get('strategy', {}).get('name') if cached else None
            with _scan_lock:
                state['state'] = 'ready'
                state['strategy'] = strategy
                state['updated'] = time.time()
        except Exception as exc:
            with _scan_lock:
                state['state'] = 'error'
                state['error'] = exc
                state['updated'] = time.time()
        finally:
            state['event'].set()


def _ensure_scan(url):
    cached = legacy.cache_get(url)
    if cached:
        return None
    state, created = _get_state(url, create=True)
    if created:
        threading.Thread(target=_scan_worker, args=(url, state), daemon=True).start()
    return state


def fast_extract_info_sync(url):
    if not legacy.is_youtube(url):
        return _original_extract(url)
    cached = legacy.cache_get(url)
    if cached:
        return cached['info']
    state = _ensure_scan(url)
    if state:
        state['event'].wait(30)
    cached = legacy.cache_get(url)
    if cached:
        return cached['info']
    if state and state.get('error'):
        raise state['error']
    return _original_extract(url)


# Any legacy path that still needs a full YouTube extraction now shares the same
# fast/in-flight scan instead of starting another extractor chain.
legacy.extract_info_sync = fast_extract_info_sync


def _youtube_id(url):
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or '').lower()
    if host == 'youtu.be':
        return parsed.path.strip('/').split('/')[0]
    qs = urllib.parse.parse_qs(parsed.query)
    if qs.get('v'):
        return qs['v'][0]
    parts = [x for x in parsed.path.split('/') if x]
    if len(parts) >= 2 and parts[0] in {'shorts', 'embed', 'live'}:
        return parts[1]
    return None


def _oembed(url):
    video_id = _youtube_id(url)
    if not video_id:
        return {'title': 'YouTube video', 'uploader': None, 'thumbnail': None}
    watch = f'https://www.youtube.com/watch?v={video_id}'
    endpoint = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode({'url': watch, 'format': 'json'})
    try:
        req = urllib.request.Request(endpoint, headers={'User-Agent': legacy.YOUTUBE_UA})
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8', 'replace'))
        return {
            'title': data.get('title') or 'YouTube video',
            'uploader': data.get('author_name'),
            'thumbnail': data.get('thumbnail_url') or f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
        }
    except Exception:
        return {
            'title': 'YouTube video',
            'uploader': None,
            'thumbnail': f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
        }


def _payload_from_info(info):
    return {
        'platform': 'youtube',
        'id': info.get('id'),
        'title': info.get('title') or 'YouTube video',
        'thumbnail': info.get('thumbnail'),
        'duration': info.get('duration'),
        'uploader': info.get('uploader') or info.get('channel'),
        'max_height': legacy.max_height(info),
        'choices': legacy.quality_choices(info, 'youtube'),
        'cached': True,
        'scan_ready': True,
    }


@app.post('/api/quick-info')
async def quick_info(body: legacy.URLBody):
    url = legacy.validate_url(body.url)
    if not legacy.is_youtube(url):
        return await legacy.media_info(body)

    cached = legacy.cache_get(url)
    if cached:
        return _payload_from_info(cached['info'])

    _ensure_scan(url)
    meta = await asyncio.to_thread(_oembed, url)
    return {
        'platform': 'youtube',
        'id': _youtube_id(url),
        'title': meta.get('title') or 'YouTube video',
        'thumbnail': meta.get('thumbnail'),
        'duration': None,
        'uploader': meta.get('uploader'),
        'max_height': 0,
        'choices': [
            {'id': 'best', 'label': 'Best quality'},
            {'id': 'audio', 'label': 'MP3 192 kbps'},
        ],
        'cached': False,
        'scan_ready': False,
    }


@app.get('/api/quick-info/status')
async def quick_info_status(url: str):
    url = legacy.validate_url(url)
    if not legacy.is_youtube(url):
        return {'ready': True}
    cached = legacy.cache_get(url)
    if cached:
        payload = _payload_from_info(cached['info'])
        payload['ready'] = True
        return payload
    state = _ensure_scan(url)
    if state and state.get('state') == 'error':
        return {'ready': False, 'failed': True}
    return {'ready': False, 'failed': False}


def _proxy_iter_fast(response):
    try:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            response.close()
        finally:
            base._stream_slots.release()


def _ffmpeg_process_fast(plan):
    cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error']
    if plan['mode'] == 'ffmpeg-audio':
        cmd += base._ffmpeg_input(plan['source'])
        cmd += [
            '-vn', '-map', '0:a:0?',
            '-c:a', 'libmp3lame', '-b:a', '192k',
            '-compression_level', '0',
            '-f', 'mp3', 'pipe:1',
        ]
    else:
        video = plan['video']
        audio = plan.get('audio')
        cmd += base._ffmpeg_input(video)
        if audio:
            cmd += base._ffmpeg_input(audio)
            cmd += ['-map', '0:v:0', '-map', '1:a:0?']
        else:
            cmd += ['-map', '0:v:0', '-map', '0:a:0?']
        cmd += [
            '-c', 'copy',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-flush_packets', '1',
            '-f', 'mp4',
            'pipe:1',
        ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=1024 * 1024)


def _process_iter_fast(proc):
    try:
        if not proc.stdout:
            return
        while True:
            chunk = proc.stdout.read(1024 * 512)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.stdout:
            proc.stdout.close()
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        base._stream_slots.release()


# The already-registered stream route resolves these names from stream_app at
# request time, so replacing them improves throughput without duplicating routes.
base._proxy_iter = _proxy_iter_fast
base._ffmpeg_process = _ffmpeg_process_fast
base._process_iter = _process_iter_fast
