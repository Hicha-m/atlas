import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const ID=/^[a-z][a-z0-9_-]{0,50}$/;
const MAX_SAMPLES=12;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validOrigin=s=>{
 try{
  const u=new URL(s);
  return ['http:','https:'].includes(u.protocol)&&u.origin===s&&
   !u.username&&!u.password&&!u.search&&!u.hash;
 }catch{return false;}
};
const intBetween=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export function validateConfig(raw){
 if(!isObject(raw)||raw.version!==1)throw Error('Config: version must be 1');
 if(!ID.test(raw.project||''))throw Error('Config: project must be a slug');
 if(!validOrigin(raw.baseUrl))throw Error('Config: baseUrl must be an exact HTTP(S) origin');
 const origins=raw.allowedRemoteOrigins||[];
 if(!Array.isArray(origins)||origins.some(x=>!validOrigin(x)||!x.startsWith('https://')))
  throw Error('Config: allowedRemoteOrigins must be exact HTTPS origins');
 if(!Array.isArray(raw.suites)||raw.suites.length<1||raw.suites.length>40)
  throw Error('Config: expected 1–40 suites');
 const used=new Set();
 const suites=raw.suites.map(s=>{
  if(!isObject(s)||!ID.test(s.id||'')||used.has(s.id))
   throw Error('Config: suite id must be unique slug');
  used.add(s.id);
  if(typeof s.path!=='string'||!s.path.startsWith('/')||s.path.startsWith('//')||
     s.path.includes('#')||s.path.length>500||s.path.includes('\\'))
   throw Error('Config: suite '+s.id+' requires safe relative path');
  const target=new URL(s.path,raw.baseUrl);
  if(target.origin!==raw.baseUrl||target.username||target.password)
   throw Error('Config: suite '+s.id+' leaves the configured origin');
  const samples=s.samples??3,intervalMs=s.intervalMs??1000,timeoutMs=s.timeoutMs??7500;
  if(!intBetween(samples,1,MAX_SAMPLES)||!intBetween(intervalMs,0,3600000)||
     !intBetween(timeoutMs,100,20000))throw Error('Config: invalid timing or count for '+s.id);
  const expectedStatus=s.expectedStatus??200;
  if(!intBetween(expectedStatus,100,599))throw Error('Config: invalid status for '+s.id);
  const format=s.format??'json';
  if(!['json','text'].includes(format))throw Error('Config: format must be json or text');
  const maxBytes=s.maxBytes??524288;
  if(!intBetween(maxBytes,1024,3145728))throw Error('Config: invalid maxBytes');
  const fields=s.fields??[];
  if(!Array.isArray(fields)||fields.length>30||fields.some(f=>!isObject(f)||
     typeof f.path!=='string'||!/^[a-zA-Z0-9_$-]+(?:\.[a-zA-Z0-9_$-]+)*$/.test(f.path)||
     !['string','number','boolean','array','object','null'].includes(f.type)||
     typeof f.required!=='boolean'))throw Error('Config: invalid contracts for '+s.id);
  if(s.hashPaths!==undefined&&(!Array.isArray(s.hashPaths)||
    s.hashPaths.some(p=>typeof p!=='string'||!/^[\w$-]+(?:\.[\w$-]+)*$/.test(p))))
   throw Error('Config: invalid hashPaths for '+s.id);
  if(s.sourceTimestampPath!==undefined&&typeof s.sourceTimestampPath!=='string')
   throw Error('Config: invalid sourceTimestampPath');
  return {...s,samples,intervalMs,timeoutMs,expectedStatus,format,maxBytes,fields,
    hashPaths:s.hashPaths??[],mayCallUpstream:s.mayCallUpstream===true};
 });
 return {...raw,allowedRemoteOrigins:origins,suites};
}
export async function loadConfig(file){
 const content=await readFile(resolve(file),'utf8');
 return validateConfig(JSON.parse(content));
}
export function pickSuite(config,id){
 const suite=config.suites.find(x=>x.id===id);
 if(!suite)throw Error('Unknown suite '+id);
 return suite;
}
function localOrigin(origin){
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);}catch{return false;}
}
export function authorizeTarget(config,target,{allowRemote=false,allowUpstream=false}={}){
 if(!validOrigin(target))throw Error('Target must be an exact HTTP(S) origin');
 if(localOrigin(target))return {remote:false};
 if(!allowRemote||!config.allowedRemoteOrigins.includes(target))
  throw Error('Remote target blocked: explicitly allow the exact configured origin');
 if(!allowUpstream)return {remote:true,upstreamAllowed:false};
 return {remote:true,upstreamAllowed:true};
}
export function authorizeSuite(config,suite,target,flags={}){
 const auth=authorizeTarget(config,target,flags);
 if(auth.remote&&suite.mayCallUpstream&&!auth.upstreamAllowed)
  throw Error('This endpoint can consume provider quota: add --allow-upstream');
 if(auth.remote&&suite.samples>3)
  throw Error('Remote sampling is bounded to 3 samples per run');
 return auth;
}
