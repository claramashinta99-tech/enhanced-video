(()=>{
  const RVL_API='https://enhanced-video-production.up.railway.app';
  const MEDIABUNNY_URL='https://esm.sh/mediabunny@1.56.3';
  const MP3_ENCODER_URL='https://esm.sh/@mediabunny/mp3-encoder@1.56.3';
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url');
  const inspectBtn=qs('#inspect-btn');
  const card=qs('#media-card');
  const statusEl=qs('#download-status');
  const thumb=qs('#media-thumb');
  const titleEl=qs('#media-title');
  const metaEl=qs('#media-meta');
  const mode=qs('#audio-mode');
  const downloadBtn=qs('#download-btn');
  if(!input||!inspectBtn||!card||!statusEl||!mode||!downloadBtn)return;

  let current=null;
  let inspectRun=0;
  let inspectController=null;
  let downloadRun=0;
  let enginePromise=null;
  let preparedAudio=null;
  let activeConversion=null;

  if(!document.querySelector('#rvl-mp3-style')){
    const css=document.createElement('style');
    css.id='rvl-mp3-style';
    css.textContent=`
      .media-card{display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:16px}
      .media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}
      .media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:13px;background:#171717;border:1px solid var(--line)}
      .media-info{min-width:0}.media-title{font-weight:700;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .media-meta{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45}
      .media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}
      .audio-mode{width:100%;min-height:44px;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:0 13px;font-size:13px;outline:none}
      .download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
      .rvl-job-progress.show{display:block}.rvl-job-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#8d8d94}
      .rvl-job-head strong{color:#c9c9ce;font-weight:600}.rvl-job-track{height:7px;border-radius:999px;background:#1a1a1d;overflow:hidden;border:1px solid rgba(255,255,255,.04)}
      .rvl-job-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#63c8ff,#8b7cff);box-shadow:0 0 16px rgba(139,124,255,.18);transition:width .22s ease}
      .rvl-job-progress.indeterminate .rvl-job-fill{width:42%!important;animation:rvlJobIndeterminate 1.05s ease-in-out infinite alternate}
      @keyframes rvlJobIndeterminate{from{transform:translateX(-40%)}to{transform:translateX(165%)}}
      @media(max-width:600px){.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.download-input-wrap{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.rvl-job-fill{transition:none}.rvl-job-progress.indeterminate .rvl-job-fill{animation:none;width:35%!important}}
    `;
    document.head.appendChild(css);
  }

  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');
  frame.name='rvl-download-frame';frame.id='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);

  let progressWrap=qs('#rvl-job-progress');
  if(!progressWrap){
    progressWrap=document.createElement('div');progressWrap.id='rvl-job-progress';progressWrap.className='rvl-job-progress';
    progressWrap.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Menyiapkan</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';
    card.insertAdjacentElement('afterend',progressWrap);
  }
  const progressStage=qs('#rvl-job-stage');
  const progressPct=qs('#rvl-job-percent');
  const progressFill=qs('#rvl-job-fill');

  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function text(id,en){return lang()==='en'?en:id}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function setStatus(msg='',type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
  function valid(url){try{const h=new URL(url).hostname.toLowerCase();return /(^|\.)youtube\.com$/.test(h)||h==='youtu.be'}catch{return false}}
  function setProgress(value=0,stage='',opts={}){
    const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    progressWrap.classList.add('show');progressWrap.classList.toggle('indeterminate',!!opts.indeterminate);
    progressFill.style.width=`${pct}%`;progressPct.textContent=opts.indeterminate?'':`${pct}%`;progressStage.textContent=stage||text('Menyiapkan','Preparing');
  }
  function hideProgress(){progressWrap.classList.remove('show','indeterminate');progressFill.style.width='0%';progressPct.textContent='0%'}
  function selectedFast(){return mode.value==='fast'}
  function safeName(v){return String(v||'audio').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,150)||'audio'}
  function abortError(){const e=new Error('Canceled');e.name='AbortError';return e}
  function cancelConversion(){const c=activeConversion;activeConversion=null;if(c)c.cancel().catch(()=>{})}

  function updateModeCopy(){
    if(!current)return;
    const bits=[];if(current.data.uploader)bits.push(current.data.uploader);
    bits.push(selectedFast()?text('Audio Asli','Original Audio'):'MP3 · 192 kbps');
    if(metaEl)metaEl.textContent=bits.join(' · ');
    downloadBtn.textContent=selectedFast()?text('Download Audio','Download Audio'):'Download MP3';
  }

  function applyStaticCopy(){
    const en=lang()==='en';const sub=qs('#page-sub');
    if(sub)sub.textContent=en?'Paste a YouTube link, check the audio, then choose Original Audio or MP3 192 kbps.':'Tempel link YouTube, cek audionya, lalu pilih Audio Asli atau MP3 192 kbps.';
    input.placeholder=en?'Paste YouTube link':'Tempel link YouTube';inspectBtn.textContent=en?'Check':'Cek';
    const fastOpt=mode.querySelector('option[value="fast"]');const mp3Opt=mode.querySelector('option[value="mp3"]');
    if(fastOpt)fastOpt.textContent=en?'Original Audio':'Audio Asli';
    if(mp3Opt)mp3Opt.textContent='MP3 · 192 kbps';
    if(!downloadBtn.disabled)updateModeCopy();
  }

  function reset(){
    current=null;preparedAudio=null;cancelConversion();card.classList.remove('show');downloadBtn.disabled=true;thumb?.removeAttribute('src');
    if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';hideProgress();
  }

  async function loadMp3Engine(){
    if(enginePromise)return enginePromise;
    enginePromise=Promise.all([import(MEDIABUNNY_URL),import(MP3_ENCODER_URL)])
      .then(async([mb,ext])=>{if(!(await mb.canEncodeAudio('mp3')))ext.registerMp3Encoder();return mb})
      .catch(err=>{enginePromise=null;throw err});
    return enginePromise;
  }

  async function prepareAudio(url){
    let lastErr=null;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const r=await fetch(`${RVL_API}/api/audio/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),cache:'no-store'});
        const data=await r.json().catch(()=>({}));
        if(r.ok&&data.token)return data;
        lastErr=new Error(data.detail||text('Audio gagal disiapkan.','Could not prepare audio.'));
      }catch(e){lastErr=e}
      if(attempt<3)await sleep(650*attempt);
    }
    throw lastErr||new Error(text('Audio gagal disiapkan.','Could not prepare audio.'));
  }

  function warmPrepare(url){
    if(preparedAudio?.url===url)return preparedAudio.promise;
    const promise=prepareAudio(url).catch(err=>{if(preparedAudio?.promise===promise)preparedAudio=null;throw err});
    preparedAudio={url,promise};
    return promise;
  }

  async function inspect(){
    const url=input.value.trim();const run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();reset();setStatus('');
    if(!valid(url)){setStatus(text('Tempel link YouTube yang valid.','Paste a valid YouTube link.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;setProgress(25,text('Mengecek link','Checking link'),{indeterminate:true});
    try{
      const r=await fetch(`${RVL_API}/api/mp3/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
      current={url,data};if(thumb){thumb.src=data.thumbnail||'';thumb.alt=data.title||'Media thumbnail'}if(titleEl)titleEl.textContent=data.title||'Untitled';
      downloadBtn.disabled=false;card.classList.add('show');hideProgress();setStatus('');updateModeCopy();
      warmPrepare(url).catch(()=>{});loadMp3Engine().catch(()=>{});
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);reset();setStatus(e.message||text('Gagal mengecek link.','Failed to check link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }

  async function pollJob(jobId,run){
    while(run===downloadRun){
      await sleep(650);
      const r=await fetch(`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;
      if(!r.ok)throw new Error(data.detail||text('Proses MP3 gagal.','MP3 process failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan MP3','Preparing MP3'));
      if(data.state==='ready'){
        setProgress(100,text('Selesai','Done'));frame.src=`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;
        downloadBtn.disabled=false;updateModeCopy();setTimeout(()=>{if(run===downloadRun)hideProgress()},2200);return;
      }
      if(data.state==='error')throw new Error(data.error||text('Proses MP3 gagal.','MP3 process failed.'));
    }
  }

  async function downloadMp3ServerFallback(run){
    setProgress(3,text('Mencoba jalur cadangan','Trying fallback path'));
    const r=await fetch(`${RVL_API}/api/mp3/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:'audio'}),cache:'no-store'});
    const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai MP3.','Could not start MP3 processing.'));
    await pollJob(data.job_id,run);
  }

  async function downloadFast(run){
    setProgress(12,text('Menyiapkan audio','Preparing audio'),{indeterminate:true});
    const data=await warmPrepare(current.url);if(run!==downloadRun)return;
    setProgress(100,text('Download dimulai','Download started'));
    frame.src=`${RVL_API}/api/audio/chunked/${encodeURIComponent(data.token)}?_=${Date.now()}`;
    downloadBtn.disabled=false;updateModeCopy();setTimeout(()=>{if(run===downloadRun)hideProgress()},1600);
  }

  async function fetchAudioBlob(token,run){
    const r=await fetch(`${RVL_API}/api/audio/chunked/${encodeURIComponent(token)}?_=${Date.now()}`,{cache:'no-store',mode:'cors'});
    if(!r.ok)throw new Error(text('Gagal mengambil audio sumber.','Failed to fetch source audio.'));
    if(!r.body){const blob=await r.blob();if(run!==downloadRun)throw abortError();return blob}
    const total=Number(r.headers.get('content-length'))||0;
    const type=r.headers.get('content-type')||'audio/mp4';
    const reader=r.body.getReader();const chunks=[];let received=0;
    while(true){
      if(run!==downloadRun){try{await reader.cancel()}catch{}throw abortError()}
      const {done,value}=await reader.read();if(done)break;
      chunks.push(value);received+=value.byteLength;
      if(total)setProgress(12+(received/total)*34,text('Mengambil audio','Fetching audio'));
      else setProgress(26,text('Mengambil audio','Fetching audio'),{indeterminate:true});
    }
    return new Blob(chunks,{type});
  }

  function saveMp3(blob){
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`${safeName(current?.data?.title)}.mp3`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  async function downloadMp3Local(run){
    setProgress(5,text('Menyiapkan audio','Preparing audio'),{indeterminate:true});
    const [prepared,mb]=await Promise.all([warmPrepare(current.url),loadMp3Engine()]);
    if(run!==downloadRun)return;
    const sourceBlob=await fetchAudioBlob(prepared.token,run);if(run!==downloadRun)return;
    setProgress(48,text('Menyiapkan MP3','Preparing MP3'));
    const file=new File([sourceBlob],prepared.filename||'source.m4a',{type:sourceBlob.type||'audio/mp4'});
    const mbInput=new mb.Input({source:new mb.BlobSource(file),formats:mb.ALL_FORMATS});
    const target=new mb.BufferTarget();
    const output=new mb.Output({format:new mb.Mp3OutputFormat(),target});
    const conversion=await mb.Conversion.init({input:mbInput,output,audio:{bitrate:192000}});
    if(!conversion.isValid)throw new Error(text('Browser ini nggak bisa menyiapkan MP3 tersebut.','This browser cannot prepare this MP3.'));
    activeConversion=conversion;
    conversion.onProgress=(p)=>{if(run===downloadRun)setProgress(48+Math.max(0,Math.min(1,p))*49,text('Menyiapkan MP3','Preparing MP3'))};
    try{await conversion.execute()}finally{if(activeConversion===conversion)activeConversion=null}
    if(run!==downloadRun)throw abortError();
    if(!target.buffer)throw new Error(text('Hasil MP3 kosong.','MP3 output is empty.'));
    const result=new Blob([target.buffer],{type:'audio/mpeg'});
    setProgress(100,text('Selesai','Done'));saveMp3(result);setStatus(text('MP3 selesai.','MP3 ready.'));
    downloadBtn.disabled=false;updateModeCopy();setTimeout(()=>{if(run===downloadRun)hideProgress()},1800);
  }

  async function downloadMp3(run){
    try{await downloadMp3Local(run)}
    catch(e){
      if(run!==downloadRun||e?.name==='AbortError')return;
      console.warn('Primary MP3 path failed, using fallback.',e);
      setStatus(text('Jalur utama gagal, mencoba jalur cadangan.','Primary path failed, trying the fallback path.'));
      await downloadMp3ServerFallback(run);
    }
  }

  async function download(){
    if(!current)return;const run=++downloadRun;setStatus('');cancelConversion();downloadBtn.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');
    try{
      if(selectedFast())await downloadFast(run);else await downloadMp3(run);
    }catch(e){if(run!==downloadRun||e?.name==='AbortError')return;console.error(e);hideProgress();setStatus(e.message||text('Download gagal.','Download failed.'),'error');downloadBtn.disabled=false;updateModeCopy()}
  }

  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);
  mode.addEventListener('change',()=>{++downloadRun;cancelConversion();hideProgress();setStatus('');updateModeCopy();if(!selectedFast())loadMp3Engine().catch(()=>{})});
  input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});
  input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;cancelConversion();if(inspectController)inspectController.abort();reset();setStatus('')}});
  window.addEventListener('reyval:lang',applyStaticCopy);applyStaticCopy();
})();