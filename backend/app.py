import asyncio, copy, os, shutil, tempfile, threading, time, urllib.request
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

APP_VERSION='1.8.1'
app=FastAPI(title='RVL Media API',version=APP_VERSION)
origins=[x.strip() for x in os.getenv('WEB_ORIGINS','https://reyval.web.id,https://www.reyval.web.id,http://localhost:5500,http://127.0.0.1:5500').split(',') if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=False,allow_methods=['GET','POST','OPTIONS'],allow_headers=['Content-Type'])
ALLOWED_HOSTS={'youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','tiktok.com','www.tiktok.com','m.tiktok.com','vm.tiktok.com','vt.tiktok.com'}
MAX_FILESIZE=500*1024*1024
DOWNLOAD_SLOTS=asyncio.Semaphore(int(os.getenv('MAX_CONCURRENT_DOWNLOADS','2')))
YOUTUBE_COOKIE_FILE=Path(os.getenv('YOUTUBE_COOKIE_FILE','/etc/secrets/youtube-cookies.txt'))
YOUTUBE_COOKIE_WORK_FILE=Path('/tmp/rvl-youtube-cookies.txt')
POT_URL=os.getenv('YOUTUBE_POT_URL','http://127.0.0.1:4416')
YOUTUBE_UA=os.getenv('YOUTUBE_USER_AGENT','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36')
CACHE_TTL=int(os.getenv('MEDIA_CACHE_TTL','900')); CACHE_MAX=int(os.getenv('MEDIA_CACHE_MAX','40'))
_cookie_lock=threading.Lock(); _cookie_initialized=False; _cache_lock=threading.Lock(); _media_cache={}

class URLBody(BaseModel): url:HttpUrl
class DownloadBody(BaseModel): url:HttpUrl; quality:str='best'
class QuietLogger:
    def debug(self,msg): pass
    def warning(self,msg): pass
    def error(self,msg): pass

def validate_url(value):
    url=str(value); p=urlparse(url); host=(p.hostname or '').lower().rstrip('.')
    if p.scheme not in {'http','https'} or host not in ALLOWED_HOSTS: raise HTTPException(400,'Link harus dari YouTube atau TikTok.')
    return url

def is_youtube(url): return 'youtu' in (urlparse(url).hostname or '').lower()
def package_version(name):
    try:return pkg_version(name)
    except PackageNotFoundError:return None

def cookie_status(path):
    out={'exists':False,'valid':False,'count':0,'size':0}
    try:
        if not path.is_file():return out
        out['exists']=True; out['size']=path.stat().st_size
        if out['size']<=64:return out
        jar=MozillaCookieJar(str(path)); jar.load(ignore_discard=True,ignore_expires=True)
        out['count']=sum(1 for _ in jar); out['valid']=out['count']>0
    except (OSError,LoadError,ValueError):pass
    return out

def youtube_cookie_status():return cookie_status(YOUTUBE_COOKIE_FILE)
def youtube_cookie_ready():return youtube_cookie_status()['valid']
def writable_cookie():
    global _cookie_initialized
    if not youtube_cookie_ready():return None
    with _cookie_lock:
        if not _cookie_initialized:
            try:shutil.copyfile(YOUTUBE_COOKIE_FILE,YOUTUBE_COOKIE_WORK_FILE);os.chmod(YOUTUBE_COOKIE_WORK_FILE,0o600);_cookie_initialized=True
            except OSError:return None
    return YOUTUBE_COOKIE_WORK_FILE if YOUTUBE_COOKIE_WORK_FILE.is_file() else None

def pot_provider_status():
    try:
        with urllib.request.urlopen(f'{POT_URL}/ping',timeout=2) as r:return 200<=r.status<300
    except Exception:return False

def cache_get(url):
    now=time.monotonic()
    with _cache_lock:
        x=_media_cache.get(url)
        if not x:return None
        if now-x['ts']>CACHE_TTL:_media_cache.pop(url,None);return None
        return x

def cache_put(url,info,strategy):
    with _cache_lock:
        if len(_media_cache)>=CACHE_MAX:_media_cache.pop(min(_media_cache,key=lambda k:_media_cache[k]['ts']),None)
        _media_cache[url]={'ts':time.monotonic(),'info':info,'strategy':strategy}

def base_opts(url=None,clients=None,use_cookie=True):
    opts={'quiet':True,'no_warnings':True,'noplaylist':True,'socket_timeout':25,'retries':2,'fragment_retries':2,'max_filesize':MAX_FILESIZE,'restrictfilenames':False,'http_headers':{'User-Agent':YOUTUBE_UA},'logger':QuietLogger()}
    if url and is_youtube(url):
        opts['js_runtimes']={'node':{}}
        opts['extractor_args']={'youtube':{'player_client':clients or ['mweb']},'youtubepot-bgutilhttp':{'base_url':[POT_URL]}}
        if use_cookie:
            c=writable_cookie()
            if c:opts['cookiefile']=str(c)
    return opts

