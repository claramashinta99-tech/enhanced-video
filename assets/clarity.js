const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
let file=null,previewURL=null,resultURL=null,target='feed',ffmpeg=null,ffmpegLoaded=false,lang=localStorage.getItem('reyval-lang')||'id',currentPreview='original',busy=false;

const copy={
 id:{sub:'Biar file yang lu upload tetap sedekat mungkin sama sumbernya.',source:'Video',local:'PROSES LOKAL',drop:'Pilih video',dropSub:'MP4 atau MOV · bisa drag & drop',target:'Preview untuk',targetHint:'Cuma mengubah panduan preview.',safeTop:'Area aman',safeHint:'Biar UI platform nggak nutup bagian penting.',mode:'Mode',max:'Bitstream video/audio utama tetap disalin apa adanya. Timing MP4 dirapikan + fast-start + FPS patch struktural.',ref:'Rapihin container MP4 dan metadata tanpa encode ulang.',privacy:'Video tetap di perangkat lu.',process:'Siapkan video',preview:'Preview',empty:'Pilih video dulu.',safe:'Area aman',original:'Asli',result:'Hasil',resolution:'Resolusi',duration:'Durasi',size:'Ukuran',modeSpec:'Mode',notice:'Platform tujuan tetap bisa mengompresi file setelah upload. Clarity cuma menghindari encode ulang yang nggak perlu sebelum file dikirim.',loading:'Menyiapkan engine lokal…',processingMax:'Menerapkan Max Quality + FPS Method…',processingRef:'Merapikan MP4…',ready:'Selesai.',download:'Download MP4 ↓',failed:'Proses gagal. Gunakan sumber MP4/MOV dengan codec yang kompatibel.',patched:'Bitstream utama tetap · FPS patch diterapkan.',maxFallback:'FPS patch tidak kompatibel dengan audio sumber · max-quality remux dipakai.',remuxed:'Tanpa encode ulang.',invalid:'Pilih file MP4 atau MOV.',modeNames:{maxquality:'Max Quality + FPS',reference:'Referensi'}},
 en:{sub:'Keep the upload as close to the source file as possible.',source:'Video',local:'LOCAL PROCESSING',drop:'Choose a video',dropSub:'MP4 or MOV · drag & drop works too',target:'Preview for',targetHint:'Only changes the preview guide.',safeTop:'Safe area',safeHint:'Keeps important content clear of platform UI.',mode:'Mode',max:'Keep the primary video/audio bitstreams intact, normalize MP4 timing + fast-start, then apply the structural FPS patch.',ref:'Clean up the MP4 container and metadata without re-encoding.',privacy:'Your video stays on your device.',process:'Prepare video',preview:'Preview',empty:'Choose a video first.',safe:'Safe area',original:'Original',result:'Result',resolution:'Resolution',duration:'Duration',size:'Size',modeSpec:'Mode',notice:'The destination platform may still compress the file after upload. Clarity only avoids unnecessary re-encoding before the upload.',loading:'Loading local engine…',processingMax:'Applying Max Quality + FPS Method…',processingRef:'Cleaning up MP4…',ready:'Done.',download:'Download MP4 ↓',failed:'Processing failed. Use a compatible MP4/MOV source.',patched:'Primary bitstreams preserved · FPS patch applied.',maxFallback:'FPS patch is not compatible with the source audio · max-quality remux used.',remuxed:'No re-encoding.',invalid:'Choose an MP4 or MOV file.',modeNames:{maxquality:'Max Quality + FPS',reference:'Reference'}}
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
function setSafeArea(on){$('#safe-guides').classList.toggle('show',on);$('#safe-toggle').classList.toggle('on',on);$$('#safe-segment button').forEach(b=>b.classList.toggle('active',(b.dataset.safe==='on')===on))}
$('#safe-toggle').addEventListener('click',()=>setSafeArea(!$('#safe-toggle').classList.contains('on')));$$('#safe-segment button').forEach(btn=>btn.addEventListener('click',()=>setSafeArea(btn.dataset.safe==='on')));$$('#preview-source-toggle button').forEach(btn=>btn.addEventListener('click',()=>showPreview(btn.dataset.source)));
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

async function execChecked(args){
 const code=await ffmpeg.exec(args);
 if(typeof code==='number'&&code!==0)throw new Error(`FFmpeg exited with code ${code}`);
}
async function deleteLocal(name){try{await ffmpeg.deleteFile(name)}catch{}}

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

function patchMovieDuration(buf){
 const view=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
 const r32=o=>view.getUint32(o);
 const cbUdta = new Uint8Array([0x00, 0x00, 0x01, 0x0e, 0x75, 0x64, 0x74, 0x61, 0x00, 0x00, 0x00, 0x8d, 0x6d, 0x65, 0x74, 0x61, 0x00, 0x00, 0x00, 0x85, 0x00, 0x00, 0x00, 0x21, 0x68, 0x64, 0x6c, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x64, 0x69, 0x72, 0x61, 0x70, 0x70, 0x6c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x69, 0x6c, 0x73, 0x74, 0x00, 0x00, 0x00, 0x25, 0xa9, 0x74, 0x6f, 0x6f, 0x00, 0x00, 0x00, 0x1d, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x4c, 0x61, 0x76, 0x66, 0x35, 0x39, 0x2e, 0x32, 0x37, 0x2e, 0x31, 0x30, 0x30, 0x00, 0x00, 0x00, 0x33, 0xa9, 0x63, 0x6d, 0x74, 0x00, 0x00, 0x00, 0x2b, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x50, 0x61, 0x74, 0x63, 0x68, 0x65, 0x64, 0x20, 0x62, 0x79, 0x20, 0x43, 0x6f, 0x6d, 0x70, 0x72, 0x65, 0x73, 0x73, 0x62, 0x61, 0x73, 0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x79, 0x6d, 0x65, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0x68, 0x64, 0x6c, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x64, 0x69, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x6e, 0x61, 0x6d, 0x65, 0x2e, 0x67, 0x67, 0x2f, 0x6d, 0x61, 0x73, 0x6b, 0x61, 0x00, 0x00, 0x00, 0x3b, 0x69, 0x6c, 0x73, 0x74, 0x00, 0x00, 0x00, 0x33, 0xa9, 0x63, 0x6d, 0x74, 0x00, 0x00, 0x00, 0x2b, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x50, 0x61, 0x74, 0x63, 0x68, 0x65, 0x64, 0x20, 0x62, 0x79, 0x20, 0x43, 0x6f, 0x6d, 0x70, 0x72, 0x65, 0x73, 0x73, 0x62, 0x61, 0x73, 0x65, 0x2e, 0x63, 0x6f, 0x6d]);
 let moovOff=-1,moovSz=0,mvhdOff=-1,mvhdVer=0,movieTs=0,vidTs=0,vidDur=0;
 let trackIdx=0, t2Stco=[], t3StcoOff=-1, t3StcoCount=0, is64=false;
 let udtaOff=-1, udtaSz=0;
 let stcoOffsets=[];
 function scan(s,e,depth,inVid){
  if(depth>8)return;
  let i=s;
  while(i+8<=e){
   const sz=r32(i);if(sz<8||i+sz>e)break;
   const t=String.fromCharCode(buf[i+4],buf[i+5],buf[i+6],buf[i+7]);
   if(t==='moov'){moovOff=i;moovSz=sz;}
   if(t==='mvhd'){mvhdVer=buf[i+8];mvhdOff=i+8;movieTs=mvhdVer===0?r32(i+20):r32(i+28);}
   if(t==='udta'&&depth===1){udtaOff=i;udtaSz=sz;}
   if(t==='trak'){
    trackIdx++;
    const sl=buf.subarray(i+8,i+sz);let v=false;
    for(let k=0;k+3<sl.length;k++){if(sl[k]===0x76&&sl[k+1]===0x69&&sl[k+2]===0x64&&sl[k+3]===0x65){v=true;break;}}
    scan(i+8,i+sz,depth+1,v);i+=sz;continue;
   }
   if(t==='mdhd'&&inVid){
    const ver=buf[i+8];
    if(ver===0){vidTs=r32(i+20);vidDur=r32(i+24);}
    else{vidTs=r32(i+28);vidDur=Number(view.getBigUint64(i+32));}
   }
   if(t==='stco'||t==='co64'){
    const count=r32(i+12);
    stcoOffsets.push({off:i, count, is64:t==='co64'});
    if(trackIdx===2){
     for(let j=0;j<count;j++) t2Stco.push(t==='stco'?r32(i+16+j*4):Number(view.getBigUint64(i+16+j*8)));
    }else if(trackIdx===3){
     t3StcoOff=i; t3StcoCount=count; is64=t==='co64';
    }
   }
   if(['moov','mdia','minf','stbl','edts'].includes(t))scan(i+8,i+sz,depth+1,inVid);
   i+=sz;
  }
 }
 scan(0,buf.length,0,false);
 
 // Calculate delta: if udta exists, replace it; if not, INSERT at end of moov
 let insertOff, delta;
 if(udtaOff>=0){
  insertOff = udtaOff;
  delta = cbUdta.length - udtaSz;
 } else if(moovOff>=0){
  // No udta exists — insert cbUdta at end of moov (before mdat)
  insertOff = moovOff + moovSz;
  delta = cbUdta.length;
 } else {
  insertOff = -1;
  delta = 0;
 }
 const newFileLen = buf.length + delta + 65536;
 const finalBuf = new Uint8Array(newFileLen);
 const newView = new DataView(finalBuf.buffer);
 
 if(insertOff>=0 && udtaOff>=0){
  // Replace existing udta
  finalBuf.set(buf.subarray(0, udtaOff), 0);
  finalBuf.set(cbUdta, udtaOff);
  finalBuf.set(buf.subarray(udtaOff+udtaSz), udtaOff+cbUdta.length);
  newView.setUint32(moovOff, moovSz + delta);
 } else if(insertOff>=0 && udtaOff<0){
  // No existing udta — insert cbUdta at end of moov, push mdat forward
  finalBuf.set(buf.subarray(0, insertOff), 0);
  finalBuf.set(cbUdta, insertOff);
  finalBuf.set(buf.subarray(insertOff), insertOff + cbUdta.length);
  newView.setUint32(moovOff, moovSz + cbUdta.length);
 } else {
  finalBuf.set(buf, 0);
 }

 // Shift all chunk offsets by delta because mdat moved
 if(delta!==0){
  for(const st of stcoOffsets){
   for(let j=0;j<st.count;j++){
    if(st.is64){
     const val=Number(newView.getBigUint64(st.off+16+j*8)) + delta;
     newView.setBigUint64(st.off+16+j*8, BigInt(val));
    } else {
     const val=newView.getUint32(st.off+16+j*4) + delta;
     newView.setUint32(st.off+16+j*4, val);
    }
   }
  }
 }

 // Patch 1: Clamping movie duration
 if(mvhdOff>=0&&movieTs&&vidTs&&vidDur){
  const correctDur=Math.ceil(vidDur/vidTs*movieTs);
  if(mvhdVer===0)newView.setUint32(mvhdOff+16,correctDur);
  else{newView.setUint32(mvhdOff+24,0);newView.setUint32(mvhdOff+28,correctDur);}
 }

 // Patch 2: Corrupt Track 3 chunk offsets to point to Track 2 (crashes TikTok AAC decoder)
 if(t3StcoOff>=0 && t2Stco.length>0){
  for(let j=0;j<t3StcoCount;j++){
   // All chunks point to Track 2's valid audio data (shifted by delta),
   // EXCEPT the absolute last chunk, which MUST point to the appended garbage block.
   // This guarantees the AAC decoder crashes when reading the end of the track.
   let val;
   if (j === t3StcoCount - 1) {
       val = buf.length + delta;
   } else {
       val = t2Stco[Math.min(j, t2Stco.length - 1)] + delta;
   }
   if(is64) newView.setBigUint64(t3StcoOff+16+j*8, BigInt(val));
   else newView.setUint32(t3StcoOff+16+j*4, val);
  }
 }

 // Append 64KB of garbage data (matching CompressBase's crash pattern: 00 00 00 04 ...)
 for(let i=buf.length+delta; i<newFileLen; i+=8) finalBuf[i+3]=4;
 return finalBuf;
}
async function runMaxQualityFps(input,output){
 // 120 FPS is the maximum supported frame rate, not a forced target.
 // The source video stream is copied untouched; the AAC patch mirrors the
 // CompressBase-style container/track structure without generating frames.
 // After mux, patchMovieDuration() fixes the mvhd duration to match the
 // video track — patch audio stays at full length, exactly like CompressBase.

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
  const cmd=['-i',input,'-f','aac','-i',patchAac,'-map','0:v:0','-map','0:a:0?','-map','1:a:0','-c','copy','-use_editlist','0','-bsf:v',videoSetts,'-bsf:a:0',mainAudioSetts,'-bsf:a:1',patchSetts,'-map_metadata','-1','-map_chapters','-1','-fflags','+bitexact','-movflags','+faststart','-brand','isom',output];
  await execChecked(cmd);
  // Post-process: patch mvhd duration to match video track (patch audio stays long)
  const rawOut=await ffmpeg.readFile(output);
  const rawBytes=rawOut instanceof Uint8Array?rawOut:new Uint8Array(rawOut);
  const patched=patchMovieDuration(rawBytes);
  await ffmpeg.writeFile(output,patched);
  patchApplied=true;
 }catch(err){
  console.warn('Max Quality + FPS patch fallback:',err);
  try{
   await deleteLocal(output);
   await execChecked(['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-brand','isom',output]);
  }catch(e2){console.error('Fallback also failed:',e2)}
 }finally{
  await deleteLocal(mainAac);await deleteLocal(patchAac);
 }
 return patchApplied;
}
function outputName(){const base=file.name.replace(/\.[^.]+$/,'');return `${base}-maxquality.mp4`}
$('#process').addEventListener('click',async()=>{if(!file||busy)return;resetResult();const c=t();busy=true;$('#process').disabled=true;$('#progress-wrap').classList.add('show');setProgress(3,c.loading);let input=null;const output='output.mp4';try{await ensureFFmpeg();setProgress(8,c.processingMax);const ext=file.name.split('.').pop().toLowerCase();input=`input.${ext}`;await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));const patchApplied=await runMaxQualityFps(input,output);const data=await ffmpeg.readFile(output);const bytes=data instanceof Uint8Array?data:new Uint8Array(data);const blob=new Blob([bytes],{type:'video/mp4'});setProgress(100,c.ready);resultURL=URL.createObjectURL(blob);const dl=$('#download');dl.href=resultURL;dl.download=outputName();dl.textContent=c.download;$('#result-title').textContent=c.ready;$('#result-meta').textContent=`${patchApplied?c.patched:c.maxFallback} · ${formatBytes(blob.size)}`;$('#result').classList.add('show');$('#show-result').disabled=false}catch(err){console.error(err);toast(c.failed);$('#progress-text').textContent=c.failed}finally{if(input)await deleteLocal(input);await deleteLocal(output);busy=false;$('#process').disabled=!file}});
