(()=>{
  const ROUTES=new Set(['/','/clarity/','/tiktok-downloader/','/youtube-downloader/','/youtube-shorts/','/youtube-mp3/']);
  let navigating=false;

  function routePath(url){
    const u=new URL(url,location.href);
    let p=u.pathname;
    if(!p.endsWith('/')&&!p.split('/').pop().includes('.'))p+='/';
    return p;
  }
  function isInternalRoute(url){
    const u=new URL(url,location.href);
    return u.origin===location.origin&&ROUTES.has(routePath(u));
  }
  function setNavForPath(path){
    const link=document.querySelector('.nav-link');
    if(!link)return;
    if(path==='/'){
      link.href='#tools';link.textContent='Tools';link.dataset.i18n='tools';
    }else{
      link.href='/';link.textContent='Homepage';link.dataset.i18n='home';
    }
  }
  function replaceStaticFooter(doc){
    document.querySelectorAll('.footer').forEach(el=>el.parentElement?.remove());
    const target=doc.querySelector('.footer');
    if(!target)return;
    const holder=target.parentElement?.cloneNode(true);
    if(!holder)return;
    const credit=document.querySelector('.rvl-credit');
    document.body.insertBefore(holder,credit||null);
  }
  function replaceToast(doc){
    document.querySelector('#toast')?.remove();
    const toast=doc.querySelector('#toast');
    if(!toast)return;
    const credit=document.querySelector('.rvl-credit');
    document.body.insertBefore(toast.cloneNode(true),credit||null);
  }
  function ensureHomeCss(){
    if(document.querySelector('link[href*="/assets/home.css"]'))return;
    const l=document.createElement('link');
    l.rel='stylesheet';l.href='/assets/home.css?v=2';l.dataset.rvlHomeCss='1';
    document.head.appendChild(l);
  }
  function loadRouteScript(path){
    document.querySelectorAll('script[data-rvl-route-script]').forEach(s=>s.remove());
    document.querySelector('#rvl-download-frame')?.remove();
    let src=null,type=null;
    if(path==='/'){ensureHomeCss();src='/assets/home.js'}
    else if(path==='/clarity/'){src='/assets/clarity-route.js';type='module'}
    else if(path==='/tiktok-downloader/'||path==='/youtube-downloader/'){src='/assets/downloader.js'}
    else if(path==='/youtube-shorts/'){src='/assets/shorts.js'}
    else if(path==='/youtube-mp3/'){src='/assets/mp3.js'}
    if(!src)return;
    const s=document.createElement('script');
    s.dataset.rvlRouteScript='1';s.src=`${src}?route=${Date.now()}`;
    if(type)s.type=type;
    document.body.appendChild(s);
  }
  async function navigate(url,{push=true}={}){
    const u=new URL(url,location.href);
    const path=routePath(u);
    if(!ROUTES.has(path)){location.href=u.href;return}
    if(path===routePath(location.href)&&u.hash){document.querySelector(u.hash)?.scrollIntoView({behavior:'smooth'});return}
    if(navigating)return;
    navigating=true;
    try{
      if(typeof window.__RVL_ROUTE_CLEANUP__==='function'){
        try{window.__RVL_ROUTE_CLEANUP__()}catch{}
        window.__RVL_ROUTE_CLEANUP__=null;
      }
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),8000);
      let res;
      try{res=await fetch(u.pathname+u.search,{cache:'no-store',signal:controller.signal,headers:{'X-RVL-Route':'1'}})}
      finally{clearTimeout(timer)}
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const doc=new DOMParser().parseFromString(await res.text(),'text/html');
      const nextMain=doc.querySelector('main');
      const currentMain=document.querySelector('main');
      if(!nextMain||!currentMain)throw new Error('Route layout missing');
      currentMain.replaceWith(nextMain.cloneNode(true));
      document.body.dataset.platform=doc.body.dataset.platform||'';
      document.title=doc.title||'RVL';
      const nextDesc=doc.querySelector('meta[name="description"]')?.content;
      if(nextDesc){const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=nextDesc}
      replaceStaticFooter(doc);replaceToast(doc);setNavForPath(path);
      if(push)history.pushState({rvl:true},'',u.pathname+u.search+u.hash);
      if(typeof window.setLang==='function')window.setLang(localStorage.getItem('reyval-lang')||'id');
      if(typeof window.applyBrand==='function')window.applyBrand();
      loadRouteScript(path);
      window.scrollTo(0,0);
      window.dispatchEvent(new CustomEvent('rvl:route',{detail:{path}}));
    }catch(err){
      console.error('RVL route fallback',err);
      location.href=u.href;
    }finally{
      navigating=false;
      document.documentElement.classList.remove('rvl-routing');
    }
  }
  document.documentElement.classList.remove('rvl-routing');
  document.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest('a[href]');
    if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    const href=a.getAttribute('href');
    if(!href||href.startsWith('mailto:')||href.startsWith('tel:'))return;
    const u=new URL(href,location.href);
    if(u.origin!==location.origin||!isInternalRoute(u))return;
    if(routePath(u)===routePath(location.href)&&u.hash)return;
    e.preventDefault();navigate(u.href);
  });
  window.addEventListener('popstate',()=>{
    if(ROUTES.has(routePath(location.href)))navigate(location.href,{push:false});
  });
  window.RVLNavigate=navigate;
})();