def youtube_attempts():
    if youtube_cookie_ready():return [
        {'name':'mweb-cookie','clients':['mweb'],'cookie':True},
        {'name':'default-cookie','clients':['default','mweb'],'cookie':True},
        {'name':'safari-cookie','clients':['default','web_safari'],'cookie':True},
        {'name':'mweb-public','clients':['mweb'],'cookie':False},
        {'name':'embedded-public','clients':['web_embedded'],'cookie':False},
        {'name':'android-vr','clients':['android_vr'],'cookie':False,'selector':'best/18'}]
    return [{'name':'mweb-public','clients':['mweb'],'cookie':False},{'name':'embedded-public','clients':['web_embedded'],'cookie':False},{'name':'android-vr','clients':['android_vr'],'cookie':False,'selector':'best/18'}]

def extract_info_sync(url):
    cached=cache_get(url)
    if cached:return cached['info']
    attempts=youtube_attempts() if is_youtube(url) else [{'name':'default','clients':None,'cookie':False}]; errors=[]
    for s in attempts:
        try:
            o=base_opts(url,s.get('clients'),s.get('cookie',False));o['skip_download']=True
            with YoutubeDL(o) as y:info=y.extract_info(url,download=False,process=False)
            if info:
                if info.get('entries'):info=next((x for x in info['entries'] if x),info)
                cache_put(url,info,s);return info
        except Exception as e:errors.append(f"{s['name']}:{type(e).__name__}")
    print(f"media info failed host={urlparse(url).hostname} attempts={','.join(errors)}",flush=True)
    raise DownloadError('media info failed')

def available_heights(info):
    hs=set()
    for f in info.get('formats') or []:
        try:h=int(f.get('height') or 0)
        except (TypeError,ValueError):h=0
        if h and f.get('vcodec')!='none':hs.add(h)
    try:
        h=int(info.get('height') or 0)
        if h:hs.add(h)
    except (TypeError,ValueError):pass
    return hs

def max_height(info):return max(available_heights(info),default=0)

def quality_choices(info,platform):
    hs=available_heights(info); out=[{'id':'best','label':'Best quality'}]
    if platform=='youtube':
        if 2160 in hs:out.append({'id':'2160','label':'4K · 2160p'})
        if 1440 in hs:out.append({'id':'1440','label':'2K · 1440p'})
    if 1080 in hs:out.append({'id':'1080','label':'1080p'})
    if 720 in hs:out.append({'id':'720','label':'720p'})
    out.append({'id':'audio','label':'MP3 192 kbps'});return out

def selector(quality):
    if quality in {'2160','1440','1080','720'}:
        h=int(quality)
        return f'bv*[height={h}]+ba/b[height={h}]',False
    if quality=='audio':return 'ba/bestaudio/best',True
    return 'bv*+ba/bestvideo*+bestaudio/best',False

def selected_video_height(info):
    vals=[]
    for key in ('requested_formats','requested_downloads'):
        for f in info.get(key) or []:
            try:h=int(f.get('height') or 0)
            except (TypeError,ValueError,AttributeError):h=0
            if h and f.get('vcodec')!='none':vals.append(h)
    try:
        h=int(info.get('height') or 0)
        if h:vals.append(h)
    except (TypeError,ValueError):pass
    return max(vals,default=0)

def verify_quality(info,quality):
    if quality not in {'2160','1440','1080','720'}:return
    wanted=int(quality); actual=selected_video_height(info)
    if actual and actual!=wanted:raise RuntimeError(f'resolution mismatch wanted={wanted} actual={actual}')

