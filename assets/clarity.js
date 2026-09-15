const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
let file=null,bgmFile=null,previewURL=null,resultURL=null,mode='reference',target='feed',ffmpeg=null,ffmpegLoaded=false,lang=localStorage.getItem('reyval-lang')||'id',currentPreview='original',busy=false;

function installBgmUI(){
  if(document.querySelector('#bgm-input')) return;
  const meta=document.querySelector('#file-meta');
  if(!meta) return;
  const wrap=document.createElement('div');
  wrap.className='bgm-section';
  wrap.innerHTML=`<label class="control-label" id="bgm-label">BGM (opsional)</label><input id="bgm-input" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" hidden><div class="dropzone audio-dropzone" id="bgm-dropzone" role="button" tabindex="0"><div class="drop-icon">♫</div><b id="bgm-drop-title">Upload musik</b><p id="bgm-drop-sub">MP3, WAV, M4A, AAC · dipakai sebagai audio output</p></div><div class="file-meta" id="bgm-meta"><div><div class="file-name" id="bgm-name"></div><div class="file-info" id="bgm-info"></div></div><button class="clear-file" id="clear-bgm" aria-label="Hapus musik">✕</button></div><span class="control-hint" id="bgm-note">Kalau diisi, audio hasil akan pakai file musik ini.</span>`;
  meta.insertAdjacentElement('afterend',wrap);
  const style=document.createElement('style');
  style.textContent='.audio-dropzone{min-height:126px;margin-top:8px}.bgm-section .control-label{margin-top:18px}.bgm-section .control-hint{display:block;margin-top:7px;color:var(--soft);font-size:10px;line-height:1.45}.audio-dropzone .drop-icon{margin-bottom:10px}.audio-dropzone p{max-width:380px}';
  document.head.appendChild(style);
}
installBgmUI();
const brandText=document.querySelector('.brand span:last-child');if(brandText)brandText.textContent='RVL';const crumb=document.querySelector('.breadcrumbs a');if(crumb)crumb.textContent='RVL';document.title='Clarity — RVL';

const copy={
  id:{
    sub:'Biar file yang lu upload tetap sedekat mungkin sama sumbernya.',source:'Video',local:'PROSES LOKAL',drop:'Pilih video',dropSub:'MP4 atau MOV · bisa drag & drop',bgm:'BGM (opsional)',bgmDrop:'Upload musik',bgmDropSub:'MP3, WAV, M4A, AAC · dipakai sebagai audio output',bgmReplace:'Kalau diisi, audio hasil akan pakai file musik ini.',target:'Preview untuk',targetHint:'Cuma mengubah panduan preview.',safeTop:'Area aman',safeHint:'Biar UI platform nggak nutup bagian penting.',mode:'Mode',ref:'Rapihin container MP4 dan metadata tanpa encode ulang.',hq:'Salin stream asli ke MP4 + fast start. Kualitas sumber tetap.',turbo:'Tanpa proses. File asli langsung dipakai.',privacy:'Video tetap di perangkat lu.',process:'Siapkan video',preview:'Preview',empty:'Pilih video dulu.',safe:'Area aman',original:'Asli',result:'Hasil',resolution:'Resolusi',duration:'Durasi',size:'Ukuran',modeSpec:'Mode',notice:'Platform tujuan tetap bisa mengompresi file setelah upload. Clarity cuma menghindari encode ulang yang nggak perlu sebelum file dikirim.',loading:'Menyiapkan engine lokal…',processingRef:'Merapikan MP4…',processingHq:'Menyalin stream asli…',processingBgm:'Memasang BGM…',ready:'Selesai.',download:'Download MP4 ↓',downloadOriginal:'Download file ↓',failed:'Proses gagal. Coba Turbo atau pakai sumber MP4/H.264.',copied:'File asli, tanpa perubahan.',remuxed:'Tanpa encode ulang.',bgmApplied:'BGM dipasang ke video.',invalid:'Pilih file MP4 atau MOV.',invalidBgm:'Pilih file audio yang valid.',modeNames:{reference:'Referensi',hq:'HQ',turbo:'Turbo'}
  },
  en:{
    sub:'Keep the upload as close to the source file as possible.',source:'Video',local:'LOCAL PROCESSING',drop:'Choose a video',dropSub:'MP4 or MOV · drag & drop works too',bgm:'BGM (optional)',bgmDrop:'Upload music',bgmDropSub:'MP3, WAV, M4A, AAC · used as the output audio',bgmReplace:'If added, the exported video will use this music file as its audio.',target:'Preview for',targetHint:'Only changes the preview guide.',safeTop:'Safe area',safeHint:'Keeps important content clear of platform UI.',mode:'Mode',ref:'Clean up the MP4 container and metadata without re-encoding.',hq:'Copy the original streams into MP4 + fast start. Source quality stays intact.',turbo:'No processing. Use the original file as-is.',privacy:'Your video stays on your device.',process:'Prepare video',preview:'Preview',empty:'Choose a video first.',safe:'Safe area',original:'Original',result:'Result',resolution:'Resolution',duration:'Duration',size:'Size',modeSpec:'Mode',notice:'The destination platform may still compress the file after upload. Clarity only avoids unnecessary re-encoding before the upload.',loading:'Loading local engine…',processingRef:'Cleaning up MP4…',processingHq:'Copying original streams…',processingBgm:'Applying BGM…',ready:'Done.',download:'Download MP4 ↓',downloadOriginal:'Download file ↓',failed:'Processing failed. Try Turbo or use an MP4/H.264 source.',copied:'Original file, unchanged.',remuxed:'No re-encoding.',bgmApplied:'BGM added to the video.',invalid:'Choose an MP4 or MOV file.',invalidBgm:'Choose a valid audio file.',modeNames:{reference:'Reference',hq:'HQ',turbo:'Turbo'}
  }
};

