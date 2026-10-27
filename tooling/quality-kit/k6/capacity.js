import http from 'k6/http';
import {check,sleep} from 'k6';
/**
 * One closed-loop virtual user = one repeating HTTP visitor with pause.
 * Localhost only. A separate Node runner validates the binary-search plan.
 */
const origin=__ENV.QK_TARGET||'http://127.0.0.1:8765';
const path=__ENV.QK_PATH||'/';
const vus=Number(__ENV.QK_CAPACITY_VUS||1);
const duration=Number(__ENV.QK_CAPACITY_DURATION||8);
const think=Number(__ENV.QK_CAPACITY_THINK_MS||100);
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)||
  !path.startsWith('/')||path.startsWith('//')||path.length>500||path.includes('#')||
  !Number.isInteger(vus)||vus<1||vus>32||
  !Number.isInteger(duration)||duration<5||duration>60||
  !Number.isInteger(think)||think<0||think>5000)throw Error('Capacity scenario: restricted to safe localhost settings');
export const options={
 discardResponseBodies:true,noConnectionReuse:false,
 scenarios:{closed:{executor:'constant-vus',vus,duration:duration+'s',gracefulStop:'1s'}},
 summaryTrendStats:['avg','min','med','max','p(90)','p(95)','p(99)']
};
export default function(){
 const r=http.get(origin+path,{timeout:'4s',redirects:0,responseType:'none'});
 check(r,{'response HTTP 200':x=>x.status===200});
 if(think>0)sleep(think/1000);
}
export function handleSummary(data){
 const m=data.metrics||{};
 const s={
  vus,
  requests:m.http_reqs?.values?.count??0,
  rps:m.http_reqs?.values?.rate??0,
  p95Ms:m.http_req_duration?.values?.['p(95)']??null,
  p99Ms:m.http_req_duration?.values?.['p(99)']??null,
  errors:m.http_req_failed?.values?.rate??1,
  dropped:m.dropped_iterations?.values?.count??0,
  durationSeconds:duration,thinkTimeMs:think
 };
 return {stdout:'QK_CAPACITY_JSON:'+JSON.stringify(s)+'\n'};
}
