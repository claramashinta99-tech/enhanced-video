const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
let file=null,previewURL=null,resultURL=null,mode='maxquality',target='feed',ffmpeg=null,ffmpegLoaded=false,lang=localStorage.getItem('reyval-lang')||'id',currentPreview='original',busy=false;

const copy={
 id:{sub:'Biar file yang lu upload tetap sedekat mungkin sama sumbernya.',source:'Video',local:'PROSES LOKAL',drop:'Pilih video',dropSub:'MP4 atau MOV · bisa drag & drop',target:'Preview untuk',targetHint:'Cuma mengubah panduan preview.',safeTop:'Area aman',safeHint:'Biar UI platform nggak nutup bagian penting.',mode:'Mode',max:'Bitstream video/audio utama tetap disalin apa adanya. Timing MP4 dirapikan + fast-start + FPS patch struktural.',ref:'Rapihin container MP4 dan metadata tanpa encode ulang.',privacy:'Video tetap di perangkat lu.',process:'Siapkan video',preview:'Preview',empty:'Pilih video dulu.',safe:'Area aman',original:'Asli',result:'Hasil',resolution:'Resolusi',duration:'Durasi',size:'Ukuran',modeSpec:'Mode',notice:'Platform tujuan tetap bisa mengompresi file setelah upload. Clarity cuma menghindari encode ulang yang nggak perlu sebelum file dikirim.',loading:'Menyiapkan engine lokal…',processingMax:'Menerapkan Max Quality + FPS Method…',processingRef:'Merapikan MP4…',ready:'Selesai.',download:'Download MP4 ↓',failed:'Proses gagal. Gunakan sumber MP4/MOV dengan codec yang kompatibel.',patched:'Bitstream utama tetap · FPS patch diterapkan.',maxFallback:'Bitstream utama tetap · remux kualitas maksimum selesai.',remuxed:'Tanpa encode ulang.',invalid:'Pilih file MP4 atau MOV.',modeNames:{maxquality:'Max Quality + FPS',reference:'Referensi'}},
 en:{sub:'Keep the upload as close to the source file as possible.',source:'Video',local:'LOCAL PROCESSING',drop:'Choose a video',dropSub:'MP4 or MOV · drag & drop works too',target:'Preview for',targetHint:'Only changes the preview guide.',safeTop:'Safe area',safeHint:'Keeps important content clear of platform UI.',mode:'Mode',max:'Keep the primary video/audio bitstreams intact, normalize MP4 timing + fast-start, then apply the structural FPS patch.',ref:'Clean up the MP4 container and metadata without re-encoding.',privacy:'Your video stays on your device.',process:'Prepare video',preview:'Preview',empty:'Choose a video first.',safe:'Safe area',original:'Original',result:'Result',resolution:'Resolution',duration:'Duration',size:'Size',modeSpec:'Mode',notice:'The destination platform may still compress the file after upload. Clarity only avoids unnecessary re-encoding before the upload.',loading:'Loading local engine…',processingMax:'Applying Max Quality + FPS Method…',processingRef:'Cleaning up MP4…',ready:'Done.',download:'Download MP4 ↓',failed:'Processing failed. Use a compatible MP4/MOV source.',patched:'Primary bitstreams preserved · FPS patch applied.',maxFallback:'Primary bitstreams preserved · max-quality remux complete.',remuxed:'No re-encoding.',invalid:'Choose an MP4 or MOV file.',modeNames:{maxquality:'Max Quality + FPS',reference:'Reference'}}
}
function t(){return copy[lang]}
function applyLang(){
 lang=localStorage.getItem('reyval-lang')||'id';const c=t();
 $('#clarity-sub').textContent=c.sub;$('#source-title').textContent=c.source;$('#local-only').textContent=c.local;$('#drop-title').textContent=c.drop;$('#drop-sub').textContent=c.dropSub;$('#target-label').textContent=c.target;$('#target-hint').textContent=c.targetHint;$('#safe-label-top').textContent=c.safeTop;$('#safe-hint').textContent=c.safeHint;$('#mode-label').textContent=c.mode;$('#mode-maxquality-desc').textContent=c.max;$('#mode-reference-desc').textContent=c.ref;$('#privacy-note').textContent=c.privacy;$('#process-label').textContent=c.process;$('#preview-title').textContent=c.preview;$('#preview-empty-text').textContent=c.empty;$('#safe-label').textContent=c.safe;$('#show-original').textContent=c.original;$('#show-result').textContent=c.result;$('#spec-resolution-label').textContent=c.resolution;$('#spec-duration-label').textContent=c.duration;$('#spec-size-label').textContent=c.size;$('#spec-mode-label').textContent=c.modeSpec;$('#notice').textContent=c.notice;$('#mode-spec').textContent=c.modeNames[mode];
 if($('#result').classList.contains('show')) $('#download').textContent=c.download;
}
window.addEventListener('reyval:lang',applyLang);document.addEventListener('DOMContentLoaded',applyLang);
function formatBytes(n){if(!n&&n!==0)return'—';const u=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(i?1:0)} ${u[i]}`}
function formatDuration(s){if(!isFinite(s))return'—';const m=Math.floor(s/60),sec=Math.round(s%60);return `${m}:${String(sec).padStart(2,'0')}`}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2300)}
function setProgress(pct,text){const safe=Math.max(0,Math.min(100,Math.round(pct)));$('#progress-fill').style.width=safe+'%';$('#progress-pct').textContent=safe+'%';if(text)$('#progress-text').textContent=text}
function showPreview(source){if(source==='result'&&!resultURL)return;const v=$('#preview');const nextURL=source==='result'?resultURL:previewURL;if(!nextURL)return;const time=isFinite(v.currentTime)?v.currentTime:0;const wasPlaying=!v.paused;currentPreview=source;$$('#preview-source-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.source===source));v.src=nextURL;v.classList.add('show');v.onloadedmetadata=()=>{try{v.currentTime=Math.min(time,Math.max(0,(v.duration||time)-.05))}catch{}if(source==='original'){$('#resolution').textContent=`${v.videoWidth} × ${v.videoHeight}`;$('#duration').textContent=formatDuration(v.duration)}if(wasPlaying)v.play().catch(()=>{})}}
function resetResult(){if(resultURL){URL.revokeObjectURL(resultURL);resultURL=null}$('#result').classList.remove('show');$('#progress-wrap').classList.remove('show');setProgress(0);$('#show-result').disabled=true;if(currentPreview==='result'&&previewURL)showPreview('original')}
function clearFile(){if(busy)return;file=null;resetResult();$('#file-input').value='';$('#file-meta').classList.remove('show');$('#process').disabled=true;const v=$('#preview');v.pause();v.removeAttribute('src');v.load();v.classList.remove('show');$('#empty-preview').style.display='block';if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;currentPreview='original';$('#resolution').textContent=$('#duration').textContent=$('#size').textContent='—';$$('#preview-source-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.source==='original'))}
function loadFile(f){if(!f||busy)return;if(!/\.(mp4|mov)$/i.test(f.name)){toast(t().invalid);return}file=f;resetResult();$('#file-name').textContent=f.name;$('#file-info').textContent=formatBytes(f.size);$('#file-meta').classList.add('show');$('#process').disabled=false;$('#size').textContent=formatBytes(f.size);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(f);$('#empty-preview').style.display='none';showPreview('original')}
$('#dropzone').addEventListener('click',()=>{if(!busy)$('#file-input').click()});$('#dropzone').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();$('#file-input').click()}});$('#file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('#clear-file').addEventListener('click',e=>{e.stopPropagation();clearFile()});
['dragenter','dragover'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();if(!busy)$('#dropzone').classList.add('drag')}));['dragleave','drop'].forEach(evt=>$('#dropzone').addEventListener(evt,e=>{e.preventDefault();$('#dropzone').classList.remove('drag')}));$('#dropzone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$$('#target button').forEach(btn=>btn.addEventListener('click',()=>{if(busy)return;target=btn.dataset.target;$$('#target button').forEach(x=>x.classList.toggle('active',x===btn));$('#preview-mode-label').textContent=target.toUpperCase()}));
$$('.mode').forEach(el=>el.addEventListener('click',()=>{if(busy)return;mode=el.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x===el));$('#mode-spec').textContent=t().modeNames[mode];resetResult()}));
function setSafeArea(on){$('#safe-guides').classList.toggle('show',on);$('#safe-toggle').classList.toggle('on',on);$$('#safe-segment button').forEach(b=>b.classList.toggle('active',(b.dataset.safe==='on')===on))}
$('#safe-toggle').addEventListener('click',()=>setSafeArea(!$('#safe-toggle').classList.contains('on')));$$('#safe-segment button').forEach(btn=>btn.addEventListener('click',()=>setSafeArea(btn.dataset.safe==='on')));$$('#preview-source-toggle button').forEach(btn=>btn.addEventListener('click',()=>showPreview(btn.dataset.source)));
async function toBlobURL(url,mimeType){const res=await fetch(url);if(!res.ok)throw new Error(`HTTP ${res.status} ${url}`);const blob=await res.blob();return URL.createObjectURL(new Blob([blob],{type:mimeType}))}
async function ensureFFmpeg(){
 if(ffmpegLoaded)return;
 const cdns=[
  {esm:'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js',core:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',wasm:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',worker:'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js'},
  {esm:'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js',core:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',wasm:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',worker:'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js'}
 ];
 let lastErr;
 for(const cdn of cdns){try{const {FFmpeg}=await import(/* @vite-ignore */ `${cdn.esm}?v=3`);ffmpeg=new FFmpeg();ffmpeg.on('progress',({progress})=>setProgress(Math.max(8,Math.min(96,progress*100))));await ffmpeg.load({coreURL:await toBlobURL(`${cdn.core}?v=3`,'text/javascript'),wasmURL:await toBlobURL(`${cdn.wasm}?v=3`,'application/wasm'),workerURL:await toBlobURL(`${cdn.worker}?v=3`,'text/javascript')});ffmpegLoaded=true;return}catch(err){lastErr=err;ffmpegLoaded=false;ffmpeg=null}}
 throw lastErr||new Error('Unable to load FFmpeg');
}

const AAC_SAMPLE_RATES=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
function parseAdts(bytes){
 let i=0,frameCount=0,profile=1,sampleRateIndex=-1,channelConfig=2;
 while(i+7<=bytes.length){
  if(bytes[i]!==0xff||(bytes[i+1]&0xf6)!==0xf0)throw new Error('Invalid AAC/ADTS stream');
  const headerLength=(bytes[i+1]&1)?7:9;
  const frameLength=((bytes[i+3]&3)<<11)|(bytes[i+4]<<3)|((bytes[i+5]>>5)&7);
  if(frameLength<headerLength||i+frameLength>bytes.length)throw new Error('Invalid AAC frame length');
  if(frameCount===0){
   profile=(bytes[i+2]>>6)&3;
   sampleRateIndex=(bytes[i+2]>>2)&15;
   channelConfig=((bytes[i+2]&1)<<2)|((bytes[i+3]>>6)&3);
  }
  frameCount++;i+=frameLength;
 }
 if(!frameCount||i!==bytes.length)throw new Error('Incomplete AAC/ADTS stream');
 const sampleRate=AAC_SAMPLE_RATES[sampleRateIndex];
 if(!sampleRate)throw new Error('Unsupported AAC sample rate');
 return{frameCount,profile,sampleRateIndex,channelConfig:channelConfig||2,sampleRate};
}
function makeDummyAdtsFrame(info){
 const payload=new Uint8Array([0,0,0,4,0,0,0,0]);
 const frameLength=7+payload.length;
 const out=new Uint8Array(frameLength);
 out[0]=0xff;out[1]=0xf1;
 out[2]=((info.profile&3)<<6)|((info.sampleRateIndex&15)<<2)|((info.channelConfig>>2)&1);
 out[3]=((info.channelConfig&3)<<6)|((frameLength>>11)&3);
 out[4]=(frameLength>>3)&255;
 out[5]=((frameLength&7)<<5)|31;
 out[6]=0xfc;
 out.set(payload,7);
 return out;
}
function buildFpsPatch(mainAudio,info){
 const dummy=makeDummyAdtsFrame(info);
 const extraCount=info.frameCount*9;
 const out=new Uint8Array(mainAudio.length+(dummy.length*extraCount));
 out.set(mainAudio,0);
 let offset=mainAudio.length;
 for(let i=0;i<extraCount;i++){out.set(dummy,offset);offset+=dummy.length}
 return out;
}
async function execChecked(args){
 const code=await ffmpeg.exec(args);
 if(typeof code==='number'&&code!==0)throw new Error(`FFmpeg exited with code ${code}`);
}
async function deleteLocal(name){try{await ffmpeg.deleteFile(name)}catch{}}
async function runReference(input,output,brand='mp42'){
 await execChecked(['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-avoid_negative_ts','make_zero','-brand',brand,output]);
}
async function runMaxQualityFps(input,output){
 const mainAac='rvl-main.aac',patchAac='rvl-fps-patch.aac';
 let patchApplied=false;
 try{
  const extractCode=await ffmpeg.exec(['-i',input,'-map','0:a:0','-c:a','copy','-f','adts',mainAac]);
  if(typeof extractCode==='number'&&extractCode!==0)throw new Error('Primary AAC track unavailable');
  const raw=await ffmpeg.readFile(mainAac);
  const mainAudio=raw instanceof Uint8Array?raw:new Uint8Array(raw);
  const info=parseAdts(mainAudio);
  const patch=buildFpsPatch(mainAudio,info);
  await ffmpeg.writeFile(patchAac,patch);
  const n=info.frameCount,end=n*1024;
  const videoSetts="setts=pts='PTS-STARTDTS':dts='DTS-STARTDTS'";
  const mainAudioSetts="setts=pts='PTS-STARTPTS':dts='DTS-STARTPTS'";
  const patchSetts=`setts=pts='if(lt(N,${n}),N*1024,${end}+(N-${n}))':dts='if(lt(N,${n}),N*1024,${end}+(N-${n}))':duration='if(lt(N,${n}),1024,1)':time_base=1/${info.sampleRate}`;
  await execChecked(['-i',input,'-f','aac','-i',patchAac,'-map','0:v:0','-map','0:a:0?','-map','1:a:0','-c','copy','-bsf:v',videoSetts,'-bsf:a:0',mainAudioSetts,'-bsf:a:1',patchSetts,'-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-brand','isom','-metadata','comment=Patched by RVL TikTok Method',output]);
  patchApplied=true;
 }catch(err){
  console.warn('Max Quality + FPS patch fallback:',err);
  await deleteLocal(output);
  await runReference(input,output,'isom');
 }finally{
  await deleteLocal(mainAac);await deleteLocal(patchAac);
 }
 return patchApplied;
}
function outputName(){const base=file.name.replace(/\.[^.]+$/,'');return `${base}-${mode}.mp4`}
$('#process').addEventListener('click',async()=>{if(!file||busy)return;resetResult();const c=t();busy=true;$('#process').disabled=true;$('#progress-wrap').classList.add('show');setProgress(3,c.loading);try{await ensureFFmpeg();setProgress(8,mode==='maxquality'?c.processingMax:c.processingRef);const ext=file.name.split('.').pop().toLowerCase();const input=`input.${ext}`;const output='output.mp4';await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));let patchApplied=false;if(mode==='maxquality')patchApplied=await runMaxQualityFps(input,output);else await runReference(input,output);const data=await ffmpeg.readFile(output);const bytes=data instanceof Uint8Array?data:new Uint8Array(data);const blob=new Blob([bytes.buffer],{type:'video/mp4'});try{await ffmpeg.deleteFile(input);await ffmpeg.deleteFile(output)}catch{}setProgress(100,mode==='maxquality'?c.processingMax:c.processingRef);resultURL=URL.createObjectURL(blob);const dl=$('#download');dl.href=resultURL;dl.download=outputName();dl.textContent=c.download;$('#result-title').textContent=c.ready;$('#result-meta').textContent=`${mode==='maxquality'?(patchApplied?c.patched:c.maxFallback):c.remuxed} · ${formatBytes(blob.size)}`;$('#result').classList.add('show');$('#show-result').disabled=false}catch(err){console.error(err);toast(c.failed);$('#progress-text').textContent=c.failed}finally{busy=false;$('#process').disabled=!file}});
