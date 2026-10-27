import {performance} from 'node:perf_hooks';
import {extractCache} from './adapters.mjs';
import {validateFields,stableFingerprint,timestampAgeSeconds} from './contracts.mjs';

async function limitedBody(response,limit){
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader(),chunks=[];
 let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>limit)throw Error('body_too_large');
   chunks.push(Buffer.from(value));
  }
 }catch(err){await reader.cancel().catch(()=>{});throw err;}
 return Buffer.concat(chunks,bytes);
}
function errorName(error){
 if(error?.name==='AbortError'||error?.name==='TimeoutError')return 'timeout';
 if(error?.message==='body_too_large')return 'body_too_large';
 if(error instanceof SyntaxError)return 'invalid_json';
 return 'network_or_contract';
}
export async function probe({baseUrl,project,suite,adapter='generic',fetcher=globalThis.fetch,now=()=>Date.now()}){
 const url=new URL(suite.path,baseUrl);
 const started=performance.now(),timestamp=new Date(now()).toISOString();
 const controller=new AbortController();
 const deadline=setTimeout(()=>controller.abort(),suite.timeoutMs);
 const out={
  timestamp,project,suite:suite.id,method:'GET',path:suite.path,
  httpStatus:0,ok:false,durationMs:0,cacheStatus:'UNKNOWN',
  cacheHeader:null,cacheAgeSeconds:null,sourceAgeSeconds:null,
  fingerprint:null,contentBytes:0,problems:[],error:null
 };
 try{
  const response=await fetcher(url.toString(),{
   method:'GET',redirect:'manual',signal:controller.signal,
   headers:{Accept:suite.format==='json'?'application/json':'text/html, text/plain;q=0.9'}
  });
  out.httpStatus=response.status;
  const cache=extractCache(response.headers,adapter);
  out.cacheStatus=cache.status;
  out.cacheHeader=cache.header;
  out.cacheAgeSeconds=cache.ageSeconds;
  const body=await limitedBody(response,suite.maxBytes);
  out.contentBytes=body.length;
  if(response.status!==suite.expectedStatus)
   out.problems.push({reason:'http_status',expected:suite.expectedStatus,actual:response.status});
  if(suite.format==='json'&&response.status===suite.expectedStatus){
   const data=JSON.parse(body.toString('utf8'));
   out.problems.push(...validateFields(data,suite.fields));
   out.fingerprint=stableFingerprint(data,suite.hashPaths);
   out.sourceAgeSeconds=timestampAgeSeconds(data,suite.sourceTimestampPath,now());
  }
  out.ok=out.problems.length===0;
 }catch(error){
  out.error=errorName(error);
  out.ok=false;
 }finally{
  clearTimeout(deadline);
  out.durationMs=Math.round((performance.now()-started)*100)/100;
 }
 return out;
}
