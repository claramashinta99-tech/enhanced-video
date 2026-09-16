import asyncio
import copy
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid
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

APP_VERSION='1.9.0'
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
CACHE_TTL=int(os.getenv('MEDIA_CACHE_TTL','900'));CACHE_MAX=int(os.getenv('MEDIA_CACHE_MAX','40'));JOB_TTL=int(os.getenv('DOWNLOAD_JOB_TTL','1200'))
EXACT_QUALITIES={'2160':2160,'1440':1440,'1080':1080,'720':720}
_cookie_lock=threading.Lock();_cookie_initialized=False;_cache_lock=threading.Lock();_media_cache={};_jobs_lock=threading.Lock();_jobs={}

class URLBody(BaseModel):
    url:HttpUrl
class DownloadBody(BaseModel):
    url:HttpUrl
    quality:str='best'
class QuietLogger:
    def debug(self,msg):pass
    def warning(self,msg):pass
    def error(self,msg):pass

def validate_url(value):
    url=str(value);p=urlparse(url);host=(p.hostname or '').lower().rstrip('.')
    if p.scheme not in {'http','https'} or host not in ALLOWED_HOSTS:raise HTTPException(400,'Link harus dari YouTube atau TikTok.')
    return url

def is_youtube(url):return 'youtu' in (urlparse(url).hostname or '').lower()
def package_version(name):
    try:return pkg_version(name)
    except PackageNotFoundError:return None

def cookie_status(path):
    out={'exists':False,'valid':False,'count':0,'size':0}
    try:
        if not path.is_file():return out
        out['exists']=True;out['size']=path.stat().st_size
        if out['size']<=64:return out
        jar=MozillaCookieJar(str(path));jar.load(ignore_discard=True,ignore_expires=True)
        out['count']=sum(1 for _ in jar);out['valid']=out['count']>0
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
    o={'quiet':True,'no_warnings':True,'noplaylist':True,'socket_timeout':25,'retries':2,'fragment_retries':2,'max_filesize':MAX_FILESIZE,'restrictfilenames':False,'http_headers':{'User-Agent':YOUTUBE_UA},'logger':QuietLogger()}
    if url and is_youtube(url):
        o['js_runtimes']={'node':{}}
        o['extractor_args']={'youtube':{'player_client':clients or ['mweb']},'youtubepot-bgutilhttp':{'base_url':[POT_URL]}}
        if use_cookie:
            c=writable_cookie()
            if c:o['cookiefile']=str(c)
    return o

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
    attempts=youtube_attempts() if is_youtube(url) else [{'name':'default','clients':None,'cookie':False}];errors=[]
    for s in attempts:
        try:
            o=base_opts(url,s.get('clients'),s.get('cookie',False));o['skip_download']=True
            with YoutubeDL(o) as y:info=y.extract_info(url,download=False,process=False)
            if info:
                if info.get('entries'):info=next((x for x in info['entries'] if x),info)
                cache_put(url,info,s);return info
        except Exception as e:errors.append(f"{s['name']}:{type(e).__name__}")
    print(f"media info failed host={urlparse(url).hostname} attempts={','.join(errors)}",flush=True);raise DownloadError('media info failed')

def format_size(f):
    try:return int(f.get('filesize') or f.get('filesize_approx') or 0)
    except (TypeError,ValueError,AttributeError):return 0

def exact_format_parts(info,target):
    videos=[];audios=[]
    for f in info.get('formats') or []:
        if not isinstance(f,dict) or not f.get('format_id'):continue
        try:h=int(f.get('height') or 0)
        except (TypeError,ValueError):h=0
        v=f.get('vcodec');a=f.get('acodec')
        if h==target and v and v!='none':videos.append(f)
        if (not v or v=='none') and a and a!='none':audios.append(f)
    if not videos:return None,None
    def vrank(f):
        ext=1 if f.get('ext') in {'mp4','m4v'} else 0
        try:tbr=float(f.get('tbr') or f.get('vbr') or 0)
        except (TypeError,ValueError):tbr=0
        return ext,format_size(f),tbr
    def arank(f):
        ext=1 if f.get('ext') in {'m4a','mp4'} else 0
        try:abr=float(f.get('abr') or f.get('tbr') or 0)
        except (TypeError,ValueError):abr=0
        return ext,format_size(f),abr
    return max(videos,key=vrank),max(audios,key=arank) if audios else None

def best_audio_selector(info):
    audios=[]
    for f in info.get('formats') or []:
        if not isinstance(f,dict) or not f.get('format_id'):continue
        v=f.get('vcodec');a=f.get('acodec')
        if (not v or v=='none') and a and a!='none':audios.append(f)
    if not audios:return None
    def rank(f):
        ext=2 if f.get('ext')=='m4a' else 1 if f.get('ext') in {'mp4','webm'} else 0
        try:abr=float(f.get('abr') or f.get('tbr') or 0)
        except (TypeError,ValueError):abr=0
        return ext,abr,format_size(f)
    return str(max(audios,key=rank)['format_id'])

