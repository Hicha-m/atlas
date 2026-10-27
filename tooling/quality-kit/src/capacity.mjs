/**
 * Pure capacity search. Does not generate traffic. "Users" means concurrent
 * closed-loop k6 VUs with a precisely defined fixed think time.
 * Search is bounded, exponential bracketing then binary search.
 */
export function validateCapacityPlan(plan={}){
 const p={
  minVus:plan.minVus??1,
  maxVus:plan.maxVus??16,
  p95LimitMs:plan.p95LimitMs??250,
  errorLimit:plan.errorLimit??0.01,
  minRps:plan.minRps??0,
  droppedLimit:plan.droppedLimit??0,
  repetitions:plan.repetitions??2,
  durationSeconds:plan.durationSeconds??8,
  thinkTimeMs:plan.thinkTimeMs??100,
  maxProbes:plan.maxProbes??12
 };
 const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
 if(!integer(p.minVus,1,16)||!integer(p.maxVus,p.minVus,32)||
    !integer(p.p95LimitMs,10,10000)||typeof p.errorLimit!=='number'||p.errorLimit<0||p.errorLimit>0.2||
    typeof p.minRps!=='number'||p.minRps<0||p.minRps>1000||
    !integer(p.droppedLimit,0,100)||!integer(p.repetitions,1,3)||
    !integer(p.durationSeconds,5,60)||!integer(p.thinkTimeMs,0,5000)||
    !integer(p.maxProbes,2,24))throw Error('Invalid or unsafe capacity plan');
 return p;
}
export function assessSample(sample,plan){
 const reasons=[];
 if(!sample||!Number.isFinite(sample.p95Ms)||sample.p95Ms<0)reasons.push('missing_p95');
 if(!Number.isFinite(sample.errors)||sample.errors<0||sample.errors>1)reasons.push('missing_errors');
 if(!Number.isFinite(sample.rps)||sample.rps<0)reasons.push('missing_rps');
 if(!Number.isInteger(sample.requests)||sample.requests<1)reasons.push('no_requests');
 if(!Number.isInteger(sample.dropped)||sample.dropped<0)reasons.push('missing_drops');
 if(!reasons.length){
  if(sample.p95Ms>plan.p95LimitMs)reasons.push('p95_above_target');
  if(sample.errors>plan.errorLimit)reasons.push('errors_above_target');
  if(sample.dropped>plan.droppedLimit)reasons.push('dropped_iterations');
  if(sample.rps<plan.minRps)reasons.push('throughput_below_target');
 }
 return {pass:reasons.length===0,reasons};
}
export function evaluateCandidate(samples,plan){
 const evaluations=samples.map(x=>assessSample(x,plan));
 return {pass:evaluations.length===plan.repetitions&&evaluations.every(x=>x.pass),
  evaluations,
  worstP95Ms:Math.max(...samples.map(s=>s.p95Ms||0)),
  minAchievedRps:Math.min(...samples.map(s=>s.rps||0)),
  maxErrorRate:Math.max(...samples.map(s=>s.errors??1))};
}
export async function capacitySearch(rawPlan,measure,{onProbe=()=>{}}={}){
 const plan=validateCapacityPlan(rawPlan);
 const tested=new Map(),history=[];
 let calls=0;
 async function test(vus){
  if(tested.has(vus))return tested.get(vus);
  if(calls+plan.repetitions>plan.maxProbes)return null;
  const samples=[];
  for(let i=0;i<plan.repetitions;i++){
   const sample=await measure(vus,i,plan);
   samples.push(sample);
   calls++;
  }
  const verdict=evaluateCandidate(samples,plan);
  const result={vus,samples,...verdict};
  tested.set(vus,result);history.push(result);onProbe(result);
  return result;
 }
 // Start at min, double until a failure or the configured ceiling.
 let low=0,high=null,next=plan.minVus;
 while(true){
  const current=await test(next);
  if(!current)break;
  if(!current.pass){high=next;break;}
  low=next;
  if(next===plan.maxVus)break;
  next=Math.min(plan.maxVus,next*2);
 }
 // Only search between one confirmed pass and one confirmed failure.
 if(high!==null){
  while(high-low>1){
   const middle=Math.floor((low+high)/2);
   const current=await test(middle);
   if(!current)break;
   if(current.pass)low=middle;
   else high=middle;
  }
 }
 const complete=low===plan.maxVus||(high!==null&&high-low===1);
 return {
  algorithm:'exponential_bracket_then_binary_search',
  objective:'maximum sustainable concurrent closed-loop VUs',
  plan,highestPassingVus:low||null,firstFailingVus:high,
  ceilingReached:low===plan.maxVus,
  boundedByProbeBudget:!complete,
  complete,probes:calls,candidates:history,
  caveat:'A virtual user continuously repeats one HTTP request with configured think time. This is NOT total unique visitors, not Vercel production capacity and not a real browser session.'
 };
}
