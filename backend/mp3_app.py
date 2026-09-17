import asyncio
import json
import re
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import app as legacy
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from yt_dlp.utils import DownloadError

app=legacy.app
legacy.APP_VERSION='1.12.4';app.version=legacy.APP_VERSION
MP3_SOURCE_TTL=600;MP3_PREP_WAIT=12;AUDIO_TOKEN_TTL=180;AUDIO_STREAM_CONCURRENCY=4
_mp3_source_lock=threading.Lock();_mp3_sources={};_audio_token_lock=threading.Lock();_audio_tokens={};_audio_stream_slots=threading.BoundedSemaphore(AUDIO_STREAM_CONCURRENCY)

def youtube_id(url):
 p=urllib.parse.urlparse(url);h=(p.hostname or '').lower()
 if h=='youtu.be':return p.path.strip('/').split('/')[0]
 q=urllib.parse.parse_qs(p.query)
 if q.get('v'):return q['v'][0]
 parts=[x for x in p.path.split('/') if x];return parts[1] if len(parts)>=2 and parts[0] in {'shorts','embed','live'} else None

def mp3_meta_sync(url):
 vid=youtube_id(url);thumb=f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg' if vid else None
 if not vid:return {'id':None,'title':'YouTube audio','uploader':None,'thumbnail':None}
 try:
  endpoint='https://www.youtube.com/oembed?'+urllib.parse.urlencode({'url':f'https://www.youtube.com/watch?v={vid}','format':'json'});req=urllib.request.Request(endpoint,headers={'User-Agent':legacy.YOUTUBE_UA})
  with urllib.request.urlopen(req,timeout=3) as r:data=json.loads(r.read().decode('utf-8','replace'))
  return {'id':vid,'title':data.get('title') or 'YouTube audio','uploader':data.get('author_name'),'thumbnail':data.get('thumbnail_url') or thumb}
 except Exception:return {'id':vid,'title':'YouTube audio','uploader':None,'thumbnail':thumb}

def _purge_sources():
 cutoff=time.time()-MP3_SOURCE_TTL
 with _mp3_source_lock:
  for url,state in list(_mp3_sources.items()):
   if state.get('updated',state.get('created',0))<cutoff:_mp3_sources.pop(url,None)
def _get_source_state(url,create=False):
 _purge_sources()
 with _mp3_source_lock:
  state=_mp3_sources.get(url)
  if state or not create:return state,False
  state={'state':'preparing','event':threading.Event(),'created':time.time(),'updated':time.time(),'source':None,'error':None,'strategy':None};_mp3_sources[url]=state;return state,True

def _audio_source_from_info(info):
 if not isinstance(info,dict):return None
 for item in info.get('requested_downloads') or []:
  if isinstance(item,dict) and item.get('url') and item.get('acodec') not in {None,'none'}:return item
 if info.get('url') and info.get('acodec') not in {None,'none'}:return info
 candidates=[]
 for f in info.get('formats') or []:
  if not isinstance(f,dict) or not f.get('url') or f.get('acodec') in {None,'none'}:continue
  try:abr=float(f.get('abr') or f.get('tbr') or 0)
  except (TypeError,ValueError):abr=0
  ext=f.get('ext') or '';candidates.append(((1 if f.get('vcodec') in {None,'none'} else 0,3 if ext=='m4a' else 2 if ext in {'mp4','webm'} else 1,abr,legacy.format_size(f)),f))
 return max(candidates,key=lambda x:x[0])[1] if candidates else None

def _mp3_attempts():
 attempts=list(legacy.youtube_attempts())
 # Restore the fast Railway path that worked earlier: authenticated audio URLs first.
 # Public/POT paths remain immediate fallbacks instead of making the MP3 job wait on them first.
 order=('mweb-cookie','default-cookie','safari-cookie','mweb-pot-public','default-public','embedded-public','android-vr-public','mweb-public','android-vr','default-embedded-cookie')
 ranked=[]
 for name in order:ranked.extend(s for s in attempts if s.get('name')==name and s not in ranked)
 ranked.extend(s for s in attempts if s not in ranked);return ranked

def _prepare_audio_source_sync(url):
 started=time.monotonic();errors=[]
 for strategy in _mp3_attempts():
  try:
   opts=legacy.base_opts(url,strategy.get('clients'),strategy.get('cookie',False));opts.update({'format':'bestaudio[ext=m4a]/bestaudio/best','skip_download':True,'socket_timeout':4,'retries':0,'fragment_retries':0,'extractor_retries':0,'cachedir':False})
   with legacy.YoutubeDL(opts) as y:info=y.extract_info(url,download=False)
   if info and info.get('entries'):info=next((x for x in info['entries'] if x),info)
   source=_audio_source_from_info(info)
   if not source or not source.get('url'):raise RuntimeError('audio source URL missing')
   print(f'audio source ready strategy={strategy.get("name")} ms={int((time.monotonic()-started)*1000)}',flush=True);return {'source':source,'title':(info or {}).get('title') or 'YouTube audio','duration':(info or {}).get('duration') or source.get('duration'),'strategy':strategy.get('name')}
  except Exception as exc:errors.append(f"{strategy.get('name')}:{type(exc).__name__}")
 print(f"audio source prepare failed attempts={','.join(errors)}",flush=True);raise DownloadError('audio source prepare failed')
