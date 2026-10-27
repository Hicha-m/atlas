import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,authorizeTarget,authorizeSuite,pickSuite} from '../src/config.mjs';
import {getPath,validateFields,stableFingerprint} from '../src/contracts.mjs';
import {probe} from '../src/probe.mjs';
import {runSuite} from '../src/runner.mjs';
import {summarize} from '../src/metrics.mjs';
import {markdownReport,csvReport} from '../src/report.mjs';

const raw={
 version:1,project:'sample',baseUrl:'http://localhost:3000',
 allowedRemoteOrigins:['https://sample.example.org'],adapter:'vercel',
 suites:[{
  id:'health',path:'/api/health',format:'json',samples:2,intervalMs:0,timeoutMs:1000,
  expectedStatus:200,maxBytes:1024,fields:[{path:'status',type:'string',required:true}],
  hashPaths:['status','data.value'],sourceTimestampPath:'updatedAt'
 }]
};
test('portable schema validates projects and prevents open URL proxying',()=>{
 const config=validateConfig(raw);
 assert.equal(pickSuite(config,'health').samples,2);
 assert.throws(()=>validateConfig({...raw,baseUrl:'http://localhost:3000/api'}),/origin/);
 assert.throws(()=>validateConfig({...raw,suites:[{...raw.suites[0],path:'//evil.example.com'}]}),/relative path/);
 assert.throws(()=>validateConfig({...raw,suites:[{...raw.suites[0],samples:999}]}),/timing/);
 assert.throws(()=>validateConfig({...raw,suites:[...raw.suites[0],raw.suites[0]]}),/suite id/);
 assert.deepEqual(authorizeTarget(config,'http://localhost:3000'),{remote:false});
 assert.throws(()=>authorizeTarget(config,'https://sample.example.org'),/blocked/);
 assert.deepEqual(authorizeTarget(config,'https://sample.example.org',{allowRemote:true}),{remote:true,upstreamAllowed:false});
 assert.throws(()=>authorizeTarget(config,'https://unlisted.example.org',{allowRemote:true}),/blocked/);
 assert.throws(()=>authorizeSuite(config,{...config.suites[0],mayCallUpstream:true},'https://sample.example.org',{allowRemote:true}),/allow-upstream/);
 assert.throws(()=>authorizeSuite(config,{...config.suites[0],samples:4},'https://sample.example.org',{allowRemote:true}),/bounded/);
});
test('contract checks nested fields, missing fields and stable business fingerprints',()=>{
 assert.equal(getPath({data:{items:[{code:1}]}},'data.items.0.code'),1);
 assert.deepEqual(validateFields({status:'ok'},raw.suites[0].fields),[]);
 assert.deepEqual(validateFields({status:200},raw.suites[0].fields)[0].reason,'type');
 assert.deepEqual(validateFields({},raw.suites[0].fields)[0].reason,'missing');
 const a=stableFingerprint({data:{value:42},status:'ok',fetchedAt:123},['data.value','status']);
 const b=stableFingerprint({data:{value:42},status:'ok',fetchedAt:999},['data.value','status']);
 assert.equal(a,b);
});
test('probe extracts CDN age, body contract, business fingerprint, source age',async()=>{
 const config=validateConfig(raw),suite=config.suites[0];
 const now=Date.parse('2026-10-27T12:00:00Z');
 const fetcher=async(url,request)=>{
  assert.equal(url,'http://localhost:3000/api/health');
  assert.equal(request.method,'GET');
  assert.equal(request.headers.Accept,'application/json');
  return new Response(JSON.stringify({status:'ok',updatedAt:'2026-10-27T11:50:00Z',data:{value:42}}),
   {status:200,headers:{'x-vercel-cache':'HIT',Age:'20','content-type':'application/json'}});
 };
 const result=await probe({baseUrl:config.baseUrl,project:config.project,suite,adapter:'vercel',fetcher,now:()=>now});
 assert.equal(result.ok,true);
 assert.equal(result.httpStatus,200);
 assert.equal(result.cacheStatus,'HIT');
 assert.equal(result.cacheAgeSeconds,20);
 assert.equal(result.sourceAgeSeconds,600);
 assert.equal(result.fingerprint?.length,64);
 assert.equal(result.path,'/api/health');
 assert.ok(result.durationMs>=0);
});
test('provider errors, malformed JSON and oversized bodies never become a successful response',async()=>{
 const config=validateConfig(raw),suite=config.suites[0];
 const fail=await probe({baseUrl:config.baseUrl,project:'sample',suite,fetcher:async()=>new Response('error',{status:502})});
 assert.equal(fail.ok,false);
 assert.equal(fail.httpStatus,502);
 assert.equal(fail.problems[0].reason,'http_status');
 const json=await probe({baseUrl:config.baseUrl,project:'sample',suite,fetcher:async()=>new Response('{invalid',{status:200})});
 assert.equal(json.error,'invalid_json');
 const big=await probe({baseUrl:config.baseUrl,project:'sample',suite,fetcher:async()=>new Response('a'.repeat(2000),{status:200})});
 assert.equal(big.error,'body_too_large');
 const net=await probe({baseUrl:config.baseUrl,project:'sample',suite,fetcher:async()=>{throw new Error('ENOTFOUND')}});
 assert.equal(net.ok,false);
 assert.equal(net.error,'network_or_contract');
});
test('runner is injection-friendly, serial and yields deterministic summaries without network',async()=>{
 const config=validateConfig(raw),calls=[],pauses=[];
 const result=await runSuite({config,suite:config.suites[0],
  fetcher:async()=>{calls.push(1);return new Response('{"status":"ok"}',{status:200,headers:{'x-vercel-cache':calls.length===1?'MISS':'HIT'}});},
  sleep:async ms=>{pauses.push(ms);}
 });
 assert.equal(calls.length,2);
 assert.deepEqual(pauses,[0]);
 assert.equal(result.summary.samples,2);
 assert.equal(result.summary.passed,2);
 assert.equal(result.summary.cache.HIT,1);
 assert.equal(result.summary.cache.MISS,1);
 assert.equal(result.summary.cacheHitRateAmongKnown,50);
 const markdown=markdownReport(result.records,{title:'Exemple portable'});
 assert.match(markdown,/Exemple portable/);
 assert.match(markdown,/50%/);
 const csv=csvReport(result.records);
 assert.equal(csv.trim().split('\n').length,3);
});
test('metrics do not confuse cache UNKNOWN with HIT denominator or infer upstream call counts',()=>{
 const report=summarize([
  {ok:true,durationMs:10,cacheStatus:'HIT',sourceAgeSeconds:4,fingerprint:'a'},
  {ok:true,durationMs:20,cacheStatus:'UNKNOWN',sourceAgeSeconds:null,fingerprint:'b'},
  {ok:false,durationMs:25,cacheStatus:'MISS',error:'timeout'},
  {ok:true,durationMs:30,cacheStatus:'STALE',sourceAgeSeconds:12,fingerprint:'a'}
 ]);
 assert.equal(report.samples,4);
 assert.equal(report.cacheMeasured,3);
 assert.equal(report.cacheHitRateAmongKnown,33.33);
 assert.equal(report.sourceAgeSecondsMax,12);
 assert.equal(report.distinctFingerprints,2);
 assert.equal(report.errors.timeout,1);
});
