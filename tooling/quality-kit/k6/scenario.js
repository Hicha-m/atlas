/**
 * Project-agnostic k6 adapter.
 * A workload is a fixed target and path, configured only via environment.
 * Never auto-run against production; remote tests require explicit target ACK.
 *
 * k6 run -e QK_TARGET=http://127.0.0.1:3000 -e QK_PATH=/ k6/scenario.js
 */
import http from 'k6/http';
import {check} from 'k6';
import {Rate,Counter,Trend} from 'k6/metrics';

const origin=__ENV.QK_TARGET||'http://127.0.0.1:3000';
const path=__ENV.QK_PATH||'/';
const level=__ENV.QK_LEVEL||'smoke';
const isLocal=/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(origin);
const validOrigin=/^https?:\/\/[^/?#]+$/.test(origin)&&!origin.includes('@');
if(!validOrigin||!path.startsWith('/')||path.startsWith('//')||
   path.includes('#')||path.includes('\\')||path.length>500)
 throw Error('Invalid QK_TARGET origin or QK_PATH');
if(!['smoke','baseline','step'].includes(level))throw Error('Invalid QK_LEVEL');
if(!isLocal&&(__ENV.QK_ALLOW_REMOTE_EXACT!==origin||
   __ENV.QK_ACK_PROVIDER_QUOTAS!=='YES')){
 throw Error('Remote target prohibited: provide QK_ALLOW_REMOTE_EXACT equal to QK_TARGET and QK_ACK_PROVIDER_QUOTAS=YES');
}
if(!isLocal&&level==='step')throw Error('step mode prohibited on remote targets');
const config={
 smoke:{rate:1,duration:'30s',vus:2},
 baseline:{rate:2,duration:'3m',vus:5},
 step:{rate:5,duration:'6m',vus:12}
}[level];

export const options={
 discardResponseBodies:true,
 scenarios:{
  http_requests:level==='step'?{
   executor:'ramping-arrival-rate',
   startRate:1,timeUnit:'1s',
   stages:[{target:2,duration:'2m'},{target:3,duration:'2m'},{target:5,duration:'2m'}],
   preAllocatedVUs:config.vus,maxVUs:config.vus*2
  }:{
   executor:'constant-arrival-rate',rate:config.rate,timeUnit:'1s',
   duration:config.duration,preAllocatedVUs:config.vus,maxVUs:config.vus*2
  }
 },
 thresholds:{
  http_req_failed:[{threshold:'rate<0.05',abortOnFail:true,delayAbortEval:'15s'}],
  http_req_duration:['p(95)<3000'],
  dropped_iterations:['count<2']
 }
};
const cacheHit=new Counter('qk_cache_hit');
const cacheMiss=new Counter('qk_cache_miss');
const cacheStale=new Counter('qk_cache_stale');
const cacheUnknown=new Counter('qk_cache_unknown');
const serverErrors=new Rate('qk_server_error_rate');
const validDuration=new Trend('qk_success_duration_ms',true);
export default function(){
 const response=http.get(origin+path,{
  timeout:'8s',redirects:0,responseType:'none',
  tags:{qk_level:level,qk_path:path}
 });
 const ok=response.status>=200&&response.status<400;
 serverErrors.add(!ok);
 check(response,{'response status success':r=>r.status>=200&&r.status<400});
 if(ok)validDuration.add(response.timings.duration);
 const state=String(response.headers['X-Vercel-Cache']||
   response.headers['Cf-Cache-Status']||response.headers['X-Cache']||'').toUpperCase();
 if(state.includes('HIT'))cacheHit.add(1);
 else if(state.includes('MISS'))cacheMiss.add(1);
 else if(state.includes('STALE'))cacheStale.add(1);
 else cacheUnknown.add(1);
}
export function handleSummary(data){
 const metrics=data.metrics||{};
 return {stdout:JSON.stringify({
  adapter:'quality-kit-k6',target:origin,path,level,
  requests:metrics.http_reqs?.values?.count??0,
  rps:metrics.http_reqs?.values?.rate??null,
  p95:metrics.http_req_duration?.values?.['p(95)']??null,
  failures:metrics.http_req_failed?.values?.rate??null,
  droppedIterations:metrics.dropped_iterations?.values?.count??0,
  cache:{hit:metrics.qk_cache_hit?.values?.count??0,
    miss:metrics.qk_cache_miss?.values?.count??0,
    stale:metrics.qk_cache_stale?.values?.count??0,
    unknown:metrics.qk_cache_unknown?.values?.count??0},
  note:'HTTP generator only. CDN hits do not measure application/server/function throughput.'
 },null,2)+'\n'};
}
