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
  const tryPlay=()=>{if(!enabled)return Promise.resolve(false);return audio.play().then(()=>true).catch(()=>false)};
  const unlockEvents=['pointerdown','pointerup','touchstart','touchend','keydown'];
  const removeUnlock=()=>unlockEvents.forEach(type=>window.removeEventListener(type,firstGesture,true));
  const firstGesture=()=>{tryPlay().then(ok=>{if(ok)removeUnlock()})};
  unlockEvents.forEach(type=>window.addEventListener(type,firstGesture,true));
  tryPlay();
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enabled=!enabled;localStorage.setItem('rvl-bgm-enabled',enabled?'1':'0');syncButton();if(enabled)tryPlay();else audio.pause()});
}

function installModernUI(){
  if(document.querySelector('#rvl-modern-ui'))return;
  const style=document.createElement('style');
  style.id='rvl-modern-ui';
  style.textContent=`
    :root{--rvl-violet:#8b7cff;--rvl-blue:#58c8ff;--rvl-pink:#ff7eb6;--rvl-mint:#68e6c2;--rvl-glow:rgba(139,124,255,.18)}
    body{background:radial-gradient(700px 460px at 12% 4%,rgba(88,200,255,.075),transparent 62%),radial-gradient(760px 480px at 88% 8%,rgba(139,124,255,.095),transparent 64%),radial-gradient(640px 420px at 50% 100%,rgba(255,126,182,.045),transparent 70%),#090909!important}
    body:before{background:linear-gradient(180deg,rgba(255,255,255,.018),transparent 26%)!important}
    .nav{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    .brand-mark{position:relative;overflow:hidden;border-color:rgba(139,124,255,.42)!important;background:linear-gradient(145deg,rgba(88,200,255,.16),rgba(139,124,255,.13) 55%,#0d0d0d)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 22px rgba(139,124,255,.10)!important}
    .brand-mark:before{content:"";position:absolute;inset:-35%;background:linear-gradient(120deg,transparent 30%,rgba(255,255,255,.13),transparent 70%);transform:translateX(-80%);animation:rvlShine 5.5s ease-in-out infinite}
    @keyframes rvlShine{0%,72%,100%{transform:translateX(-80%)}84%{transform:translateX(80%)}}
    .eyebrow{border-color:rgba(139,124,255,.26)!important;background:linear-gradient(180deg,rgba(139,124,255,.075),rgba(255,255,255,.018))!important;box-shadow:0 0 28px rgba(139,124,255,.07)}
    .eyebrow-dot{background:linear-gradient(180deg,var(--rvl-blue),var(--rvl-violet))!important;box-shadow:0 0 15px rgba(88,200,255,.4)!important}
    .btn,.tool-card,.mode,.feature,.panel,.download-card,.spec,.segmented,.mini-segmented,.switch,.music-toggle,.lang button,.nav-link{transition:transform .16s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease,color .18s ease!important}
    .btn.primary{background:linear-gradient(135deg,#fff 0%,#eef3ff 45%,#ddd8ff 100%)!important;border-color:rgba(255,255,255,.85)!important;box-shadow:0 8px 26px rgba(139,124,255,.12)}
    .btn.primary:hover{box-shadow:0 10px 34px rgba(139,124,255,.20),0 0 0 1px rgba(139,124,255,.12)}
    .tool-card{background:linear-gradient(180deg,rgba(21,21,23,.96),rgba(13,13,15,.98))!important}
    .tool-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(135deg,rgba(88,200,255,.035),transparent 34%,rgba(139,124,255,.04) 72%,rgba(255,126,182,.025));opacity:.9}
    .tool-card:hover{border-color:rgba(139,124,255,.34)!important;box-shadow:0 18px 45px rgba(0,0,0,.28),0 0 34px rgba(139,124,255,.06)}
    .tool-card:nth-child(2):hover{border-color:rgba(88,200,255,.32)!important}.tool-card:nth-child(3):hover{border-color:rgba(255,126,182,.28)!important}
    .tool-icon{background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(139,124,255,.055))!important;border-color:rgba(255,255,255,.11)!important}
    .status-pill.live{color:#c9ffe9!important;border-color:rgba(104,230,194,.28)!important;background:rgba(104,230,194,.065)!important}
    .panel,.download-card{box-shadow:0 18px 60px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.015)}
    .mode.active{border-color:rgba(139,124,255,.55)!important;background:linear-gradient(180deg,rgba(139,124,255,.09),rgba(22,22,22,.98))!important;box-shadow:inset 0 0 0 1px rgba(139,124,255,.08),0 0 28px rgba(139,124,255,.055)!important}
    .mode.active .mode-check{border-color:#ebe8ff!important;box-shadow:0 0 13px rgba(139,124,255,.28)}
    .segmented button.active,.mini-segmented button.active,.lang button.active{background:linear-gradient(180deg,rgba(139,124,255,.16),rgba(255,255,255,.055))!important;box-shadow:inset 0 0 0 1px rgba(139,124,255,.10)}
    .switch.on i{background:linear-gradient(180deg,var(--rvl-blue),var(--rvl-violet))!important;box-shadow:0 0 10px rgba(88,200,255,.32)}
    .music-toggle:not(.off){border-color:rgba(139,124,255,.34)!important;background:linear-gradient(145deg,rgba(88,200,255,.08),rgba(139,124,255,.09),#0e0e0e)!important;box-shadow:0 0 18px rgba(139,124,255,.07)}
    .feature:hover,.spec:hover{border-color:rgba(139,124,255,.22)!important;background:#111113!important}
    .clickable-rvl{position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .clickable-rvl.rvl-press{transform:scale(.965)!important}
    .clickable-rvl .rvl-ripple{position:absolute;pointer-events:none;border-radius:50%;width:12px;height:12px;transform:translate(-50%,-50%) scale(0);background:radial-gradient(circle,rgba(255,255,255,.34),rgba(139,124,255,.16) 42%,transparent 70%);animation:rvlRipple .52s ease-out forwards;z-index:8}
    @keyframes rvlRipple{to{transform:translate(-50%,-50%) scale(12);opacity:0}}
    .rvl-credit{width:min(calc(100% - 32px),1160px);margin:18px auto 28px;text-align:center;color:#777;font-size:12px;letter-spacing:.01em}
    .rvl-credit span{background:linear-gradient(90deg,#aaa,#fff,#c9c3ff,#aaa);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:rvlCredit 8s linear infinite}
    @keyframes rvlCredit{to{background-position:200% center}}
    @media(max-width:600px){.rvl-credit{margin-top:12px;margin-bottom:22px}.music-toggle{width:32px;height:32px}}
    @media(prefers-reduced-motion:reduce){.brand-mark:before,.rvl-credit span,.music-toggle .bars i{animation:none!important}.clickable-rvl .rvl-ripple{display:none}}
  `;
  document.head.appendChild(style);

  const selector='button,.btn,.tool-card,.mode,.switch,.nav-link,.brand,.text-link,.download-card a,.segmented button,.mini-segmented button,.lang button';
  const mark=()=>document.querySelectorAll(selector).forEach(el=>el.classList.add('clickable-rvl'));
  mark();
  const observer=new MutationObserver(mark);observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('pointerdown',e=>{
    const el=e.target.closest(selector);if(!el||el.disabled)return;
    el.classList.add('rvl-press');
    const rect=el.getBoundingClientRect();const ripple=document.createElement('span');ripple.className='rvl-ripple';ripple.style.left=`${e.clientX-rect.left}px`;ripple.style.top=`${e.clientY-rect.top}px`;el.appendChild(ripple);
    setTimeout(()=>ripple.remove(),560);
  });
  const clearPress=e=>{const el=e.target.closest(selector);if(el)el.classList.remove('rvl-press')};
  document.addEventListener('pointerup',clearPress);document.addEventListener('pointercancel',clearPress);document.addEventListener('pointerleave',clearPress,true);

  if(!document.querySelector('.rvl-credit')){
    const credit=document.createElement('div');credit.className='rvl-credit';credit.innerHTML='<span>Made with ❤️ by Rey</span>';document.body.appendChild(credit);
  }
}

document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>setLang(btn.dataset.lang)));setLang(getLang());applyBrand();installSiteBgm();installModernUI()});
