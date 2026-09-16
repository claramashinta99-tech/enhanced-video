(()=>{
  const STYLE_ID='rvl-shorts-clean-layout';
  const css=`
    body[data-platform="youtube-shorts"] .download-card{overflow:hidden!important}
    body[data-platform="youtube-shorts"] .media-card.show{
      display:grid!important;
      grid-template-columns:240px minmax(0,1fr)!important;
      align-items:start!important;
      gap:18px!important;
      margin-top:16px!important;
      padding-top:16px!important;
    }
    body[data-platform="youtube-shorts"] .media-thumb{
      display:block!important;
      width:240px!important;
      max-width:240px!important;
      height:auto!important;
      max-height:none!important;
      aspect-ratio:16/9!important;
      object-fit:cover!important;
      justify-self:start!important;
      border-radius:0!important;
    }
    body[data-platform="youtube-shorts"] .media-info{
      width:100%!important;
      min-width:0!important;
      align-self:start!important;
    }
    body[data-platform="youtube-shorts"] .media-title{
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
      overflow-wrap:anywhere!important;
      font-size:15px!important;
      line-height:1.45!important;
    }
    body[data-platform="youtube-shorts"] .media-meta{
      margin-top:7px!important;
      line-height:1.5!important;
    }
    body[data-platform="youtube-shorts"] .media-actions{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 150px!important;
      align-items:stretch!important;
      gap:10px!important;
      width:100%!important;
      margin-top:16px!important;
    }
    body[data-platform="youtube-shorts"] .quality-select,
    body[data-platform="youtube-shorts"] #download-btn{
      width:100%!important;
      min-width:0!important;
      height:48px!important;
      min-height:48px!important;
      margin:0!important;
      box-sizing:border-box!important;
    }
    body[data-platform="youtube-shorts"] #download-btn{
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:0 16px!important;
    }
    body[data-platform="youtube-shorts"] .rvl-job-progress{
      width:100%!important;
      margin-top:16px!important;
      padding-top:14px!important;
      box-sizing:border-box!important;
    }
    body[data-platform="youtube-shorts"] .rvl-job-head{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:10px!important;
      padding-left:0!important;
    }
    @media(max-width:700px){
      body[data-platform="youtube-shorts"] .media-card.show{
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:12px!important;
        margin-top:12px!important;
        padding-top:12px!important;
      }
      body[data-platform="youtube-shorts"] .media-thumb{
        width:100%!important;
        max-width:none!important;
        height:auto!important;
        max-height:220px!important;
        aspect-ratio:16/9!important;
        object-fit:cover!important;
      }
      body[data-platform="youtube-shorts"] .media-info{
        width:100%!important;
      }
      body[data-platform="youtube-shorts"] .media-title{
        font-size:14px!important;
        line-height:1.4!important;
      }
      body[data-platform="youtube-shorts"] .media-actions{
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:10px!important;
        width:100%!important;
        margin-top:12px!important;
      }
      body[data-platform="youtube-shorts"] .quality-select,
      body[data-platform="youtube-shorts"] #download-btn{
        width:100%!important;
        height:48px!important;
        min-height:48px!important;
      }
      body[data-platform="youtube-shorts"] .rvl-job-progress{
        margin-top:12px!important;
        padding-top:12px!important;
      }
    }
  `;
  function apply(){
    const old=document.getElementById(STYLE_ID);
    if(old)old.remove();
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=css;
    document.head.appendChild(style);
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,0),{once:true});
  window.addEventListener('rvl:route',()=>setTimeout(apply,60));
  setTimeout(apply,0);
})();
