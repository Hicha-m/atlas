/**
 * Offline-only fault fixtures injected as the HTTP fetcher into probe/runSuite.
 * These must NEVER be installed in an application runtime or pointed at a
 * third-party service. They generate Responses inside the test process.
 */
export function fakeFetcher(mode,{payload={status:'ok'},delayMs=0}={}){
 const presets={
  ok:()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json','x-vercel-cache':'HIT',age:'3'}}),
  rateLimit:()=>new Response('{"error":"rate limited"}',{status:429,headers:{'retry-after':'30'}}),
  upstreamError:()=>new Response('{"error":"upstream failed"}',{status:502}),
  invalidJson:()=>new Response('{not valid json',{status:200}),
  invalidContract:()=>new Response('{"unexpected":true}',{status:200}),
  networkFailure:()=>{throw Error('Injected network failure')}
 };
 if(!Object.hasOwn(presets,mode)&&mode!=='timeout')
  throw Error('Unknown offline fault mode: '+mode);
 return async (_url,options={})=>{
  const signal=options.signal;
  if(mode==='timeout'||delayMs>0){
   const duration=mode==='timeout'?30000:delayMs;
   await new Promise((resolve,reject)=>{
    if(signal?.aborted){const e=new Error('aborted');e.name='AbortError';reject(e);return;}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},duration);
    function abort(){
     clearTimeout(timer);
     signal?.removeEventListener('abort',abort);
     const e=new Error('aborted');e.name='AbortError';reject(e);
    }
    signal?.addEventListener('abort',abort,{once:true});
   });
  }
  return presets[mode]();
 };
}
