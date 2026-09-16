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
  const quality=qs('#quality');
  const downloadBtn=qs('#download-btn');
  if(!input||!inspectBtn||!card||!statusEl||!quality||!downloadBtn)return;

  const platform=document.body.dataset.platform||'youtube';
  let current=null;
  let inspectRun=0;
  let inspectController=null;
  let downloadRun=0;

  if(!document.querySelector('#rvl-downloader-style')){
    const css=document.createElement('style');
    css.id='rvl-downloader-style';
    css.textContent=`
      .media-card{display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:16px}
      .media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}
      .media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:13px;background:#171717;border:1px solid var(--line)}
      .media-info{min-width:0}.media-title{font-weight:700;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .media-meta{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}
      .quality-select{width:100%;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:12px 13px;outline:none}.quality-select:disabled{opacity:.5}
      .download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-stream-progress{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
      .rvl-stream-progress.show{display:block}.rvl-stream-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#8d8d94}
      .rvl-stream-head strong{color:#c9c9ce;font-weight:600}.rvl-stream-track{height:7px;border-radius:999px;background:#1a1a1d;overflow:hidden;border:1px solid rgba(255,255,255,.04)}
      .rvl-stream-fill{height:100%;width:38%;border-radius:inherit;background:linear-gradient(90deg,#63c8ff,#8b7cff);box-shadow:0 0 16px rgba(139,124,255,.18);animation:rvlStream 1.05s ease-in-out infinite alternate}
      @keyframes rvlStream{from{transform:translateX(-55%)}to{transform:translateX(215%)}}
      .rvl-stream-progress.ready .rvl-stream-fill{width:100%;transform:none;animation:none;transition:width .18s ease}
      @media(max-width:600px){.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.download-input-wrap{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.rvl-stream-fill{animation:none;transform:none;width:45%}.rvl-stream-progress.ready .rvl-stream-fill{width:100%}}
    `;
    document.head.appendChild(css);
  }

  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');
  frame.name='rvl-download-frame';frame.id='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);

  let progressWrap=qs('#rvl-stream-progress');
  if(!progressWrap){
    progressWrap=document.createElement('div');
    progressWrap.id='rvl-stream-progress';
    progressWrap.className='rvl-stream-progress';
    progressWrap.innerHTML='<div class="rvl-stream-head"><strong id="rvl-stream-stage">Menyiapkan</strong><span id="rvl-stream-state"></span></div><div class="rvl-stream-track"><div class="rvl-stream-fill"></div></div>';
    card.insertAdjacentElement('afterend',progressWrap);
  }
  const progressStage=qs('#rvl-stream-stage');
  const progressState=qs('#rvl-stream-state');

  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function text(id,en){return lang()==='en'?en:id}
  function fmtDuration(s){if(!Number.isFinite(Number(s)))return'';s=Math.round(Number(s));const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function setStatus(msg='',type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
  function validForPlatform(url){try{const h=new URL(url).hostname.toLowerCase();return platform==='youtube'?(/(^|\.)youtube\.com$/.test(h)||h==='youtu.be'):(/(^|\.)tiktok\.com$/.test(h));}catch{return false}}
  function showProgress(stage,state=''){
    progressWrap.classList.add('show');progressWrap.classList.remove('ready');
    progressStage.textContent=stage||text('Menyiapkan','Preparing');progressState.textContent=state;
  }
  function markReady(){progressWrap.classList.add('show','ready');progressStage.textContent=text('Download dimulai','Download started');progressState.textContent=''}
  function hideProgress(){progressWrap.classList.remove('show','ready');progressState.textContent=''}

  function applyStaticCopy(){
    const en=lang()==='en';const sub=qs('#page-sub');
    if(sub)sub.textContent=en?`Paste a ${platform==='youtube'?'YouTube':'TikTok'} link, check it, then choose the quality.`:`Tempel link ${platform==='youtube'?'YouTube':'TikTok'}, cek videonya, lalu pilih kualitas.`;
    input.placeholder=en?`Paste ${platform==='youtube'?'YouTube':'TikTok'} link`:`Tempel link ${platform==='youtube'?'YouTube':'TikTok'}`;
    inspectBtn.textContent=en?'Check':'Cek';
    if(!downloadBtn.disabled)downloadBtn.textContent='Download';
    if(!current)setStatus('');
  }

  function renderMeta(data){
    const bits=[];
    if(data.uploader)bits.push(data.uploader);
    if(data.duration)bits.push(fmtDuration(data.duration));
    if(platform==='youtube'&&data.max_height)bits.push(`max ${data.max_height}p`);
    if(metaEl)metaEl.textContent=bits.join(' · ');
  }

  function renderChoices(list,preserve=true){
    const old=preserve?quality.value:'';
    quality.innerHTML='';
    (list||[]).forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;quality.appendChild(o)});
    if(old&&[...quality.options].some(o=>o.value===old))quality.value=old;
  }

  function renderMedia(data,preserveChoice=false){
    if(thumb){thumb.src=data.thumbnail||'';thumb.alt=data.title||'Media thumbnail'}
    if(titleEl)titleEl.textContent=data.title||'Untitled';
    renderMeta(data);renderChoices(data.choices||[],preserveChoice);
    quality.disabled=false;downloadBtn.disabled=false;downloadBtn.textContent='Download';card.classList.add('show');
  }

  function resetMediaCard(){
    current=null;card.classList.remove('show');downloadBtn.disabled=true;quality.disabled=true;thumb?.removeAttribute('src');
    if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';quality.innerHTML='';hideProgress();
  }

  async function pollYoutubeScan(run,url){
    for(let i=0;i<36&&run===inspectRun;i++){
      await sleep(600);
      if(run!==inspectRun||!current||current.url!==url)return;
      try{
        const r=await fetch(`${RVL_API}/api/quick-info/status?url=${encodeURIComponent(url)}&_=${Date.now()}`,{cache:'no-store'});
        const data=await r.json().catch(()=>({}));
        if(run!==inspectRun||!current||current.url!==url)return;
        if(data.ready){
          current.data=data;renderMedia(data,true);return;
        }
        if(data.failed)return;
      }catch{return}
    }
  }

  async function inspect(){
    const url=input.value.trim();const run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();resetMediaCard();setStatus('');
    if(!validForPlatform(url)){setStatus(text(platform==='youtube'?'Tempel link YouTube yang valid.':'Tempel link TikTok yang valid.',platform==='youtube'?'Paste a valid YouTube link.':'Paste a valid TikTok link.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;showProgress(text('Mengecek','Checking'));
    try{
      const endpoint=platform==='youtube'?'/api/quick-info':'/api/info';
      const r=await fetch(`${RVL_API}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
      current={url,data};renderMedia(data,false);hideProgress();setStatus('');
      if(platform==='youtube'&&!data.scan_ready)pollYoutubeScan(run,url);
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);resetMediaCard();setStatus(e.message||text('Gagal mengecek link.','Failed to check link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }

  async function download(){
    if(!current)return;const run=++downloadRun;const selected=quality.value;
    setStatus('');downloadBtn.disabled=true;quality.disabled=true;downloadBtn.textContent=text('Menyiapkan…','Preparing…');
    showProgress(text(selected==='audio'?'Menyiapkan MP3':'Menyiapkan download',selected==='audio'?'Preparing MP3':'Preparing download'));
    try{
      const r=await fetch(`${RVL_API}/api/stream/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:selected}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;
      if(!r.ok||!data.token)throw new Error(data.detail||text('Gagal menyiapkan download.','Could not prepare download.'));
      markReady();
      frame.src=`${RVL_API}/api/stream/${encodeURIComponent(data.token)}?_=${Date.now()}`;
      downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download';
      setTimeout(()=>{if(run===downloadRun)hideProgress()},1400);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download gagal.','Download failed.'),'error');downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download'}
  }

  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});
  input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();resetMediaCard();setStatus('')}});
  window.addEventListener('reyval:lang',applyStaticCopy,{once:true});applyStaticCopy();
})();