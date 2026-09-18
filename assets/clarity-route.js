await import(`/assets/clarity.js?route=${Date.now()}`);

const isMethodRoute=()=>location.pathname==='/clarity/'||location.pathname==='/clarity';

const copy={
  id:{
    sub:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',
    notice:'TikTok tetap bisa melakukan kompresi setelah upload. TikTok Method membantu menghindari encode ulang yang nggak perlu sebelum file dikirim.',
    guideTitle:'Cara upload hasil ke <span class="guide-key key-studio">TikTok Studio</span>',
    guideIntro:'Setelah video selesai diproses, upload lewat <span class="guide-key key-studio">TikTok Studio</span> di <span class="guide-key key-edge">Microsoft Edge</span> supaya alurnya konsisten dan gampang diikuti.',
    s1Title:'Login TikTok di <span class="guide-key key-edge">Microsoft Edge</span>',
    s1Text:'Buka tiktok.com di <span class="guide-key key-edge">Microsoft Edge</span> lalu login ke akun TikTok yang mau dipakai upload.',
    s2Title:'Aktifkan <span class="guide-key key-desktop">mode desktop</span>',
    s2Text:'Kalau dari HP atau tablet, buka menu Edge lalu aktifkan <span class="guide-key key-desktop">Situs desktop / Desktop site</span>. Di PC atau laptop, langkah ini bisa dilewati.',
    s3Title:'Buka <span class="guide-key key-studio">TikTok Studio</span>',
    s3Text:'Masuk ke <span class="guide-key key-studio">TikTok Studio</span> lewat browser yang sama supaya sesi login tetap aktif.',
    s4Title:'Klik tombol <span class="guide-key key-upload">Upload</span>',
    s4Text:'Klik tombol <span class="guide-key key-upload">Upload</span> di TikTok Studio untuk memilih video hasil <span class="guide-key key-method">TikTok Method</span>.',
    s5Title:'Pilih video hasil & <span class="guide-key key-upload">upload</span>',
    s5Text:'Pilih file hasil dari <span class="guide-key key-method">TikTok Method</span>, cek preview dan caption, lalu klik <span class="guide-key key-upload">Upload</span>.',
    guideNote:'TikTok tetap dapat melakukan kompresi setelah file dikirim. Tutorial ini mengatur jalur upload, bukan menjamin TikTok tidak akan memproses ulang video.',
    studio:'Buka <span class="guide-key key-studio">TikTok Studio</span> ↗',
    demo:'Lihat demo',
    demoTitle:'Demo upload <span class="guide-key key-studio">TikTok Studio</span>'
  },
  en:{
    sub:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',
    notice:'TikTok may still compress the video after upload. TikTok Method helps avoid unnecessary re-encoding before the file is sent.',
    guideTitle:'How to upload the result with <span class="guide-key key-studio">TikTok Studio</span>',
    guideIntro:'After processing finishes, upload through <span class="guide-key key-studio">TikTok Studio</span> in <span class="guide-key key-edge">Microsoft Edge</span> for a consistent, easy-to-follow workflow.',
    s1Title:'Log in to TikTok in <span class="guide-key key-edge">Microsoft Edge</span>',
    s1Text:'Open tiktok.com in <span class="guide-key key-edge">Microsoft Edge</span> and log in to the TikTok account you want to use for the upload.',
    s2Title:'Enable <span class="guide-key key-desktop">desktop mode</span>',
    s2Text:'On a phone or tablet, open the Edge menu and enable <span class="guide-key key-desktop">Desktop site</span>. On a PC or laptop, skip this step.',
    s3Title:'Open <span class="guide-key key-studio">TikTok Studio</span>',
    s3Text:'Open <span class="guide-key key-studio">TikTok Studio</span> in the same browser so your login session stays active.',
    s4Title:'Click <span class="guide-key key-upload">Upload</span>',
    s4Text:'Click <span class="guide-key key-upload">Upload</span> in TikTok Studio to choose the video produced by <span class="guide-key key-method">TikTok Method</span>.',
    s5Title:'Choose the result & <span class="guide-key key-upload">upload</span>',
    s5Text:'Choose the file produced by <span class="guide-key key-method">TikTok Method</span>, check the preview and caption, then click <span class="guide-key key-upload">Upload</span>.',
    guideNote:'TikTok may still compress media after upload. This tutorial standardizes the upload path; it does not guarantee TikTok will not process the video again.',
    studio:'Open <span class="guide-key key-studio">TikTok Studio</span> ↗',
    demo:'View demo',
    demoTitle:'<span class="guide-key key-studio">TikTok Studio</span> upload demo'
  }
};

