#!/usr/bin/env node
/**
 * Isolated local HTTP adapter: real Atlas serverless handlers and parsers,
 * deterministic provider fixtures. Absolutely NO external network fetches.
 * An adjustable local semaphore models constrained CPU/service capacity;
 * this is NOT equivalent to Vercel Functions or its CDN.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import weather from '../../../api/immersive-weather.js';
import trains from '../../../api/train-map.js';
import rails from '../../../api/rail-lines.js';

const host='127.0.0.1',port=Number(process.env.QK_ATLAS_PORT||8890);
const slots=Number(process.env.QK_ATLAS_SLOTS||5);
const workMs=Number(process.env.QK_ATLAS_WORK_MS||65);
if(!Number.isInteger(port)||port<1024||port>65535||
   !Number.isInteger(slots)||slots<1||slots>100||
   !Number.isInteger(workMs)||workMs<1||workMs>1000)
 throw Error('Invalid local fixture controls');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const home=await readFile(resolve(root,'index.html'),'utf8');
const actualNetworkFetch=globalThis.fetch; // never invoked by test server
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const vi=n=>{let a=[],v=BigInt(n);do{let b=Number(v&127n);v>>=7n;if(v)b|=128;a.push(b);}while(v);return Buffer.from(a);};
const field=(n,v)=>Buffer.concat([vi(n*8),vi(v)]);
const bytes=(n,v)=>Buffer.concat([vi(n*8+2),vi(v.length),v]);
const str=(n,s)=>bytes(n,Buffer.from(s));
const packet=(...parts)=>Buffer.concat(parts);
const now=Math.floor(Date.now()/1000);
const tripEntities=Array.from({length:70},(_,i)=>{
 const code=String(87751008+(i%15));
 const stop=packet(field(1,3),bytes(2,packet(field(2,now+600+(i%8)*60))),str(4,'StopArea:OCE'+code));
 const trip=packet(str(1,'OCESN'+String(50000+i)+'F:TER:FR:line'));
 const update=packet(bytes(1,trip),bytes(2,stop),field(4,now));
 return bytes(2,packet(str(1,'entity-'+i),bytes(3,update)));
});
const feed=packet(bytes(1,packet(str(1,'2.0'),field(3,now))),...tripEntities);
const stationRecords=Array.from({length:15},(_,i)=>({
 code_uic:String(87751008+i),libelle:'Mock gare '+(i+1),code_ligne:'930000',
 geo_point_2d:{lat:43.30+i*.01,lon:5.35+i*.01}
}));
const railResults=Array.from({length:12},(_,i)=>({
 code_ligne:'930000',mnemo:'EXPLOITE',
 geo_shape:{type:'Feature',geometry:{type:'LineString',coordinates:[
 [5.35+i*.01,43.30+i*.01],[5.36+i*.01,43.31+i*.01],[5.37+i*.01,43.32+i*.01]
 ]}}
}));
let upstreamMocks=0;
globalThis.fetch=async url=>{
 const u=new URL(String(url));
 if(!['api.open-meteo.com','air-quality-api.open-meteo.com','proxy.transport.data.gouv.fr','data.sncf.com'].includes(u.hostname))
  throw Error('External network blocked in Atlas local capacity adapter: '+u.hostname);
 upstreamMocks++;
 if(u.hostname==='api.open-meteo.com')return json({
  current:{time:'2026-10-27T13:00',temperature_2m:19,precipitation:0},
  hourly:{time:['2026-10-27T13:00','2026-10-27T14:00'],temperature_2m:[19,20]},
  daily:{time:['2026-10-27'],temperature_2m_max:[21],temperature_2m_min:[12]}
 });
 if(u.hostname==='air-quality-api.open-meteo.com')return json({current:{european_aqi:22}});
 if(u.hostname==='proxy.transport.data.gouv.fr')
  return new Response(feed,{status:200,headers:{'content-type':'application/x-protobuf'}});
 if(u.pathname.includes('liste-des-gares'))return json({total_count:15,results:stationRecords});
 if(u.pathname.includes('formes-des-lignes-du-rfn'))return json({total_count:12,results:railResults});
 throw Error('Unknown provider path '+u.pathname);
};
// Fail closed: no non-loopback outgoing requests are made by this adapter.
if(actualNetworkFetch===globalThis.fetch)throw Error('Provider isolation not active');
let active=0,peakActive=0,total=0,failures=0;
const queue=[];
function enter(resolve){
 if(active<slots){
  active++;peakActive=Math.max(peakActive,active);
  setTimeout(()=>{active--;resolve();const next=queue.shift();if(next)enter(next);},workMs);
 }else queue.push(resolve);
}
const waitSlot=()=>new Promise(resolve=>enter(resolve));
const router={ '/api/immersive-weather':weather,'/api/train-map':trains,'/api/rail-lines':rails };
createServer(async(req,res)=>{
 total++;
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/__fixture_status'){
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({fixture:true,total,failures,upstreamMocks,active,queued:queue.length,
   peakActive,slots,workMs,realFunctions:true,remoteProviderCalls:0}));
  return;
 }
 if(u.pathname!=='/'&&!router[u.pathname]){res.writeHead(404).end();return;}
 try{
  await waitSlot();
  if(u.pathname==='/'){
   res.setHeader('content-type','text/html; charset=utf-8');res.end(home);return;
  }
  const query=Object.fromEntries(u.searchParams);
  const out={setHeader(k,v){res.setHeader(k,v);return this;},
   status(n){res.statusCode=n;return this;},
   json(body){res.setHeader('content-type','application/json');
    if(res.statusCode>=400)failures++;
    res.end(JSON.stringify(body));return this;}};
  await router[u.pathname]({method:req.method,query},out);
 }catch(e){
  failures++;
  if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});
  if(!res.writableEnded)res.end(JSON.stringify({error:'Isolated handler failure'}));
 }
}).listen(port,host,()=>console.log(JSON.stringify({
 mode:'atlas-local-real-handlers',url:'http://'+host+':'+port,
 slots,workMs,providers:'deterministic mock-only',remoteProviderCalls:0
})));
