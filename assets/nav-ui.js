(()=>{
  if(window.__RVL_NAV_UI__)return;window.__RVL_NAV_UI__=true;
  function install(){
    const navRight=document.querySelector('.nav-right');if(!navRight)return;
    navRight.querySelectorAll('.rvl-tools-wrap').forEach(el=>el.remove());
    const music=navRight.querySelector('.music-toggle');
    if(music){music.textContent='Music';music.classList.add('rvl-music-text')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('rvl:route',()=>setTimeout(install,0));
})();
