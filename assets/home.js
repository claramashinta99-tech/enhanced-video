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
      titleA:'Tools video yang simpel.',
      titleB:'Tinggal pilih quest.',
      lead:'TikTok Method bantu siapin video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin. Tool lain buat download video sosial, Shorts, dan MP3.',
      primary:'Buka TikTok Method',secondary:'Lihat semua tools',active:'8 tools aktif',quick:'Quick access',quickState:'8 / 8 AKTIF',
      miniClarity:'Upload TikTok lebih jernih / HD',miniTikTok:'Download video',miniYouTube:'Video sampai 4K',miniShorts:'Shorts downloader',miniMp3:'Convert audio · 192 kbps',miniFacebook:'Download video publik',miniInstagram:'Reel / video publik',miniX:'Download video publik',
      sectionTitle:'Pilih tool lu.',sectionSub:'Delapan tool aktif, sekarang dengan tampilan pixel yang lebih playful.',
      clarityDesc:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',youtubeDesc:'Download video YouTube sampai resolusi 4K.',shortsDesc:'Download YouTube Shorts lewat jalur khusus Shorts.',mp3Desc:'Ambil audio YouTube dan convert langsung ke MP3 192 kbps.',facebookDesc:'Download video Facebook publik dengan kualitas yang tersedia.',instagramDesc:'Download Reel dan video Instagram publik.',xDesc:'Download video dari post X / Twitter publik.',open:'Buka tool',
      localTitle:'TikTok Method tetap lokal',localDesc:'Video diproses di browser lu sebelum diupload ke TikTok.',directTitle:'Jalur lebih jelas',directDesc:'Setiap downloader punya jalurnya sendiri supaya nggak saling ganggu.',responsiveTitle:'Nyaman di mana aja',responsiveDesc:'Tetap enak dipakai dari desktop sampai HP.'
    },
    en:{
      badge:'RVL ARCADE',titleA:'Simple video tools.',titleB:'Pick your quest.',lead:'TikTok Method prepares video before a TikTok upload so source quality is preserved as much as possible. The other tools handle social video, Shorts, and MP3 downloads.',
      primary:'Open TikTok Method',secondary:'View all tools',active:'8 tools live',quick:'Quick access',quickState:'8 / 8 LIVE',miniClarity:'Cleaner / HD TikTok upload prep',miniTikTok:'Video download',miniYouTube:'Video up to 4K',miniShorts:'Shorts downloader',miniMp3:'Audio convert · 192 kbps',miniFacebook:'Public video downloader',miniInstagram:'Public Reel / video',miniX:'Public video downloader',
      sectionTitle:'Pick your tool.',sectionSub:'Eight live tools with a playful pixel interface.',clarityDesc:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',tiktokDesc:'Paste a TikTok link, check the video, then download.',youtubeDesc:'Download YouTube video up to 4K resolution.',shortsDesc:'Download YouTube Shorts through a dedicated Shorts flow.',mp3Desc:'Grab YouTube audio and convert it directly to 192 kbps MP3.',facebookDesc:'Download public Facebook videos in the available quality.',instagramDesc:'Download public Instagram Reels and videos.',xDesc:'Download video from public X / Twitter posts.',open:'Open tool',
      localTitle:'TikTok Method stays local',localDesc:'Your video is processed in your browser before the TikTok upload.',directTitle:'Clearer routes',directDesc:'Each downloader has its own route so the tools do not interfere with each other.',responsiveTitle:'Works anywhere',responsiveDesc:'Comfortable from desktop to mobile.'
    }
  }
  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function apply(){const dict=copy[lang()]||copy.id;document.querySelectorAll('[data-home-i18n]').forEach(el=>{const key=el.dataset.homeI18n;if(dict[key])el.textContent=dict[key]})}
  window.__rvlHomeModule={apply};window.addEventListener('reyval:lang',apply);window.addEventListener('rvl:route',e=>{if(e.detail?.path==='/')apply()});apply();
})();
