(()=>{
  const RVL_API='https://rvl-api.onrender.com';
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url'),inspectBtn=qs('#inspect-btn'),card=qs('#media-card'),statusEl=qs('#download-status');
  const thumb=qs('#media-thumb'),titleEl=qs('#media-title'),metaEl=qs('#media-meta'),quality=qs('#quality'),downloadBtn=qs('#download-btn');
  if(!input||!inspectBtn||!card||!statusEl||!quality||!downloadBtn)return;

  let current=null,inspectRun=0,downloadRun=0,inspectController=null;

  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');frame.id='rvl-download-frame';frame.name='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);

  let progressWrap=qs('#rvl-job-progress');
  if(!progressWrap){
    progressWrap=document.createElement('div');progressWrap.id='rvl-job-progress';progressWrap.className='rvl-job-progress';
    progressWrap.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Menyiapkan</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';
    card.insertAdjacentElement('afterend',progressWrap);
  }
  const progressStage=qs('#rvl-job-stage'),progressPct=qs('#rvl-job-percent'),progressFill=qs('#rvl-job-fill');

  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function text(id,en){return lang()==='en'?en:id}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function fmtDuration(s){s=Number(s);if(!Number.isFinite(s))return'';s=Math.round(s);const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`}
  function setStatus(msg='',type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
  function canonicalShort(raw){
    try{
      const u=new URL(raw);
      const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
      if(host!=='youtube.com')return null;
      const m=u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if(!m)return null;
      return `https://www.youtube.com/watch?v=${m[1]}`;
    }catch{return null}
  }
  function setProgress(value=0,stage='',opts={}){
    const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    progressWrap.classList.add('show');progressWrap.classList.toggle('indeterminate',!!opts.indeterminate);
    progressFill.style.width=`${pct}%`;progressPct.textContent=opts.indeterminate?'':`${pct}%`;
    progressStage.textContent=stage||text('Menyiapkan','Preparing');
  }
  function hideProgress(){progressWrap.classList.remove('show','indeterminate');progressFill.style.width='0%';progressPct.textContent='0%'}
  function reset(){current=null;card.classList.remove('show');downloadBtn.disabled=true;quality.disabled=true;quality.innerHTML='';thumb?.removeAttribute('src');if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';hideProgress()}
  function applyStaticCopy(){
    const en=lang()==='en',sub=qs('#page-sub');
    if(sub)sub.textContent=en?'Paste a YouTube Shorts link, check it, then choose the available video quality.':'Tempel link YouTube Shorts, cek videonya, lalu pilih kualitas yang tersedia.';
    input.placeholder=en?'Paste YouTube Shorts link':'Tempel link YouTube Shorts';inspectBtn.textContent=en?'Check':'Cek';if(!downloadBtn.disabled)downloadBtn.textContent='Download';
  }

  async function inspect(){
    const raw=input.value.trim(),apiUrl=canonicalShort(raw),run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();reset();setStatus('');
    if(!apiUrl){setStatus(text('Tempel link youtube.com/shorts/... yang valid.','Paste a valid youtube.com/shorts/... link.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;setProgress(22,text('Mengecek Shorts','Checking Short'),{indeterminate:true});
    try{
      const r=await fetch(`${RVL_API}/api/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:apiUrl}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Shorts nggak bisa dibaca.','Could not read this Short.'));
      current={raw,apiUrl,data};
      if(thumb){thumb.src=data.thumbnail||'';thumb.alt=data.title||'Short thumbnail'}if(titleEl)titleEl.textContent=data.title||'Untitled';
      const bits=[];if(data.uploader)bits.push(data.uploader);if(data.duration)bits.push(fmtDuration(data.duration));bits.push('Shorts');if(data.max_height)bits.push(`max ${data.max_height}p`);if(metaEl)metaEl.textContent=bits.join(' · ');
      const choices=(data.choices||[]).filter(c=>c.id!=='audio');if(!choices.length)throw new Error(text('Kualitas video Shorts tidak ditemukan.','No Shorts video quality found.'));
      choices.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;quality.appendChild(o)});
      quality.disabled=false;downloadBtn.disabled=false;downloadBtn.textContent='Download';card.classList.add('show');hideProgress();
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);reset();setStatus(e.message||text('Gagal mengecek Shorts.','Failed to check Short.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }

  async function pollJob(jobId,run){
    while(run===downloadRun){
      await sleep(650);
      const r=await fetch(`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok)throw new Error(data.detail||text('Proses Shorts gagal.','Shorts download failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan','Preparing'));
      if(data.state==='ready'){
        setProgress(100,text('Selesai','Done'));frame.src=`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;
        downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download';setTimeout(()=>{if(run===downloadRun)hideProgress()},2600);return;
      }
      if(data.state==='error')throw new Error(data.error||text('Download Shorts gagal.','Shorts download failed.'));
    }
  }

  async function download(){
    if(!current)return;
    const run=++downloadRun,selected=quality.value;setStatus('');downloadBtn.disabled=true;quality.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');setProgress(3,text('Mulai proses','Starting'));
    try{
      const r=await fetch(`${RVL_API}/api/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.apiUrl,quality:selected}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai Shorts.','Could not start Shorts download.'));
      setProgress(data.progress||3,text('Antrean','Queued'));await pollJob(data.job_id,run);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download Shorts gagal.','Shorts download failed.'),'error');downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download'}
  }

  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});
  input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.raw){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();reset();setStatus('')}});
  window.addEventListener('reyval:lang',applyStaticCopy);applyStaticCopy();
})();