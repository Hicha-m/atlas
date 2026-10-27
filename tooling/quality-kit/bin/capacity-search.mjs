#!/usr/bin/env node
/**
 * Portable controlled capacity test runner. NOT deployed to Vercel.
 * All network traffic is localhost, never the public hosting endpoint.
 *
 * Binary search locates the highest *tested* passing number of closed-loop
 * VUs under a fixed journey (one GET + think time) and constraints.
 */
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {capacitySearch,validateCapacityPlan} from '../src/capacity.mjs';

const singleScenario=fileURLToPath(new URL('../k6/capacity.js',import.meta.url));
const atlasScenario=fileURLToPath(new URL('../k6/atlas-journey.js',import.meta.url));
const parse=args=>{
 const out={};
 for(let i=0;i<args.length;i++){
  const name=args[i];
  if(!name.startsWith('--')||i+1===args.length)throw Error('Invalid CLI argument '+name);
  out[name.slice(2)]=args[++i];
 }
 return out;
};
const integer=(opts,name,defaultValue)=>opts[name]===undefined?defaultValue:Number(opts[name]);
const opts=parse(process.argv.slice(2));
// Optional project profile: no framework coupling, no untrusted origin bypass.
const profile=opts.profile?JSON.parse(await readFile(resolve(opts.profile),'utf8')):null;
if(profile&&(profile.version!==1||typeof profile.project!=='string'||
  !/^[a-z][a-z0-9_-]{0,50}$/.test(profile.project)||
  !profile.plan||typeof profile.plan!=='object'||
  !['closed-loop-http','atlas-workflow'].includes(profile.journey?.kind)))
 throw Error('Invalid capacity profile v1');
const origin=opts.target||profile?.localOrigin||'http://127.0.0.1:8765';
const pathname=opts.path||profile?.path||'/';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)||
 !pathname.startsWith('/')||pathname.startsWith('//')||pathname.includes('#')||pathname.includes('\\')||pathname.length>500)
 throw Error('Localhost only; remote load testing is disabled (Vercel requires authorization)');
const chosen=profile?.plan||{};
const atlasJourney=profile?.journey?.kind==='atlas-workflow';
const scenario=atlasJourney?atlasScenario:singleScenario;
const plan=validateCapacityPlan({
 minVus:integer(opts,'min-vus',chosen.minVus??1),
 maxVus:integer(opts,'max-vus',chosen.maxVus??16),
 p95LimitMs:integer(opts,'p95-ms',chosen.p95LimitMs??250),
 errorLimit:opts['max-error-rate']===undefined?(chosen.errorLimit??0.01):Number(opts['max-error-rate']),
 minRps:integer(opts,'min-rps',chosen.minRps??0),
 repetitions:integer(opts,'repetitions',chosen.repetitions??2),
 durationSeconds:integer(opts,'duration-seconds',chosen.durationSeconds??8),
 thinkTimeMs:integer(opts,'think-ms',chosen.thinkTimeMs??100),
 maxProbes:integer(opts,'max-probes',chosen.maxProbes??20)
});
if(profile&&(
 profile.journey.thinkTimeMs!==plan.thinkTimeMs||
 !Array.isArray(profile.journey.steps)||
 (atlasJourney?
  profile.journey.steps.length!==4||
  profile.journey.steps.some((x,i)=>x.method!=='GET'||x.path!==[
    '/','/api/immersive-weather?kind=forecast&lat=43.2965&lon=5.3698',
    '/api/train-map','/api/rail-lines?south=42.9&north=43.8&west=4.7&east=5.9'][i])||
  origin!=='http://127.0.0.1:8890':
  profile.journey.steps.length!==1||
  profile.journey.steps[0].method!=='GET'||
  profile.journey.steps[0].path!==pathname)
))throw Error('Profile journey and test plan do not agree');
const out=resolve(opts.out||'monitoring/results/capacity-local.json');
const executable=opts.k6||'k6';
async function measure(vus,repeat,configuration){
 const args=['run','--quiet','--no-color',
  '-e','QK_TARGET='+origin,'-e','QK_PATH='+pathname,
  '-e','QK_CAPACITY_VUS='+vus,
  '-e','QK_CAPACITY_DURATION='+configuration.durationSeconds,
  '-e','QK_CAPACITY_THINK_MS='+configuration.thinkTimeMs,
  scenario];
 let stdout='',stderr='';
 const elapsed=Date.now();
 await new Promise((done,reject)=>{
  const p=spawn(executable,args,{shell:false,env:process.env,stdio:['ignore','pipe','pipe']});
  const limit=32768;
  p.stdout.on('data',b=>{stdout=(stdout+b.toString()).slice(-limit);});
  p.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-limit);});
  p.on('error',reject);
  p.on('close',code=>{
   if(code!==0)reject(Error('k6 exit '+code+' '+stderr.slice(-400)));
   else done();
  });
 });
 const line=stdout.split(/\r?\n/).find(x=>x.startsWith('QK_CAPACITY_JSON:'));
 if(!line)throw Error('k6 summary not found; stdout '+stdout.slice(-500));
 const value=JSON.parse(line.slice('QK_CAPACITY_JSON:'.length));
 if(value.vus!==vus||value.durationSeconds!==configuration.durationSeconds)
  throw Error('k6 summary mismatched scenario');
 return {...value,runDurationMs:Date.now()-elapsed,repeat:repeat+1,
   errors:Math.max(value.errors??1,value.stepErrors??0,value.journeyErrors??0)};
}
console.log(JSON.stringify({mode:'local-only',origin,path:pathname,plan}));
const result=await capacitySearch(plan,measure,{onProbe:item=>{
 console.log(JSON.stringify({testedVus:item.vus,pass:item.pass,
  worstP95Ms:item.worstP95Ms,minRps:item.minAchievedRps,
  maxErrors:item.maxErrorRate,reasons:item.evaluations.map(e=>e.reasons)}));
}});
const manifest={
 dateUTC:new Date().toISOString(),
 kind:atlasJourney?'atlas_local_workflow_capacity':'local_capacity_binary_search',target:origin,path:pathname,
 profile:profile?{project:profile.project,id:profile.id??null,journey:profile.journey}:null,
 nodeVersion:process.version,k6Binary:executable,gitSha:process.env.GITHUB_SHA||null,
 result
};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(manifest,null,2)+'\n');
const rows=['vus,pass,repeat,p95_ms,p99_ms,rps,errors,dropped,requests,journeys,journey_errors,journey_p95_ms'];
for(const x of result.candidates)for(const s of x.samples)
 rows.push([x.vus,x.pass,s.repeat,s.p95Ms,s.p99Ms,s.rps,s.errors,s.dropped,s.requests,s.journeys??'',s.journeyErrors??'',s.journeyP95Ms??''].join(','));
await writeFile(out.replace(/\.json$/i,'')+'.csv',rows.join('\n')+'\n');
console.log('QK_CAPACITY_RESULT:'+JSON.stringify({
 highestPassingVus:result.highestPassingVus,firstFailingVus:result.firstFailingVus,
 ceilingReached:result.ceilingReached,complete:result.complete,
 probes:result.probes,out
}));
if(!result.complete)process.exitCode=2;
