const p=(ordered,fraction)=>{
 if(!ordered.length)return null;
 const index=(ordered.length-1)*fraction,lo=Math.floor(index),hi=Math.ceil(index);
 return Math.round((ordered[lo]+(ordered[hi]-ordered[lo])*(index-lo))*100)/100;
};
export function summarize(records){
 const total=records.length,passed=records.filter(x=>x.ok);
 const times=passed.map(x=>x.durationMs).filter(Number.isFinite).sort((a,b)=>a-b);
 const counts={HIT:0,MISS:0,STALE:0,BYPASS:0,UNKNOWN:0,OTHER:0};
 const errors={};
 for(const r of records){
  const key=Object.hasOwn(counts,r.cacheStatus)?r.cacheStatus:'OTHER';
  counts[key]++;
  if(!r.ok)errors[r.error||r.problems?.map(p=>p.reason).join('|')||'failed']=
   (errors[r.error||r.problems?.map(p=>p.reason).join('|')||'failed']||0)+1;
 }
 const known=counts.HIT+counts.MISS+counts.STALE;
 const ages=records.map(x=>x.sourceAgeSeconds).filter(x=>Number.isFinite(x));
 const hashes=records.map(x=>x.fingerprint).filter(Boolean);
 return {
  samples:total,passed:passed.length,failed:total-passed.length,
  successRate:total?Math.round(passed.length/total*10000)/100:null,
  latencyMs:{p50:p(times,.5),p95:p(times,.95),p99:p(times,.99),max:times.at(-1)??null},
  cache:counts,cacheHitRateAmongKnown:known?Math.round(counts.HIT/known*10000)/100:null,
  cacheMeasured:known,sourceAgeSecondsMax:ages.length?Math.max(...ages):null,
  distinctFingerprints:new Set(hashes).size,errors
 };
}