def exact_selector(info,quality):
    if quality not in EXACT_QUALITIES:return None
    video,audio=exact_format_parts(info,EXACT_QUALITIES[quality])
    if not video:return None
    return f"{video['format_id']}+{audio['format_id']}" if audio else str(video['format_id'])

def estimated_quality_size(info,quality):
    if quality not in EXACT_QUALITIES:return 0
    video,audio=exact_format_parts(info,EXACT_QUALITIES[quality]);return format_size(video or {})+format_size(audio or {})

def available_heights(info):
    hs=set()
    for f in info.get('formats') or []:
        try:h=int(f.get('height') or 0)
        except (TypeError,ValueError):h=0
        if h and f.get('vcodec')!='none':hs.add(h)
    return hs

def max_height(info):return max(available_heights(info),default=0)
def human_mb(n):return f'{n/1048576:.1f} MB' if n else None

def quality_choices(info,platform):
    hs=available_heights(info);out=[{'id':'best','label':'Best quality'}]
    for q,label in [('2160','4K · 2160p'),('1440','2K · 1440p'),('1080','1080p'),('720','720p')]:
        h=int(q)
        if h not in hs or (platform!='youtube' and h>1080):continue
        est=estimated_quality_size(info,q) if platform=='youtube' else 0
        out.append({'id':q,'label':f'{label} · ~{human_mb(est)}' if est else label,'estimated_bytes':est or None})
    out.append({'id':'audio','label':'MP3 192 kbps'});return out

def selector(quality):
    if quality in EXACT_QUALITIES:return f"bv*[height={EXACT_QUALITIES[quality]}]+ba/b[height={EXACT_QUALITIES[quality]}]",False
    if quality=='audio':return 'ba/bestaudio',True
    return 'bv*+ba/bestvideo*+bestaudio/best',False

def job_update(job_id,**fields):
    with _jobs_lock:
        job=_jobs.get(job_id)
        if not job:return
        if 'progress' in fields:fields['progress']=max(int(job.get('progress',0)),min(100,int(fields['progress'])))
        job.update(fields);job['updated']=time.time()

def make_progress_hooks(job_id,quality):
    def hook(d):
        status=d.get('status')
        if status=='downloading':
            total=d.get('total_bytes') or d.get('total_bytes_estimate') or 0;done=d.get('downloaded_bytes') or 0;ratio=min(1.0,done/total) if total else 0
            job_update(job_id,state='working',progress=12+int(ratio*66),stage='Mengambil audio' if quality=='audio' else 'Mengambil media')
        elif status=='finished':job_update(job_id,state='working',progress=82,stage='Convert MP3' if quality=='audio' else 'Menyatukan file')
    def post(d):
        if d.get('status')=='started':job_update(job_id,state='working',progress=87,stage='Convert MP3' if quality=='audio' else 'Finalisasi')
        elif d.get('status')=='finished':job_update(job_id,state='working',progress=97,stage='Finalisasi')
    return [hook],[post]

