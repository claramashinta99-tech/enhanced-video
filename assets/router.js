(()=>{
  // Reliability-first router: use the browser's native navigation for tool pages.
  // This avoids stale <main> swaps and the rvl-routing overlay getting stuck.
  document.documentElement.classList.remove('rvl-routing');

  function normalize(url){
    const u=new URL(url,location.href);
    let p=u.pathname;
    if(!p.endsWith('/')&&!p.split('/').pop().includes('.'))p+='/';
    return {...u,pathname:p};
  }

  window.RVLNavigate=(url)=>{
    try{
      const u=new URL(url,location.href);
      if(u.origin!==location.origin){location.href=u.href;return}
      if(u.pathname===location.pathname&&u.hash){
        document.querySelector(u.hash)?.scrollIntoView({behavior:'smooth'});
        return;
      }
      location.assign(u.href);
    }catch{location.href=String(url||'/')}
  };

  // Native links already do exactly what we want. This listener only makes sure
  // a stale routing class from an older cached script can never survive.
  document.addEventListener('click',()=>document.documentElement.classList.remove('rvl-routing'),true);
  window.addEventListener('pageshow',()=>document.documentElement.classList.remove('rvl-routing'));
})();
