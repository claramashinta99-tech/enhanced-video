(()=>{
  const qs=s=>document.querySelector(s);
  const input=qs('#media-url'),inspectBtn=qs('#inspect-btn'),card=qs('#media-card'),statusEl=qs('#download-status'),thumb=qs('#media-thumb'),titleEl=qs('#media-title'),metaEl=qs('#media-meta'),quality=qs('#quality'),downloadBtn=qs('#download-btn'),detected=qs('#detected-platform');
  if(!input||!inspectBtn||!card||!statusEl||!quality||!downloadBtn)return;
  const RAILWAY='https://enhanced-video-production.up.railway.app';
  const RENDER='https://rvl-api.onrender.com';
  const apiFor=kind=>kind?.platform==='youtube'?RENDER:RAILWAY;
  let current=null,inspectRun=0,inspectController=null,downloadRun=0;

  if(!document.querySelector('#rvl-universal-style')){
    const css=document.createElement('style');css.id='rvl-universal-style';css.textContent=`
      .universal-wrap{max-width:900px;margin:0 auto}.universal-support{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:22px 0 16px}.universal-platform{border:2px solid #35446a;background:#151d34;box-shadow:3px 3px 0 #070a14;border-radius:5px;padding:11px 8px;text-align:center}.universal-platform img{width:30px;height:30px;display:block;margin:0 auto 7px}.universal-platform b{display:block;font-size:12px}.universal-platform span{display:block;margin-top:4px;color:#aab5d3;font-size:9px;line-height:1.35}.universal-platform.active{border-color:#aa8cff;background:#1c2746}
      .universal-note{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 15px}.universal-note span,.detected-platform{border:1px solid #35446a;background:#10172b;border-radius:3px;padding:5px 7px;color:#aab5d3;font-size:9px}.detected-platform{display:none;margin:12px 0 0;color:#77e8c1;border-color:#315d50;background:#15382e}.detected-platform.show{display:inline-flex}
      .media-card{display:none;margin-top:16px;border-top:2px dashed #35446a;padding-top:18px}.media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}.media-card.show.no-thumb{grid-template-columns:1fr}.media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border:3px solid #070a14;border-radius:4px;background:#0c1224;box-shadow:3px 3px 0 #070a14}.media-card.no-thumb .media-thumb{display:none!important}.media-info{min-width:0}.media-title{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-meta{font-size:11px;color:#aab5d3;margin-top:6px}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}.quality-select{width:100%;border:3px solid #263453;background:#0c1224;color:#fff;border-radius:3px;padding:12px}.download-status-text{margin-top:12px;font-size:11px;color:#aab5d3;min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}
      .rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:2px dashed #35446a}.rvl-job-progress.show{display:block}.rvl-job-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#aab5d3}.rvl-job-track{height:8px;background:#0c1224;border:2px solid #263453;overflow:hidden}.rvl-job-fill{height:100%;width:0;background:linear-gradient(90deg,#6ed8ff,#aa8cff);transition:width .25s ease}.rvl-job-progress.indeterminate .rvl-job-fill{width:42%!important;animation:rvlUniMove 1s steps(8,end) infinite alternate}@keyframes rvlUniMove{from{transform:translateX(-40%)}to{transform:translateX(165%)}}
      .carousel-results{display:none;margin-top:16px;padding-top:16px;border-top:2px dashed #35446a}.carousel-results.show{display:block}.carousel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.carousel-head b{font-size:13px}.carousel-head span{font-size:10px;color:#aab5d3}.carousel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.carousel-item{border:2px solid #35446a;background:#10172b;padding:8px;border-radius:4px}.carousel-preview{width:100%;aspect-ratio:1/1;object-fit:cover;background:#0c1224;border:2px solid #070a14;border-radius:3px}.carousel-item-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;font-size:10px;color:#aab5d3}.carousel-item .btn{width:100%;margin-top:8px;padding:9px 10px;font-size:11px}.carousel-audio-note{margin-top:9px;font-size:10px;color:#77e8c1}.carousel-main-actions{display:flex;gap:8px;margin-top:12px}.carousel-main-actions .btn{flex:1}
      @media(max-width:700px){.universal-support{grid-template-columns:repeat(5,minmax(68px,1fr));overflow-x:auto;padding-bottom:4px}.universal-platform{min-width:76px}.universal-platform span{font-size:8px}.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.carousel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.universal-support{grid-template-columns:repeat(5,78px);justify-content:start}.universal-platform b{font-size:10px}.carousel-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(css);
  }

  document.querySelector('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');frame.id='rvl-download-frame';frame.name='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);
  let progressWrap=qs('#rvl-job-progress');
  if(!progressWrap){progressWrap=document.createElement('div');progressWrap.id='rvl-job-progress';progressWrap.className='rvl-job-progress';progressWrap.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Menyiapkan</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';card.insertAdjacentElement('afterend',progressWrap)}
  const progressStage=qs('#rvl-job-stage'),progressPct=qs('#rvl-job-percent'),progressFill=qs('#rvl-job-fill');
  let carouselWrap=qs('#carousel-results');
  if(!carouselWrap){carouselWrap=document.createElement('section');carouselWrap.id='carousel-results';carouselWrap.className='carousel-results';carouselWrap.innerHTML='<div class="carousel-head"><b id="carousel-title">Carousel</b><span id="carousel-count"></span></div><div id="carousel-grid" class="carousel-grid"></div><div id="carousel-audio-note" class="carousel-audio-note"></div><div class="carousel-main-actions"><button id="carousel-all" class="btn primary" type="button">Download All (.zip)</button></div>';progressWrap.insertAdjacentElement('afterend',carouselWrap)}
  const carouselTitle=qs('#carousel-title'),carouselCount=qs('#carousel-count'),carouselGrid=qs('#carousel-grid'),carouselAudio=qs('#carousel-audio-note'),carouselAll=qs('#carousel-all');
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
  function reset(){current=null;card.classList.remove('show','no-thumb');quality.innerHTML='';quality.disabled=true;quality.style.display='';downloadBtn.disabled=true;downloadBtn.style.display='';if(thumb){thumb.onerror=null;thumb.onload=null;thumb.removeAttribute('src')}if(titleEl)titleEl.textContent='';if(metaEl)metaEl.textContent='';detected?.classList.remove('show');highlight('');hideProgress();carouselWrap.classList.remove('show');carouselGrid.innerHTML='';carouselAudio.textContent='';carouselAll.disabled=false}
  function setThumb(url,title){if(!thumb)return;if(!url){card.classList.add('no-thumb');return}card.classList.remove('no-thumb');thumb.alt=title||'Media thumbnail';thumb.onerror=()=>{card.classList.add('no-thumb');thumb.removeAttribute('src')};thumb.onload=()=>card.classList.remove('no-thumb');thumb.src=url}
  function isCarouselCandidate(url,kind){try{const p=new URL(url).pathname.toLowerCase();if(kind.platform==='tiktok')return p.includes('/photo/')||!p.includes('/video/');if(kind.platform==='instagram')return p.includes('/p/');}catch{}return false}
  function isExplicitTikTokPhoto(url){try{return new URL(url).pathname.toLowerCase().includes('/photo/')}catch{return false}}
  async function fetchJson(path,url,signal,api=RAILWAY){const r=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal,cache:'no-store'});const data=await r.json().catch(()=>({}));return {r,data}}
  function renderCarousel(data,kind,url){current={url,kind,data,mode:'carousel',api:RAILWAY};setThumb(data.thumbnail,data.title);titleEl.textContent=data.title||'Carousel';const bits=[kind.label,`${data.count||0} item`];if(data.uploader)bits.push(data.uploader);metaEl.textContent=bits.join(' · ');quality.style.display='none';downloadBtn.style.display='none';card.classList.add('show');carouselTitle.textContent=kind.platform==='tiktok'?text('TikTok Photo / Slideshow','TikTok Photo / Slideshow'):text('Instagram Carousel','Instagram Carousel');carouselCount.textContent=`${data.count||0} item`;carouselAudio.textContent=data.has_audio?text('Audio asli akan ikut di dalam file ZIP.','Original audio will be included in the ZIP.') : '';carouselGrid.innerHTML='';(data.items||[]).forEach(item=>{const el=document.createElement('article');el.className='carousel-item';const img=document.createElement('img');img.className='carousel-preview';img.alt=`Item ${item.index}`;img.referrerPolicy='no-referrer';if(item.thumbnail)img.src=item.thumbnail;const meta=document.createElement('div');meta.className='carousel-item-meta';meta.innerHTML=`<span>#${item.index}</span><span>${item.kind==='video'?'VIDEO':'PHOTO'}</span>`;const btn=document.createElement('button');btn.className='btn';btn.type='button';btn.textContent=text('Download item','Download item');btn.addEventListener('click',()=>downloadCarousel(item.index,btn));el.append(img,meta,btn);carouselGrid.appendChild(el)});carouselWrap.classList.add('show');if(detected){detected.textContent=text(`Terdeteksi: ${kind.label} · Carousel`,`Detected: ${kind.label} · Carousel`);detected.classList.add('show')}hideProgress()}
  function applyCopy(){const en=lang()==='en',sub=qs('#page-sub');if(sub)sub.textContent=en?'Paste one supported link. RVL detects the platform automatically.':'Tempel satu link yang didukung. RVL otomatis deteksi platform.';input.placeholder=en?'Paste TikTok, YouTube, Instagram, Facebook, or X link':'Tempel link TikTok, YouTube, Instagram, Facebook, atau X';inspectBtn.textContent=en?'Check':'Cek';if(!downloadBtn.disabled)downloadBtn.textContent='Download'}

  async function inspect(){
    const url=input.value.trim(),kind=detect(url),api=apiFor(kind),run=++inspectRun;++downloadRun;
    if(inspectController)inspectController.abort();inspectController=new AbortController();reset();setStatus('');
    if(!kind){setStatus(text('Link belum didukung. Pakai TikTok, YouTube, Instagram, Facebook, atau X.','Unsupported link. Use TikTok, YouTube, Instagram, Facebook, or X.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;highlight(kind.platform);setProgress(24,text('Mendeteksi & membaca link','Detecting & reading link'),{indeterminate:true});
    try{
      let data=null,usedCarousel=false;
      if(isCarouselCandidate(url,kind)){
        const res=await fetchJson('/api/carousel/info',url,inspectController.signal);
        if(run!==inspectRun)return;
        if(res.r.ok){data=res.data;usedCarousel=true}
        else if(kind.platform==='tiktok'&&isExplicitTikTokPhoto(url))throw new Error(res.data.detail||text('TikTok slideshow nggak bisa dibaca.','Could not read TikTok slideshow.'));
      }
      if(!data){
        const infoPath=kind.family==='social'?'/api/social/info':'/api/info';
        const res=await fetchJson(infoPath,url,inspectController.signal,api);
        if(run!==inspectRun)return;
        if(!res.r.ok){
          if(kind.platform==='tiktok'||kind.platform==='instagram'){
            const carouselRes=await fetchJson('/api/carousel/info',url,inspectController.signal);
            if(run!==inspectRun)return;
            if(carouselRes.r.ok){data=carouselRes.data;usedCarousel=true}
            else throw new Error(res.data.detail||carouselRes.data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
          }else throw new Error(res.data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
        }else data=res.data;
      }
      if(usedCarousel){renderCarousel(data,kind,url);return}
      if(kind.family==='social'&&data.platform!==kind.platform)throw new Error(text('Platform tidak cocok.','Platform mismatch.'));
      current={url,kind,data,mode:'video',api};setThumb(data.thumbnail,data.title);titleEl.textContent=data.title||'Untitled';
      const bits=[kind.label];if(data.uploader)bits.push(data.uploader);if(data.duration)bits.push(fmtDuration(data.duration));if(data.max_height)bits.push(`max ${data.max_height}p`);metaEl.textContent=bits.join(' · ');
      const choices=(data.choices||[]).filter(x=>x&&x.id!=='audio');if(!choices.length)choices.push({id:'best',label:'Best quality'});
      choices.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.label;quality.appendChild(o)});
      quality.disabled=false;downloadBtn.disabled=false;downloadBtn.textContent='Download';card.classList.add('show');if(detected){detected.textContent=text(`Terdeteksi: ${kind.label}`,`Detected: ${kind.label}`);detected.classList.add('show')}hideProgress();
    }catch(e){if(e.name==='AbortError'||run!==inspectRun)return;console.error(e);reset();setStatus(e.message||text('Gagal membaca link.','Failed to read link.'),'error')}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }
  async function poll(jobId,run,family,api=RAILWAY){
    const base=family==='social'?'/api/social/jobs':'/api/jobs';
    while(run===downloadRun){
      await sleep(650);const r=await fetch(`${api}${base}/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok)throw new Error(data.detail||text('Proses download gagal.','Download failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan','Preparing'));
      if(data.state==='ready'){setProgress(100,text('Selesai','Done'));frame.src=`${api}${base}/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download';setTimeout(()=>{if(run===downloadRun)hideProgress()},2400);return}
      if(data.state==='error')throw new Error(data.error||text('Download gagal.','Download failed.'));
    }
  }
  async function pollCarousel(jobId,run,button){
    while(run===downloadRun){
      await sleep(650);const r=await fetch(`${RAILWAY}/api/carousel/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok)throw new Error(data.detail||text('Proses carousel gagal.','Carousel download failed.'));
      setProgress(data.progress||0,data.stage||text('Menyiapkan carousel','Preparing carousel'));
      if(data.state==='ready'){setProgress(100,text('Selesai','Done'));frame.src=`${RAILWAY}/api/carousel/jobs/${encodeURIComponent(jobId)}/file?_=${Date.now()}`;if(button){button.disabled=false;button.textContent=button===carouselAll?'Download All (.zip)':text('Download item','Download item')}setTimeout(()=>{if(run===downloadRun)hideProgress()},2400);return}
      if(data.state==='error')throw new Error(data.error||text('Download carousel gagal.','Carousel download failed.'));
    }
  }
  async function downloadCarousel(itemIndex=null,button=carouselAll){
    if(!current||current.mode!=='carousel')return;const run=++downloadRun;button.disabled=true;button.textContent=text('Proses…','Processing…');setStatus('');setProgress(4,text('Mulai carousel','Starting carousel'));
    try{const r=await fetch(RAILWAY+'/api/carousel/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,item:itemIndex}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai carousel.','Could not start carousel download.'));await pollCarousel(data.job_id,run,button)}
    catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download carousel gagal.','Carousel download failed.'),'error');button.disabled=false;button.textContent=button===carouselAll?'Download All (.zip)':text('Download item','Download item')}
  }
  async function download(){
    if(!current)return;const run=++downloadRun,family=current.kind.family,api=current.api||RAILWAY,jobPath=family==='social'?'/api/social/jobs':'/api/jobs';
    downloadBtn.disabled=true;quality.disabled=true;downloadBtn.textContent=text('Proses…','Processing…');setProgress(3,text('Mulai proses','Starting'));setStatus('');
    try{
      const r=await fetch(api+jobPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:quality.value||'best'}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||text('Gagal memulai proses.','Could not start processing.'));await poll(data.job_id,run,family,api);
    }catch(e){if(run!==downloadRun)return;console.error(e);hideProgress();setStatus(e.message||text('Download gagal.','Download failed.'),'error');downloadBtn.disabled=false;quality.disabled=false;downloadBtn.textContent='Download'}
  }
  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);carouselAll.addEventListener('click',()=>downloadCarousel(null,carouselAll));input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});input.addEventListener('input',()=>{const kind=detect(input.value.trim());if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;if(inspectController)inspectController.abort();reset()}highlight(kind?.platform||'')});
  window.addEventListener('reyval:lang',applyCopy);applyCopy();
  const initial=new URLSearchParams(location.search).get('url');if(initial){input.value=initial;const kind=detect(initial);highlight(kind?.platform||'');setTimeout(inspect,0)}
})();