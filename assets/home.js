(()=>{
  if(window.__rvlHomeModule){window.__rvlHomeModule.apply();return}
  const copy={
    id:{
      badge:'RVL ARCADE',
      titleA:'Tools video yang simpel.',
      titleB:'Tinggal pilih quest.',
      lead:'TikTok Method bantu siapin video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin. Tool lain buat download video, Shorts, dan MP3.',
      primary:'Buka TikTok Method',secondary:'Lihat semua tools',active:'5 tools aktif',quick:'Quick access',quickState:'5 / 5 AKTIF',
      miniClarity:'Upload TikTok lebih jernih / HD',miniTikTok:'Download video',miniYouTube:'Video sampai 4K',miniShorts:'Shorts downloader',miniMp3:'Convert audio · 192 kbps',
      sectionTitle:'Pilih tool lu.',sectionSub:'Lima tool aktif, sekarang dengan tampilan pixel yang lebih playful.',
      clarityDesc:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',youtubeDesc:'Download video YouTube sampai resolusi 4K.',shortsDesc:'Download YouTube Shorts lewat jalur khusus Shorts.',mp3Desc:'Ambil audio YouTube dan convert langsung ke MP3 192 kbps.',open:'Buka tool',
      localTitle:'TikTok Method tetap lokal',localDesc:'Video diproses di browser lu sebelum diupload ke TikTok.',directTitle:'Jalur lebih jelas',directDesc:'Video, Shorts, dan MP3 dipisah biar nggak saling ganggu.',responsiveTitle:'Nyaman di mana aja',responsiveDesc:'Tetap enak dipakai dari desktop sampai HP.'
    },
    en:{
      badge:'RVL ARCADE',titleA:'Simple video tools.',titleB:'Pick your quest.',lead:'TikTok Method prepares video before a TikTok upload so source quality is preserved as much as possible. The other tools handle video, Shorts, and MP3 downloads.',
      primary:'Open TikTok Method',secondary:'View all tools',active:'5 tools live',quick:'Quick access',quickState:'5 / 5 LIVE',miniClarity:'Cleaner / HD TikTok upload prep',miniTikTok:'Video download',miniYouTube:'Video up to 4K',miniShorts:'Shorts downloader',miniMp3:'Audio convert · 192 kbps',
      sectionTitle:'Pick your tool.',sectionSub:'Five live tools with a playful pixel interface.',clarityDesc:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',tiktokDesc:'Paste a TikTok link, check the video, then download.',youtubeDesc:'Download YouTube video up to 4K resolution.',shortsDesc:'Download YouTube Shorts through a dedicated Shorts flow.',mp3Desc:'Grab YouTube audio and convert it directly to 192 kbps MP3.',open:'Open tool',
      localTitle:'TikTok Method stays local',localDesc:'Your video is processed in your browser before the TikTok upload.',directTitle:'Clearer routes',directDesc:'Video, Shorts, and MP3 are separated so they do not get in each other’s way.',responsiveTitle:'Works anywhere',responsiveDesc:'Comfortable from desktop to mobile.'
    }
  }
  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function apply(){const dict=copy[lang()]||copy.id;document.querySelectorAll('[data-home-i18n]').forEach(el=>{const key=el.dataset.homeI18n;if(dict[key])el.textContent=dict[key]})}
  window.__rvlHomeModule={apply};window.addEventListener('reyval:lang',apply);window.addEventListener('rvl:route',e=>{if(e.detail?.path==='/')apply()});apply();
})();
