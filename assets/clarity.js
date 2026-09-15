const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
let file=null,previewURL=null,resultURL=null,mode='reference',target='feed',ffmpeg=null,ffmpegLoaded=false,lang=localStorage.getItem('reyval-lang')||'id',currentPreview='original',busy=false;

const copy={
  id:{
    sub:'Biar file yang lu upload tetap sedekat mungkin sama sumbernya.',source:'Video',local:'PROSES LOKAL',drop:'Pilih video',dropSub:'MP4 atau MOV · bisa drag & drop',target:'Preview untuk',targetHint:'Cuma mengubah panduan preview.',safeTop:'Area aman',safeHint:'Biar UI TikTok nggak nutup bagian penting.',mode:'Mode',ref:'Rapihin container MP4 dan metadata tanpa encode ulang.',hq:'Salin stream asli ke MP4 + fast start. Kualitas sumber tetap.',turbo:'Tanpa proses. File asli langsung dipakai.',privacy:'Video tetap di perangkat lu.',process:'Siapkan video',preview:'Preview',empty:'Pilih video dulu.',safe:'Area aman',original:'Asli',result:'Hasil',resolution:'Resolusi',duration:'Durasi',size:'Ukuran',modeSpec:'Mode',notice:'TikTok tetap bisa melakukan kompresi setelah upload. Clarity cuma menghindari encode ulang yang nggak perlu sebelum file dikirim.',loading:'Menyiapkan engine lokal…',processingRef:'Merapikan MP4…',processingHq:'Menyalin stream asli…',ready:'Selesai.',download:'Download MP4 ↓',downloadOriginal:'Download file ↓',failed:'Engine lokal gagal dimuat. Refresh halaman lalu coba lagi, atau pakai Turbo.',copied:'File asli, tanpa perubahan.',remuxed:'Tanpa encode ulang.',invalid:'Pilih file MP4 atau MOV.',modeNames:{reference:'Referensi',hq:'HQ',turbo:'Turbo'}
  },
  en:{
    sub:'Keep the upload as close to the source file as possible.',source:'Video',local:'LOCAL PROCESSING',drop:'Choose a video',dropSub:'MP4 or MOV · drag & drop works too',target:'Preview for',targetHint:'Only changes the preview guide.',safeTop:'Safe area',safeHint:'Keeps important content clear of TikTok UI.',mode:'Mode',ref:'Clean up the MP4 container and metadata without re-encoding.',hq:'Copy the original streams into MP4 + fast start. Source quality stays intact.',turbo:'No processing. Use the original file as-is.',privacy:'Your video stays on your device.',process:'Prepare video',preview:'Preview',empty:'Choose a video first.',safe:'Safe area',original:'Original',result:'Result',resolution:'Resolution',duration:'Duration',size:'Size',modeSpec:'Mode',notice:'TikTok may still compress the file after upload. Clarity only avoids unnecessary re-encoding before the upload.',loading:'Loading local engine…',processingRef:'Cleaning up MP4…',processingHq:'Copying original streams…',ready:'Done.',download:'Download MP4 ↓',downloadOriginal:'Download file ↓',failed:'The local engine could not load. Refresh and try again, or use Turbo.',copied:'Original file, unchanged.',remuxed:'No re-encoding.',invalid:'Choose an MP4 or MOV file.',modeNames:{reference:'Reference',hq:'HQ',turbo:'Turbo'}
  }
};

function t(){return copy[lang]}
function applyLang(){
  lang=localStorage.getItem('reyval-lang')||'id';const c=t();
  $('#clarity-sub').textContent=c.sub;$('#source-title').textContent=c.source;$('#local-only').textContent=c.local;$('#drop-title').textContent=c.drop;$('#drop-sub').textContent=c.dropSub;$('#target-label').textContent=c.target;$('#target-hint').textContent=c.targetHint;$('#safe-label-top').textContent=c.safeTop;$('#safe-hint').textContent=c.safeHint;$('#mode-label').textContent=c.mode;$('#mode-reference-desc').textContent=c.ref;$('#mode-hq-desc').textContent=c.hq;$('#mode-turbo-desc').textContent=c.turbo;$('#privacy-note').textContent=c.privacy;$('#process-label').textContent=c.process;$('#preview-title').textContent=c.preview;$('#preview-empty-text').textContent=c.empty;$('#safe-label').textContent=c.safe;$('#show-original').textContent=c.original;$('#show-result').textContent=c.result;$('#spec-resolution-label').textContent=c.resolution;$('#spec-duration-label').textContent=c.duration;$('#spec-size-label').textContent=c.size;$('#spec-mode-label').textContent=c.modeSpec;$('#notice').textContent=c.notice;$('#mode-spec').textContent=c.modeNames[mode];
  if($('#result').classList.contains('show')) $('#download').textContent=mode==='turbo'?c.downloadOriginal:c.download;
}
window.addEventListener('reyval:lang',applyLang);document.addEventListener('DOMContentLoaded',applyLang);

