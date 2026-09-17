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
      .music-toggle.rvl-music-text{width:auto!important;height:36px!important;min-width:58px!important;padding:0 12px!important;border-radius:5px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:700!important;line-height:1!important;white-space:nowrap!important}
      .music-toggle.rvl-music-text.off{opacity:.62!important}
      .rvl-tools-wrap{position:relative;display:inline-flex;align-items:center;z-index:80}
      .rvl-tools-wrap>.nav-link{height:36px!important;min-width:58px;padding:0 12px!important;border:1px solid var(--line,#292929)!important;border-radius:5px!important;background:#0e0e0e!important;color:#f2f2f2!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important;white-space:nowrap!important}
      .rvl-tools-wrap.open>.nav-link{border-color:#555!important;background:#171717!important}
      .rvl-tools-panel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:194px;padding:7px;background:#101014;border:1px solid #333;border-radius:6px;box-shadow:0 14px 34px rgba(0,0,0,.45);z-index:100}
      .rvl-tools-wrap.open>.rvl-tools-panel{display:grid;gap:5px}
      .rvl-tools-panel a{display:block;padding:9px 10px;border:1px solid #292929;border-radius:4px;background:#151515;color:#ddd;text-decoration:none;font-size:12px;line-height:1.2}
      .rvl-tools-panel a:hover{background:#1c1c22;border-color:#555;color:#fff}
      .rvl-tools-panel a.active{border-color:#476d61;color:#bff7df;background:#13251f}
      @media(max-width:700px){.music-toggle.rvl-music-text,.rvl-tools-wrap>.nav-link{height:32px!important;min-width:52px!important;padding:0 9px!important;font-size:11px!important}.rvl-tools-panel{position:fixed;right:12px;top:64px;width:min(220px,calc(100vw - 24px))}}
    `;
    document.head.appendChild(style);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