def clear_workdir(w):
    root=Path(w)
    if not root.exists():return
    for p in root.iterdir():
        try:shutil.rmtree(p,ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        except OSError:pass

def dl_opts(url,quality,w,s):
    fmt,audio=selector(quality)
    if s.get('selector') and quality=='best':fmt=s['selector']
    o=base_opts(url,s.get('clients'),s.get('cookie',False));o.update({'format':fmt,'outtmpl':str(Path(w)/'%(title).80B [%(id)s].%(ext)s'),'merge_output_format':'mp4','windowsfilenames':True})
    if audio:o['postprocessors']=[{'key':'FFmpegExtractAudio','preferredcodec':'mp3','preferredquality':'192'}]
    return o

def find_output(w):
    fs=[p for p in Path(w).iterdir() if p.is_file() and not p.name.endswith(('.part','.ytdl'))]
    if not fs:raise RuntimeError('File hasil tidak ditemukan.')
    return max(fs,key=lambda p:p.stat().st_mtime)

def download_sync(url,quality,w):
    cached=cache_get(url); errors=[]
    if cached:
        try:
            clear_workdir(w)
            with YoutubeDL(dl_opts(url,quality,w,cached['strategy'])) as y:
                result=y.process_ie_result(copy.deepcopy(cached['info']),download=True)
            verify_quality(result,quality)
            return find_output(w)
        except Exception as e:errors.append(f'cache:{type(e).__name__}')
    attempts=youtube_attempts() if is_youtube(url) else [{'name':'default','clients':None,'cookie':False}]
    if cached:
        preferred=cached['strategy']['name'];attempts.sort(key=lambda x:0 if x['name']==preferred else 1)
    for s in attempts:
        try:
            clear_workdir(w)
            with YoutubeDL(dl_opts(url,quality,w,s)) as y:result=y.extract_info(url,download=True)
            verify_quality(result,quality)
            return find_output(w)
        except Exception as e:errors.append(f"{s['name']}:{type(e).__name__}")
    print(f"media download failed host={urlparse(url).hostname} quality={quality} attempts={','.join(errors)}",flush=True)
    raise DownloadError('download failed')

def cleanup(path):shutil.rmtree(path,ignore_errors=True)
def youtube_error(exc):
    c=youtube_cookie_status();m=str(exc).lower()
    if not c['exists']:return 'Cookie YouTube belum kebaca di Render.'
    if not c['valid']:return 'Cookie YouTube tidak valid.'
    if 'sign in' in m or 'not a bot' in m:return 'YouTube menolak sesi server. Cookie perlu diperbarui.'
    if 'format' in m or 'resolution' in m:return 'Resolusi yang dipilih tidak tersedia dari sesi YouTube server.'
    return 'YouTube gagal menyiapkan file.'

@app.get('/')
async def root():return {'name':'RVL Media API','status':'ok','version':APP_VERSION,'youtube_auth':youtube_cookie_ready()}
@app.get('/health')
async def health():return {'ok':True,'version':APP_VERSION,'youtube_auth':youtube_cookie_ready(),'youtube_cookie':youtube_cookie_status(),'youtube_cookie_working':cookie_status(YOUTUBE_COOKIE_WORK_FILE),'yt_dlp':package_version('yt-dlp'),'yt_dlp_ejs':package_version('yt-dlp-ejs'),'js_runtime':'node','pot_provider':pot_provider_status(),'media_cache':len(_media_cache),'youtube_strategy':'cached>mweb-cookie>default-cookie>safari-cookie>public-fallback'}
@app.post('/api/info')
async def media_info(body:URLBody):
    url=validate_url(body.url)
    try:info=await asyncio.to_thread(extract_info_sync,url)
    except DownloadError as e:raise HTTPException(422,youtube_error(e) if is_youtube(url) else 'Media tidak bisa dibaca. Coba link lain.') from e
    except Exception as e:raise HTTPException(500,youtube_error(e) if is_youtube(url) else 'Gagal membaca media.') from e
    platform='youtube' if is_youtube(url) else 'tiktok'
    return {'platform':platform,'id':info.get('id'),'title':info.get('title') or 'Untitled','thumbnail':info.get('thumbnail'),'duration':info.get('duration'),'uploader':info.get('uploader') or info.get('channel'),'max_height':max_height(info),'choices':quality_choices(info,platform),'cached':True}

async def make_download(url,quality):
    url=validate_url(url);quality=quality.lower().strip()
    if quality not in {'best','2160','1440','1080','720','audio'}:raise HTTPException(400,'Pilihan kualitas tidak valid.')
    w=tempfile.mkdtemp(prefix='rvl-')
    try:
        async with DOWNLOAD_SLOTS:path=await asyncio.to_thread(download_sync,url,quality,w)
    except DownloadError as e:cleanup(w);raise HTTPException(422,youtube_error(e) if is_youtube(url) else 'Download gagal. Media mungkin dibatasi.') from e
    except Exception as e:cleanup(w);raise HTTPException(500,youtube_error(e) if is_youtube(url) else 'Gagal menyiapkan file.') from e
    return FileResponse(str(path),filename=path.name,media_type='audio/mpeg' if path.suffix.lower()=='.mp3' else 'video/mp4',headers={'Cache-Control':'no-store'},background=BackgroundTask(cleanup,w))
@app.post('/api/download')
async def download_post(body:DownloadBody):return await make_download(str(body.url),body.quality)
@app.get('/api/download')
async def download_get(url:str,quality:str='best'):return await make_download(url,quality)