function formatBytes(n){if(!n&&n!==0)return'—';const u=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(i?1:0)} ${u[i]}`}
function formatDuration(s){if(!isFinite(s))return'—';const m=Math.floor(s/60),sec=Math.round(s%60);return `${m}:${String(sec).padStart(2,'0')}`}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600)}
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
function loadFile(f){
  if(!f||busy)return;if(!/\.(mp4|mov)$/i.test(f.name)){toast(t().invalid);return}
  file=f;resetResult();$('#file-name').textContent=f.name;$('#file-info').textContent=formatBytes(f.size);$('#file-meta').classList.add('show');$('#process').disabled=false;$('#size').textContent=formatBytes(f.size);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(f);$('#empty-preview').style.display='none';showPreview('original');
}

$('#dropzone').addEventListener('click',()=>{if(!busy)$('#file-input').click()});$('#dropzone').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();$('#file-input').click()}});$('#file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('#clear-file').addEventListener('click',e=>{e.stopPropagation();clearFile()});
['dragenter','dragover'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();if(!busy)$('#dropzone').classList.add('drag')}));['dragleave','drop'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();$('#dropzone').classList.remove('drag')}));$('#dropzone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));

$$('#target button').forEach(btn=>btn.addEventListener('click',()=>{if(busy)return;target=btn.dataset.target;$$('#target button').forEach(x=>x.classList.toggle('active',x===btn));$('#preview-mode-label').textContent=target.toUpperCase()}));
$$('.mode').forEach(el=>el.addEventListener('click',()=>{if(busy)return;mode=el.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x===el));$('#mode-spec').textContent=t().modeNames[mode];resetResult()}));

function setSafeArea(on){
  $('#safe-guides').classList.toggle('show',on);$('#safe-toggle').classList.toggle('on',on);$$('#safe-segment button').forEach(b=>b.classList.toggle('active',(b.dataset.safe==='on')===on));
}
$('#safe-toggle').addEventListener('click',()=>setSafeArea(!$('#safe-toggle').classList.contains('on')));$$('#safe-segment button').forEach(btn=>btn.addEventListener('click',()=>setSafeArea(btn.dataset.safe==='on')));
$$('#preview-source-toggle button').forEach(btn=>btn.addEventListener('click',()=>showPreview(btn.dataset.source)));

async function toBlobURL(url,mimeType){
  const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);const b=await r.blob();return URL.createObjectURL(new Blob([b],{type:mimeType}));
}
async function toPatchedBlobURL(url,mimeType){
  const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);let js=await r.text();
  js=js.replace('new URL(e.p+e.u(814),e.b)','r.workerLoadURL');
  return URL.createObjectURL(new Blob([js],{type:mimeType}));
}
async function loadFFmpegFrom(baseMain,baseCore){
  if(!window.FFmpegWASM){
    const mainURL=await toPatchedBlobURL(`${baseMain}/ffmpeg.js`,'text/javascript');
    await import(mainURL);
  }
  if(!window.FFmpegWASM?.FFmpeg)throw new Error('FFmpegWASM global missing');
  ffmpeg=new window.FFmpegWASM.FFmpeg();
  ffmpeg.on('progress',({progress})=>setProgress(Math.max(8,Math.min(96,(progress||0)*100))));
  const workerLoadURL=await toBlobURL(`${baseMain}/814.ffmpeg.js`,'text/javascript');
  const coreURL=await toBlobURL(`${baseCore}/ffmpeg-core.js`,'text/javascript');
  const wasmURL=await toBlobURL(`${baseCore}/ffmpeg-core.wasm`,'application/wasm');
  await ffmpeg.load({workerLoadURL,coreURL,wasmURL});
}
async function ensureFFmpeg(){
  if(ffmpegLoaded)return;
  const sources=[
    ['https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/umd','https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.3/dist/umd'],
    ['https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd','https://unpkg.com/@ffmpeg/core@0.12.3/dist/umd']
  ];
  let lastErr;
  for(const [main,core] of sources){
    try{await loadFFmpegFrom(main,core);ffmpegLoaded=true;return}catch(err){console.warn('FFmpeg source failed',main,err);lastErr=err;try{ffmpeg?.terminate?.()}catch{}ffmpeg=null}
  }
  throw lastErr||new Error('Unable to load FFmpeg');
}
function outputName(){const base=file.name.replace(/\.[^.]+$/,'');return `${base}-${mode}.mp4`}

$('#process').addEventListener('click',async()=>{
  if(!file||busy)return;resetResult();const c=t();busy=true;$('#process').disabled=true;$('#progress-wrap').classList.add('show');setProgress(mode==='turbo'?30:3,mode==='turbo'?c.copied:c.loading);
  try{
    let blob;
    if(mode==='turbo'){
      await new Promise(r=>setTimeout(r,140));blob=file;setProgress(100,c.copied);
    }else{
      await ensureFFmpeg();setProgress(8,mode==='reference'?c.processingRef:c.processingHq);
      const ext=file.name.split('.').pop().toLowerCase();const input=`input.${ext}`;const output='output.mp4';
      await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
      const args=mode==='reference'
        ?['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-avoid_negative_ts','make_zero','-brand','mp42',output]
        :['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','0','-movflags','+faststart',output];
      await ffmpeg.exec(args);const data=await ffmpeg.readFile(output);blob=new Blob([data.buffer],{type:'video/mp4'});
      try{await ffmpeg.deleteFile(input);await ffmpeg.deleteFile(output)}catch{}
      setProgress(100,mode==='reference'?c.processingRef:c.processingHq);
    }
    resultURL=URL.createObjectURL(blob);const dl=$('#download');dl.href=resultURL;dl.download=mode==='turbo'?file.name:outputName();dl.textContent=mode==='turbo'?c.downloadOriginal:c.download;$('#result-title').textContent=c.ready;$('#result-meta').textContent=`${mode==='turbo'?c.copied:c.remuxed} · ${formatBytes(blob.size)}`;$('#result').classList.add('show');$('#show-result').disabled=false;
  }catch(err){console.error(err);toast(c.failed);$('#progress-text').textContent=c.failed;setProgress(0,c.failed)}
  finally{busy=false;$('#process').disabled=!file}
});
