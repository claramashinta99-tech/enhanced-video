(()=>{
  if(window.__RVL_NAV_UI__) return;
  window.__RVL_NAV_UI__=true;

  const tools=[
    ['TikTok Method','/clarity/'],
    ['TikTok Downloader','/tiktok-downloader/'],
    ['YouTube Video','/youtube-downloader/'],
    ['YouTube Shorts','/youtube-shorts/'],
    ['YouTube MP3','/youtube-mp3/']
  ];

  function ensureLiteMusic(navRight){
    let btn=navRight.querySelector('.music-toggle');
    if(btn){
      btn.textContent='Music';
      btn.classList.add('rvl-music-text');
      return;
    }

    const audio=document.createElement('audio');
    audio.id='rvl-site-bgm';
    audio.src='/assets/site-bgm.mp3';
    audio.preload='metadata';
    audio.loop=true;
    audio.volume=.16;
    document.body.appendChild(audio);

    btn=document.createElement('button');
    btn.type='button';
    btn.className='music-toggle rvl-music-text';
    btn.textContent='Music';
    btn.setAttribute('aria-label','Toggle background music');
    navRight.prepend(btn);

    const pref=localStorage.getItem('rvl-bgm-enabled');
    let enabled=pref!=='0';
    const stored=Number(sessionStorage.getItem('rvl-bgm-time')||0);
    const sync=()=>btn.classList.toggle('off',!enabled);
    const save=()=>{if(Number.isFinite(audio.currentTime))sessionStorage.setItem('rvl-bgm-time',String(audio.currentTime))};
    const play=()=>{if(enabled)audio.play().catch(()=>{})};
    sync();
    audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(stored)&&stored>0&&audio.duration)audio.currentTime=stored%audio.duration},{once:true});
    const firstGesture=()=>{play();window.removeEventListener('pointerdown',firstGesture,true);window.removeEventListener('keydown',firstGesture,true)};
    window.addEventListener('pointerdown',firstGesture,true);
    window.addEventListener('keydown',firstGesture,true);
    window.addEventListener('beforeunload',save);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});
    btn.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      enabled=!enabled;
      localStorage.setItem('rvl-bgm-enabled',enabled?'1':'0');
      sync();
      if(enabled)play();else audio.pause();
    });
  }

  function installTools(navRight){
    const old=navRight.querySelector('.rvl-tools-menu');
    if(old)old.remove();

    let trigger=navRight.querySelector('.nav-link');
    if(!trigger){
      trigger=document.createElement('button');
      trigger.type='button';
      trigger.className='nav-link';
      navRight.appendChild(trigger);
    }
    trigger.textContent='Tools';
    trigger.removeAttribute('data-i18n');
    trigger.setAttribute('aria-haspopup','true');
    trigger.setAttribute('aria-expanded','false');
    if(trigger.tagName==='A')trigger.href='/#tools';

    const wrap=document.createElement('div');
    wrap.className='rvl-tools-wrap';
    const panel=document.createElement('div');
    panel.className='rvl-tools-panel';
    panel.setAttribute('aria-hidden','true');
    const current=location.pathname.replace(/\/+$/,'')+'/';
    for(const [label,href] of tools){
      const a=document.createElement('a');
      a.href=href;a.textContent=label;
      if(href===current)a.classList.add('active');
      panel.appendChild(a);
    }
    trigger.parentNode.insertBefore(wrap,trigger);
    wrap.append(trigger,panel);

    const close=()=>{wrap.classList.remove('open');trigger.setAttribute('aria-expanded','false');panel.setAttribute('aria-hidden','true')};
    trigger.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const open=!wrap.classList.contains('open');
      close();
      if(open){wrap.classList.add('open');trigger.setAttribute('aria-expanded','true');panel.setAttribute('aria-hidden','false')}
    });
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  }

  function install(){
    const navRight=document.querySelector('.nav-right');
    if(!navRight)return;
    ensureLiteMusic(navRight);
    installTools(navRight);

    const style=document.createElement('style');
    style.id='rvl-nav-ui-style';
    style.textContent=`
      .nav-right{gap:8px!important}
      .music-toggle.rvl-music-text,
      .rvl-tools-wrap>.nav-link{
        appearance:none!important;
        width:auto!important;
        height:34px!important;
        min-width:60px!important;
        padding:0 13px!important;
        border:2px solid #35446a!important;
        border-radius:4px!important;
        background:#131c34!important;
        color:#e9eeff!important;
        box-shadow:3px 3px 0 #070a14!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        font:inherit!important;
        font-size:11px!important;
        font-weight:700!important;
        letter-spacing:.01em!important;
        line-height:1!important;
        white-space:nowrap!important;
        cursor:pointer!important;
        text-decoration:none!important;
      }
      .music-toggle.rvl-music-text:hover,
      .rvl-tools-wrap>.nav-link:hover{background:#192442!important;border-color:#53668f!important;color:#fff!important}
      .music-toggle.rvl-music-text:not(.off){color:#7fe7c3!important}
      .music-toggle.rvl-music-text.off{color:#7d879e!important;opacity:1!important}
      .rvl-tools-wrap{position:relative;display:inline-flex;align-items:center;z-index:80}
      .rvl-tools-wrap.open>.nav-link{background:#202b4c!important;border-color:#756bb2!important;color:#fff!important}
      .rvl-tools-panel{
        display:none;
        position:absolute;
        right:-3px;
        top:calc(100% + 10px);
        width:202px;
        padding:8px;
        background:#11192e;
        border:2px solid #35446a;
        border-radius:4px;
        box-shadow:6px 6px 0 #070a14;
        z-index:100;
      }
      .rvl-tools-wrap.open>.rvl-tools-panel{display:grid;gap:5px}
      .rvl-tools-panel:before{content:"";position:absolute;right:18px;top:-7px;width:10px;height:10px;background:#11192e;border-left:2px solid #35446a;border-top:2px solid #35446a;transform:rotate(45deg)}
      .rvl-tools-panel a{
        display:block;
        position:relative;
        padding:9px 10px 9px 12px;
        border:1px solid #283858;
        border-radius:3px;
        background:#0d1427;
        color:#dbe5ff;
        text-decoration:none;
        font-size:11px;
        font-weight:600;
        line-height:1.2;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);
      }
      .rvl-tools-panel a:hover{background:#17223d;border-color:#53668f;color:#fff;transform:translateX(1px)}
      .rvl-tools-panel a.active{border-color:#42675a;color:#9af0cf;background:#11251f;box-shadow:inset 3px 0 0 #68e6c2}

      body[data-platform="youtube-mp3"] .nav-right{gap:10px!important}
      body[data-platform="youtube-mp3"] .music-toggle.rvl-music-text,
      body[data-platform="youtube-mp3"] .rvl-tools-wrap>.nav-link{
        height:34px!important;
        min-width:58px!important;
        padding:0 12px!important;
        border:1px solid #303030!important;
        border-radius:9px!important;
        background:#121212!important;
        color:#d8d8d8!important;
        box-shadow:none!important;
        font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
        font-size:12px!important;
        font-weight:650!important;
      }
      body[data-platform="youtube-mp3"] .music-toggle.rvl-music-text:not(.off){color:#d8d8d8!important}
      body[data-platform="youtube-mp3"] .music-toggle.rvl-music-text.off{color:#666!important}
      body[data-platform="youtube-mp3"] .music-toggle.rvl-music-text:hover,
      body[data-platform="youtube-mp3"] .rvl-tools-wrap>.nav-link:hover,
      body[data-platform="youtube-mp3"] .rvl-tools-wrap.open>.nav-link{background:#1a1a1a!important;border-color:#464646!important;color:#fff!important}
      body[data-platform="youtube-mp3"] .rvl-tools-panel{background:#111;border:1px solid #2e2e2e;border-radius:10px;box-shadow:0 18px 42px rgba(0,0,0,.5)}
      body[data-platform="youtube-mp3"] .rvl-tools-panel:before{background:#111;border-left:1px solid #2e2e2e;border-top:1px solid #2e2e2e}
      body[data-platform="youtube-mp3"] .rvl-tools-panel a{border:1px solid #252525;border-radius:7px;background:#151515;color:#d0d0d0;font-size:12px;font-weight:550}
      body[data-platform="youtube-mp3"] .rvl-tools-panel a:hover{background:#1d1d1d;border-color:#3d3d3d;color:#fff;transform:none}
      body[data-platform="youtube-mp3"] .rvl-tools-panel a.active{border-color:#35483f;color:#b7e5ce;background:#132019;box-shadow:inset 3px 0 0 #6fae90}

      @media(max-width:700px){
        .nav-right{gap:6px!important}
        .music-toggle.rvl-music-text,.rvl-tools-wrap>.nav-link{height:32px!important;min-width:52px!important;padding:0 9px!important;font-size:10px!important}
        .rvl-tools-panel{position:fixed;right:12px;top:64px;width:min(212px,calc(100vw - 24px))}
        .rvl-tools-panel:before{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
