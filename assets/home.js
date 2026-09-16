(()=>{
  if(window.__rvlHomeModule){window.__rvlHomeModule.apply();return}
  const copy={
    id:{
      badge:'RVL TOOLS',
      titleA:'Tools video yang simpel.',
      titleB:'Tinggal pakai.',
      lead:'Clarity buat siapin video. TikTok & YouTube Downloader buat download media tanpa muter-muter.',
      primary:'Buka Clarity',
      secondary:'Lihat semua tools',
      active:'3 tools aktif',
      quick:'Quick access',
      quickState:'3 / 3 AKTIF',
      miniClarity:'Video prep',
      miniTikTok:'Download video',
      miniYouTube:'Video · MP3 · sampai 4K',
      sectionTitle:'Pilih yang lu butuhin.',
      sectionSub:'Semua tool aktif dan langsung bisa dipakai.',
      clarityDesc:'Siapkan video tanpa encode ulang yang nggak perlu.',
      tiktokDesc:'Tempel link TikTok, cek videonya, lalu download.',
      youtubeDesc:'Download video sampai 4K atau ambil MP3.',
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
      lead:'Use Clarity to prep video, then grab media with the TikTok and YouTube downloaders.',
      primary:'Open Clarity',
      secondary:'View all tools',
      active:'3 tools live',
      quick:'Quick access',
      quickState:'3 / 3 LIVE',
      miniClarity:'Video prep',
      miniTikTok:'Video download',
      miniYouTube:'Video · MP3 · up to 4K',
      sectionTitle:'Pick what you need.',
      sectionSub:'Every tool is live and ready to use.',
      clarityDesc:'Prepare video without unnecessary re-encoding.',
      tiktokDesc:'Paste a TikTok link, check the video, then download.',
      youtubeDesc:'Download video up to 4K or grab an MP3.',
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
