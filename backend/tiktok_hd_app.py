import html
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

from yt_dlp import YoutubeDL

import tiktok_engine_app as base

app = base.app
legacy = base.legacy

_BASE_DOWNLOAD_SYNC = legacy.download_sync
_TIKTOK_HD_SLOT = getattr(base, '_TIKTOK_HD_SLOT', '2160')
_UA = os.getenv(
    'TIKTOK_USER_AGENT',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
)
_VIDEO_HEADERS = {
    'User-Agent': _UA,
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.8',
    'Accept-Encoding': 'identity',
    'Referer': 'https://www.tiktok.com/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
}
_PAGE_HEADERS = {
    'User-Agent': _UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.8',
    'Referer': 'https://www.tiktok.com/',
}

try:
    from curl_cffi import requests as curl_requests
except Exception:
    curl_requests = None


def _num(value, default=0.0):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return default


def _int(value, default=0):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return default


def _is_tiktok(url):
    try:
        return base._is_tiktok(url)
    except Exception:
        return 'tiktok.com' in str(url).lower()


def _video_id(url):
    try:
        return base._video_id(url)
    except Exception:
        match = re.search(r'/(?:video|photo)/(\d+)', str(url))
        return match.group(1) if match else None


def _request_text(url, timeout=18):
    if curl_requests is not None:
        try:
            response = curl_requests.get(
                url,
                headers=_PAGE_HEADERS,
                timeout=timeout,
                impersonate='chrome',
                allow_redirects=True,
            )
            if 200 <= response.status_code < 300 and response.text:
                return response.text
        except Exception as exc:
            print(f'tiktok source curl page failed type={type(exc).__name__} detail={str(exc)[-240:]}', flush=True)

    request = urllib.request.Request(url, headers=_PAGE_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode('utf-8', 'replace')


def _embedded_json(page):
    for script_id in ('__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE', '__FRONTITY_CONNECT_STATE__'):
        match = re.search(
            rf'<script[^>]+id=["\']{re.escape(script_id)}["\'][^>]*>(.*?)</script>',
            page,
            re.I | re.S,
        )
        if not match:
            continue
        raw = html.unescape(match.group(1)).strip()
        if not raw:
            continue
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            continue
    return None


def _walk_for_item(node, video_id):
    if isinstance(node, dict):
        node_id = str(node.get('id') or node.get('aweme_id') or node.get('awemeId') or node.get('itemId') or '')
        video = node.get('video')
        if isinstance(video, dict) and (not video_id or node_id == str(video_id)):
            if video.get('bitrateInfo') or video.get('bit_rate') or video.get('playAddr') or video.get('play_addr'):
                return node
        for value in node.values():
            found = _walk_for_item(value, video_id)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _walk_for_item(value, video_id)
            if found:
                return found
    return None


def _find_item(data, video_id):
    if not isinstance(data, dict):
        return None
    scope = data.get('__DEFAULT_SCOPE__')
    if isinstance(scope, dict):
        detail = scope.get('webapp.video-detail')
        if isinstance(detail, dict):
            item = (((detail.get('itemInfo') or {}).get('itemStruct')) if isinstance(detail.get('itemInfo'), dict) else None)
            if isinstance(item, dict):
                return item
    return _walk_for_item(data, video_id)


def _addr_urls(addr):
    if not isinstance(addr, dict):
        return []
    values = addr.get('UrlList') or addr.get('url_list') or []
    if isinstance(values, str):
        values = [values]
    for key in ('src', 'url', 'download'):
        value = addr.get(key)
        if isinstance(value, str):
            values = [*values, value]
    out = []
    for value in values:
        if isinstance(value, str) and value.startswith(('http://', 'https://')) and value not in out:
            out.append(value)
    return out


def _quality_hint(*values):
    for value in values:
        text = str(value or '').lower()
        matches = re.findall(r'(?<!\d)(2160|1440|1080|960|720|576|540|480|360)p?(?!\d)', text)
        if matches:
            return max(int(x) for x in matches)
    return 0


def _candidate(addr, *, gear='', codec='', bitrate=0, fps=0, fallback_width=0, fallback_height=0, source_kind=''):
    if not isinstance(addr, dict):
        return []
    width = _int(addr.get('Width') or addr.get('width') or fallback_width)
    height = _int(addr.get('Height') or addr.get('height') or fallback_height)
    data_size = _int(addr.get('DataSize') or addr.get('data_size') or addr.get('size'))
    url_key = addr.get('UrlKey') or addr.get('url_key') or ''
    hinted = _quality_hint(gear, url_key)
    short_edge = min(x for x in (width, height) if x > 0) if width > 0 and height > 0 else hinted
    if hinted > short_edge:
        short_edge = hinted
    gear_l = str(gear or '').lower()
    kind_l = str(source_kind or '').lower()
    source_bonus = 3 if any(x in gear_l for x in ('original', 'source', 'origin', 'raw')) else 0
    source_bonus = max(source_bonus, 2 if kind_l in ('play_addr_h264', 'play_addr_bytevc1') else 0)
    codec_l = str(codec or '').lower()
    codec_bonus = 2 if any(x in codec_l for x in ('h265', 'hevc', 'bytevc1')) else 1 if 'h264' in codec_l else 0
    bitrate = _int(bitrate or addr.get('Bitrate') or addr.get('bit_rate') or 0)
    fps = _num(fps or addr.get('FPS') or addr.get('fps') or 0)
    result = []
    for media_url in _addr_urls(addr):
        result.append({
            'url': media_url,
            'gear': str(gear or source_kind or 'source'),
            'codec': str(codec or ''),
            'width': width,
            'height': height,
            'short_edge': short_edge,
            'bitrate': bitrate,
            'fps': fps,
            'data_size': data_size,
            'source_bonus': source_bonus,
            'codec_bonus': codec_bonus,
            'source_kind': source_kind,
        })
    return result


def _item_candidates(item):
    video = item.get('video') if isinstance(item, dict) else None
    if not isinstance(video, dict):
        return []
    width = _int(video.get('width') or video.get('Width'))
    height = _int(video.get('height') or video.get('Height'))
    root_fps = _num(video.get('fps') or video.get('FPS'))
    out = []

    for entry in video.get('bitrateInfo') or []:
        if not isinstance(entry, dict):
            continue
        addr = entry.get('PlayAddr') or entry.get('play_addr')
        out.extend(_candidate(
            addr,
            gear=entry.get('GearName') or entry.get('gear_name') or '',
            codec=entry.get('CodecType') or entry.get('codec_type') or '',
            bitrate=entry.get('Bitrate') or entry.get('bit_rate') or 0,
            fps=entry.get('FPS') or entry.get('fps') or root_fps,
            fallback_width=width,
            fallback_height=height,
            source_kind='bitrateInfo',
        ))

    for entry in video.get('bit_rate') or []:
        if not isinstance(entry, dict):
            continue
        addr = entry.get('play_addr') or entry.get('PlayAddr')
        out.extend(_candidate(
            addr,
            gear=entry.get('gear_name') or entry.get('GearName') or '',
            codec='h265' if entry.get('is_bytevc1') else (entry.get('codec_type') or ''),
            bitrate=entry.get('bit_rate') or entry.get('Bitrate') or 0,
            fps=entry.get('fps') or entry.get('FPS') or root_fps,
            fallback_width=width,
            fallback_height=height,
            source_kind='bit_rate',
        ))

    direct_fields = (
        ('playAddr', 'playAddr', ''),
        ('play_addr', 'play_addr', 'h265' if video.get('is_bytevc1') or video.get('is_h265') else ''),
        ('play_addr_h264', 'play_addr_h264', 'h264'),
        ('play_addr_bytevc1', 'play_addr_bytevc1', 'h265'),
    )
    for key, kind, codec in direct_fields:
        addr = video.get(key)
        out.extend(_candidate(
            addr,
            gear=kind,
            codec=codec,
            fps=root_fps,
            fallback_width=width,
            fallback_height=height,
            source_kind=kind,
        ))

    unique = {}
    for item in out:
        old = unique.get(item['url'])
        if old is None or _candidate_score(item) > _candidate_score(old):
            unique[item['url']] = item
    return list(unique.values())


def _candidate_score(item):
    return (
        _int(item.get('short_edge')),
        _int(item.get('source_bonus')),
        _num(item.get('fps')),
        _int(item.get('bitrate')),
        _int(item.get('data_size')),
        _int(item.get('codec_bonus')),
    )


def _best_embed_candidate(url):
    vid = _video_id(url)
    if not vid:
        return None
    errors = []
    for page_url in (
        f'https://www.tiktok.com/embed/v2/{vid}',
        str(url).split('#', 1)[0].split('?', 1)[0],
    ):
        try:
            page = _request_text(page_url)
            data = _embedded_json(page)
            item = _find_item(data, vid)
            candidates = _item_candidates(item or {})
            if candidates:
                best = max(candidates, key=_candidate_score)
                print(
                    'tiktok source candidate '
                    f'id={vid} gear={best.get("gear")} '
                    f'res={best.get("width")}x{best.get("height")} '
                    f'fps={best.get("fps")} bitrate={best.get("bitrate")} '
                    f'bytes={best.get("data_size")}',
                    flush=True,
                )
                return best
            errors.append(f'{page_url}:no-candidates')
        except Exception as exc:
            errors.append(f'{page_url}:{type(exc).__name__}:{str(exc)[-140:]}')
    print(f'tiktok embed source failed id={vid} detail={" | ".join(errors)[-600:]}', flush=True)
    return None


def _native_candidate_score(fmt):
    if not isinstance(fmt, dict) or not fmt.get('url'):
        return (-1,)
    note = f"{fmt.get('format_note') or ''} {fmt.get('format_id') or ''}".lower()
    if 'watermark' in note or 'unplayable' in note:
        return (-1,)
    width = _int(fmt.get('width'))
    height = _int(fmt.get('height'))
    hinted = _quality_hint(fmt.get('format_id'), fmt.get('format'), fmt.get('format_note'))
    short_edge = min(x for x in (width, height) if x > 0) if width > 0 and height > 0 else hinted
    short_edge = max(short_edge, hinted)
    source_bonus = 3 if any(x in note for x in ('original', 'source', 'origin', 'raw')) else 0
    fps = _num(fmt.get('fps'))
    bitrate = _num(fmt.get('tbr') or fmt.get('vbr')) * 1000
    size = _int(fmt.get('filesize') or fmt.get('filesize_approx'))
    codec = str(fmt.get('vcodec') or '').lower()
    codec_bonus = 2 if any(x in codec for x in ('h265', 'hevc')) else 1 if 'h264' in codec else 0
    has_audio = 1 if fmt.get('acodec') not in (None, 'none') else 0
    return (short_edge, source_bonus, fps, bitrate, size, has_audio, codec_bonus)


def _best_native_candidate(url):
    opts = legacy.base_opts(url, None, False)
    opts.update({
        'skip_download': True,
        'noplaylist': True,
        'retries': 1,
        'fragment_retries': 1,
        'extractor_retries': 1,
        'socket_timeout': 15,
        'http_headers': dict(_PAGE_HEADERS),
    })
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget
        opts['impersonate'] = ImpersonateTarget.from_str('chrome')
    except Exception:
        pass
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info and info.get('entries'):
            info = next((entry for entry in info['entries'] if entry), info)
        formats = [fmt for fmt in (info or {}).get('formats') or [] if _native_candidate_score(fmt)[0] >= 0]
        if not formats:
            return None
        best = max(formats, key=_native_candidate_score)
        score = _native_candidate_score(best)
        return {
            'url': best.get('url'),
            'gear': best.get('format_id') or 'yt-dlp',
            'codec': best.get('vcodec') or '',
            'width': _int(best.get('width')),
            'height': _int(best.get('height')),
            'short_edge': _int(score[0]),
            'source_bonus': _int(score[1]),
            'fps': _num(best.get('fps')),
            'bitrate': int(_num(best.get('tbr') or best.get('vbr')) * 1000),
            'data_size': _int(best.get('filesize') or best.get('filesize_approx')),
            'codec_bonus': _int(score[-1]),
            'source_kind': 'yt-dlp',
        }
    except Exception as exc:
        print(f'tiktok native source probe failed type={type(exc).__name__} detail={str(exc)[-300:]}', flush=True)
        return None


def _probe_file(path):
    try:
        raw = subprocess.check_output([
            'ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,avg_frame_rate,bit_rate',
            '-show_entries', 'format=bit_rate,duration', '-of', 'json', str(path),
        ], text=True, timeout=15)
        data = json.loads(raw)
        stream = (data.get('streams') or [{}])[0]
        fmt = data.get('format') or {}
        return {
            'width': _int(stream.get('width')),
            'height': _int(stream.get('height')),
            'fps': stream.get('avg_frame_rate') or '',
            'video_bitrate': _int(stream.get('bit_rate')),
            'total_bitrate': _int(fmt.get('bit_rate')),
            'duration': _num(fmt.get('duration')),
        }
    except Exception:
        return {}


def _download_direct(candidate, workdir, video_id, job_id=None):
    legacy.clear_workdir(workdir)
    target = Path(workdir) / f'TikTok [{video_id or "video"}]_hd.mp4'
    media_url = candidate['url']
    if job_id:
        legacy.job_update(job_id, state='working', progress=13, stage='Mengambil source HD TikTok')

    total = 0
    if curl_requests is not None:
        try:
            with curl_requests.get(
                media_url,
                headers=_VIDEO_HEADERS,
                timeout=45,
                impersonate='chrome',
                allow_redirects=True,
                stream=True,
            ) as response:
                response.raise_for_status()
                expected = _int(response.headers.get('content-length'))
                with open(target, 'wb') as output:
                    for chunk in response.iter_content(chunk_size=512 * 1024):
                        if not chunk:
                            continue
                        output.write(chunk)
                        total += len(chunk)
                        if job_id:
                            progress = 15 + int(min(1.0, total / expected) * 70) if expected else min(84, 15 + total // (1024 * 1024))
                            legacy.job_update(job_id, state='working', progress=progress, stage='Mengambil source HD TikTok')
        except Exception as exc:
            print(f'tiktok source curl download failed type={type(exc).__name__} detail={str(exc)[-260:]}', flush=True)
            target.unlink(missing_ok=True)
            total = 0

    if not target.is_file():
        request = urllib.request.Request(media_url, headers=_VIDEO_HEADERS)
        with urllib.request.urlopen(request, timeout=45) as response, open(target, 'wb') as output:
            expected = _int(response.headers.get('Content-Length'))
            while True:
                chunk = response.read(512 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                total += len(chunk)
                if job_id:
                    progress = 15 + int(min(1.0, total / expected) * 70) if expected else min(84, 15 + total // (1024 * 1024))
                    legacy.job_update(job_id, state='working', progress=progress, stage='Mengambil source HD TikTok')

    if not target.is_file() or target.stat().st_size < 1024:
        raise RuntimeError('TikTok source HD kosong')
    if job_id:
        legacy.job_update(job_id, state='working', progress=92, stage='Verifikasi source HD')
    probe = _probe_file(target)
    print(
        'tiktok source downloaded '
        f'id={video_id} bytes={target.stat().st_size} '
        f'res={probe.get("width")}x{probe.get("height")} '
        f'fps={probe.get("fps")} vbitrate={probe.get("video_bitrate")} '
        f'tbitrate={probe.get("total_bitrate")}',
        flush=True,
    )
    return target


def download_sync(url, quality, workdir, job_id=None):
    if not _is_tiktok(url) or quality != _TIKTOK_HD_SLOT:
        return _BASE_DOWNLOAD_SYNC(url, quality, workdir, job_id)

    vid = _video_id(url)
    errors = []
    for finder in (_best_embed_candidate, _best_native_candidate):
        try:
            candidate = finder(url)
            if not candidate or not candidate.get('url'):
                continue
            return _download_direct(candidate, workdir, vid, job_id)
        except Exception as exc:
            errors.append(f'{finder.__name__}:{type(exc).__name__}:{str(exc)[-180:]}')
            legacy.clear_workdir(workdir)

    print(f'tiktok source HD fallback id={vid} detail={" | ".join(errors)[-600:]}', flush=True)
    return _BASE_DOWNLOAD_SYNC(url, quality, workdir, job_id)


legacy.download_sync = download_sync
legacy.APP_VERSION = '1.17.0'
app.version = legacy.APP_VERSION
