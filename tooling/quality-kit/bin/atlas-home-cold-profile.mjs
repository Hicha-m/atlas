#!/usr/bin/env node
/**
 * Lightweight home-page profiling. A single run performs exactly 8 curl
 * requests plus 2 Chromium navigations to Atlas TEST (never production).
 * Output separates DNS, TCP, TLS, TTFB, transfer and browser paint timings.
 * No cache busting, no concurrency, no synthetic pressure on Vercel.
 */
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {chromium} from '@playwright/test';
const ORIGIN='https://atlas-live-data-studio-test.vercel.app';
const OUT=resolve('monitoring/results/atlas-home-cold-profile.json');
const tmp=await mkdtemp(join(tmpdir(),'atlas-home-profile-'));
const urls=['/','/','/index.html','/index.html','/app.js','/app.js','/styles.css','/styles.css'];
const measurements=[];
function num(v){return v==null?null:Math.round(Number(v)*1000*100)/100;}
for(let i=0;i<urls.length;i++){
 const headersFile=join(tmp,'headers-'+i),bodyFile=join(tmp,'body-'+i);
 try{
  const raw=execFileSync('curl',[
   '--silent','--show-error','--location','--max-time','15','--http2',
   '--user-agent','Atlas-QualityKit-home-profiling/1.0',
   '--dump-header',headersFile,'--output',bodyFile,
   '--write-out','%{json}',ORIGIN+urls[i]
  ],{encoding:'utf8',timeout:18000});
  const c=JSON.parse(raw);
  const headers=(await readFile(headersFile,'utf8')).split(/\r?\n/);
  const last={};
  for(const line of headers){const m=/^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);if(m)last[m[1].toLowerCase()]=m[2];}
  const item={
   path:urls[i],status:c.http_code,cache:last['x-vercel-cache']??null,
   cacheControl:last['cache-control']??null,age:last.age??null,
   contentType:last['content-type']??null,bytes:c.size_download,
   remoteIp:c.remote_ip??null,httpVersion:c.http_version,
   timingsMs:{
    dns:num(c.time_namelookup),
    tcpConnect:num(c.time_connect),
    tlsReady:num(c.time_appconnect),
    firstByte:num(c.time_starttransfer),
    total:num(c.time_total),
    serverWaitAfterTls:num(c.time_starttransfer-c.time_appconnect),
    transferAfterTtfb:num(c.time_total-c.time_starttransfer)
   }};
  measurements.push(item);
  console.log('CURL_PROFILE:'+JSON.stringify(item));
 }catch(e){
  measurements.push({path:urls[i],error:String(e.message).slice(0,500)});
 }
}
const browser=await chromium.launch({headless:true});
const browserResults=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const failed=[];
 page.on('requestfailed',request=>failed.push({url:request.url(),reason:request.failure()?.errorText}));
 await page.addInitScript(()=>{
  window.__atlasPaint={fcp:null,lcp:null};
  try{new PerformanceObserver(list=>{
   for(const entry of list.getEntries())if(entry.name==='first-contentful-paint')window.__atlasPaint.fcp=entry.startTime;
  }).observe({type:'paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{
   for(const entry of list.getEntries())window.__atlasPaint.lcp=entry.startTime;
  }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
 });
 for(let run=0;run<2;run++){
  const t=Date.now();
  const response=await page.goto(ORIGIN+'/',{waitUntil:'load',timeout:20000});
  await page.waitForTimeout(1200);
  const perf=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const resources=performance.getEntriesByType('resource').map(e=>({
    url:e.name,host:new URL(e.name).hostname,type:e.initiatorType,
    startMs:Math.round(e.startTime),durationMs:Math.round(e.duration),
    responseEndMs:Math.round(e.responseEnd),
    transferSize:e.transferSize??0,decodedBodySize:e.decodedBodySize??0,
    responseStatus:e.responseStatus??null
   }));
   const rounding=x=>Math.round(x*100)/100;
   return {
    navigation:{dnsMs:rounding(nav.domainLookupEnd-nav.domainLookupStart),
      connectMs:rounding(nav.connectEnd-nav.connectStart),
      tlsMs:rounding(nav.connectEnd-nav.secureConnectionStart),
      requestToFirstByteMs:rounding(nav.responseStart-nav.requestStart),
      ttfbMs:rounding(nav.responseStart-nav.startTime),
      htmlTransferMs:rounding(nav.responseEnd-nav.responseStart),
      domContentLoadedMs:rounding(nav.domContentLoadedEventEnd-nav.startTime),
      windowLoadMs:rounding(nav.loadEventEnd-nav.startTime),
      transferSize:nav.transferSize,decodedBodySize:nav.decodedBodySize,
      responseStatus:nav.responseStatus},
    paint:window.__atlasPaint,
    elements:{title:document.title,headLinks:document.querySelectorAll('link[rel=stylesheet]').length,
      scripts:document.querySelectorAll('script').length,
      mainTextChars:document.querySelector('main')?.textContent?.trim().length??0},
    resources
   };
  });
  const result={
   iteration:run+1,responseStatus:response?.status(),requestFailures:failed.splice(0),
   ...perf,resourceCount:perf.resources.length,
   resourcesSortedByEndMs:perf.resources.slice().sort((a,b)=>b.responseEndMs-a.responseEndMs).slice(0,20),
   externalHosts:[...new Set(perf.resources.filter(r=>r.host!=='atlas-live-data-studio-test.vercel.app').map(r=>r.host))],
   wallClockMs:Date.now()-t
  };
  delete result.resources;
  browserResults.push(result);
  console.log('BROWSER_PROFILE:'+JSON.stringify(result).slice(0,11000));
 }
 await context.close();
}finally{await browser.close();}
const result={
 executedUTC:new Date().toISOString(),origin:ORIGIN,
 rule:'TEST ONLY. 8 sequential curl calls and 2 browser loads; no load test or cache busting.',
 curl:measurements,browser:browserResults,
 warning:'These are low-sample, specific-region observations. Curl firstByte includes DNS/TCP/TLS and edge/origin wait. p95 cannot be estimated from these measurements.'
};
await mkdir(dirname(OUT),{recursive:true});
await writeFile(OUT,JSON.stringify(result,null,2)+'\n');
const failedCurl=measurements.filter(m=>m.status!==200);
const failedBrowser=browserResults.filter(m=>m.responseStatus!==200);
if(failedCurl.length||failedBrowser.length)process.exitCode=1;
console.log('ATLAS_HOME_PROFILE_RESULT:'+JSON.stringify({
 out:OUT,requestCount:measurements.length,browserLoads:browserResults.length,
 allHttp200:!failedCurl.length&&!failedBrowser.length
}));
