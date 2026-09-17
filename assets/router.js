(()=>{
  document.documentElement.classList.remove('rvl-routing');

  window.RVLNavigate=(url)=>{
    try{
      const u=new URL(url,location.href);
      if(u.origin!==location.origin){location.href=u.href;return}
      if(u.pathname===location.pathname&&u.hash){
        document.querySelector(u.hash)?.scrollIntoView({behavior:'smooth'});
        return;
      }
      location.assign(u.href);
    }catch{
      location.href=String(url||'/');
    }
  };

  document.addEventListener('click',()=>document.documentElement.classList.remove('rvl-routing'),true);
  window.addEventListener('pageshow',()=>document.documentElement.classList.remove('rvl-routing'));
})();
