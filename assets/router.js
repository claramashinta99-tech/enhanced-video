(()=>{
  const ROUTES=new Set(['/','/clarity/','/tiktok-downloader/','/youtube-downloader/']);
  let navigating=false;
  function routePath(url){const u=new URL(url,location.href);let p=u.pathname;if(!p.endsWith('/')&&!p.split('/').pop().includes('.'))p+='/';return p}
  function isInternalRoute(url){const u=new URL(url,location.href);return u.origin===location.origin&&ROUTES.has(routePath(u))}
  function setNavForPath(path){const link=document.querySelector('.nav-link');if(!link)return;if(path==='/'){link.href='#tools';link.textContent='Tools';link.dataset.i18n='tools'}else{link.href='/';link.textContent='Homepage';link.dataset.i18n='home'}}
  function replaceStaticFooter(doc){document.querySelectorAll('.footer').forEach(el=>el.parentElement?.remove());const target=doc.querySelector('.footer');if(!target)return;const holder=target.parentElement?.cloneNode(true);if(!holder)return;const credit=document.querySelector('.rvl-credit');document.body.insertBefore(holder,credit||null)}
  function replaceToast(doc){document.querySelector('#toast')?.remove();const toast=doc.querySelector('#toast');if(toast){const credit=document.querySelector('.rvl-credit');document.body.insertBefore(toast.cloneNode(true),credit||null)}}
  function ensureHomeCss(){if(document.querySelector('link[href*="/assets/home.css"]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/assets/home.css?v=1';l.dataset.rvlHomeCss='1';document.head.appendChild(l)}
  function loadRouteScript(path){
    document.querySelectorAll('script[data-rvl-route-script]').forEach(s=>s.remove());document.querySelector('#rvl-download-frame')?.remove();
    let src=null,type=null;
    if(path==='/'){ensureHomeCss();src=`/assets/home.js?route=${Date.now()}`}
    else if(path==='/clarity/'){src=`/assets/clarity.js?route=${Date.now()}`;type='module'}
    else if(path==='/tiktok-downloader/'||path==='/youtube-downloader/'){src=`/assets/downloader.js?route=${Date.now()}`}
    if(!src)return;const s=document.createElement('script');s.dataset.rvlRouteScript='1';s.src=src;if(type)s.type=type;document.body.appendChild(s)
  }
  async function navigate(url,{push=true}={}){
    if(navigating)return;const u=new URL(url,location.href);const path=routePath(u);
    if(!ROUTES.has(path)){location.href=u.href;return}
    if(path===location.pathname&&u.hash){document.querySelector(u.hash)?.scrollIntoView({behavior:'smooth'});return}
    navigating=true;document.documentElement.classList.add('rvl-routing');
    try{
      const res=await fetch(u.pathname,{cache:'no-store',headers:{'X-RVL-Route':'1'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const doc=new DOMParser().parseFromString(await res.text(),'text/html');const nextMain=doc.querySelector('main'),currentMain=document.querySelector('main');if(!nextMain||!currentMain)throw new Error('Route layout missing');
      currentMain.replaceWith(nextMain.cloneNode(true));document.body.dataset.platform=doc.body.dataset.platform||'';document.title=doc.title||'RVL';
      const nextDesc=doc.querySelector('meta[name="description"]')?.content;if(nextDesc){const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=nextDesc}
      replaceStaticFooter(doc);replaceToast(doc);setNavForPath(path);if(push)history.pushState({rvl:true},'',u.pathname+u.search+u.hash);
      if(typeof window.setLang==='function')window.setLang(localStorage.getItem('reyval-lang')||'id');if(typeof window.applyBrand==='function')window.applyBrand();loadRouteScript(path);
      window.scrollTo({top:0,behavior:'instant'});window.dispatchEvent(new CustomEvent('rvl:route',{detail:{path}}));
    }catch(err){console.error('RVL route fallback',err);location.href=u.href}finally{navigating=false;document.documentElement.classList.remove('rvl-routing')}
  }
  document.addEventListener('click',e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const a=e.target.closest('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const href=a.getAttribute('href');if(!href||href.startsWith('mailto:')||href.startsWith('tel:'))return;const u=new URL(href,location.href);if(u.origin!==location.origin)return;if(u.pathname===location.pathname&&u.hash)return;if(!isInternalRoute(u))return;e.preventDefault();navigate(u.href)});
  window.addEventListener('popstate',()=>{if(ROUTES.has(routePath(location.href)))navigate(location.href,{push:false})});window.RVLNavigate=navigate;
})();
