import {probe} from './probe.mjs';
import {summarize} from './metrics.mjs';
import {authorizeSuite} from './config.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runSuite({
 config,suite,target=config.baseUrl,allowRemote=false,allowUpstream=false,
 fetcher=globalThis.fetch,now=()=>Date.now(),sleep=pause
}){
 const {remote}=authorizeSuite(config,suite,target,{allowRemote,allowUpstream});
 const results=[],interval=remote?Math.max(5000,suite.intervalMs):suite.intervalMs;
 for(let i=0;i<suite.samples;i++){
  if(i)await sleep(interval);
  const record=await probe({
   baseUrl:target,project:config.project,suite,adapter:config.adapter||'generic',
   fetcher,now
  });
  results.push({...record,iteration:i+1});
 }
 return {records:results,summary:summarize(results)};
}
