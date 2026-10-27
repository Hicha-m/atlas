import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCapacityPlan,capacitySearch,assessSample} from '../src/capacity.mjs';

const sample=(vus,good)=>({
 vus,requests:Math.max(1,30*vus),rps:vus*3,
 p95Ms:good?80:800,errors:good?0:.2,dropped:0
});
test('reproducible capacity search brackets then finds highest passing VUs',async()=>{
 const seen=[];
 const result=await capacitySearch({maxVus:32,repetitions:2,maxProbes:22},
  async(vus,repeat)=>{seen.push({vus,repeat});return sample(vus,vus<=11);});
 assert.equal(result.highestPassingVus,11);
 assert.equal(result.firstFailingVus,12);
 assert.equal(result.complete,true);
 assert.deepEqual(result.candidates.map(x=>x.vus),[1,2,4,8,16,12,10,11]);
 assert.equal(seen.length,16);
 assert.ok(result.candidates.every(x=>x.samples.length===2));
});
test('all load levels pass and ceiling is reported (not called a saturation limit)',async()=>{
 const result=await capacitySearch({maxVus:8},async vus=>sample(vus,true));
 assert.equal(result.highestPassingVus,8);
 assert.equal(result.firstFailingVus,null);
 assert.equal(result.ceilingReached,true);
 assert.equal(result.complete,true);
});
test('even one VU fails: no fabricated passing capacity',async()=>{
 const result=await capacitySearch({maxVus:8},async vus=>sample(vus,false));
 assert.equal(result.highestPassingVus,null);
 assert.equal(result.firstFailingVus,1);
 assert.equal(result.complete,true);
});
test('each tested load must pass every repetition, no averaging out the failed run',async()=>{
 const result=await capacitySearch({maxVus:8},async(vus,repeat)=>sample(vus,vus<4||repeat===0));
 assert.equal(result.highestPassingVus,3);
 assert.equal(result.firstFailingVus,4);
});
test('a limited probe budget is identified as incomplete, not a confirmed maximum',async()=>{
 const result=await capacitySearch({maxVus:32,maxProbes:4,repetitions:2},
  async vus=>sample(vus,vus<=6));
 assert.equal(result.boundedByProbeBudget,true);
 assert.equal(result.complete,false);
 assert.equal(result.highestPassingVus,2);
 assert.equal(result.firstFailingVus,null);
});
test('validations reject dangerous over-large plans or unknown metrics',async()=>{
 assert.throws(()=>validateCapacityPlan({maxVus:1000}),/Invalid/);
 assert.throws(()=>validateCapacityPlan({durationSeconds:300}),/Invalid/);
 assert.throws(()=>validateCapacityPlan({repetitions:5}),/Invalid/);
 assert.throws(()=>validateCapacityPlan({errorLimit:-.1}),/Invalid/);
 const verdict=assessSample({requests:30,p95Ms:500,errors:0,rps:20,dropped:0},
  validateCapacityPlan({p95LimitMs:250}));
 assert.equal(verdict.pass,false);
 assert.deepEqual(verdict.reasons,['p95_above_target']);
 const bad=assessSample({requests:1,p95Ms:null,errors:0,rps:5,dropped:0},validateCapacityPlan());
 assert.equal(bad.pass,false);
});
