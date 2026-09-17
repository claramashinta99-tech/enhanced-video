(()=>{
  if(window.__rvlSizeFix)return;
  window.__rvlSizeFix=true;
  const nativeFetch=window.fetch.bind(window);
  const swap=url=>String(url).replace(/\/api\/file-size(?=($|[?#]))/,'/api/file-size-v2');
  window.fetch=(input,init)=>{
    try{
      if(typeof input==='string'){
        input=swap(input);
      }else if(input instanceof Request){
        const next=swap(input.url);
        if(next!==input.url)input=new Request(next,input);
      }
    }catch{}
    return nativeFetch(input,init);
  };
})();
