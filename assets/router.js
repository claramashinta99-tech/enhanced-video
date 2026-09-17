(()=>{
  const ROUTES=new Set(['/','/clarity/','/tiktok-downloader/','/youtube-downloader/','/youtube-shorts/','/youtube-mp3/']);
  const SCRIPT={
    '/':'/assets/home.js',
    '/clarity/':'/assets/clarity-route.js',
    '/tiktok-downloader/':'/assets/downloader.js',
    '/youtube-downloader/':'/assets/downloader.js',
    '/youtube-shorts/':'/assets/shorts.js',
    '/youtube-mp3/':'/assets/mp3.js'
  };
  let navigating=false;
  let activeController=null;

  const pathOf=(value)=>{
    const u=new URL(value,location.href);
    let p=u.pathname;
    if(!p.endsWith('/')&&!p.split('/').pop().includes('.'))p+='/';
    return p;
  };
  const setNav=(path)=>{
    const a=document.querySelector('.nav-right > .nav-link');
    if(!a)return;
    if(path==='/'){a.href='#tools';a.textContent='Tools';a.dataset.i18n='tools'}
    else{a.href='/';a.textContent='Homepage';a.dataset.i18n='home'}
  };
  const ensureHomeCss=()=>{
    if(document.querySelector('link[href*="/assets/home.css"]'))return;
    const l=document.createElement('link');l.rel='stylesheet';l.href='/assets/home.css?v=2';document.head.appendChild(l);
  };
  const syncToast=(doc)=>{
    document.querySelector('#toast')?.remove();
    const toast=doc.querySelector('#toast');
    if(!toast)return;
    document.body.appendChild(toast.cloneNode(true));
  };
  const loadRouteScript=(path)=>{
    document.querySelectorAll('script[data-rvl-route-script]').forEach(s=>s.remove());
    document.querySelector('#rvl-download-frame')?.remove();
    const src=SCRIPT[path];
    if(!src)return;
    const s=document.createElement('script');
    s.dataset.rvlRouteScript='1';
    s.src=`${src}?route=${Date.now()}`;
    if(path==='/clarity/')s.type='module';
    document.body.appendChild(s);
  };

  async function navigate(value,{push=true}={}){
    const u=new URL(value,location.href);
    const path=pathOf(u);
    if(u.origin!==location.origin||!ROUTES.has(path)){location.assign(u.href);return}
    if(path===pathOf(location.href)&&u.hash){document.querySelector(u.hash)?.scrollIntoView({behavior:'smooth'});return}
    if(navigating)return;
    navigating=true;
    document.documentElement.classList.remove('rvl-routing');
    activeController?.abort();
    const controller=new AbortController();activeController=controller;
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const res=await fetch(`${path}${u.search}`,{cache:'no-store',signal:controller.signal});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const doc=new DOMParser().parseFromString(await res.text(),'text/html');
      const nextMain=doc.querySelector('main');
      const currentMain=document.querySelector('main');
      if(!nextMain||!currentMain)throw new Error('Missing main');
      currentMain.replaceWith(nextMain.cloneNode(true));
      document.body.dataset.platform=doc.body.dataset.platform||'';
      document.title=doc.title||'RVL';
      const desc=doc.querySelector('meta[name="description"]')?.content;
      const ownDesc=document.querySelector('meta[name="description"]');
      if(desc&&ownDesc)ownDesc.content=desc;
      if(path==='/')ensureHomeCss();
      syncToast(doc);
      setNav(path);
      if(push)history.pushState({rvl:true},'',u.pathname+u.search+u.hash);
      loadRouteScript(path);
      if(typeof window.setLang==='function')window.setLang(localStorage.getItem('reyval-lang')||'id');
      if(typeof window.applyBrand==='function')window.applyBrand();
      window.scrollTo(0,0);
      window.dispatchEvent(new CustomEvent('rvl:route',{detail:{path}}));
    }catch(err){
      console.error('RVL navigation fallback',err);
      location.assign(u.href);
    }finally{
      clearTimeout(timer);
      if(activeController===controller)activeController=null;
      navigating=false;
      document.documentElement.classList.remove('rvl-routing');
    }
  }

  document.documentElement.classList.remove('rvl-routing');

  document.addEventListener('click',e=>{
    const a=e.target.closest('.rvl-tools-panel a[href]');
    if(!a)return;
    const u=new URL(a.getAttribute('href'),location.href);
    const path=pathOf(u);
    if(u.origin!==location.origin||!ROUTES.has(path))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    document.querySelector('.rvl-tools-wrap')?.classList.remove('open');
    if(path==='/youtube-mp3/'||document.body.dataset.platform==='youtube-mp3'){
      location.assign(u.href);
      return;
    }
    navigate(u.href);
  },true);

  document.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest('a[href]');
    if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    const raw=a.getAttribute('href');
    if(!raw||raw.startsWith('mailto:')||raw.startsWith('tel:'))return;
    const u=new URL(raw,location.href);
    const path=pathOf(u);
    if(u.origin!==location.origin||!ROUTES.has(path))return;
    if(path===pathOf(location.href)&&u.hash)return;
    e.preventDefault();
    navigate(u.href);
  });
  window.addEventListener('popstate',()=>navigate(location.href,{push:false}));
  window.RVLNavigate=navigate;
})();