def clear_workdir(w):
    root=Path(w)
    if not root.exists():return
    for p in root.iterdir():
        try:shutil.rmtree(p,ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        except OSError:pass

def dl_opts(url,quality,w,s,format_override=None,job_id=None):
    fmt,audio=selector(quality)
    if format_override:fmt=format_override
    elif s.get('selector') and quality=='best':fmt=s['selector']
    o=base_opts(url,s.get('clients'),s.get('cookie',False));o.update({'format':fmt,'outtmpl':str(Path(w)/'%(title).80B [%(id)s].%(ext)s'),'merge_output_format':'mp4','windowsfilenames':True})
    if job_id:
        hooks,posts=make_progress_hooks(job_id,quality);o['progress_hooks']=hooks;o['postprocessor_hooks']=posts
    if audio:o['postprocessors']=[{'key':'FFmpegExtractAudio','preferredcodec':'mp3','preferredquality':'192'}]
    return o

def find_output(w):
    fs=[p for p in Path(w).iterdir() if p.is_file() and not p.name.endswith(('.part','.ytdl'))]
    if not fs:raise RuntimeError('File hasil tidak ditemukan.')
    return max(fs,key=lambda p:p.stat().st_mtime)

def probe_dimensions(path):
    if path.suffix.lower()=='.mp3':return 0,0
    try:
        raw=subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0:s=x',str(path)],text=True,timeout=15).strip().splitlines()[0]
        w,h=raw.split('x',1);return int(w),int(h)
    except Exception:return 0,0

def verify_file_quality(path,quality):
    if quality not in EXACT_QUALITIES:return
    wanted=EXACT_QUALITIES[quality];w,h=probe_dimensions(path)
    if not h:raise RuntimeError('ffprobe could not verify output resolution')
    if h!=wanted:raise RuntimeError(f'output resolution mismatch wanted={wanted} got={w}x{h}')

def add_quality_suffix(path,quality):
    if quality not in EXACT_QUALITIES:return path
    new=path.with_name(f'{path.stem} [{quality}p]{path.suffix}')
    if new!=path:path.rename(new)
    return new

def download_from_info(url,quality,w,info,strategy,job_id=None):
    fmt=exact_selector(info,quality)
    if quality in EXACT_QUALITIES and not fmt:raise RuntimeError(f'exact {quality}p format not present')
    if quality=='audio':fmt=best_audio_selector(info)
    clear_workdir(w)
    with YoutubeDL(dl_opts(url,quality,w,strategy,fmt,job_id)) as y:y.process_ie_result(copy.deepcopy(info),download=True)
    path=find_output(w);verify_file_quality(path,quality);return add_quality_suffix(path,quality)

def download_sync(url,quality,w,job_id=None):
    cached=cache_get(url);errors=[]
    if job_id:job_update(job_id,state='working',progress=8,stage='Menyiapkan')
    if cached:
        try:return download_from_info(url,quality,w,cached['info'],cached['strategy'],job_id)
        except Exception as e:errors.append(f'cache:{type(e).__name__}')
    attempts=youtube_attempts() if is_youtube(url) else [{'name':'default','clients':None,'cookie':False}]
    if cached:
        preferred=cached['strategy']['name'];attempts.sort(key=lambda x:0 if x['name']==preferred else 1)
    for s in attempts:
        try:
            if job_id:job_update(job_id,state='working',progress=10,stage='Membaca sumber')
            o=base_opts(url,s.get('clients'),s.get('cookie',False));o['skip_download']=True
            with YoutubeDL(o) as y:info=y.extract_info(url,download=False,process=False)
            if info.get('entries'):info=next((x for x in info['entries'] if x),info)
            path=download_from_info(url,quality,w,info,s,job_id);cache_put(url,info,s);return path
        except Exception as e:errors.append(f"{s['name']}:{type(e).__name__}")
    print(f"media download failed host={urlparse(url).hostname} quality={quality} attempts={','.join(errors)}",flush=True);raise DownloadError('download failed')

def cleanup(path):shutil.rmtree(path,ignore_errors=True)
def youtube_error(exc):
    c=youtube_cookie_status();m=str(exc).lower()
    if not c['exists']:return 'Cookie YouTube belum kebaca di Render.'
    if not c['valid']:return 'Cookie YouTube tidak valid.'
    if 'sign in' in m or 'not a bot' in m:return 'YouTube menolak sesi server. Cookie perlu diperbarui.'
    return 'YouTube gagal menyiapkan file atau resolusi asli tidak tersedia dari sesi server.'

def purge_jobs():
    cutoff=time.time()-JOB_TTL;stale=[]
    with _jobs_lock:
        for job_id,job in list(_jobs.items()):
            if job.get('updated',job.get('created',0))<cutoff:stale.append((job_id,job.get('workdir')));_jobs.pop(job_id,None)
    for _,workdir in stale:
        if workdir:cleanup(workdir)

def remove_job(job_id):
    workdir=None
    with _jobs_lock:
        job=_jobs.pop(job_id,None)
        if job:workdir=job.get('workdir')
    if workdir:cleanup(workdir)

async def run_job(job_id,url,quality):
    with _jobs_lock:
        job=_jobs.get(job_id);workdir=job.get('workdir') if job else None
    if not workdir:return
    try:
        async with DOWNLOAD_SLOTS:path=await asyncio.to_thread(download_sync,url,quality,workdir,job_id)
        job_update(job_id,state='ready',progress=100,stage='Siap',filename=path.name,path=str(path))
    except DownloadError as e:job_update(job_id,state='error',progress=0,stage='Gagal',error=youtube_error(e) if is_youtube(url) else 'Download gagal. Media mungkin dibatasi.')
    except Exception as e:
        print(f'job failed id={job_id} type={type(e).__name__}',flush=True);job_update(job_id,state='error',progress=0,stage='Gagal',error=youtube_error(e) if is_youtube(url) else 'Gagal menyiapkan file.')

@app.get('/')
async def root():return {'name':'RVL Media API','status':'ok','version':APP_VERSION,'youtube_auth':youtube_cookie_ready()}
@app.get('/health')
async def health():
    with _jobs_lock:active_jobs=sum(1 for j in _jobs.values() if j.get('state') in {'queued','working'})
    return {'ok':True,'version':APP_VERSION,'youtube_auth':youtube_cookie_ready(),'youtube_cookie':youtube_cookie_status(),'youtube_cookie_working':cookie_status(YOUTUBE_COOKIE_WORK_FILE),'yt_dlp':package_version('yt-dlp'),'yt_dlp_ejs':package_version('yt-dlp-ejs'),'js_runtime':'node','pot_provider':pot_provider_status(),'ffprobe':shutil.which('ffprobe') is not None,'media_cache':len(_media_cache),'active_jobs':active_jobs,'youtube_strategy':'cached-format>progress-job>fallback'}
@app.post('/api/info')
async def media_info(body:URLBody):
    url=validate_url(body.url)
    try:info=await asyncio.to_thread(extract_info_sync,url)
    except DownloadError as e:raise HTTPException(422,youtube_error(e) if is_youtube(url) else 'Media tidak bisa dibaca. Coba link lain.') from e
    except Exception as e:raise HTTPException(500,youtube_error(e) if is_youtube(url) else 'Gagal membaca media.') from e
    platform='youtube' if is_youtube(url) else 'tiktok'
    return {'platform':platform,'id':info.get('id'),'title':info.get('title') or 'Untitled','thumbnail':info.get('thumbnail'),'duration':info.get('duration'),'uploader':info.get('uploader') or info.get('channel'),'max_height':max_height(info),'choices':quality_choices(info,platform),'cached':True}

@app.post('/api/jobs')
async def create_download_job(body:DownloadBody):
    purge_jobs();url=validate_url(body.url);quality=body.quality.lower().strip()
    if quality not in {'best','2160','1440','1080','720','audio'}:raise HTTPException(400,'Pilihan kualitas tidak valid.')
    job_id=uuid.uuid4().hex;workdir=tempfile.mkdtemp(prefix='rvl-job-');now=time.time()
    with _jobs_lock:_jobs[job_id]={'id':job_id,'state':'queued','progress':2,'stage':'Antrean','url':url,'quality':quality,'workdir':workdir,'path':None,'filename':None,'error':None,'created':now,'updated':now}
    asyncio.create_task(run_job(job_id,url,quality));return {'job_id':job_id,'state':'queued','progress':2}
@app.get('/api/jobs/{job_id}')
async def get_download_job(job_id:str):
    purge_jobs()
    with _jobs_lock:
        job=_jobs.get(job_id)
        if not job:raise HTTPException(404,'Job tidak ditemukan atau sudah kedaluwarsa.')
        return {'job_id':job_id,'state':job.get('state'),'progress':int(job.get('progress',0)),'stage':job.get('stage') or '','filename':job.get('filename'),'error':job.get('error')}
@app.get('/api/jobs/{job_id}/file')
async def get_download_job_file(job_id:str):
    with _jobs_lock:
        job=_jobs.get(job_id)
        if not job:raise HTTPException(404,'Job tidak ditemukan atau sudah kedaluwarsa.')
        if job.get('state')!='ready' or not job.get('path'):raise HTTPException(409,'File belum siap.')
        path=Path(job['path']);filename=job.get('filename') or path.name
    if not path.is_file():remove_job(job_id);raise HTTPException(410,'File sudah tidak tersedia.')
    return FileResponse(str(path),filename=filename,media_type='audio/mpeg' if path.suffix.lower()=='.mp3' else 'video/mp4',headers={'Cache-Control':'no-store'},background=BackgroundTask(remove_job,job_id))

async def make_download(url,quality):
    url=validate_url(url);quality=quality.lower().strip()
    if quality not in {'best','2160','1440','1080','720','audio'}:raise HTTPException(400,'Pilihan kualitas tidak valid.')
    w=tempfile.mkdtemp(prefix='rvl-')
    try:
        async with DOWNLOAD_SLOTS:path=await asyncio.to_thread(download_sync,url,quality,w,None)
    except DownloadError as e:cleanup(w);raise HTTPException(422,youtube_error(e) if is_youtube(url) else 'Download gagal. Media mungkin dibatasi.') from e
    except Exception as e:cleanup(w);raise HTTPException(500,youtube_error(e) if is_youtube(url) else 'Gagal menyiapkan file.') from e
    return FileResponse(str(path),filename=path.name,media_type='audio/mpeg' if path.suffix.lower()=='.mp3' else 'video/mp4',headers={'Cache-Control':'no-store'},background=BackgroundTask(cleanup,w))
@app.post('/api/download')
async def download_post(body:DownloadBody):return await make_download(str(body.url),body.quality)
@app.get('/api/download')
async def download_get(url:str,quality:str='best'):return await make_download(url,quality)
