(()=>{
  if(window.__rvlHomeModule){window.__rvlHomeModule.apply();return}
  const copy={
    id:{
      badge:'RVL TOOLS',
      titleA:'Tools video yang simpel.',
      titleB:'Tinggal pakai.',
      lead:'Clarity buat siapin video. TikTok, YouTube Video, dan MP3 buat download sesuai kebutuhan.',
      primary:'Buka Clarity',
      secondary:'Lihat semua tools',
      active:'4 tools aktif',
      quick:'Quick access',
      quickState:'4 / 4 AKTIF',
      miniClarity:'Video prep',
      miniTikTok:'Download video',
      miniYouTube:'Video sampai 4K',
      miniMp3:'Convert audio · 192 kbps',
      sectionTitle:'Pilih yang lu butuhin.',
      sectionSub:'Semua tool aktif dan langsung bisa dipakai.',
      clarityDesc:'Siapkan video tanpa encode ulang yang nggak perlu.',
      tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',
      youtubeDesc:'Download video YouTube sampai resolusi 4K.',
      mp3Desc:'Ambil audio YouTube dan convert langsung ke MP3 192 kbps.',
      open:'Buka tool',
      localTitle:'Clarity tetap lokal',
      localDesc:'File video tetap diproses di browser lu.',
      directTitle:'Langsung ke intinya',
      directDesc:'Nggak ada menu tambahan yang bikin muter.',
      responsiveTitle:'Nyaman di mana aja',
      responsiveDesc:'Tetap enak dipakai dari desktop sampai HP.'
    },
    en:{
      badge:'RVL TOOLS',
      titleA:'Simple video tools.',
      titleB:'Ready when you are.',
      lead:'Use Clarity to prep video, then use TikTok, YouTube Video, or MP3 for the format you need.',
      primary:'Open Clarity',
      secondary:'View all tools',
      active:'4 tools live',
      quick:'Quick access',
      quickState:'4 / 4 LIVE',
      miniClarity:'Video prep',
      miniTikTok:'Video download',
      miniYouTube:'Video up to 4K',
      miniMp3:'Audio convert · 192 kbps',
      sectionTitle:'Pick what you need.',
      sectionSub:'Every tool is live and ready to use.',
      clarityDesc:'Prepare video without unnecessary re-encoding.',
      tiktokDesc:'Paste a TikTok link, check the video, then download.',
      youtubeDesc:'Download YouTube video up to 4K resolution.',
      mp3Desc:'Grab YouTube audio and convert it directly to 192 kbps MP3.',
      open:'Open tool',
      localTitle:'Clarity stays local',
      localDesc:'Your video stays in your browser while it is processed.',
      directTitle:'Straight to the point',
      directDesc:'No extra menus getting in the way.',
      responsiveTitle:'Works anywhere',
      responsiveDesc:'Comfortable from desktop to mobile.'
    }
  }
  function lang(){return localStorage.getItem('reyval-lang')||'id'}
  function apply(){
    const dict=copy[lang()]||copy.id
    document.querySelectorAll('[data-home-i18n]').forEach(el=>{
      const key=el.dataset.homeI18n
      if(dict[key])el.textContent=dict[key]
    })
  }
  window.__rvlHomeModule={apply}
  window.addEventListener('reyval:lang',apply)
  window.addEventListener('rvl:route',e=>{if(e.detail?.path==='/')apply()})
  apply()
})();
