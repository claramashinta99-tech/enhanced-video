(()=>{
  if(window.__RVL_NAV_UI__)return;window.__RVL_NAV_UI__=true;
  function install(){
    const navRight=document.querySelector('.nav-right');if(!navRight)return;
    navRight.querySelectorAll('.rvl-tools-wrap').forEach(el=>el.remove());
    const music=navRight.querySelector('.music-toggle');
    if(music){
      music.classList.remove('rvl-music-text');
      music.innerHTML='<span class="rvl-music-icon" aria-hidden="true">♫</span>';
      music.setAttribute('aria-label','Toggle background music');
      music.setAttribute('title','Music');
    }
    const mp3Music=navRight.querySelector('#mp3-music');
    if(mp3Music){
      mp3Music.textContent='♫';
      mp3Music.setAttribute('aria-label','Toggle background music');
      mp3Music.setAttribute('title','Music');
      mp3Music.style.minWidth='34px';
      mp3Music.style.width='34px';
      mp3Music.style.padding='0';
      mp3Music.style.fontSize='18px';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('rvl:route',()=>setTimeout(install,0));
})();
