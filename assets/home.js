(()=>{
  if(window.__rvlHomeModule){window.__rvlHomeModule.apply();return}
  const copy={
    id:{
      badge:'RVL ARCADE',
      titleA:'Tools video yang simpel.',
      titleB:'Tinggal pilih quest.',
      lead:'Clarity buat siapin video. TikTok, YouTube Video, Shorts, dan MP3 buat download sesuai kebutuhan.',
      primary:'Buka Clarity',secondary:'Lihat semua tools',active:'5 tools aktif',quick:'Quick access',quickState:'5 / 5 AKTIF',
      miniClarity:'Video prep',miniTikTok:'Download video',miniYouTube:'Video sampai 4K',miniShorts:'Shorts downloader',miniMp3:'Convert audio · 192 kbps',
      sectionTitle:'Pilih tool lu.',sectionSub:'Lima tool aktif, sekarang dengan tampilan pixel yang lebih playful.',
      clarityDesc:'Siapkan video tanpa encode ulang yang nggak perlu.',tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',youtubeDesc:'Download video YouTube sampai resolusi 4K.',shortsDesc:'Download YouTube Shorts lewat jalur khusus Shorts.',mp3Desc:'Ambil audio YouTube dan convert langsung ke MP3 192 kbps.',open:'Buka tool',
      localTitle:'Clarity tetap lokal',localDesc:'File video tetap diproses di browser lu.',directTitle:'Jalur lebih jelas',directDesc:'Video, Shorts, dan MP3 dipisah biar nggak saling ganggu.',responsiveTitle:'Nyaman di mana aja',responsiveDesc:'Tetap enak dipakai dari desktop sampai HP.'
    },
    en:{
      badge:'RVL ARCADE',titleA:'Simple video tools.',titleB:'Pick your quest.',lead:'Use Clarity to prep video, then TikTok, YouTube Video, Shorts, or MP3 for what you need.',
      primary:'Open Clarity',secondary:'View all tools',active:'5 tools live',quick:'Quick access',quickState:'5 / 5 LIVE',miniClarity:'Video prep',miniTikTok:'Video download',miniYouTube:'Video up to 4K',miniShorts:'Shorts downloader',miniMp3:'Audio convert · 192 kbps',
      sectionTitle:'Pick your tool.',sectionSub:'Five live tools with a playful pixel interface.',clarityDesc:'Prepare video without unnecessary re-encoding.',tiktokDesc:'Paste a TikTok link, check the video, then download.',youtubeDesc:'Download YouTube video up to 4K resolution.',shortsDesc:'Download YouTube Shorts through a dedicated Shorts flow.',mp3Desc:'Grab YouTube audio and convert it directly to 192 kbps MP3.',open:'Open tool',
      localTitle:'Clarity stays local',localDesc:'Your video stays in your browser while it is processed.',directTitle:'Clearer routes',directDesc:'Video, Shorts, and MP3 are separated so they do not get in each other’s way.',responsiveTitle:'Works anywhere',responsiveDesc:'Comfortable from desktop to mobile.'
    }
  }
  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function apply(){const dict=copy[lang()]||copy.id;document.querySelectorAll('[data-home-i18n]').forEach(el=>{const key=el.dataset.homeI18n;if(dict[key])el.textContent=dict[key]})}
  window.__rvlHomeModule={apply};window.addEventListener('reyval:lang',apply);window.addEventListener('rvl:route',e=>{if(e.detail?.path==='/')apply()});apply();
})();
