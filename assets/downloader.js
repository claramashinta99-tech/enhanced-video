const RVL_API='https://rvl-api.onrender.com';
const qs=s=>document.querySelector(s);
const platform=document.body.dataset.platform||'youtube';
const input=qs('#media-url');
const inspectBtn=qs('#inspect-btn');
const card=qs('#media-card');
const statusEl=qs('#download-status');
const thumb=qs('#media-thumb');
const titleEl=qs('#media-title');
const metaEl=qs('#media-meta');
const quality=qs('#quality');
const downloadBtn=qs('#download-btn');
let current=null;

const css=document.createElement('style');
css.textContent=`
.media-card{display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:16px}.media-card.show{display:grid;grid-template-columns:132px 1fr;gap:14px}.media-thumb{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:13px;background:#171717;border:1px solid var(--line)}.media-info{min-width:0}.media-title{font-weight:700;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.media-meta{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45}.media-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:13px}.quality-select{width:100%;border:1px solid #303030;background:#0a0a0a;color:#fff;border-radius:13px;padding:12px 13px;outline:none}.quality-select:disabled{opacity:.5}.download-status-text{margin-top:12px;font-size:11px;color:var(--muted);min-height:16px}.download-status-text.error{color:#ff9d9d}.download-status-text.ok{color:#b8f3c5}@media(max-width:600px){.media-card.show{grid-template-columns:92px 1fr}.media-thumb{width:92px}.media-actions{grid-template-columns:1fr}.download-input-wrap{grid-template-columns:1fr}}
`;
document.head.appendChild(css);

function lang(){return localStorage.getItem('reyval-lang')||'id'}
function text(id,en){return lang()==='en'?en:id}
function fmtDuration(s){if(!Number.isFinite(Number(s)))return'';s=Math.round(Number(s));const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`}
function setStatus(msg,type=''){statusEl.textContent=msg;statusEl.className='download-status-text'+(type?' '+type:'')}
function validForPlatform(url){
  try{const h=new URL(url).hostname.toLowerCase();return platform==='youtube'?(/(^|\.)youtube\.com$/.test(h)||h==='youtu.be'):(/(^|\.)tiktok\.com$/.test(h));}catch{return false}
}
function filenameFromDisposition(value,fallback){
  const m=value&&value.match(/filename\*=UTF-8''([^;]+)/i);if(m){try{return decodeURIComponent(m[1])}catch{}}
  const q=value&&value.match(/filename="([^"]+)"/i);return q?q[1]:fallback;
}

async function inspect(){
  const url=input.value.trim();current=null;card.classList.remove('show');downloadBtn.disabled=true;quality.disabled=true;
  if(!validForPlatform(url)){setStatus(text(platform==='youtube'?'Tempel link YouTube yang valid.':'Tempel link TikTok yang valid.',platform==='youtube'?'Paste a valid YouTube link.':'Paste a valid TikTok link.'),'error');return}
  inspectBtn.disabled=true;input.disabled=true;setStatus(text('Mengecek link…','Checking link…'));
  try{
    const r=await fetch(`${RVL_API}/api/info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.detail||text('Link nggak bisa dibaca.','Could not read this link.'));
    current={url,data};
    thumb.src=data.thumbnail||'';thumb.alt=data.title||'Media thumbnail';
    titleEl.textContent=data.title||'Untitled';
    const bits=[];if(data.uploader)bits.push(data.uploader);if(data.duration)bits.push(fmtDuration(data.duration));metaEl.textContent=bits.join(' · ');
    quality.innerHTML='';(data.choices||[]).forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;quality.appendChild(o)});
    quality.disabled=false;downloadBtn.disabled=false;card.classList.add('show');setStatus(text('Siap. Pilih kualitas lalu download.','Ready. Choose a quality and download.'),'ok');
  }catch(e){console.error(e);setStatus(e.message||text('Gagal mengecek link.','Failed to check link.'),'error')}
  finally{inspectBtn.disabled=false;input.disabled=false}
}

async function download(){
  if(!current)return;downloadBtn.disabled=true;quality.disabled=true;inspectBtn.disabled=true;setStatus(text('Menyiapkan file… ini bisa beberapa saat.','Preparing file… this may take a moment.'));
  try{
    const r=await fetch(`${RVL_API}/api/download`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,quality:quality.value})});
    if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.detail||text('Download gagal.','Download failed.'))}
    const blob=await r.blob();const ext=quality.value==='audio'?'mp3':'mp4';const fallback=`RVL-${platform}-${Date.now()}.${ext}`;const name=filenameFromDisposition(r.headers.get('content-disposition'),fallback);const a=document.createElement('a');const objectURL=URL.createObjectURL(blob);a.href=objectURL;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),30000);setStatus(text('Selesai. File udah mulai didownload.','Done. Your download has started.'),'ok');
  }catch(e){console.error(e);setStatus(e.message||text('Download gagal.','Download failed.'),'error')}
  finally{downloadBtn.disabled=false;quality.disabled=false;inspectBtn.disabled=false}
}

inspectBtn.addEventListener('click',inspect);downloadBtn.addEventListener('click',download);input.addEventListener('keydown',e=>{if(e.key==='Enter')inspect()});
window.addEventListener('reyval:lang',()=>{if(current)setStatus(text('Siap. Pilih kualitas lalu download.','Ready. Choose a quality and download.'),'ok')});