const GUIDE_CSS=String.raw`
.tiktok-upload-guide{padding:0 0 34px}.tiktok-upload-guide .panel{max-width:none}
.upload-guide-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.upload-guide-intro{margin:0;color:var(--muted);font-size:13px;line-height:1.7;max-width:760px}
.upload-demo-btn{flex:0 0 auto;min-width:138px}.demo-play{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff;color:#161326;font-size:9px;box-shadow:0 0 18px rgba(110,216,255,.38)}
.upload-guide-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.upload-guide-step{min-width:0;border:2px solid #35446a;background:linear-gradient(180deg,rgba(16,23,43,.96),rgba(10,16,31,.96));padding:11px;box-shadow:4px 4px 0 #070a14;transition:transform .16s ease,border-color .16s ease}.upload-guide-step:hover{transform:translateY(-3px);border-color:#6ed8ff}
.upload-step-head{display:flex;align-items:flex-start;gap:9px;min-height:52px}.upload-step-num{display:grid!important;place-items:center!important;flex:0 0 28px;width:28px!important;height:28px!important;border:2px solid #263453!important;background:#0c1224!important;color:#aa8cff!important;font-weight:800!important;font-size:10px!important;box-shadow:2px 2px 0 #070a14}.upload-step-head b{display:block;font-size:12px;line-height:1.35;margin-top:2px}.upload-guide-step>p{margin:10px 1px 0;color:#aab5d3;font-size:10px;line-height:1.55}
.guide-key{position:relative;display:inline-block;font-weight:800!important;letter-spacing:.01em;background:linear-gradient(90deg,#f5f1ff,#8fe9ff,#d3a8ff,#ff99cf);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;filter:drop-shadow(0 0 6px rgba(170,140,255,.28));animation:guideKeyFlow 3.2s linear infinite}.guide-key:after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:linear-gradient(90deg,transparent,currentColor,transparent);opacity:.65;transform-origin:center;animation:guideKeyLine 2s ease-in-out infinite}.key-edge{--key:#6ed8ff}.key-desktop{--key:#aa8cff}.key-studio{--key:#ff91c8}.key-upload{--key:#77e8c1}.key-method{--key:#ffd977}.guide-key:after{background:linear-gradient(90deg,transparent,var(--key),transparent);box-shadow:0 0 8px var(--key)}
@keyframes guideKeyFlow{to{background-position:220% 0}}@keyframes guideKeyLine{0%,100%{transform:scaleX(.35);opacity:.25}50%{transform:scaleX(1);opacity:.9}}
.guide-shot{position:relative;width:100%;aspect-ratio:9/16;margin-top:8px;border:3px solid #070a14;background:#080e1c;overflow:hidden;box-shadow:0 0 0 1px #35446a,0 10px 26px rgba(0,0,0,.32);font-family:var(--font-ui)!important;color:#f8fbff}.shot-browser{height:10%;display:grid;grid-template-columns:18px 1fr 18px;align-items:center;gap:4px;padding:0 7px;background:#141d31;border-bottom:1px solid #263453;font-size:8px}.shot-browser div{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#1b2941;border:1px solid #30415f;border-radius:6px;padding:4px 5px;color:#d7e2f5}
.shot-login-body{height:90%;display:flex;flex-direction:column;align-items:center;padding:19% 7% 8%;gap:7px}.shot-tiktok{font-size:34px;font-weight:900;text-shadow:-3px 0 #25f4ee,3px 0 #fe2c55}.shot-login-body strong{font-size:20px}.shot-login-body small{font-size:8px;color:#aab5d3}.shot-login-btn{width:100%;padding:9px 4px;text-align:center;margin-top:5px;background:#fe2c55!important;color:#fff!important;font-size:10px;font-weight:800}.shot-option{width:100%;border:1px solid #263453;background:#0e1729;padding:7px;font-size:7px}.shot-hot{position:relative;border:2px solid #ff64c8!important;box-shadow:0 0 0 2px rgba(255,100,200,.18),0 0 18px rgba(255,100,200,.48)!important;animation:shotPulse 1.45s ease-in-out infinite}.shot-pointer{position:absolute;color:#ff4fa7;font-size:26px;font-weight:900;filter:drop-shadow(0 0 5px rgba(255,79,167,.6));animation:pointerNudge .8s ease-in-out infinite alternate}
.shot-login .shot-pointer{right:9%;top:49%}.shot-menu{position:relative;margin:7% 7%;padding:8px;background:#1a2437;border:1px solid #35446a;box-shadow:0 12px 28px rgba(0,0,0,.38);font-size:8px}.shot-menu>div{padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.06)}.shot-desktop-row{display:flex;align-items:center;justify-content:space-between;background:#1e2940}.shot-desktop-row i,.shot-switch-row i{display:block;width:24px;height:12px;border-radius:999px;background:#3189ff;box-shadow:inset 11px 0 0 #b7dbff}.shot-desktop .shot-pointer{right:10%;top:48%}
.shot-studio-head{height:10%;display:flex;align-items:center;justify-content:space-between;padding:0 8px;background:#fff;color:#111;font-size:8px}.shot-studio-body{height:80%;display:grid;grid-template-columns:22% 1fr;background:#fff;color:#172033}.shot-sidebar{display:flex;flex-direction:column;align-items:center;gap:17px;padding-top:12px;border-right:1px solid #e5e8ef;color:#57657d;font-size:11px}.shot-sidebar b{color:#ff315c}.shot-studio-main{padding:25% 9% 8%;text-align:center}.shot-studio-main strong{font-size:13px}.shot-studio-main small{display:block;margin-top:10px;font-size:7px;color:#7a8498;line-height:1.5}.shot-chart{height:48px;display:flex;align-items:end;justify-content:center;gap:4px;margin-top:18px}.shot-chart i{width:10px;background:#a98cff}.shot-chart i:nth-child(1){height:12px}.shot-chart i:nth-child(2){height:24px}.shot-chart i:nth-child(3){height:33px}.shot-chart i:nth-child(4){height:44px}
.shot-upload-pill{padding:5px 8px;background:#fe2c55!important;color:#fff!important;font-size:7px}.shot-dashboard{position:relative;height:80%;padding:18% 7% 5%;background:#fff;color:#151b26}.shot-dashboard strong{font-size:12px}.shot-dashboard small{display:block;margin-top:7px;font-size:7px;color:#7a8498;line-height:1.45}.shot-tabs{display:flex;gap:12px;margin:16px 0 9px;font-size:7px}.shot-tabs b{color:#ff315c}.shot-row{height:31px;margin-top:7px;background:linear-gradient(90deg,#e9edf5 24%,#f6f7fa 24%);border-radius:3px}.shot-upload .shot-pointer{right:9%;top:20%}
.shot-final-body{position:relative;height:90%;padding:8% 7%;background:#fff;color:#172033}.shot-thumb{height:28%;display:grid;place-items:center;background:linear-gradient(160deg,#ff91c8,#6d74e8 55%,#30238e);color:#fff;font-weight:900;font-size:14px}.shot-file{margin:7px 0 10px;font-size:7px;color:#65738a;overflow:hidden;text-overflow:ellipsis}.shot-final-body label{font-size:7px;font-weight:700}.shot-caption{height:42px;margin-top:4px;border:1px solid #ccd3df;padding:6px;font-size:7px}.shot-switch-row{display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-size:7px}.shot-final-upload{margin-top:12px;background:#fe2c55!important;color:#fff!important;text-align:center;padding:9px;font-size:9px;font-weight:800}.shot-final .shot-pointer{right:8%;bottom:8%}
@keyframes shotPulse{0%,100%{filter:brightness(1);transform:scale(1)}50%{filter:brightness(1.18);transform:scale(1.025)}}@keyframes pointerNudge{to{transform:translate(4px,4px)}}
.upload-guide-action{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding-top:16px;border-top:2px dashed #35446a}.upload-guide-action small{color:#7f8caf;line-height:1.55;max-width:760px}.upload-guide-action .btn{white-space:nowrap}#open-tiktok-studio .guide-key{background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;color:#111827!important;filter:none!important;text-shadow:none!important;animation:none!important}#open-tiktok-studio .guide-key:after{background:linear-gradient(90deg,transparent,#7c3aed,transparent)!important;box-shadow:0 0 8px rgba(124,58,237,.45)!important}
.guide-demo-modal{position:fixed;inset:0;z-index:10020;display:none;place-items:center;padding:18px}.guide-demo-modal.show{display:grid}.guide-demo-backdrop{position:absolute;inset:0;background:rgba(2,5,14,.82);backdrop-filter:blur(8px)}.guide-demo-dialog{position:relative;width:min(92vw,430px);border:3px solid #35446a;background:#0d1528;box-shadow:10px 10px 0 #070a14,0 0 60px rgba(170,140,255,.16);padding:14px}.guide-demo-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.guide-demo-head b{display:block;margin-top:7px;font-size:15px}.guide-demo-close{width:34px;height:34px;border:2px solid #35446a;background:#151d34;color:#fff;cursor:pointer}.guide-demo-stage{position:relative;display:grid;place-items:center;margin-top:12px;overflow:hidden}.guide-demo-gif{display:block;width:min(100%,270px);height:auto;aspect-ratio:9/16;object-fit:cover;border:3px solid #070a14;box-shadow:0 0 0 1px #35446a,0 12px 34px rgba(0,0,0,.38);background:#080e1c}.guide-demo-foot{display:flex;align-items:center;justify-content:center;gap:12px;padding-top:10px;border-top:1px solid #263453;color:#aab5d3;font-size:10px}.guide-demo-open{overflow:hidden}
@media(max-width:1040px){.upload-guide-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.guide-shot{max-width:245px;margin-left:auto;margin-right:auto}.upload-step-head{min-height:0}}
@media(max-width:620px){.upload-guide-top{flex-direction:column}.upload-demo-btn{width:100%}.upload-guide-steps{grid-template-columns:1fr}.upload-guide-step{padding:13px}.guide-shot{max-width:270px}.upload-guide-action{align-items:stretch;flex-direction:column}.upload-guide-action .btn{width:100%}.guide-demo-dialog{padding:11px}}
@media(prefers-reduced-motion:reduce){.guide-key,.guide-key:after,.shot-hot,.shot-pointer{animation:none!important}}
`;