function t(){return copy[lang]}
function applyLang(){
  lang=localStorage.getItem('reyval-lang')||'id';const c=t();
  $('#clarity-sub').textContent=c.sub;$('#source-title').textContent=c.source;$('#local-only').textContent=c.local;$('#drop-title').textContent=c.drop;$('#drop-sub').textContent=c.dropSub;
  $('#bgm-label').textContent=c.bgm;$('#bgm-drop-title').textContent=c.bgmDrop;$('#bgm-drop-sub').textContent=c.bgmDropSub;$('#bgm-note').textContent=c.bgmReplace;
  $('#target-label').textContent=c.target;$('#target-hint').textContent=c.targetHint;$('#safe-label-top').textContent=c.safeTop;$('#safe-hint').textContent=c.safeHint;$('#mode-label').textContent=c.mode;$('#mode-reference-desc').textContent=c.ref;$('#mode-hq-desc').textContent=c.hq;$('#mode-turbo-desc').textContent=c.turbo;$('#privacy-note').textContent=c.privacy;$('#process-label').textContent=c.process;$('#preview-title').textContent=c.preview;$('#preview-empty-text').textContent=c.empty;$('#safe-label').textContent=c.safe;$('#show-original').textContent=c.original;$('#show-result').textContent=c.result;$('#spec-resolution-label').textContent=c.resolution;$('#spec-duration-label').textContent=c.duration;$('#spec-size-label').textContent=c.size;$('#spec-mode-label').textContent=c.modeSpec;$('#notice').textContent=c.notice;$('#mode-spec').textContent=c.modeNames[mode];
  if($('#result').classList.contains('show')) $('#download').textContent=(!bgmFile&&mode==='turbo')?c.downloadOriginal:c.download;
}
window.addEventListener('reyval:lang',applyLang);document.addEventListener('DOMContentLoaded',applyLang);

