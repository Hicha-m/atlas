#!/usr/bin/env node
/**
 * Explicitly artificial localhost fixture to prove binary search finds a
 * measurable failure boundary. THIS IS NOT THE ATLAS OR VERCEL BACKEND.
 * Start: node tooling/quality-kit/examples/capacity-fixture.mjs
 */
import {createServer} from 'node:http';
const host='127.0.0.1',port=Number(process.env.QK_FIXTURE_PORT||8877);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid test port');
const slots=Number(process.env.QK_FIXTURE_FAST_SLOTS||3);
let active=0,total=0;
createServer((req,res)=>{
 if(req.method!=='GET'||req.url!=='/synthetic-health'){
  res.writeHead(404).end();return;
 }
 active++;total++;
 // Deliberate queue sensitivity at concurrency > 3. Every request is
 // successful, but the response latency grows beyond the p95 target.
 const delay=active>slots?520:32;
 setTimeout(()=>{
  active--;
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify({ok:true,fixture:true}));
 },delay);
}).listen(port,host,()=>console.log(JSON.stringify({
 fixture:true,url:'http://'+host+':'+port+'/synthetic-health',
 fastSlots:slots,warning:'Artificial fixture only; not Atlas server capacity'
})));
