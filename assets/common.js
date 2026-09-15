const translations={
  id:{tools:'Tools',homeBadge:'RVL TOOLS',homeTitle:'Tools buat video, tanpa ribet.',homeSub:'Clarity udah aktif. Tool lain nyusul.',openClarity:'Buka Clarity',viewTools:'Lihat tools',ourTools:'Pilih tool',toolsSub:'Satu tempat buat workflow media yang sering kepake.',clarityDesc:'Siapkan video tanpa encode ulang yang nggak perlu.',tiktokDesc:'Tool ini segera hadir.',youtubeDesc:'Tool ini segera hadir.',available:'AKTIF',soon:'SEGERA',openTool:'Buka tool',previewTool:'Lihat halaman',privacy:'Lokal',privacyDesc:'Clarity jalan di browser. File tetap di perangkat lu.',mobile:'Responsif',mobileDesc:'Nyaman dipakai dari HP sampai desktop.',simple:'Ringkas',simpleDesc:'Nggak ada menu yang nggak perlu.',back:'Balik ke RVL',tiktokPageSub:'Tool ini segera hadir.',youtubePageSub:'Tool ini segera hadir.',pasteTikTok:'Tempel link',pasteYouTube:'Tempel link',download:'Lanjut',comingShort:'Segera hadir',comingNote:'Belum tersedia. Lagi disiapin.',home:'Homepage'},
  en:{tools:'Tools',homeBadge:'RVL TOOLS',homeTitle:'Video tools, without the clutter.',homeSub:'Clarity is live. More tools are coming.',openClarity:'Open Clarity',viewTools:'View tools',ourTools:'Choose a tool',toolsSub:'One place for the media tasks you actually use.',clarityDesc:'Prepare video without unnecessary re-encoding.',tiktokDesc:'This tool is coming soon.',youtubeDesc:'This tool is coming soon.',available:'LIVE',soon:'SOON',openTool:'Open tool',previewTool:'View page',privacy:'Local',privacyDesc:'Clarity runs in your browser. Your file stays on your device.',mobile:'Responsive',mobileDesc:'Comfortable on mobile and desktop.',simple:'Simple',simpleDesc:'No unnecessary menus.',back:'Back to RVL',tiktokPageSub:'This tool is coming soon.',youtubePageSub:'This tool is coming soon.',pasteTikTok:'Paste link',pasteYouTube:'Paste link',download:'Continue',comingShort:'Coming soon',comingNote:'Not available yet. In progress.',home:'Homepage'}
};
function getLang(){return localStorage.getItem('reyval-lang')||'id'}
function applyBrand(){
  document.querySelectorAll('.brand').forEach(el=>{const text=[...el.children].find(x=>!x.classList.contains('brand-mark'));if(text)text.textContent='RVL'});
  document.querySelectorAll('.breadcrumbs a').forEach(a=>{if(/reyval/i.test(a.textContent))a.textContent='RVL'});
  document.querySelectorAll('.small-label').forEach(el=>{el.textContent=el.textContent.replace(/REYVAL/g,'RVL')});
  document.querySelectorAll('.footer span').forEach(el=>{el.textContent=el.textContent.replace(/Reyval/g,'RVL')});
  if(document.title.includes('Reyval'))document.title=document.title.replace(/Reyval/g,'RVL');
  const d=document.querySelector('meta[name="description"]');if(d&&d.content.includes('Reyval'))d.content=d.content.replace(/Reyval/g,'RVL');
}
function setLang(lang){localStorage.setItem('reyval-lang',lang);document.documentElement.lang=lang;document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;if(translations[lang]?.[key])el.textContent=translations[lang][key]});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const key=el.dataset.i18nPlaceholder;if(translations[lang]?.[key])el.placeholder=translations[lang][key]});document.querySelectorAll('[data-lang]').forEach(btn=>btn.classList.toggle('active',btn.dataset.lang===lang));applyBrand();window.dispatchEvent(new CustomEvent('reyval:lang',{detail:{lang}}))}

function installSiteBgm(){
  if(document.querySelector('#rvl-site-bgm'))return;
  const audio=document.createElement('audio');
  audio.id='rvl-site-bgm';audio.src='/assets/site-bgm.mp3';audio.preload='auto';audio.loop=true;audio.volume=.16;
  document.body.appendChild(audio);
  const style=document.createElement('style');
  style.textContent='.music-toggle{width:34px;height:34px;border:1px solid var(--line,#292929);border-radius:999px;background:#0e0e0e;color:#f2f2f2;display:grid;place-items:center;cursor:pointer;font-size:14px;line-height:1;transition:.18s ease}.music-toggle:hover{background:#171717;border-color:#444}.music-toggle.off{color:#666}.music-toggle .bars{display:flex;align-items:end;gap:2px;height:12px}.music-toggle .bars i{display:block;width:2px;background:currentColor;border-radius:2px;animation:rvlEq .8s ease-in-out infinite alternate}.music-toggle .bars i:nth-child(1){height:5px;animation-delay:-.4s}.music-toggle .bars i:nth-child(2){height:11px;animation-delay:-.15s}.music-toggle .bars i:nth-child(3){height:7px;animation-delay:-.55s}.music-toggle.off .bars i{animation:none;height:2px}@keyframes rvlEq{from{transform:scaleY(.45)}to{transform:scaleY(1)}}';
  document.head.appendChild(style);
  const btn=document.createElement('button');
  btn.type='button';btn.className='music-toggle';btn.setAttribute('aria-label','Toggle background music');btn.innerHTML='<span class="bars"><i></i><i></i><i></i></span>';
  const navRight=document.querySelector('.nav-right');if(navRight)navRight.insertBefore(btn,navRight.firstChild);
  const pref=localStorage.getItem('rvl-bgm-enabled');
  let enabled=pref!=='0';
  const stored=Number(sessionStorage.getItem('rvl-bgm-time')||0);
  const syncButton=()=>btn.classList.toggle('off',!enabled);
  syncButton();
  audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(stored)&&stored>0&&audio.duration)audio.currentTime=stored%audio.duration},{once:true});
  const saveTime=()=>{if(Number.isFinite(audio.currentTime))sessionStorage.setItem('rvl-bgm-time',String(audio.currentTime))};
  setInterval(saveTime,1000);window.addEventListener('beforeunload',saveTime);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveTime()});
  const tryPlay=()=>{if(!enabled)return;audio.play().catch(()=>{})};
  const firstGesture=()=>{tryPlay();window.removeEventListener('pointerdown',firstGesture,true);window.removeEventListener('keydown',firstGesture,true)};
  window.addEventListener('pointerdown',firstGesture,true);window.addEventListener('keydown',firstGesture,true);
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enabled=!enabled;localStorage.setItem('rvl-bgm-enabled',enabled?'1':'0');syncButton();if(enabled)tryPlay();else audio.pause()});
}

document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>setLang(btn.dataset.lang)));setLang(getLang());applyBrand();installSiteBgm()});
