(()=>{
  if(window.__rvlRailwayBridge)return;
  window.__rvlRailwayBridge=true;
  const FROM='https://rvl-api.onrender.com';
  const TO='https://enhanced-video-production.up.railway.app';
  const rewrite=value=>{
    try{
      const s=String(value||'');
      return s.startsWith(FROM)?TO+s.slice(FROM.length):s;
    }catch{return value}
  };

  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    try{
      if(input instanceof Request){
        const next=rewrite(input.url);
        if(next!==input.url) input=new Request(next,input);
      }else if(input instanceof URL){
        input=new URL(rewrite(input.href));
      }else{
        input=rewrite(input);
      }
    }catch{}
    return nativeFetch(input,init);
  };

  const desc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  if(desc?.get&&desc?.set&&desc.configurable!==false){
    try{
      Object.defineProperty(HTMLIFrameElement.prototype,'src',{
        configurable:true,
        enumerable:desc.enumerable,
        get(){return desc.get.call(this)},
        set(value){return desc.set.call(this,rewrite(value))}
      });
    }catch{}
  }
})();
