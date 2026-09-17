(()=>{
  if(window.__rvlSizeFix)return;
  window.__rvlSizeFix=true;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    try{
      if(typeof input==='string'&&input.includes('/api/file-size')){
        input=input.replace('/api/file-size','/api/file-size-v2');
      }else if(input instanceof Request&&input.url.includes('/api/file-size')){
        input=new Request(input.url.replace('/api/file-size','/api/file-size-v2'),input);
      }
    }catch{}
    return nativeFetch(input,init);
  };
})();
