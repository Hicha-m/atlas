#!/usr/bin/env node
/**
 * Side-by-side local Chromium profiling on two isolated loopback servers.
 * Compares main baseline against profiling branch from a git checkout.
 * This does not measure Vercel, regional network, or real field UX.
 */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {chromium} from '@playwright/test';
const BASELINE=resolve('atlas-baseline');
const OPTIMIZED=resolve('.');
const OUT=resolve('monitoring/results/atlas-home-local-comparison.json');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
 '.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.webp':'image/webp'};
function start(root){
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
   const body=await readFile(path);
   res.writeHead(200,{'Content-Type':MIME[extname(path)]||'application/octet-stream',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(body);
  }catch{res.writeHead(404).end('not found');}
 });
 return new Promise(done=>server.listen(0,'127.0.0.1',()=>done({
  server,origin:'http://127.0.0.1:'+server.address().port
 })));
}
const [old,newSite]=await Promise.all([start(BASELINE),start(OPTIMIZED)]);
const browser=await chromium.launch({headless:true});
const results={baseline:[],optimized:[]};
async function capture(type,origin,i){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const requests=[];const failures=[];
 page.on('request',r=>requests.push(r.url()));
 page.on('requestfailed',r=>failures.push(r.url()));
 await page.addInitScript(()=>{
  window.__profile={fcp:null,lcp:null,longTasks:[]};
  try{new PerformanceObserver(list=>{
   for(const p of list.getEntries()){
    if(p.name==='first-contentful-paint')window.__profile.fcp=p.startTime;
   }
  }).observe({type:'paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{
   for(const p of list.getEntries())window.__profile.lcp=p.startTime;
  }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{
   for(const p of list.getEntries())window.__profile.longTasks.push({startMs:p.startTime,durationMs:p.duration});
  }).observe({type:'longtask',buffered:true});}catch{}
 });
 try{
  const response=await page.goto(origin+'/',{waitUntil:'load',timeout:25000});
  await page.waitForTimeout(750);
  const data=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const resources=performance.getEntriesByType('resource');
   const boot=performance.getEntriesByName('atlas-bootstrap','measure')[0];
   const paint=window.__profile;
   return {
    title:document.title,
    homeCards:document.querySelectorAll('#catalog .card').length,
    stylesInHead:document.querySelectorAll('head link[rel=stylesheet]').length,
    scriptsInHtml:document.querySelectorAll('script').length,
    domContentLoadedMs:Math.round(nav.domContentLoadedEventEnd),
    windowLoadMs:Math.round(nav.loadEventEnd),
    fcpMs:paint.fcp==null?null:Math.round(paint.fcp),
    lcpMs:paint.lcp==null?null:Math.round(paint.lcp),
    longTasks:paint.longTasks.map(t=>({...t,durationMs:Math.round(t.durationMs)})),
    bootstrapMeasureMs:boot?Math.round(boot.duration*10)/10:null,
    resourceCount:resources.length,
    totalDecodedResourceBytes:resources.reduce((n,r)=>n+(r.decodedBodySize||0),0),
    requestedOrigins:[...new Set(resources.map(r=>new URL(r.name).origin))],
    thirdPartyResources:resources.filter(r=>new URL(r.name).origin!==location.origin).length,
    staticHeading:document.querySelector('main h1')?.textContent?.trim()??null
   };
  });
  const result={sample:i+1,status:response?.status()??null,failedRequests:failures.length,requestCount:requests.length,...data};
  console.log('LOCAL_COMPARE:'+JSON.stringify({type,...result}));
  results[type].push(result);
 }finally{await context.close();}
}
function median(values){
 const a=values.filter(Number.isFinite).sort((a,b)=>a-b);
 return a.length?a[Math.floor(a.length/2)]:null;
}
try{
 // Pair each run to minimize machine drift, but always create a new browser
 // context so both variants are measured with empty browser caches.
 for(let i=0;i<3;i++){
  await capture('baseline',old.origin,i);
  await capture('optimized',newSite.origin,i);
 }
}finally{
 await browser.close();
 await Promise.all([new Promise(r=>old.server.close(r)),new Promise(r=>newSite.server.close(r))]);
}
const metrics=Object.fromEntries(['baseline','optimized'].map(type=>{
 const rows=results[type];return [type,{
  coldFcpMedianMs:median(rows.map(r=>r.fcpMs)),
  coldLcpMedianMs:median(rows.map(r=>r.lcpMs)),
  domContentLoadedMedianMs:median(rows.map(r=>r.domContentLoadedMs)),
  windowLoadMedianMs:median(rows.map(r=>r.windowLoadMs)),
  resourceCountMedian:median(rows.map(r=>r.resourceCount)),
  thirdPartyResourceMedian:median(rows.map(r=>r.thirdPartyResources)),
  cssCountMedian:median(rows.map(r=>r.stylesInHead)),
  scriptCountMedian:median(rows.map(r=>r.scriptsInHtml)),
  decodedResourceBytesMedian:median(rows.map(r=>r.totalDecodedResourceBytes)),
  bootstrapMeasureMedianMs:median(rows.map(r=>r.bootstrapMeasureMs))
 }]}));
const ok=results.baseline.length===3&&results.optimized.length===3&&
 results.baseline.every(r=>r.status===200)&&
 results.optimized.every(r=>r.status===200&&r.homeCards===15);
const report={measuredAt:new Date().toISOString(),kind:'LOCAL_TWO_VERSION_CHROMIUM_NOT_VERCEL',
 sampleCountPerVariant:3,baselineRef:'afc240158c62a9f5b8d4280d9dde37faa1c1dba0',
 optimizedRef:'profiling/home-cold-start-20261027',
 cache:'new clean Chromium context per sample; HTTP no-store local files',
 caveats:['Loopback removes Vercel CDN and origin TTFB','CDN libraries served externally, network variability remains',
  '3 samples per version are insufficient for robust p95 or SEO field data',
  'Only home route is measured; separate regression suite validates lazy module routes'],
 metrics,passed:ok,samples:results};
await mkdir(dirname(OUT),{recursive:true});await writeFile(OUT,JSON.stringify(report,null,2)+'\n');
console.log('LOCAL_COMPARE_SUMMARY:'+JSON.stringify({passed:ok,metrics,file:OUT}));
if(!ok)process.exitCode=1;