def _source_worker(url,state):
 try:
  data=_prepare_audio_source_sync(url)
  with _mp3_source_lock:state.update(state='ready',source=data,strategy=data.get('strategy'),updated=time.time())
 except Exception as exc:
  with _mp3_source_lock:state.update(state='error',error=exc,updated=time.time())
 finally:state['event'].set()
def _ensure_source_prepare(url):
 state,created=_get_source_state(url,True)
 if created:threading.Thread(target=_source_worker,args=(url,state),daemon=True).start()
 return state
def _wait_source(url):
 state=_ensure_source_prepare(url)
 if state.get('state')=='ready' and state.get('source'):return state['source']
 state['event'].wait(MP3_PREP_WAIT)
 if state.get('state')=='ready' and state.get('source'):return state['source']
 if state.get('error'):raise state['error']
 raise DownloadError('audio source prepare timeout')

def _safe_title(v):v=re.sub(r'[\\/:*?"<>|]+',' ',str(v or 'YouTube audio'));v=re.sub(r'\s+',' ',v).strip().strip('.');return v[:90] or 'YouTube audio'
def _source_headers(s):
 h=dict(s.get('http_headers') or {});h.setdefault('User-Agent',legacy.YOUTUBE_UA);return {str(k):str(v) for k,v in h.items() if v is not None and str(k).lower() not in {'host','content-length'}}
def _ffmpeg_headers(source):
 h=_source_headers(source);a=[];ua=h.pop('User-Agent',h.pop('user-agent',legacy.YOUTUBE_UA));ref=h.pop('Referer',h.pop('referer',None))
 if ua:a+=['-user_agent',str(ua)]
 if ref:a+=['-referer',str(ref)]
 lines=[f'{k}: {v}' for k,v in h.items() if '\r' not in v and '\n' not in v]
 if lines:a+=['-headers','\r\n'.join(lines)+'\r\n']
 return a

def _transcode_direct(source_data,workdir,job_id=None):
 source=source_data['source'];title=_safe_title(source_data.get('title'));duration=float(source_data.get('duration') or 0);output=Path(workdir)/f'{title}.mp3';legacy.clear_workdir(workdir)
 cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-rw_timeout','5000000','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','1']+_ffmpeg_headers(source)+['-i',source['url'],'-vn','-map','0:a:0?','-c:a','libmp3lame','-b:a','192k','-compression_level','0','-write_xing','0','-id3v2_version','3','-progress','pipe:1','-nostats',str(output)]
 if job_id:legacy.job_update(job_id,state='working',progress=16,stage='Convert MP3')
 started=time.monotonic();proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
 try:
  if proc.stdout:
   for raw in proc.stdout:
    line=raw.strip()
    if line.startswith('out_time_ms=') and duration>0 and job_id:
     try:sec=int(line.split('=',1)[1])/1_000_000;legacy.job_update(job_id,state='working',progress=18+int(max(0,min(1,sec/duration))*77),stage='Convert MP3')
     except (TypeError,ValueError):pass
  code=proc.wait(timeout=max(60,int(duration*.75+15) if duration else 90))
 except Exception:
  if proc.poll() is None:proc.kill()
  raise
 if code!=0 or not output.is_file() or output.stat().st_size<=1024:raise RuntimeError('ffmpeg MP3 conversion failed')
 if job_id:legacy.job_update(job_id,state='working',progress=97,stage='Finalisasi')
 print(f'mp3 direct transcode done ms={int((time.monotonic()-started)*1000)} bytes={output.stat().st_size}',flush=True);return output

def fast_mp3_sync(url,workdir,job_id=None):
 if job_id:legacy.job_update(job_id,state='working',progress=8,stage='Menyiapkan audio')
 try:
  return _transcode_direct(_wait_source(url),workdir,job_id)
 except Exception as exc:
  print(f'mp3 fast path fallback type={type(exc).__name__}',flush=True)
  if job_id:legacy.job_update(job_id,state='working',progress=8,stage='Fallback audio')
  legacy.clear_workdir(workdir)
  return legacy.download_sync(url,'audio',workdir,job_id)

def _purge_audio_tokens():
 cutoff=time.time()-AUDIO_TOKEN_TTL
 with _audio_token_lock:
  for token,data in list(_audio_tokens.items()):
   if data.get('created',0)<cutoff:_audio_tokens.pop(token,None)
