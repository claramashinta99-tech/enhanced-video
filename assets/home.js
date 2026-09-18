(()=>{
  function ensureHomeNav(){
    if(document.querySelector('#rvl-home-nav-only'))return;
    const style=document.createElement('style');
    style.id='rvl-home-nav-only';
    style.textContent='body:has(.home-main) .rvl-tools-wrap{display:none!important}';
    document.head.appendChild(style);
  }
  ensureHomeNav();
  if(window.__rvlHomeModule){window.__rvlHomeModule.apply();return}
  const copy={
    id:{
      badge:'RVL ARCADE',
      titleA:'Download. Convert. Explore.',
      titleB:'Satu tempat.',
      lead:'Tempel link dari platform yang didukung lewat Universal Downloader, atau buka tool khusus kalau lu butuh workflow tertentu.',
      primary:'Buka Universal Downloader',secondary:'TikTok Method',active:'10 tools aktif',quick:'Quick access',quickState:'10 / 10 AKTIF',
      miniClarity:'Upload TikTok lebih jernih / HD',miniTikTok:'Download video',miniYouTube:'Video sampai 4K',miniShorts:'Shorts downloader',miniMp3:'Convert audio · 192 kbps',miniFacebook:'Download video publik',miniInstagram:'Reel / video publik',miniX:'Download video publik',
      sectionTitle:'Pilih tool lu.',sectionSub:'Sepuluh tool aktif buat download, inspect, dan optimasi media.',
      universalDesc:'Satu kolom link untuk otomatis mendeteksi TikTok, YouTube, Instagram, Facebook, atau X.',inspectorDesc:'Cek resolusi, FPS, codec, bitrate, audio, container, dan metadata file.',clarityDesc:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',youtubeDesc:'Download video YouTube sampai resolusi 4K.',shortsDesc:'Download YouTube Shorts lewat jalur khusus Shorts.',mp3Desc:'Ambil audio YouTube dan convert langsung ke MP3 192 kbps.',facebookDesc:'Download video Facebook publik dengan kualitas yang tersedia.',instagramDesc:'Download Reel dan video Instagram publik.',xDesc:'Download video dari post X / Twitter publik.',open:'Buka tool',
      localTitle:'TikTok Method tetap lokal',localDesc:'Video diproses di browser lu sebelum diupload ke TikTok.',directTitle:'Jalur lebih jelas',directDesc:'Setiap downloader punya jalurnya sendiri supaya nggak saling ganggu.',responsiveTitle:'Nyaman di mana aja',responsiveDesc:'Tetap enak dipakai dari desktop sampai HP.'
    },
    en:{
      badge:'RVL ARCADE',titleA:'Download. Convert. Explore.',titleB:'All in one place.',lead:'Paste a supported link into Universal Downloader, or open a dedicated tool when you need a specific workflow.',
      primary:'Open Universal Downloader',secondary:'TikTok Method',active:'10 tools live',quick:'Quick access',quickState:'10 / 10 LIVE',miniClarity:'Cleaner / HD TikTok upload prep',miniTikTok:'Video download',miniYouTube:'Video up to 4K',miniShorts:'Shorts downloader',miniMp3:'Audio convert · 192 kbps',miniFacebook:'Public video downloader',miniInstagram:'Public Reel / video',miniX:'Public video downloader',
      sectionTitle:'Pick your tool.',sectionSub:'Ten live tools for downloading, inspecting, and optimizing media.',universalDesc:'One link field that automatically detects TikTok, YouTube, Instagram, Facebook, or X.',inspectorDesc:'Check resolution, FPS, codec, bitrate, audio, container, and file metadata.',clarityDesc:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',tiktokDesc:'Paste a TikTok link, check the video, then download.',youtubeDesc:'Download YouTube video up to 4K resolution.',shortsDesc:'Download YouTube Shorts through a dedicated Shorts flow.',mp3Desc:'Grab YouTube audio and convert it directly to 192 kbps MP3.',facebookDesc:'Download public Facebook videos in the available quality.',instagramDesc:'Download public Instagram Reels and videos.',xDesc:'Download video from public X / Twitter posts.',open:'Open tool',
      localTitle:'TikTok Method stays local',localDesc:'Your video is processed in your browser before the TikTok upload.',directTitle:'Clearer routes',directDesc:'Each downloader has its own route so the tools do not interfere with each other.',responsiveTitle:'Works anywhere',responsiveDesc:'Comfortable from desktop to mobile.'
    }
  }
  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function bindUniversal(){
    const input=document.querySelector('#home-universal-url'),btn=document.querySelector('#home-universal-go'),err=document.querySelector('#home-universal-error');
    if(!input||!btn||btn.dataset.bound==='1')return;btn.dataset.bound='1';
    const valid=value=>{try{const h=new URL(value).hostname.toLowerCase();return /(^|\.)(tiktok\.com|youtube\.com|instagram\.com|facebook\.com|x\.com|twitter\.com)$/.test(h)||h==='youtu.be'||h==='fb.watch'}catch{return false}};
    const go=()=>{const url=input.value.trim();if(!valid(url)){if(err)err.textContent=lang()==='en'?'Paste a supported TikTok, YouTube, Instagram, Facebook, or X link.':'Tempel link TikTok, YouTube, Instagram, Facebook, atau X yang valid.';return}if(err)err.textContent='';const target='/universal-downloader/?url='+encodeURIComponent(url);if(window.RVLNavigate)window.RVLNavigate(target);else location.href=target};
    btn.addEventListener('click',go);input.addEventListener('keydown',e=>{if(e.key==='Enter')go()});input.addEventListener('input',()=>{if(err)err.textContent=''});
  }
  function apply(){const dict=copy[lang()]||copy.id;document.querySelectorAll('[data-home-i18n]').forEach(el=>{const key=el.dataset.homeI18n;if(dict[key])el.textContent=dict[key]});bindUniversal()}
  window.__rvlHomeModule={apply};window.addEventListener('reyval:lang',apply);window.addEventListener('rvl:route',e=>{if(e.detail?.path==='/')setTimeout(apply,0)});apply();
})();
