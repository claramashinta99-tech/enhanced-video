(()=>{
  const API='https://enhanced-video-production.up.railway.app';
  const $=s=>document.querySelector(s);
  const input=$('#media-url'),inspectBtn=$('#inspect-btn'),card=$('#media-card'),status=$('#download-status'),thumb=$('#media-thumb'),title=$('#media-title'),meta=$('#media-meta'),mode=$('#audio-mode'),downloadBtn=$('#download-btn');
  if(!input||!inspectBtn||!card||!status||!mode||!downloadBtn)return;
  let current=null,inspectRun=0,downloadRun=0,inspectController=null,sizeRun=0;
  const lang=()=>localStorage.getItem('reyval-lang')||'id';
  const t=(id,en)=>lang()==='en'?en:id;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const setStatus=(msg='',type='')=>{status.textContent=msg;status.className='download-status-text'+(type?' '+type:'')};
  const valid=url=>{try{const h=new URL(url).hostname.toLowerCase();return /(^|\.)youtube\.com$/.test(h)||h==='youtu.be'}catch{return false}};

  if(!$('#rvl-mp3-style')){
    const css=document.createElement('style');css.id='rvl-mp3-style';css.textContent=`
      .media-card{display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:16px}.media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}.media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:13px;background:#171717;border:1px solid var(--line)}.media-info{min-width:0}.media-title{font-weight:700;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-meta{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45}.media-size{font-size:11px;color:#b7c9ff;margin-top:5px;line-height:1.4;font-weight:600}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}.audio-mode{width:100%;min-height:44px;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:0 13px;font-size:13px;outline:none}.download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text:empty{display:none}.download-status-text.error{color:#ff9d9d}.rvl-job-progress{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.rvl-job-progress.show{display:block}.rvl-job-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;color:#8d8d94}.rvl-job-head strong{color:#c9c9ce;font-weight:600}.rvl-job-track{height:7px;border-radius:999px;background:#1a1a1d;overflow:hidden;border:1px solid rgba(255,255,255,.04)}.rvl-job-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#63c8ff,#8b7cff);transition:width .22s ease}.rvl-job-progress.indeterminate .rvl-job-fill{width:42%!important;animation:rvlJobIndeterminate 1.05s ease-in-out infinite alternate}@keyframes rvlJobIndeterminate{from{transform:translateX(-40%)}to{transform:translateX(165%)}}@media(max-width:600px){.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.download-input-wrap{grid-template-columns:1fr}}`;
    document.head.appendChild(css);
  }
  let sizeEl=$('#media-size');if(!sizeEl&&meta){sizeEl=document.createElement('div');sizeEl.id='media-size';sizeEl.className='media-size';meta.insertAdjacentElement('afterend',sizeEl)}
  $('#rvl-download-frame')?.remove();
  const frame=document.createElement('iframe');frame.id='rvl-download-frame';frame.name='rvl-download-frame';frame.style.display='none';document.body.appendChild(frame);
  let progress=$('#rvl-job-progress');
  if(!progress){progress=document.createElement('div');progress.id='rvl-job-progress';progress.className='rvl-job-progress';progress.innerHTML='<div class="rvl-job-head"><strong id="rvl-job-stage">Lagi diproses…</strong><span id="rvl-job-percent">0%</span></div><div class="rvl-job-track"><div class="rvl-job-fill" id="rvl-job-fill"></div></div>';card.insertAdjacentElement('afterend',progress)}
  const stage=$('#rvl-job-stage'),pct=$('#rvl-job-percent'),fill=$('#rvl-job-fill');
  const fmtBytes=n=>{n=Number(n);if(!Number.isFinite(n)||n<=0)return'';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`};
  const setSize=(bytes=0,estimated=true,pending=false)=>{if(!sizeEl)return;if(pending){sizeEl.textContent=t('Ukuran: menghitung…','Size: calculating…');return}const f=fmtBytes(bytes);sizeEl.textContent=f?`${t('Ukuran','Size')}: ${estimated?'~':''}${f}`:t('Ukuran: tersedia setelah proses','Size: available after processing')};
  const refreshSize=async()=>{const run=++sizeRun;if(!current){if(sizeEl)sizeEl.textContent='';return}setSize(0,true,true);const quality=mode.value==='fast'?'fast':'mp3';for(let i=0;i<10&&run===sizeRun&&current;i++){try{const r=await fetch(`${API}/api/file-size`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==sizeRun||!current)return;if(r.ok&&data.bytes){setSize(data.bytes,data.estimated!==false);return}}catch{}if(i<9)await sleep(700)}if(run===sizeRun)setSize(0,false,false)};
  const guessStage=(n=0)=>{const p=Math.max(0,Math.min(100,Math.round(Number(n)||0)));if(p<18)return t('Lagi ngambil audionya…','Getting the audio…');if(p<42)return t('Sedang diracik…','Working on it…');if(p<68)return t('Masih diproses…','Still working…');if(p<90)return t('Hampir jadi…','Almost there…');return t('Sedikit lagi…','Just a little more…')};
  const setProgress=(n=0,label='',ind=false)=>{const p=Math.max(0,Math.min(100,Math.round(Number(n)||0)));progress.classList.add('show');progress.classList.toggle('indeterminate',ind);fill.style.width=`${p}%`;pct.textContent=ind?'':`${p}%`;stage.textContent=label||guessStage(p)};
  const hideProgress=()=>{progress.classList.remove('show','indeterminate');fill.style.width='0%';pct.textContent='0%'};
  const updateMode=()=>{if(!current)return;const bits=[];if(current.uploader)bits.push(current.uploader);bits.push(mode.value==='fast'?t('Audio Asli','Original Audio'):'MP3 · 192 kbps');meta.textContent=bits.join(' · ');downloadBtn.textContent=mode.value==='fast'?t('Download Audio','Download Audio'):'Download MP3';refreshSize()};
  const reset=()=>{current=null;++sizeRun;card.classList.remove('show');downloadBtn.disabled=true;thumb?.removeAttribute('src');if(title)title.textContent='';if(meta)meta.textContent='';if(sizeEl)sizeEl.textContent='';hideProgress()};

  async function inspect(){
    const url=input.value.trim(),run=++inspectRun;++downloadRun;
    inspectController?.abort();inspectController=new AbortController();reset();setStatus('');
    if(!valid(url)){setStatus(t('Tempel link YouTube yang valid.','Paste a valid YouTube link.'),'error');return}
    inspectBtn.disabled=true;input.disabled=true;setProgress(20,t('Lagi ngecek link…','Checking the link…'),true);
    try{
      const r=await fetch(`${API}/api/mp3/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:inspectController.signal,cache:'no-store'});
      const data=await r.json().catch(()=>({}));if(run!==inspectRun)return;if(!r.ok)throw new Error(data.detail||t('Link nggak bisa dibaca.','Could not read this link.'));
      current={url,...data};if(thumb){thumb.src=data.thumbnail||'';thumb.alt=data.title||'Media thumbnail'}if(title)title.textContent=data.title||'Untitled';card.classList.add('show');downloadBtn.disabled=false;hideProgress();updateMode();
    }catch(e){if(e.name!=='AbortError'&&run===inspectRun){console.error(e);reset();setStatus(e.message||t('Gagal mengecek link.','Failed to check link.'),'error')}}
    finally{if(run===inspectRun){inspectBtn.disabled=false;input.disabled=false;inspectController=null}}
  }
  async function poll(job,run){
    while(run===downloadRun){
      await sleep(650);
      const r=await fetch(`${API}/api/jobs/${encodeURIComponent(job)}?_=${Date.now()}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok)throw new Error(data.detail||t('Proses MP3 gagal.','MP3 process failed.'));
      setProgress(data.progress||0,guessStage(data.progress||0));
      if(data.state==='ready'){setProgress(100,t('Sip, beres!','Done!'));frame.src=`${API}/api/jobs/${encodeURIComponent(job)}/file-reyval?_=${Date.now()}`;downloadBtn.disabled=false;refreshSize();setTimeout(()=>{if(run===downloadRun)hideProgress()},1600);return}
      if(data.state==='error')throw new Error(data.error||t('Proses MP3 gagal.','MP3 process failed.'));
    }
  }
  async function download(){
    if(!current)return;const run=++downloadRun;downloadBtn.disabled=true;setStatus('');
    try{
      if(mode.value==='fast'){
        setProgress(15,t('Lagi ngambil audionya…','Getting the audio…'),true);
        const r=await fetch(`${API}/api/audio/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.token)throw new Error(data.detail||t('Audio gagal disiapkan.','Could not prepare audio.'));
        setProgress(100,t('Sip, mulai didownload…','Nice, download starting…'));frame.src=`${API}/api/audio/chunked/${encodeURIComponent(data.token)}?_=${Date.now()}`;setTimeout(()=>{if(run===downloadRun)hideProgress()},1200);
      }else{
        setProgress(5,guessStage(5));
        const r=await fetch(`${API}/api/mp3/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:'audio'}),cache:'no-store'});const data=await r.json().catch(()=>({}));if(run!==downloadRun)return;if(!r.ok||!data.job_id)throw new Error(data.detail||t('Gagal memulai MP3.','Could not start MP3 processing.'));
        await poll(data.job_id,run);
      }
    }catch(e){if(run===downloadRun){console.error(e);hideProgress();setStatus(e.message||t('Download gagal.','Download failed.'),'error')}}
    finally{if(run===downloadRun){downloadBtn.disabled=false;updateMode()}}
  }
  function applyCopy(){const en=lang()==='en';const sub=$('#page-sub');if(sub)sub.textContent=en?'Paste a YouTube link, check the audio, then choose Original Audio or MP3 192 kbps.':'Tempel link YouTube, cek audionya, lalu pilih Audio Asli atau MP3 192 kbps.';input.placeholder=en?'Paste YouTube link':'Tempel link YouTube';inspectBtn.textContent=en?'Check':'Cek';const f=mode.querySelector('option[value="fast"]'),m=mode.querySelector('option[value="mp3"]');if(f)f.textContent=en?'Original Audio':'Audio Asli';if(m)m.textContent='MP3 · 192 kbps';updateMode()}
  inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);mode.addEventListener('change',updateMode);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});input.addEventListener('input',()=>{if(current&&input.value.trim()!==current.url){++inspectRun;++downloadRun;inspectController?.abort();reset();setStatus('')}});window.addEventListener('reyval:lang',applyCopy);applyCopy();
})();
