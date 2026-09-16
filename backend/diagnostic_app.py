import urllib.parse

import audio_chunked_app as base
from fastapi import HTTPException
from fastapi.responses import RedirectResponse

app = base.app
legacy = base.legacy
legacy.APP_VERSION = '1.13.1'
app.version = legacy.APP_VERSION


@app.get('/api/audio/debug/{token}')
async def audio_debug(token: str):
    base.base._purge_audio_tokens()
    with base.base._audio_token_lock:
        item = base.base._audio_tokens.get(token)
    if not item:
        raise HTTPException(404, 'Token tidak ditemukan atau kedaluwarsa.')
    source = item['source']
    parsed = urllib.parse.urlparse(source.get('url') or '')
    query = urllib.parse.parse_qs(parsed.query)
    return {
        'source_host': parsed.hostname,
        'source_size': base._source_size(source),
        'source_ext': base.base._audio_ext(source),
        'has_ip_param': 'ip' in query,
        'has_expire_param': 'expire' in query,
        'header_keys': sorted(str(k).lower() for k in (source.get('http_headers') or {}).keys()),
    }


@app.get('/api/audio/direct/{token}')
async def audio_direct(token: str):
    base.base._purge_audio_tokens()
    with base.base._audio_token_lock:
        item = base.base._audio_tokens.get(token)
    if not item:
        raise HTTPException(404, 'Token tidak ditemukan atau kedaluwarsa.')
    source_url = item['source'].get('url')
    if not source_url:
        raise HTTPException(410, 'URL sumber tidak tersedia.')
    return RedirectResponse(source_url, status_code=307, headers={'Cache-Control': 'no-store'})
