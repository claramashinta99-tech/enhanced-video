(()=>{
  const RVL_API='https://rvl-api.onrender.com';
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url');
  const inspectBtn=qs('#inspect-btn');
  const card=qs('#media-card');
  const statusEl=qs('#download-status');
  const thumb=qs('#media-thumb');
  const titleEl=qs('#media-title');
  const metaEl=qs('#media-meta');
  const downloadBtn=qs('#download-btn');
  if(!input||!inspectBtn||!card||!statusEl||!downloadBtn)return;

  let current=null;
  let inspectRun=0;
  let inspectController=null;
  let downloadRun=0;

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
      .mp3-format{display:flex;align-items:center;min-height:44px;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:0 13px;font-size:13px}
      .download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
      .rvl-job-progress.show{display:block}.rvl-job-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#8d8d94}
      .rvl-job-head strong{color:#c9c9ce;font-weight:600}.rvl-job-track{height:7px;border-radius:999px;background:#1a1a1d;overflow:hidden;border:1px solid rgba(255,255,255,.04)}
      .rvl-job-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#63c8ff,#8b7cff);box-shadow:0 0 16px rgba(139,124,255,.18);transition:width .28s ease}
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
  function applyStaticCopy(){
    const en=lang()==='en';const sub=qs('#page-sub');
    if(sub)sub.textContent=en?'Paste a YouTube link and convert the audio to MP3.':'Tempel link YouTube, lalu convert audionya ke MP3.';
    input.placeholder=en?'Paste YouTube link':'Tempel link YouTube';inspectBtn.textContent=en?'Check':'Cek';if(!downloadBtn.disabled)downloadBtn.textContent='Download MP3';
  }
  function reset(){current=null;card.classList.remove('show');downloadBtn.disabled=true;thumb?.removeAttribute('src');if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';hideProgress()}

  async function inspect(){
    const url=input.value.trim();const run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();reset();setStatus('');
    if(!valid(url)){setStatus(text('Tempel link YouTube yang valid.','Paste a valid YouTube link.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;setProgress(25,text('Mengecek link','Checking link'),{indeterminate:true});
    try{
      const r=await fetch(`${RVL_API}/api/mp3/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
      current={url,data};if(thumb){thumb.src=data.thumbnail||'';thumb.alt=data.title||'Media thumbnail'}if(titleEl)titleEl.textContent=data.title||'Untitled';
      const bits=[];if(data.uploader)bits.push(data.uploader);bits.push('MP3 · 192 kbps');if(metaEl)metaEl.textContent=bits.join(' · ');
      downloadBtn.disabled=false;downloadBtn.textContent='Download MP3';card.classList.add('show');hideProgress();setStatus('');
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);reset();setStatus(e.message||text('Gagal mengecek link.','Failed to check link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }

  async function pollJob(jobId,run){
    while(run===downloadRun){
      await sleep(600);
      const r=await fetch(`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;
      if(!r.ok)throw new Error(data.detail||text('Proses MP3 gagal.','MP3 process failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan MP3','Preparing MP3'));
      if(data.state==='ready'){
        setProgress(100,text('Selesai','Done'));frame.src=`${RVL_API}/api/jobs/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;
        downloadBtn.disabled=false;downloadBtn.textContent='Download MP3';setTimeout(()=>{if(run===downloadRun)hideProgress()},2600);return;
      }
      if(data.state==='error')throw new Error(data.error||text('Convert MP3 gagal.','MP3 conversion failed.'));
    }
  }

  async function download(){
    if(!current)return;const run=++downloadRun;setStatus('');downloadBtn.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');setProgress(3,text('Menyiapkan MP3','Preparing MP3'));
    try{
      const r=await fetch(`${RVL_API}/api/mp3/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:'audio'}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai MP3.','Could not start MP3 conversion.'));
      setProgress(data.progress||3,text('Mulai','Starting'));await pollJob(data.job_id,run);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Convert MP3 gagal.','MP3 conversion failed.'),'error');downloadBtn.disabled=false;downloadBtn.textContent='Download MP3'}
  }

  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});
  input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();reset();setStatus('')}});
  window.addEventListener('reyval:lang',applyStaticCopy);applyStaticCopy();
})();
