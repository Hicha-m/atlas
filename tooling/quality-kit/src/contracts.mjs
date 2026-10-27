import {createHash} from 'node:crypto';

export function getPath(value,path){
 if(!path)return undefined;
 return path.split('.').reduce((current,key)=>{
  if(current===null||current===undefined)return undefined;
  return Object.hasOwn(Object(current),key)?current[key]:undefined;
 },value);
}
function typeOf(value){
 if(value===null)return 'null';
 if(Array.isArray(value))return 'array';
 return typeof value;
}
export function validateFields(body,fields=[]){
 const problems=[];
 for(const field of fields){
  const value=getPath(body,field.path);
  if(value===undefined){
   if(field.required)problems.push({path:field.path,reason:'missing'});
   continue;
  }
  if(typeOf(value)!==field.type)
   problems.push({path:field.path,reason:'type',expected:field.type,actual:typeOf(value)});
 }
 return problems;
}
export function stableFingerprint(body,paths=[]){
 if(!paths.length)return null;
 const selected=paths.map(path=>[path,getPath(body,path)??null]);
 return createHash('sha256').update(JSON.stringify(selected)).digest('hex');
}
export function timestampAgeSeconds(body,path,nowMs=Date.now()){
 if(!path)return null;
 const value=getPath(body,path);
 if(value===undefined||value===null||value==='')return null;
 const time=typeof value==='number'?(value<1e11?value*1000:value):Date.parse(value);
 if(!Number.isFinite(time))return null;
 return Math.max(0,Math.round((nowMs-time)/1000));
}
