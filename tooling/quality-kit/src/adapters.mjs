const STATES=['HIT','MISS','STALE','BYPASS','REVALIDATED','PRERENDER','UPDATING','EXPIRED','DYNAMIC','NONE'];
const normalizeStatus=value=>{
 const s=String(value||'').trim().toUpperCase();
 if(s.includes('HIT'))return 'HIT';
 if(s.includes('MISS'))return 'MISS';
 if(s.includes('STALE')||s.includes('UPDATING'))return 'STALE';
 if(s.includes('BYPASS')||s.includes('SKIP'))return 'BYPASS';
 if(s.includes('REVALIDATED'))return 'REVALIDATED';
 if(s.includes('EXPIRED'))return 'EXPIRED';
 if(s.includes('PRERENDER'))return 'PRERENDER';
 if(s.includes('DYNAMIC'))return 'DYNAMIC';
 return STATES.includes(s)?s:'UNKNOWN';
};
export function extractCache(headers,adapter='generic'){
 const names=adapter==='vercel'?
   ['x-vercel-cache','cdn-cache-status','cf-cache-status','x-cache']:
   ['cdn-cache-status','cf-cache-status','x-cache','x-vercel-cache'];
 let raw='',header=null;
 for(const name of names){
  const value=headers.get(name);
  if(value){raw=value;header=name;break;}
 }
 const ageRaw=headers.get('age');
 const age=ageRaw===null?null:Number(ageRaw);
 return {
  status:normalizeStatus(raw),header,
  ageSeconds:Number.isFinite(age)&&age>=0?age:null,
  observedCacheHeader:raw?String(raw).slice(0,70):null
 };
}
