const translations={
  id:{
    tools:'Tools',homeBadge:'REYVAL TOOLS',homeTitle:'Tools buat video, tanpa ribet.',homeSub:'Clarity udah aktif. Downloader TikTok dan YouTube nyusul.',openClarity:'Buka Clarity',viewTools:'Lihat tools',ourTools:'Pilih tool',toolsSub:'Satu tempat buat workflow media yang sering kepake.',clarityDesc:'Siapkan video TikTok tanpa encode ulang yang nggak perlu.',tiktokDesc:'Simpan video TikTok langsung dari link.',youtubeDesc:'Video atau audio dari YouTube, tinggal pilih format.',available:'AKTIF',soon:'SEGERA',openTool:'Buka tool',previewTool:'Lihat halaman',privacy:'Lokal',privacyDesc:'Clarity jalan di browser. File video tetap di perangkat lu.',mobile:'Responsif',mobileDesc:'Nyaman dipakai dari HP sampai desktop.',simple:'Ringkas',simpleDesc:'Nggak ada menu yang nggak perlu.',back:'Balik ke Reyval',tiktokPageSub:'Simpan video TikTok langsung dari link.',youtubePageSub:'Download video atau audio YouTube dari satu link.',pasteTikTok:'Tempel link TikTok',pasteYouTube:'Tempel link YouTube',download:'Download',comingShort:'Segera hadir',comingNote:'Belum tersedia. Lagi disiapin.',home:'Homepage'
  },
  en:{
    tools:'Tools',homeBadge:'REYVAL TOOLS',homeTitle:'Video tools, without the clutter.',homeSub:'Clarity is live. TikTok and YouTube downloaders are next.',openClarity:'Open Clarity',viewTools:'View tools',ourTools:'Choose a tool',toolsSub:'One place for the media tasks you actually use.',clarityDesc:'Prepare TikTok videos without unnecessary re-encoding.',tiktokDesc:'Save TikTok videos straight from a link.',youtubeDesc:'Video or audio from YouTube, choose the format.',available:'LIVE',soon:'SOON',openTool:'Open tool',previewTool:'View page',privacy:'Local',privacyDesc:'Clarity runs in your browser. Your video stays on your device.',mobile:'Responsive',mobileDesc:'Comfortable on mobile and desktop.',simple:'Simple',simpleDesc:'No unnecessary menus.',back:'Back to Reyval',tiktokPageSub:'Save TikTok videos straight from a link.',youtubePageSub:'Download YouTube video or audio from one link.',pasteTikTok:'Paste TikTok link',pasteYouTube:'Paste YouTube link',download:'Download',comingShort:'Coming soon',comingNote:'Not available yet. In progress.',home:'Homepage'
  }
};
function getLang(){return localStorage.getItem('reyval-lang')||'id'}
function setLang(lang){
  localStorage.setItem('reyval-lang',lang);
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.dataset.i18n;
    if(translations[lang]?.[key]) el.textContent=translations[lang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key=el.dataset.i18nPlaceholder;
    if(translations[lang]?.[key]) el.placeholder=translations[lang][key];
  });
  document.querySelectorAll('[data-lang]').forEach(btn=>btn.classList.toggle('active',btn.dataset.lang===lang));
  window.dispatchEvent(new CustomEvent('reyval:lang',{detail:{lang}}));
}
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>setLang(btn.dataset.lang)));
  setLang(getLang());
});
