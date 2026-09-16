(()=>{
  if(window.__rvlRailwayBridge)return;
  window.__rvlRailwayBridge=true;
  const FROM='https://rvl-api.onrender.com';
  const TO='https://enhanced-video-production.up.railway.app';
  const useRailway=()=>true;
  const rewrite=value=>{
    try{
      const s=String(value||'');
      if(!useRailway())return s;
      return s.startsWith(FROM)?TO+s.slice(FROM.length):s;
    }catch{return value}
  };

  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    try{
      if(input instanceof Request){
        const next=rewrite(input.url);
        if(next!==input.url) input=new Request(next,input);
      }else if(input instanceof URL){
        input=new URL(rewrite(input.href));
      }else{
        input=rewrite(input);
      }
    }catch{}
    return nativeFetch(input,init);
  };

  const desc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  if(desc?.get&&desc?.set&&desc.configurable!==false){
    try{
      Object.defineProperty(HTMLIFrameElement.prototype,'src',{
        configurable:true,
        enumerable:desc.enumerable,
        get(){return desc.get.call(this)},
        set(value){return desc.set.call(this,rewrite(value))}
      });
    }catch{}
  }

  // Keep the MP3 page copy simple and provider-agnostic. The actual
  // implementation may use a direct source path, in-browser processing,
  // or a server fallback depending on what YouTube exposes for the video.
  let cleaning=false;
  const cleanMp3Copy=()=>{
    if(cleaning||document.body?.dataset?.platform!=='youtube-mp3')return;
    cleaning=true;
    try{
      const en=(localStorage.getItem('reyval-lang')||'id')==='en';
      const sub=document.querySelector('#page-sub');
      if(sub)sub.textContent=en?'Paste a YouTube link, check the audio, then choose Original Audio or MP3 192 kbps.':'Tempel link YouTube, cek audionya, lalu pilih Audio Asli atau MP3 192 kbps.';

      const mode=document.querySelector('#audio-mode');
      const fast=mode?.querySelector('option[value="fast"]');
      const mp3=mode?.querySelector('option[value="mp3"]');
      if(fast)fast.textContent=en?'Original Audio':'Audio Asli';
      if(mp3)mp3.textContent='MP3 · 192 kbps';

      const meta=document.querySelector('#media-meta');
      if(meta&&meta.textContent){
        meta.textContent=meta.textContent
          .replace(/Audio cepat\s*·\s*tanpa convert/gi,en?'Original Audio':'Audio Asli')
          .replace(/Fast audio\s*·\s*no conversion/gi,'Original Audio')
          .replace(/MP3\s*·\s*192 kbps\s*·\s*(proses lokal|lokal)/gi,'MP3 · 192 kbps')
          .replace(/MP3\s*·\s*192 kbps\s*·\s*local processing/gi,'MP3 · 192 kbps')
          .replace(/MP3\s*·\s*192 kbps\s*·\s*local/gi,'MP3 · 192 kbps');
      }

      const status=document.querySelector('#download-status');
      if(status&&status.textContent){
        const s=status.textContent.trim();
        if(/cookie youtube|\brender\b/i.test(s)){
          status.textContent=en?'YouTube could not prepare the audio yet. Please try again.':'YouTube belum bisa menyiapkan audio. Coba lagi.';
        }else{
          status.textContent=s
            .replace(/Mode lokal gagal, lanjut lewat server\.?/gi,'Jalur utama gagal, mencoba jalur cadangan.')
            .replace(/Local mode failed, continuing on server\.?/gi,'Primary path failed, trying the fallback path.')
            .replace(/MP3 selesai\s*·\s*diproses di perangkat lu\.?/gi,'MP3 selesai.')
            .replace(/MP3 ready\s*·\s*processed on your device\.?/gi,'MP3 ready.');
        }
      }

      const stage=document.querySelector('#rvl-job-stage');
      if(stage&&stage.textContent){
        stage.textContent=stage.textContent
          .replace(/Convert MP3 di perangkat/gi,'Menyiapkan MP3')
          .replace(/Converting MP3 on device/gi,'Preparing MP3');
      }
    }finally{cleaning=false}
  };

  const observer=new MutationObserver(()=>cleanMp3Copy());
  const startObserver=()=>{
    if(document.documentElement)observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    cleanMp3Copy();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});else startObserver();
  window.addEventListener('rvl:route',()=>setTimeout(cleanMp3Copy,0));
  window.addEventListener('reyval:lang',()=>setTimeout(cleanMp3Copy,0));
})();