function installGuideStyle(){
  if(document.querySelector('#rvl-upload-guide-style'))return;
  const style=document.createElement('style');
  style.id='rvl-upload-guide-style';
  style.textContent=GUIDE_CSS;
  document.head.appendChild(style);
}

function setHTML(selector,value){
  const el=document.querySelector(selector);
  if(el&&el.innerHTML!==value)el.innerHTML=value;
}

function closeUploadDemo(){
  const modal=document.querySelector('#upload-demo-modal');
  if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
  document.body.classList.remove('guide-demo-open');
}
window.__RVL_CLOSE_UPLOAD_DEMO__=closeUploadDemo;

function bindUploadDemo(){
  if(!isMethodRoute())return;
  const button=document.querySelector('#upload-demo-btn');
  const modal=document.querySelector('#upload-demo-modal');
  const gif=document.querySelector('#upload-demo-gif');
  if(!button||!modal||!gif)return;

  const open=()=>{
    closeUploadDemo();
    const base=(gif.getAttribute('src')||'../assets/tutorial/tiktok-upload-demo.gif').split('?')[0];
    gif.src=`${base}?v=1&t=${Date.now()}`;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('guide-demo-open');
    modal.querySelector('.guide-demo-close')?.focus();
  };

  if(!button.dataset.rvlBound){
    button.dataset.rvlBound='1';
    button.addEventListener('click',open);
  }
  modal.querySelectorAll('[data-demo-close]').forEach(el=>{
    if(el.dataset.rvlBound)return;
    el.dataset.rvlBound='1';
    el.addEventListener('click',closeUploadDemo);
  });
}
function applyTikTokMethod(){
  if(!isMethodRoute())return;
  installGuideStyle();
  const lang=localStorage.getItem('reyval-lang')||'id';
  const c=copy[lang]||copy.id;
  document.title='TikTok Method — RVL';
  const desc=document.querySelector('meta[name="description"]');if(desc)desc.content='TikTok Method — alat untuk menyiapkan video sebelum upload ke TikTok agar kualitas tetap semaksimal mungkin.';
  const title=document.querySelector('.page-title');if(title&&title.textContent!=='TikTok Method')title.textContent='TikTok Method';
  const crumbs=document.querySelectorAll('.breadcrumbs span');const crumb=crumbs[crumbs.length-1];if(crumb&&crumb.textContent!=='TikTok Method')crumb.textContent='TikTok Method';
  const sub=document.querySelector('#clarity-sub');if(sub&&sub.textContent!==c.sub)sub.textContent=c.sub;
  const notice=document.querySelector('#notice');if(notice&&notice.textContent!==c.notice)notice.textContent=c.notice;

  const htmlMap={
    '#upload-guide-title':'guideTitle','#upload-guide-intro':'guideIntro',
    '#upload-step-1-title':'s1Title','#upload-step-1-text':'s1Text',
    '#upload-step-2-title':'s2Title','#upload-step-2-text':'s2Text',
    '#upload-step-3-title':'s3Title','#upload-step-3-text':'s3Text',
    '#upload-step-4-title':'s4Title','#upload-step-4-text':'s4Text',
    '#upload-step-5-title':'s5Title','#upload-step-5-text':'s5Text',
    '#upload-guide-note':'guideNote','#open-tiktok-studio':'studio',
    '#upload-demo-label':'demo','#upload-demo-title':'demoTitle'
  };
  Object.entries(htmlMap).forEach(([selector,key])=>setHTML(selector,c[key]));
  bindUploadDemo();
}

if(!window.__RVL_UPLOAD_DEMO_KEY_BOUND__){
  window.__RVL_UPLOAD_DEMO_KEY_BOUND__=true;
  window.addEventListener('keydown',e=>{if(e.key==='Escape')window.__RVL_CLOSE_UPLOAD_DEMO__?.()});
}

applyTikTokMethod();
window.addEventListener('reyval:lang',()=>setTimeout(applyTikTokMethod,0));
window.addEventListener('rvl:route',()=>{
  if(!isMethodRoute())closeUploadDemo();
  setTimeout(applyTikTokMethod,0);
});
setTimeout(applyTikTokMethod,0);
