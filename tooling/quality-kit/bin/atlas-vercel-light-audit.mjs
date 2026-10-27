#!/usr/bin/env node
/**
 * Manual, intentionally tiny Vercel production-target AUDIT of the isolated
 * atlas-live-data-studio-test project only. 13 sequential GETs total.
 * Never a load test: no concurrency, no VUs, no retries, no cache-busting.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';

const ORIGIN='https://atlas-live-data-studio-test.vercel.app';
const args=process.argv.slice(2);
if(args.length>2||args.length===1&&args[0]!=='--out'||
 args.length===2&&args[0]!=='--out')throw Error('Usage: node atlas-vercel-light-audit.mjs [--out results.json]');
const output=resolve(args[1]||'monitoring/results/atlas-vercel-light-audit.json');
const maxRequests=13;
const results=[];
const routes={
 home:'/',
 asset:'/app.js',
 forecast:'/api/immersive-weather?kind=forecast&lat=43.2965&lon=5.3698',
 air:'/api/immersive-weather?kind=air&lat=43.2965&lon=5.3698',
 lyon:'/api/immersive-weather?kind=forecast&lat=45.764&lon=4.8357',
 trains:'/api/train-map',
 rail:'/api/rail-lines?south=42.9&north=43.8&west=4.7&east=5.9'
};
function verify(kind,status,body,header){
 if(status!==200)return 'http_status_'+status;
 if(kind==='home')return /<html/i.test(body)?null:'invalid_html';
 if(kind==='asset')return body.length>1000?null:'invalid_javascript';
 if(header!=='fixture')return 'fixture_header_absent';
 try{
  const json=JSON.parse(body);
  if(kind==='forecast'||kind==='lyon')
   return json.current&&Array.isArray(json.hourly?.time)&&json.hourly.time.length>=12&&
    Array.isArray(json.daily?.time)&&json.daily.time.length===10?null:'invalid_forecast_contract';
  if(kind==='air')return json.current&&Number.isFinite(json.current.european_aqi)?null:'invalid_air_contract';
  if(kind==='trains')return json.fixture===true&&json.markers?.length>=10&&
    json.locationPrecision==='next_stop_anchor_not_vehicle_position'?null:'invalid_train_contract';
  if(kind==='rail')return json.fixture===true&&json.lines?.length>=2&&
    json.nature==='railway_infrastructure_not_vehicle_track'?null:'invalid_rail_contract';
 }catch{return 'non_json_response';}
 return 'unknown_route';
}
async function get(section,kind){
 if(results.length>=maxRequests)throw Error('Hard request budget exceeded');
 const path=routes[kind],url=ORIGIN+path;
 const t=performance.now();
 try{
  const r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{'User-Agent':'Atlas-QualityKit-Transparent-Light-Audit/1.0','Accept':'*/*'}});
  const body=await r.text();
  const ms=Math.round((performance.now()-t)*100)/100;
  const headers={
   cache:r.headers.get('x-vercel-cache'),
   age:r.headers.get('age'),
   cacheControl:r.headers.get('cache-control'),
   dataMode:r.headers.get('x-atlas-data-mode'),
   environment:r.headers.get('x-atlas-environment'),
   vercelId:r.headers.get('x-vercel-id')
  };
  const error=verify(kind,r.status,body,headers.dataMode);
  const item={section,kind,path,status:r.status,latencyMs:ms,
   bytes:Buffer.byteLength(body),headers,pass:!error,error};
  results.push(item);
  process.stdout.write(JSON.stringify({section,kind,status:r.status,latencyMs:ms,
   cache:headers.cache,pass:!error,error})+'\n');
 }catch(e){
  const item={section,kind,path,latencyMs:Math.round((performance.now()-t)*100)/100,
   pass:false,error:e.name==='TimeoutError'?'timeout':e.message};
  results.push(item);process.stdout.write(JSON.stringify(item)+'\n');
 }
}
const pause=ms=>new Promise(done=>setTimeout(done,ms));
// No VUs. Exactly 13 sequential requests across 3 measurement areas.
for(const kind of ['home','home','asset','asset'])await get('cdn',kind);
for(const kind of ['forecast','forecast','air','trains','rail'])await get('functions',kind);
for(const kind of ['forecast','lyon','trains','rail']){
 await get('user-journey',kind);
 await pause(2000);
}
const sections=Object.fromEntries(['cdn','functions','user-journey'].map(name=>{
 const rows=results.filter(r=>r.section===name);
 return [name,{requests:rows.length,passed:rows.filter(r=>r.pass).length,
  failed:rows.filter(r=>!r.pass).length,
  observedLatenciesMs:rows.map(r=>r.latencyMs),cacheStates:rows.map(r=>r.headers?.cache??null)}];
}));
const report={
 generatedUTC:new Date().toISOString(),target:ORIGIN,
 mode:'manual_light_probe_not_load_testing',
 totalRequests:results.length,maxRequests,
 sequential:true,concurrentUsers:1,repeat:0,thinkTimeMs:2000,
 budget:'13 requests total; no retries or proxy rotation',
 externalProviders:'mocked only for the three Atlas fixture routes',
 warning:'These are single-request observations, NOT statistically reliable p95 or sustainable capacity estimates.',
 sections,allPass:results.length===13&&results.every(r=>r.pass),requests:results
};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log('ATLAS_LIGHT_AUDIT:'+JSON.stringify({file:output,allPass:report.allPass,
 totalRequests:report.totalRequests,sections:report.sections}));
if(!report.allPass)process.exitCode=1;
