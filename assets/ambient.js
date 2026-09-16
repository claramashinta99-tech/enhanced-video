(()=>{
  if(window.__RVL_AMBIENT__)return;
  window.__RVL_AMBIENT__=true;

  const install=()=>{
    if(document.querySelector('#rvl-ambient-bg'))return;

    const style=document.createElement('style');
    style.id='rvl-ambient-style';
    style.textContent=`
      body{position:relative;isolation:isolate;overflow-x:hidden}
      .rvl-ambient-bg{position:fixed;inset:-12vh -10vw;z-index:0;pointer-events:none;overflow:hidden;contain:strict;opacity:.9}
      body>.shell,body>main,body>.toast,body>.rvl-credit{position:relative;z-index:1}
      .rvl-ambient-blob{position:absolute;border-radius:999px;filter:blur(95px);will-change:transform;transform:translate3d(0,0,0)}
      .rvl-ambient-a{width:min(58vw,860px);height:min(58vw,860px);left:-14vw;top:-20vh;background:radial-gradient(circle at 50% 50%,rgba(88,200,255,.20),rgba(88,200,255,.085) 38%,transparent 70%);animation:rvlAmbientA 26s ease-in-out infinite}
      .rvl-ambient-b{width:min(54vw,820px);height:min(54vw,820px);right:-15vw;top:-12vh;background:radial-gradient(circle at 50% 50%,rgba(139,124,255,.22),rgba(139,124,255,.08) 42%,transparent 72%);animation:rvlAmbientB 31s ease-in-out infinite}
      .rvl-ambient-c{width:min(46vw,700px);height:min(46vw,700px);left:30vw;bottom:-30vh;background:radial-gradient(circle at 50% 50%,rgba(255,126,182,.12),rgba(104,230,194,.055) 48%,transparent 72%);animation:rvlAmbientC 36s ease-in-out infinite}
      .rvl-ambient-grid{position:absolute;inset:-12%;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at center,black 0%,rgba(0,0,0,.72) 38%,transparent 78%);-webkit-mask-image:radial-gradient(ellipse at center,black 0%,rgba(0,0,0,.72) 38%,transparent 78%);animation:rvlGridDrift 42s linear infinite}
      .rvl-ambient-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(9,9,9,.20) 72%,rgba(9,9,9,.58) 100%)}
      @keyframes rvlAmbientA{0%,100%{transform:translate3d(-4%,-3%,0) scale(1)}28%{transform:translate3d(18%,10%,0) scale(1.08)}58%{transform:translate3d(8%,28%,0) scale(.94)}82%{transform:translate3d(-12%,15%,0) scale(1.04)}}
      @keyframes rvlAmbientB{0%,100%{transform:translate3d(5%,-4%,0) scale(1.03)}24%{transform:translate3d(-18%,14%,0) scale(.96)}55%{transform:translate3d(-8%,30%,0) scale(1.08)}80%{transform:translate3d(12%,12%,0) scale(1)}}
      @keyframes rvlAmbientC{0%,100%{transform:translate3d(0,8%,0) scale(1)}32%{transform:translate3d(-22%,-16%,0) scale(1.1)}66%{transform:translate3d(26%,-10%,0) scale(.94)}}
      @keyframes rvlGridDrift{from{background-position:0 0,0 0}to{background-position:64px 64px,64px 64px}}
      @media(max-width:700px){
        .rvl-ambient-bg{inset:-8vh -28vw;opacity:.78}
        .rvl-ambient-blob{filter:blur(74px)}
        .rvl-ambient-a{width:118vw;height:118vw;left:-52vw;top:-12vh}
        .rvl-ambient-b{width:112vw;height:112vw;right:-58vw;top:20vh}
        .rvl-ambient-c{width:105vw;height:105vw;left:8vw;bottom:-28vh;opacity:.72}
        .rvl-ambient-grid{opacity:.07;background-size:52px 52px}
      }
      @media(prefers-reduced-motion:reduce){
        .rvl-ambient-blob,.rvl-ambient-grid{animation:none!important}
        .rvl-ambient-a{transform:translate3d(8%,8%,0)}
        .rvl-ambient-b{transform:translate3d(-8%,14%,0)}
        .rvl-ambient-c{transform:translate3d(0,-8%,0)}
      }
    `;
    document.head.appendChild(style);

    const bg=document.createElement('div');
    bg.id='rvl-ambient-bg';
    bg.className='rvl-ambient-bg';
    bg.setAttribute('aria-hidden','true');
    bg.innerHTML='<span class="rvl-ambient-blob rvl-ambient-a"></span><span class="rvl-ambient-blob rvl-ambient-b"></span><span class="rvl-ambient-blob rvl-ambient-c"></span><span class="rvl-ambient-grid"></span><span class="rvl-ambient-vignette"></span>';
    document.body.prepend(bg);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
