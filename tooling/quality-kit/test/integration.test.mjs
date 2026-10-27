import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {probe} from '../src/probe.mjs';
import {fakeFetcher} from '../src/faults.mjs';

const run=promisify(execFile);
const cli=fileURLToPath(new URL('../bin/quality-kit.mjs',import.meta.url));
const example=fileURLToPath(new URL('../examples/project.example.json',import.meta.url));
const suite={
 id:'health',path:'/health',samples:1,intervalMs:0,timeoutMs:150,expectedStatus:200,
 format:'json',maxBytes:2048,fields:[{path:'status',type:'string',required:true}],
 hashPaths:[],mayCallUpstream:false
};
test('fault injection verifies 429, 502, timeout and invalid payloads OFFLINE',async()=>{
 for(const [scenario,expectedStatus,errorCode] of [
  ['rateLimit',429,null],['upstreamError',502,null],
  ['invalidJson',200,'invalid_json'],['invalidContract',200,null],['timeout',0,'timeout']
 ]){
  const result=await probe({baseUrl:'http://localhost:3000',suite,project:'demo',fetcher:fakeFetcher(scenario)});
  assert.equal(result.ok,false,scenario);
  assert.equal(result.httpStatus,expectedStatus,scenario);
  if(errorCode)assert.equal(result.error,errorCode,scenario);
 }
});
test('portable CLI validates, probes, stores NDJSON/CSV and reports without external calls',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'quality-kit-'));
 const server=createServer((req,res)=>{
  res.setHeader('X-Vercel-Cache','HIT');
  res.setHeader('Age','4');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({status:'ok',service:'example'}));
 });
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const target='http://127.0.0.1:'+server.address().port;
  const conf={
   version:1,project:'portable-test',baseUrl:target,allowedRemoteOrigins:[],adapter:'vercel',
   suites:[{...suite,samples:2,timeoutMs:1500,intervalMs:0}]
  };
  const configFile=resolve(dir,'config.json'),ndjson=resolve(dir,'measurements.ndjson');
  await writeFile(configFile,JSON.stringify(conf));
  const validated=await run(process.execPath,[cli,'validate','--config',configFile],{timeout:4000});
  assert.match(validated.stdout,/"valid": true/);
  const plan=await run(process.execPath,[cli,'plan','--config',configFile],{timeout:4000});
  assert.match(plan.stdout,/"executable":true/);
  const probed=await run(process.execPath,[cli,'probe','--config',configFile,
    '--suite','health','--out',ndjson],{timeout:6000});
  assert.match(probed.stdout,/"passed":2/);
  const lines=(await readFile(ndjson,'utf8')).trim().split('\n');
  assert.equal(lines.length,2);
  assert.ok(lines.every(line=>JSON.parse(line).cacheStatus==='HIT'));
  const csv=await readFile(resolve(dir,'measurements.csv'),'utf8');
  assert.equal(csv.trim().split('\n').length,3);
  const manifest=JSON.parse(await readFile(resolve(dir,'measurements.manifest.json'),'utf8'));
  assert.equal(manifest.project,'portable-test');
  assert.equal(manifest.configurationSha256.length,64);
  assert.equal(manifest.totalRecords,2);
  const report=await run(process.execPath,[cli,'report','--input',ndjson,
    '--out',resolve(dir,'report.md')],{timeout:4000});
  assert.match(report.stdout,/portable-test \/ health/);
  assert.match(await readFile(resolve(dir,'report.md'),'utf8'),/100%/);
  await assert.rejects(()=>run(process.execPath,[cli,'probe','--config',configFile,
   '--suite','health','--target','https://unlisted.example.org'],{timeout:4000}),/Remote target blocked/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
 }
});
test('example configuration works out-of-the-box for any localhost app',async()=>{
 const result=await run(process.execPath,[cli,'validate','--config',example],{timeout:4000});
 assert.match(result.stdout,/"project": "example"/);
});
