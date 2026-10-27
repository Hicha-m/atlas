import http from 'k6/http';
import {check,sleep} from 'k6';
import {Rate,Counter,Trend} from 'k6/metrics';
/**
 * Atlas user journey, localhost ONLY. Four GETs to actual Atlas handler routes.
 * Every action has a two-second pause. No external provider contact is allowed
 * by the Node fixture, which supplies deterministic upstream responses.
 */
const origin=__ENV.QK_TARGET||'http://127.0.0.1:8890';
const vus=Number(__ENV.QK_CAPACITY_VUS||1);
const seconds=Number(__ENV.QK_CAPACITY_DURATION||18);
const thinkMs=Number(__ENV.QK_CAPACITY_THINK_MS||2000);
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)||
   !Number.isInteger(vus)||vus<1||vus>512||
   !Number.isInteger(seconds)||seconds<10||seconds>180||
   !Number.isInteger(thinkMs)||thinkMs!==2000)
 throw Error('Atlas journey: localhost only, max 512 VUs and 2000ms pause');
const steps=[
 {name:'home',path:'/',format:'html'},
 {name:'weather',path:'/api/immersive-weather?kind=forecast&lat=43.2965&lon=5.3698',format:'weather'},
 {name:'trains',path:'/api/train-map',format:'trains'},
 {name:'rail',path:'/api/rail-lines?south=42.9&north=43.8&west=4.7&east=5.9',format:'rail'}
];
const journeyFailed=new Rate('atlas_journey_failed');
const journeyCount=new Counter('atlas_journeys_completed');
const journeyDuration=new Trend('atlas_journey_duration_ms',true);
const stepFailures=new Rate('atlas_step_failed');
export const options={
 discardResponseBodies:false,
 scenarios:{journeys:{executor:'constant-vus',vus,duration:seconds+'s',gracefulStop:'10s'}},
 summaryTrendStats:['avg','min','med','max','p(90)','p(95)','p(99)'],
 maxRedirects:0
};
function validResponse(r,step){
 if(r.status!==200||!r.body)return false;
 if(step.format==='html')return r.body.includes('<!DOCTYPE html')||r.body.includes('<html');
 try{
  const obj=JSON.parse(r.body);
  if(step.format==='weather')return !!obj.current&&Array.isArray(obj.hourly?.time)&&Array.isArray(obj.daily?.time);
  if(step.format==='trains')return Array.isArray(obj.markers)&&typeof obj.provider==='string';
  if(step.format==='rail')return Array.isArray(obj.lines)&&obj.nature==='railway_infrastructure_not_vehicle_track';
 }catch{return false;}
 return false;
}
export default function(){
 let failed=false;
 const start=Date.now();
 for(const step of steps){
  const r=http.get(origin+step.path,{timeout:'5s',responseType:'text',tags:{atlas_step:step.name}});
  const good=validResponse(r,step);
  check(r,{['Atlas '+step.name+' status and contract']:()=>good},{atlas_step:step.name});
  stepFailures.add(!good,{atlas_step:step.name});
  failed=failed||!good;
  sleep(thinkMs/1000);
 }
 journeyFailed.add(failed);
 journeyCount.add(1);
 journeyDuration.add(Date.now()-start);
}
export function handleSummary(data){
 const m=data.metrics||{};
 const value=(key,field,defaultValue=null)=>m[key]?.values?.[field]??defaultValue;
 const report={
  vus,durationSeconds:seconds,thinkTimeMs:thinkMs,
  steps:steps.map(({name,path})=>({name,path})),
  requests:value('http_reqs','count',0),
  rps:value('http_reqs','rate',0),
  p95Ms:value('http_req_duration','p(95)'),
  p99Ms:value('http_req_duration','p(99)'),
  errors:value('http_req_failed','rate',1),
  stepErrors:value('atlas_step_failed','rate',1),
  journeyErrors:value('atlas_journey_failed','rate',1),
  journeys:value('atlas_journeys_completed','count',0),
  journeyP95Ms:value('atlas_journey_duration_ms','p(95)'),
  dropped:value('dropped_iterations','count',0),
  requestP95ByStep:Object.fromEntries(steps.map(s=>[s.name,value('http_req_duration{atlas_step:'+s.name+'}','p(95)')]))
 };
 return {stdout:'QK_CAPACITY_JSON:'+JSON.stringify(report)+'\n'};
}
