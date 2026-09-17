(()=>{
  if(window.__RVL_TOOLS_MENU__)return;
  window.__RVL_TOOLS_MENU__=true;
  const navRight=document.querySelector('.nav-right');
  if(!navRight)return;
  const items=[
    ['TikTok Method','../clarity/'],
    ['TikTok Downloader','../tiktok-downloader/'],
    ['YouTube Video','../youtube-downloader/'],
    ['YouTube Shorts','../youtube-shorts/'],
    ['YouTube MP3','../youtube-mp3/']
  ];
  const current=location.pathname.replace(/\/+$/,'')+'/';
  const wrap=document.createElement('div');wrap.className='rvl-tools-menu';
  const btn=document.createElement('button');btn.type='button';btn.className='rvl-tools-btn';btn.textContent='Tools';btn.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');panel.className='rvl-tools-panel';panel.setAttribute('aria-hidden','true');
  items.forEach(([label,href])=>{
    const a=document.createElement('a');a.href=href;a.textContent=label;
    try{if(new URL(a.href,location.href).pathname.replace(/\/+$/,'')+'/'===current)a.classList.add('active')}catch{}
    panel.appendChild(a);
  });
  wrap.append(btn,panel);
  const home=navRight.querySelector('.nav-link');
  if(home)navRight.insertBefore(wrap,home);else navRight.prepend(wrap);
  const css=document.createElement('style');css.textContent=`
    .rvl-tools-menu{position:relative;display:inline-flex;align-items:center;z-index:50}
    .rvl-tools-btn{min-height:34px;padding:0 11px;border:2px solid #35446a;background:#151d34;color:#e8ecff;border-radius:4px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 #070a14}
    .rvl-tools-btn:hover{filter:brightness(1.08)}
    .rvl-tools-panel{position:absolute;right:0;top:calc(100% + 9px);width:190px;padding:7px;display:none;background:#10172b;border:2px solid #35446a;box-shadow:6px 6px 0 #070a14;border-radius:5px}
    .rvl-tools-menu.open .rvl-tools-panel{display:grid;gap:5px}
    .rvl-tools-panel a{display:block;padding:9px 10px;border:1px solid #2c3859;background:#151d34;color:#dce6ff;text-decoration:none;border-radius:3px;font-size:12px;line-height:1.2}
    .rvl-tools-panel a:hover{border-color:#aa8cff;background:#1c2746}
    .rvl-tools-panel a.active{color:#77e8c1;border-color:#315d50;background:#15382e}
    @media(max-width:700px){.rvl-tools-btn{min-height:32px;padding:0 9px;font-size:11px}.rvl-tools-panel{position:fixed;right:12px;top:68px;width:min(220px,calc(100vw - 24px))}}
  `;document.head.appendChild(css);
  const close=()=>{wrap.classList.remove('open');btn.setAttribute('aria-expanded','false');panel.setAttribute('aria-hidden','true')};
  btn.addEventListener('click',e=>{e.stopPropagation();const open=!wrap.classList.contains('open');close();if(open){wrap.classList.add('open');btn.setAttribute('aria-expanded','true');panel.setAttribute('aria-hidden','false')}});
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
})();
