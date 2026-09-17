(()=>{
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url'),inspectBtn=qs('#inspect-btn'),card=qs('#media-card'),statusEl=qs('#download-status'),thumb=qs('#media-thumb'),titleEl=qs('#media-title'),metaEl=qs('#media-meta'),quality=qs('#quality'),downloadBtn=qs('#download-btn');
  if(!input||!inspectBtn||!card||!statusEl||!quality||!downloadBtn)return;

  const API='https://enhanced-video-production.up.railway.app';
  const platform=document.body.dataset.platform||'facebook';
  const LABEL={facebook:'Facebook',instagram:'Instagram',x:'X'}[platform]||'Social';
  let current=null,inspectRun=0,inspectController=null,downloadRun=0;

  if(!document.querySelector('#rvl-social-downloader-style')){
    const css=document.createElement('style');css.id='rvl-social-downloader-style';css.textContent=`
      .media-card{display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:16px}.media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}.media-card.show.no-thumb{grid-template-columns:1fr}
      .media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:13px;background:#171717;border:1px solid var(--line)}.media-card.no-thumb .media-thumb{display:none!important}.media-info{min-width:0}.media-title{font-weight:700;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-meta{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}
      .quality-select{width:100%;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:12px 13px;outline:none}.quality-select:disabled{opacity:.5}.download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.rvl-job-progress.show{display:block}.rvl-job-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#8d8d94}.rvl-job-head strong{color:#c9c9ce;font-weight:600}.rvl-job-track{height:7px;border-radius:999px;background:#1a1a1d;overflow:hidden;border:1px solid rgba(255,255,255,.04)}.rvl-job-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#63c8ff,#8b7cff);box-shadow:0 0 16px rgba(139,124,255,.18);transition:width .28s ease}.rvl-job-progress.indeterminate .rvl-job-fill{width:42%!important;animation:rvlJobIndeterminate 1.05s ease-in-out infinite alternate}@keyframes rvlJobIndeterminate{from{transform:translateX(-40%)}to{transform:translateX(165%)}}
      @media(max-width:600px){.media-card.show{grid-template-columns:92px 1fr}.media-card.show.no-thumb{grid-template-columns:1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.download-input-wrap{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.rvl-job-fill{transition:none}.rvl-job-progress.indeterminate .rvl-job-fill{animation:none;width:35%!important}}
    `;document.head.appendChild(css);
  }

  if(thumb){thumb.referrerPolicy='no-referrer';thumb.decoding='async'}
  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');frame.name='rvl-download-frame';frame.id='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);
  let progressWrap=qs('#rvl-job-progress');if(!progressWrap){progressWrap=document.createElement('div');progressWrap.id='rvl-job-progress';progressWrap.className='rvl-job-progress';progressWrap.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Menyiapkan</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';card.insertAdjacentElement('afterend',progressWrap)}
  const progressStage=qs('#rvl-job-stage'),progressPct=qs('#rvl-job-percent'),progressFill=qs('#rvl-job-fill');

  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function text(id,en){return lang()==='en'?en:id}
  function fmtDuration(s){if(!Number.isFinite(Number(s)))return'';s=Math.round(Number(s));const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function setStatus(msg='',type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
  function hostMatches(host,root){return host===root||host.endsWith('.'+root)}
  function validForPlatform(url){
    try{
      const u=new URL(url),h=u.hostname.toLowerCase().replace(/\.$/,'');
      if(platform==='facebook')return hostMatches(h,'facebook.com')||hostMatches(h,'fb.watch');
      if(platform==='instagram')return hostMatches(h,'instagram.com');
      if(platform==='x')return hostMatches(h,'x.com')||hostMatches(h,'twitter.com');
      return false;
    }catch{return false}
  }
  function setProgress(value=0,stage='',opts={}){const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));progressWrap.classList.add('show');progressWrap.classList.toggle('indeterminate',!!opts.indeterminate);progressFill.style.width=`${pct}%`;progressPct.textContent=opts.indeterminate?'':`${pct}%`;progressStage.textContent=stage||text('Menyiapkan','Preparing')}
  function hideProgress(){progressWrap.classList.remove('show','indeterminate');progressFill.style.width='0%';progressPct.textContent='0%'}
  function applyStaticCopy(){
    const en=lang()==='en';
    const sub=qs('#page-sub');
    if(sub)sub.textContent=en?`Paste a public ${LABEL} video link, check it, then download.`:`Tempel link video ${LABEL} publik, cek videonya, lalu download.`;
    input.placeholder=en?`Paste ${LABEL} video link`:`Tempel link video ${LABEL}`;
    inspectBtn.textContent=en?'Check':'Cek';
    if(!downloadBtn.disabled)downloadBtn.textContent='Download';
    if(!current)setStatus('');
  }
  function resetMediaCard(){current=null;card.classList.remove('show','no-thumb');downloadBtn.disabled=true;quality.disabled=true;if(thumb){thumb.onerror=null;thumb.onload=null;thumb.removeAttribute('src');thumb.style.display=''}if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';quality.innerHTML='';hideProgress()}
  function setThumbnail(url,title){if(!thumb)return;if(!url){card.classList.add('no-thumb');thumb.removeAttribute('src');return}card.classList.remove('no-thumb');thumb.style.display='';thumb.alt=title||'Media thumbnail';thumb.onerror=()=>{card.classList.add('no-thumb');thumb.removeAttribute('src')};thumb.onload=()=>card.classList.remove('no-thumb');thumb.src=url}

  async function inspect(){
    const url=input.value.trim();const run=++inspectRun;++downloadRun;if(inspectController)inspectController.abort();inspectController=new AbortController();resetMediaCard();setStatus('');
    if(!validForPlatform(url)){setStatus(text(`Tempel link ${LABEL} yang valid.`,`Paste a valid ${LABEL} link.`),'error');return}
    inspectBtn.disabled=true;input.disabled=true;setProgress(25,text('Mengecek link','Checking link'),{indeterminate:true});
    try{
      const r=await fetch(`${API}/api/social/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
      if(data.platform!==platform)throw new Error(text('Link tidak cocok dengan tool ini.','This link does not match this tool.'));
      current={url,data};setThumbnail(data.thumbnail,data.title);if(titleEl)titleEl.textContent=data.title||'Untitled';
      const bits=[];if(data.uploader)bits.push(data.uploader);if(data.duration)bits.push(fmtDuration(data.duration));if(data.max_height)bits.push(`max ${data.max_height}p`);if(metaEl)metaEl.textContent=bits.join(' · ');
      const choices=(data.choices||[]);if(!choices.length)choices.push({id:'best',label:'Best quality'});choices.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;quality.appendChild(o)});
      quality.disabled=false;downloadBtn.disabled=false;downloadBtn.textContent='Download';card.classList.add('show');hideProgress();setStatus('');
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);resetMediaCard();setStatus(e.message||text('Gagal mengecek link.','Failed to check link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }

  async function pollJob(jobId,run){
    while(run===downloadRun){
      await sleep(650);
      const r=await fetch(`${API}/api/social/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;
      if(!r.ok)throw new Error(data.detail||text('Proses download gagal.','Download process failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan','Preparing'));
      if(data.state==='ready'){setProgress(100,text('Selesai','Done'));frame.src=`${API}/api/social/jobs/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download';setTimeout(()=>{if(run===downloadRun)hideProgress()},2600);return}
      if(data.state==='error')throw new Error(data.error||text('Download gagal.','Download failed.'));
    }
  }
  async function download(){
    if(!current)return;const run=++downloadRun;const selected=quality.value;setStatus('');downloadBtn.disabled=true;quality.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');setProgress(3,text('Mulai proses','Starting'));
    try{
      const r=await fetch(`${API}/api/social/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:selected}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai proses.','Could not start processing.'));
      setProgress(data.progress||3,text('Antrean','Queued'));await pollJob(data.job_id,run);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download gagal.','Download failed.'),'error');downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download'}
  }

  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();resetMediaCard();setStatus('')}});window.addEventListener('reyval:lang',applyStaticCopy);applyStaticCopy();
})();
