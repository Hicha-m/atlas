#!/usr/bin/env node
/**
 * One Chromium session only; manual preproduction UI smoke, never a load test.
 * Real browser clicks -> Atlas Test HTTP functions; blocks remote providers,
 * OSM map tiles and any Atlas API not explicitly mocked.
 */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
const ORIGIN='https://atlas-live-data-studio-test.vercel.app';
const out=resolve('monitoring/results/atlas-vercel-browser-smoke.json');
const findings=[],requests=[];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1365,height:850}});
const page=await context.newPage();
let blockedThirdParty=0,blockedNonMockApi=0;
const ALLOWED_API=new Set(['/api/immersive-weather','/api/train-map','/api/rail-lines']);
await page.route('**/*',async route=>{
 const req=route.request();
 const u=new URL(req.url());
 if(u.origin===ORIGIN){
  if(u.pathname.startsWith('/api/')&&!ALLOWED_API.has(u.pathname)){
   blockedNonMockApi++;return route.abort();
  }
  return route.continue();
 }
 if(['unpkg.com','cdn.jsdelivr.net'].includes(u.hostname))return route.continue();
 blockedThirdParty++;return route.abort();
});
page.on('response',r=>{
 const u=new URL(r.url());
 if(u.origin!==ORIGIN||!u.pathname.startsWith('/api/'))return;
 requests.push({path:u.pathname,status:r.status(),fixture:r.headers()['x-atlas-data-mode']==='fixture'});
});
async function step(name,fn){
 const t=Date.now();
 try{await fn();findings.push({name,pass:true,durationMs:Date.now()-t});}
 catch(e){findings.push({name,pass:false,durationMs:Date.now()-t,
  error:String(e.message).slice(0,400)});}
}
try{
 await step('open immersive weather',async()=>{
  await page.goto(ORIGIN+'/#/weather/immersive',{waitUntil:'domcontentloaded',timeout:18000});
  await page.locator('#wi-city-quick').waitFor({state:'visible',timeout:10000});
  await page.locator('.wi-day-list .wi-day').first().waitFor({state:'visible',timeout:14000});
 });
 await step('choose Lyon via UI',async()=>{
  await page.locator('#wi-city-quick').click();
  await page.locator('#wi-search-results .wi-place[data-name="Lyon"]').click();
  await page.locator('#wi-location-trigger').filter({hasText:'Lyon'}).waitFor({state:'visible',timeout:10000});
 });
 await step('open trains and network tab',async()=>{
  await page.goto(ORIGIN+'/#/transport/trains',{waitUntil:'domcontentloaded',timeout:18000});
  await page.locator('#tm-tab-direct').waitFor({state:'visible',timeout:10000});
  await page.locator('#tm-tab-direct').click();
  await page.waitForResponse(r=>r.url().includes('/api/train-map')&&r.status()===200,{timeout:14000});
 });
 await step('verify simulated Vercel API headers',async()=>{
  const must=['/api/immersive-weather','/api/train-map'];
  if(must.some(path=>!requests.some(r=>r.path===path&&r.status===200&&r.fixture)))
   throw Error('Some API responses did not carry the required fixture header');
  if(requests.some(r=>r.status!==200||!r.fixture))
   throw Error('API response not 200 / not in fixture mode');
 });
}finally{await browser.close();}
const report={at:new Date().toISOString(),target:ORIGIN,
 kind:'single_browser_functional_smoke_not_load_test',
 browserSessions:1,virtualUsers:1,
 warnings:['External map tiles, geocoding, and any unmocked API are blocked in browser',
  'Only controlled UI navigation; not a capacity benchmark'],
 steps:findings,apiResponses:requests,blockedThirdParty,blockedNonMockApi,
 pass:findings.every(f=>f.pass)&&findings.length===4};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('ATLAS_BROWSER_SMOKE:'+JSON.stringify({pass:report.pass,steps:findings,apiResponses:requests.length,out}));
if(!report.pass)process.exitCode=1;