def _audio_ext(s):
 ext=str(s.get('ext') or '').lower().strip('.');return ext if ext in {'m4a','mp4','webm','opus','ogg'} else 'm4a'
def _audio_media_type(e):return {'m4a':'audio/mp4','mp4':'audio/mp4','webm':'audio/webm','opus':'audio/ogg','ogg':'audio/ogg'}.get(e,'application/octet-stream')
def _open_audio_source(s):return urllib.request.urlopen(urllib.request.Request(s['url'],headers=_source_headers(s)),timeout=25)
def _audio_iter(r):
 try:
  while True:
   c=r.read(1024*1024)
   if not c:break
   yield c
 finally:
  try:r.close()
  finally:_audio_stream_slots.release()

async def run_mp3_job(job_id,url):
 with legacy._jobs_lock:job=legacy._jobs.get(job_id);workdir=job.get('workdir') if job else None
 if not workdir:return
 try:
  async with legacy.DOWNLOAD_SLOTS:path=await asyncio.to_thread(fast_mp3_sync,url,workdir,job_id)
  legacy.job_update(job_id,state='ready',progress=100,stage='Siap',filename=path.name,path=str(path))
 except DownloadError:
  legacy.job_update(job_id,state='error',progress=0,stage='Gagal',error='Sumber audio YouTube belum tersedia. Coba lagi.')
 except Exception as exc:
  print(f'mp3 job failed id={job_id} type={type(exc).__name__}',flush=True);legacy.job_update(job_id,state='error',progress=0,stage='Gagal',error='MP3 gagal diproses. Coba lagi.')

@app.post('/api/mp3/info')
async def mp3_info(body:legacy.URLBody):
 url=legacy.validate_url(body.url)
 if not legacy.is_youtube(url):raise HTTPException(400,'Link harus dari YouTube.')
 _ensure_source_prepare(url);meta=await asyncio.to_thread(mp3_meta_sync,url);return {'platform':'youtube-mp3','id':meta.get('id'),'title':meta.get('title') or 'YouTube audio','thumbnail':meta.get('thumbnail'),'uploader':meta.get('uploader'),'format':'MP3','bitrate':192,'audio_prepare':'background','fast_audio':True}
@app.post('/api/audio/prepare')
async def prepare_fast_audio(body:legacy.URLBody):
 _purge_audio_tokens();url=legacy.validate_url(body.url)
 if not legacy.is_youtube(url):raise HTTPException(400,'Link harus dari YouTube.')
 try:source_data=await asyncio.to_thread(_wait_source,url)
 except Exception as exc:raise HTTPException(422,'Audio YouTube belum berhasil disiapkan dari server. Coba lagi sebentar.') from exc
 source=source_data['source'];ext=_audio_ext(source);title=_safe_title(source_data.get('title'));token=uuid.uuid4().hex
 with _audio_token_lock:_audio_tokens[token]={'created':time.time(),'source':source,'filename':f'{title}.{ext}','media_type':_audio_media_type(ext)}
 return {'token':token,'filename':f'{title}.{ext}','media_type':_audio_media_type(ext),'strategy':source_data.get('strategy')}
@app.get('/api/audio/stream/{token}')
async def stream_fast_audio(token:str):
 _purge_audio_tokens()
 with _audio_token_lock:item=_audio_tokens.get(token)
 if not item:raise HTTPException(404,'Token audio tidak ditemukan atau kedaluwarsa.')
 if not _audio_stream_slots.acquire(blocking=False):raise HTTPException(429,'Server audio sedang penuh. Coba lagi sebentar.')
 try:response=await asyncio.to_thread(_open_audio_source,item['source'])
 except Exception as exc:_audio_stream_slots.release();raise HTTPException(502,'Sumber audio YouTube tidak bisa dibuka.') from exc
 return StreamingResponse(_audio_iter(response),media_type=item['media_type'],headers={'Content-Disposition':f'attachment; filename="{item["filename"]}"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
@app.post('/api/mp3/jobs')
async def create_mp3_job(body:legacy.DownloadBody):
 legacy.purge_jobs();url=legacy.validate_url(body.url)
 if not legacy.is_youtube(url):raise HTTPException(400,'Link harus dari YouTube.')
 job_id=uuid.uuid4().hex;workdir=tempfile.mkdtemp(prefix='rvl-mp3-')
 with legacy._jobs_lock:legacy._jobs[job_id]={'state':'queued','progress':0,'stage':'Antri','created':time.time(),'updated':time.time(),'workdir':workdir,'path':None,'filename':None,'error':None}
 asyncio.create_task(run_mp3_job(job_id,url));return {'job_id':job_id,'state':'queued'}