await import(`/assets/clarity.js?route=${Date.now()}`);

const isMethodRoute=()=>location.pathname==='/clarity/'||location.pathname==='/clarity';
const copy={
  id:{
    sub:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',
    notice:'TikTok tetap bisa melakukan kompresi setelah upload. TikTok Method membantu menghindari encode ulang yang nggak perlu sebelum file dikirim.',
    guideTitle:'Cara upload hasil ke TikTok Studio',
    guideIntro:'Setelah video selesai diproses, upload lewat TikTok Studio di Microsoft Edge supaya alurnya konsisten dan gampang diikuti.',
    s1Title:'Login TikTok di Microsoft Edge',s1Text:'Buka tiktok.com di Microsoft Edge lalu login ke akun TikTok yang mau dipakai upload.',
    s2Title:'Aktifkan mode desktop',s2Text:'Kalau dari HP atau tablet, buka menu Edge lalu aktifkan Situs desktop / Desktop site. Di PC atau laptop, langkah ini bisa dilewati.',
    s3Title:'Buka TikTok Studio',s3Text:'Masuk ke TikTok Studio lewat browser yang sama supaya sesi login tetap aktif.',
    s4Title:'Upload video hasil',s4Text:'Pilih file hasil dari TikTok Method, cek caption dan preview, lalu lanjutkan upload dari TikTok Studio.',
    guideNote:'TikTok tetap dapat melakukan kompresi setelah file dikirim. Tutorial ini mengatur jalur upload, bukan menjamin TikTok tidak akan memproses ulang video.',
    studio:'Buka TikTok Studio ↗'
  },
  en:{
    sub:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',
    notice:'TikTok may still compress the video after upload. TikTok Method helps avoid unnecessary re-encoding before the file is sent.',
    guideTitle:'How to upload the result with TikTok Studio',
    guideIntro:'After processing finishes, upload through TikTok Studio in Microsoft Edge for a consistent, easy-to-follow workflow.',
    s1Title:'Log in to TikTok in Microsoft Edge',s1Text:'Open tiktok.com in Microsoft Edge and log in to the TikTok account you want to use for the upload.',
    s2Title:'Enable desktop mode',s2Text:'On a phone or tablet, open the Edge menu and enable Desktop site. On a PC or laptop, skip this step.',
    s3Title:'Open TikTok Studio',s3Text:'Open TikTok Studio in the same browser so your login session stays active.',
    s4Title:'Upload the processed video',s4Text:'Choose the file produced by TikTok Method, check the caption and preview, then continue the upload in TikTok Studio.',
    guideNote:'TikTok may still compress media after upload. This tutorial standardizes the upload path; it does not guarantee TikTok will not process the video again.',
    studio:'Open TikTok Studio ↗'
  }
};

function applyTikTokMethod(){
  if(!isMethodRoute())return;
  const lang=localStorage.getItem('reyval-lang')||'id';
  const c=copy[lang]||copy.id;
  document.title='TikTok Method — RVL';
  const desc=document.querySelector('meta[name="description"]');if(desc)desc.content='TikTok Method — alat untuk menyiapkan video sebelum upload ke TikTok agar kualitas tetap semaksimal mungkin.';
  const title=document.querySelector('.page-title');if(title&&title.textContent!=='TikTok Method')title.textContent='TikTok Method';
  const crumbs=document.querySelectorAll('.breadcrumbs span');const crumb=crumbs[crumbs.length-1];if(crumb&&crumb.textContent!=='TikTok Method')crumb.textContent='TikTok Method';
  const sub=document.querySelector('#clarity-sub');if(sub&&sub.textContent!==c.sub)sub.textContent=c.sub;
  const notice=document.querySelector('#notice');if(notice&&notice.textContent!==c.notice)notice.textContent=c.notice;
  const map={
    '#upload-guide-title':'guideTitle','#upload-guide-intro':'guideIntro',
    '#upload-step-1-title':'s1Title','#upload-step-1-text':'s1Text',
    '#upload-step-2-title':'s2Title','#upload-step-2-text':'s2Text',
    '#upload-step-3-title':'s3Title','#upload-step-3-text':'s3Text',
    '#upload-step-4-title':'s4Title','#upload-step-4-text':'s4Text',
    '#upload-guide-note':'guideNote','#open-tiktok-studio':'studio'
  };
  Object.entries(map).forEach(([selector,key])=>{const el=document.querySelector(selector);if(el&&el.textContent!==c[key])el.textContent=c[key]});
}

applyTikTokMethod();
window.addEventListener('reyval:lang',()=>setTimeout(applyTikTokMethod,0));
window.addEventListener('rvl:route',()=>setTimeout(applyTikTokMethod,0));
const observer=new MutationObserver(()=>applyTikTokMethod());
observer.observe(document.body,{subtree:true,childList:true,characterData:true});
setTimeout(applyTikTokMethod,0);