function formatBytes(n){if(!n&&n!==0)return'—';const u=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(i?1:0)} ${u[i]}`}
function formatDuration(s){if(!isFinite(s))return'—';const m=Math.floor(s/60),sec=Math.round(s%60);return `${m}:${String(sec).padStart(2,'0')}`}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2300)}
function setProgress(pct,text){const safe=Math.max(0,Math.min(100,Math.round(pct)));$('#progress-fill').style.width=safe+'%';$('#progress-pct').textContent=safe+'%';if(text)$('#progress-text').textContent=text}

function showPreview(source){
  if(source==='result'&&!resultURL)return;
  const v=$('#preview');const nextURL=source==='result'?resultURL:previewURL;if(!nextURL)return;
  const time=isFinite(v.currentTime)?v.currentTime:0;const wasPlaying=!v.paused;
  currentPreview=source;$$('#preview-source-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.source===source));
  v.src=nextURL;v.classList.add('show');
  v.onloadedmetadata=()=>{try{v.currentTime=Math.min(time,Math.max(0,(v.duration||time)-.05))}catch{}if(source==='original'){$('#resolution').textContent=`${v.videoWidth} × ${v.videoHeight}`;$('#duration').textContent=formatDuration(v.duration)}if(wasPlaying)v.play().catch(()=>{})};
}

function resetResult(){
  if(resultURL){URL.revokeObjectURL(resultURL);resultURL=null}
  $('#result').classList.remove('show');$('#progress-wrap').classList.remove('show');setProgress(0);$('#show-result').disabled=true;
  if(currentPreview==='result'&&previewURL)showPreview('original');
}
function clearFile(){
  if(busy)return;file=null;resetResult();$('#file-input').value='';$('#file-meta').classList.remove('show');$('#process').disabled=true;const v=$('#preview');v.pause();v.removeAttribute('src');v.load();v.classList.remove('show');$('#empty-preview').style.display='block';if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;currentPreview='original';$('#resolution').textContent=$('#duration').textContent=$('#size').textContent='—';$$('#preview-source-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.source==='original'));
}
function clearBgm(){
  if(busy)return;bgmFile=null;$('#bgm-input').value='';$('#bgm-meta').classList.remove('show');resetResult();
}
function loadFile(f){
  if(!f||busy)return;if(!/\.(mp4|mov)$/i.test(f.name)){toast(t().invalid);return}
  file=f;resetResult();$('#file-name').textContent=f.name;$('#file-info').textContent=formatBytes(f.size);$('#file-meta').classList.add('show');$('#process').disabled=false;$('#size').textContent=formatBytes(f.size);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(f);$('#empty-preview').style.display='none';showPreview('original');
}
function loadBgm(f){
  if(!f||busy)return;if(!/\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name)){toast(t().invalidBgm);return}
  bgmFile=f;resetResult();$('#bgm-name').textContent=f.name;$('#bgm-info').textContent=formatBytes(f.size);$('#bgm-meta').classList.add('show');
}

$('#dropzone').addEventListener('click',()=>{if(!busy)$('#file-input').click()});$('#dropzone').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();$('#file-input').click()}});$('#file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('#clear-file').addEventListener('click',e=>{e.stopPropagation();clearFile()});
$('#bgm-dropzone').addEventListener('click',()=>{if(!busy)$('#bgm-input').click()});$('#bgm-dropzone').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();$('#bgm-input').click()}});$('#bgm-input').addEventListener('change',e=>loadBgm(e.target.files[0]));$('#clear-bgm').addEventListener('click',e=>{e.stopPropagation();clearBgm()});
['dragenter','dragover'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();if(!busy)$('#dropzone').classList.add('drag')}));['dragleave','drop'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();$('#dropzone').classList.remove('drag')}));$('#dropzone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
['dragenter','dragover'].forEach(evt=>$('#bgm-dropzone').addEventListener(evt,e=>{e.preventDefault();if(!busy)$('#bgm-dropzone').classList.add('drag')}));['dragleave','drop'].forEach(evt=>$('#bgm-dropzone').addEventListener(evt,e=>{e.preventDefault();$('#bgm-dropzone').classList.remove('drag')}));$('#bgm-dropzone').addEventListener('drop',e=>loadBgm(e.dataTransfer.files[0]));

$$('#target button').forEach(btn=>btn.addEventListener('click',()=>{if(busy)return;target=btn.dataset.target;$$('#target button').forEach(x=>x.classList.toggle('active',x===btn));$('#preview-mode-label').textContent=target.toUpperCase()}));
$$('.mode').forEach(el=>el.addEventListener('click',()=>{if(busy)return;mode=el.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x===el));$('#mode-spec').textContent=t().modeNames[mode];resetResult()}));

function setSafeArea(on){
  $('#safe-guides').classList.toggle('show',on);$('#safe-toggle').classList.toggle('on',on);$$('#safe-segment button').forEach(b=>b.classList.toggle('active',(b.dataset.safe==='on')===on));
}
$('#safe-toggle').addEventListener('click',()=>setSafeArea(!$('#safe-toggle').classList.contains('on')));$$('#safe-segment button').forEach(btn=>btn.addEventListener('click',()=>setSafeArea(btn.dataset.safe==='on')));
$$('#preview-source-toggle button').forEach(btn=>btn.addEventListener('click',()=>showPreview(btn.dataset.source)));

async function toBlobURL(url,mimeType){
  const res=await fetch(url);if(!res.ok)throw new Error(`HTTP ${res.status} ${url}`);
  const blob=await res.blob();return URL.createObjectURL(new Blob([blob],{type:mimeType}));
}
async function ensureFFmpeg(){
  if(ffmpegLoaded)return;
  const cdns=[
    {
      base:'https://cdn.jsdelivr.net/npm/@ffmpeg',
      esm:'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js',
      core:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
      wasm:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',
      worker:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js'
    },
    {
      base:'https://unpkg.com/@ffmpeg',
      esm:'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js',
      core:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
      wasm:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',
      worker:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js'
    }
  ];
  let lastErr;
  for(const cdn of cdns){
    try{
      const {FFmpeg}=await import(/* @vite-ignore */ `${cdn.esm}?v=3`);
      ffmpeg=new FFmpeg();
      ffmpeg.on('progress',({progress})=>setProgress(Math.max(8,Math.min(96,progress*100))));
      await ffmpeg.load({
        coreURL:await toBlobURL(`${cdn.core}?v=3`,'text/javascript'),
        wasmURL:await toBlobURL(`${cdn.wasm}?v=3`,'application/wasm'),
        workerURL:await toBlobURL(`${cdn.worker}?v=3`,'text/javascript')
      });
      ffmpegLoaded=true;
      return;
    }catch(err){
      lastErr=err;
      ffmpegLoaded=false;
      ffmpeg=null;
    }
  }
  throw lastErr||new Error('Unable to load FFmpeg');
}
function outputName(){const base=file.name.replace(/\.[^.]+$/,'');return `${base}${bgmFile?'-bgm':''}-${mode}.mp4`}

$('#process').addEventListener('click',async()=>{
  if(!file||busy)return;resetResult();const c=t();busy=true;$('#process').disabled=true;$('#progress-wrap').classList.add('show');
  const needsProcessing = mode!=='turbo' || !!bgmFile;
  setProgress(needsProcessing?3:30, needsProcessing ? (bgmFile?c.processingBgm:c.loading) : c.copied);
  try{
    let blob;
    if(!needsProcessing){
      await new Promise(r=>setTimeout(r,140));blob=file;setProgress(100,c.copied);
    }else{
      await ensureFFmpeg();
      setProgress(8,bgmFile?c.processingBgm:(mode==='reference'?c.processingRef:c.processingHq));
      const ext=file.name.split('.').pop().toLowerCase();const input=`input.${ext}`;const output='output.mp4';
      await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
      let args;
      if(bgmFile){
        const bgmExt=bgmFile.name.split('.').pop().toLowerCase();const bgmInput=`bgm.${bgmExt}`;
        await ffmpeg.writeFile(bgmInput,new Uint8Array(await bgmFile.arrayBuffer()));
        args=['-i',input,'-i',bgmInput,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart'];
        if(mode==='reference') args.push('-map_metadata','-1','-map_chapters','-1','-avoid_negative_ts','make_zero','-brand','mp42');
        else args.push('-map_metadata','0');
        args.push(output);
      }else{
        args=mode==='reference'
          ?['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-avoid_negative_ts','make_zero','-brand','mp42',output]
          :['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','0','-movflags','+faststart',output];
      }
      await ffmpeg.exec(args);const data=await ffmpeg.readFile(output);blob=new Blob([data.buffer],{type:'video/mp4'});
      try{await ffmpeg.deleteFile(input);await ffmpeg.deleteFile(output);if(bgmFile){const bgmExt=bgmFile.name.split('.').pop().toLowerCase();await ffmpeg.deleteFile(`bgm.${bgmExt}`)}}catch{}
      setProgress(100,bgmFile?c.processingBgm:(mode==='reference'?c.processingRef:c.processingHq));
    }
    resultURL=URL.createObjectURL(blob);const dl=$('#download');dl.href=resultURL;dl.download=(!bgmFile&&mode==='turbo')?file.name:outputName();dl.textContent=(!bgmFile&&mode==='turbo')?c.downloadOriginal:c.download;$('#result-title').textContent=c.ready;const stateMsg=bgmFile?c.bgmApplied:((mode==='turbo')?c.copied:c.remuxed);$('#result-meta').textContent=`${stateMsg} · ${formatBytes(blob.size)}`;$('#result').classList.add('show');$('#show-result').disabled=false;
  }catch(err){console.error(err);toast(c.failed);$('#progress-text').textContent=c.failed}
  finally{busy=false;$('#process').disabled=!file}
});