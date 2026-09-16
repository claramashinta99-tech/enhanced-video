await import(`/assets/clarity.js?route=${Date.now()}`);

const isMethodRoute=()=>location.pathname==='/clarity/'||location.pathname==='/clarity';
const copy={
  id:{sub:'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',notice:'TikTok tetap bisa melakukan kompresi setelah upload. TikTok Method membantu menghindari encode ulang yang nggak perlu sebelum file dikirim.'},
  en:{sub:'Prepare video before uploading to TikTok so the source quality is preserved as much as possible and stays clean / HD.',notice:'TikTok may still compress the video after upload. TikTok Method helps avoid unnecessary re-encoding before the file is sent.'}
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
}

applyTikTokMethod();
window.addEventListener('reyval:lang',()=>setTimeout(applyTikTokMethod,0));
window.addEventListener('rvl:route',()=>setTimeout(applyTikTokMethod,0));
const observer=new MutationObserver(()=>applyTikTokMethod());
observer.observe(document.body,{subtree:true,childList:true,characterData:true});
setTimeout(applyTikTokMethod,0);
