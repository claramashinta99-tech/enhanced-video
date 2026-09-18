(()=>{
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url'),inspectBtn=qs('#inspect-btn'),card=qs('#media-card'),statusEl=qs('#download-status'),thumb=qs('#media-thumb'),titleEl=qs('#media-title'),metaEl=qs('#media-meta'),quality=qs('#quality'),downloadBtn=qs('#download-btn'),detected=qs('#detected-platform');
  if(!input||!inspectBtn||!card||!statusEl||!quality||!downloadBtn)return;
  const API='https://enhanced-video-production.up.railway.app';
  let current=null,inspectRun=0,inspectController=null,downloadRun=0;

  if(!document.querySelector('#rvl-universal-style')){
    const css=document.createElement('style');css.id='rvl-universal-style';css.textContent=`
      .universal-wrap{max-width:900px;margin:0 auto}.universal-support{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:22px 0 16px}.universal-platform{border:2px solid #35446a;background:#151d34;box-shadow:3px 3px 0 #070a14;border-radius:5px;padding:11px 8px;text-align:center}.universal-platform img{width:30px;height:30px;display:block;margin:0 auto 7px}.universal-platform b{display:block;font-size:12px}.universal-platform span{display:block;margin-top:4px;color:#aab5d3;font-size:9px;line-height:1.35}.universal-platform.active{border-color:#aa8cff;background:#1c2746}
      .universal-note{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 15px}.universal-note span,.detected-platform{border:1px solid #35446a;background:#10172b;border-radius:3px;padding:5px 7px;color:#aab5d3;font-size:9px}.detected-platform{display:none;margin:12px 0 0;color:#77e8c1;border-color:#315d50;background:#15382e}.detected-platform.show{display:inline-flex}
      .media-card{display:none;margin-top:16px;border-top:2px dashed #35446a;padding-top:18px}.media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}.media-card.show.no-thumb{grid-template-columns:1fr}.media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border:3px solid #070a14;border-radius:4px;background:#0c1224;box-shadow:3px 3px 0 #070a14}.media-card.no-thumb .media-thumb{display:none!important}.media-info{min-width:0}.media-title{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-meta{font-size:11px;color:#aab5d3;margin-top:6px}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}.quality-select{width:100%;border:3px solid #263453;background:#0c1224;color:#fff;border-radius:3px;padding:12px}.download-status-text{margin-top:12px;font-size:11px;color:#aab5d3;min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:2px dashed #35446a}.rvl-job-progress.show{display:block}.rvl-job-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#aab5d3}.rvl-job-track{height:8px;background:#0c1224;border:2px solid #263453;overflow:hidden}.rvl-job-fill{height:100%;width:0;background:linear-gradient(90deg,#6ed8ff,#aa8cff);transition:width .25s ease}.rvl-job-progress.indeterminate .rvl-job-fill{width:42%!important;animation:rvlUniMove 1s steps(8,end) infinite alternate}@keyframes rvlUniMove{from{transform:translateX(-40%)}to{transform:translateX(165%)}}
      @media(max-width:700px){.universal-support{grid-template-columns:repeat(5,minmax(68px,1fr));overflow-x:auto;padding-bottom:4px}.universal-platform{min-width:76px}.universal-platform span{font-size:8px}.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}}@media(max-width:480px){.universal-support{grid-template-columns:repeat(5,78px);justify-content:start}.universal-platform b{font-size:10px}}
    `;document.head.appendChild(css);
  }

  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');frame.id='rvl-download-frame';frame.name='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);
  let progressWrap=qs('#rvl-job-progress');
  if(!progressWrap){progressWrap=document.createElement('div');progressWrap.id='rvl-job-progress';progressWrap.className='rvl-job-progress';progressWrap.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Menyiapkan</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';card.insertAdjacentElement('afterend',progressWrap)}
  const progressStage=qs('#rvl-job-stage'),progressPct=qs('#rvl-job-percent'),progressFill=qs('#rvl-job-fill');
  if(thumb){thumb.referrerPolicy='no-referrer';thumb.decoding='async'}

  const lang=()=>localStorage.getItem('reyval-lang')||'id';
  const text=(id,en)=>lang()==='en'?en:id;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const fmtDuration=s=>{if(!Number.isFinite(Number(s)))return'';s=Math.round(Number(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
  const hostMatches=(h,r)=>h===r||h.endsWith('.'+r);
  function detect(url){
    try{
      const u=new URL(url),h=u.hostname.toLowerCase().replace(/\.$/,'');
      if(hostMatches(h,'tiktok.com'))return {platform:'tiktok',label:'TikTok',family:'core'};
      if(hostMatches(h,'youtube.com')||h==='youtu.be')return {platform:'youtube',label:'YouTube',family:'core'};
      if(hostMatches(h,'instagram.com'))return {platform:'instagram',label:'Instagram',family:'social'};
      if(hostMatches(h,'facebook.com')||hostMatches(h,'fb.watch'))return {platform:'facebook',label:'Facebook',family:'social'};
      if(hostMatches(h,'x.com')||hostMatches(h,'twitter.com'))return {platform:'x',label:'X',family:'social'};
    }catch{}
    return null;
  }
  function setStatus(msg='',type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
  function setProgress(value=0,stage='',opts={}){const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));progressWrap.classList.add('show');progressWrap.classList.toggle('indeterminate',!!opts.indeterminate);progressFill.style.width=`${pct}%`;progressPct.textContent=opts.indeterminate?'':`${pct}%`;progressStage.textContent=stage||text('Menyiapkan','Preparing')}
  function hideProgress(){progressWrap.classList.remove('show','indeterminate');progressFill.style.width='0%';progressPct.textContent='0%'}
  function highlight(platform=''){document.querySelectorAll('.universal-platform').forEach(el=>el.classList.toggle('active',el.dataset.platform===platform))}
  function reset(){current=null;card.classList.remove('show','no-thumb');quality.innerHTML='';quality.disabled=true;downloadBtn.disabled=true;if(thumb){thumb.onerror=null;thumb.onload=null;thumb.removeAttribute('src')}if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';detected?.classList.remove('show');highlight('');hideProgress()}
  function setThumb(url,title){if(!thumb)return;if(!url){card.classList.add('no-thumb');return}card.classList.remove('no-thumb');thumb.alt=title||'Media thumbnail';thumb.onerror=()=>{card.classList.add('no-thumb');thumb.removeAttribute('src')};thumb.onload=()=>card.classList.remove('no-thumb');thumb.src=url}
  function applyCopy(){const en=lang()==='en',sub=qs('#page-sub');if(sub)sub.textContent=en?'Paste one supported link. RVL detects the platform automatically.':'Tempel satu link yang didukung. RVL otomatis deteksi platform.';input.placeholder=en?'Paste TikTok, YouTube, Instagram, Facebook, or X link':'Tempel link TikTok, YouTube, Instagram, Facebook, atau X';inspectBtn.textContent=en?'Check':'Cek';if(!downloadBtn.disabled)downloadBtn.textContent='Download'}

  async function inspect(){
    const url=input.value.trim(),kind=detect(url),run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();reset();setStatus('');
    if(!kind){setStatus(text('Link belum didukung. Pakai TikTok, YouTube, Instagram, Facebook, atau X.','Unsupported link. Use TikTok, YouTube, Instagram, Facebook, or X.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;highlight(kind.platform);setProgress(24,text('Mendeteksi & membaca link','Detecting & reading link'),{indeterminate:true});
    try{
      const infoPath=kind.family==='social'?'/api/social/info':'/api/info';
      const r=await fetch(API+infoPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
      if(kind.family==='social'&&data.platform!==kind.platform)throw new Error(text('Platform tidak cocok.','Platform mismatch.'));
      current={url,kind,data};setThumb(data.thumbnail,data.title);titleEl.textContent=data.title||'Untitled';
      const bits=[kind.label];if(data.uploader)bits.push(data.uploader);if(data.duration)bits.push(fmtDuration(data.duration));if(data.max_height)bits.push(`max ${data.max_height}p`);metaEl.textContent=bits.join(' · ');
      const choices=(data.choices||[]).filter(x=>x&&x.id!=='audio');if(!choices.length)choices.push({id:'best',label:'Best quality'});
      choices.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.label;quality.appendChild(o)});
      quality.disabled=false;downloadBtn.disabled=false;downloadBtn.textContent='Download';card.classList.add('show');if(detected){detected.textContent=text(`Terdeteksi: ${kind.label}`,`Detected: ${kind.label}`);detected.classList.add('show')}hideProgress();
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);reset();setStatus(e.message||text('Gagal membaca link.','Failed to read link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }
  async function poll(jobId,run,family){
    const base=family==='social'?'/api/social/jobs':'/api/jobs';
    while(run===downloadRun){
      await sleep(650);const r=await fetch(`${API}${base}/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok)throw new Error(data.detail||text('Proses download gagal.','Download failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan','Preparing'));
      if(data.state==='ready'){setProgress(100,text('Selesai','Done'));frame.src=`${API}${base}/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download';setTimeout(()=>{if(run===downloadRun)hideProgress()},2400);return}
      if(data.state==='error')throw new Error(data.error||text('Download gagal.','Download failed.'));
    }
  }
  async function download(){
    if(!current)return;const run=++downloadRun,family=current.kind.family,jobPath=family==='social'?'/api/social/jobs':'/api/jobs';
    downloadBtn.disabled=true;quality.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');setProgress(3,text('Mulai proses','Starting'));setStatus('');
    try{
      const r=await fetch(API+jobPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:quality.value||'best'}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai proses.','Could not start processing.'));await poll(data.job_id,run,family);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download gagal.','Download failed.'),'error');downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download'}
  }
  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});input.addEventListener('input',()=>{const kind=detect(input.value.trim());if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();reset()}highlight(kind?.platform||'')});
  window.addEventListener('reyval:lang',applyCopy);applyCopy();
  const initial=new URLSearchParams(location.search).get('url');if(initial){input.value=initial;const kind=detect(initial);highlight(kind?.platform||'');setTimeout(inspect,0)}
})();