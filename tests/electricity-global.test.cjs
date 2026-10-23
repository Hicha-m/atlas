const test=require('node:test'),assert=require('node:assert/strict');
const subject=import('../electricity-global-data.js');
test('normalize country retains genuine zero and missing values',async()=>{
 const {normalizeCountry}=await subject;
 const c=normalizeCountry({iso3:'FRA',name:'France',year:2025,total_generation_twh:0,demand_twh:null,generation_twh:{nuclear:0},share_pct:{nuclear:0}});
 assert.equal(c.generation,0);assert.equal(c.demand,null);assert.equal(c.fuels.find(f=>f.id==='nuclear').share,0);
});
test('reject invalid world response',async()=>{
 const {normalizeGlobal}=await subject;
 assert.throws(()=>normalizeGlobal({countries:[]}),/Aucun pays/);
 assert.throws(()=>normalizeGlobal({results:[]}),/Format/);
});
test('Europe includes France and Germany but excludes Japan',async()=>{
 const {EUROPE_ISO3}=await subject;
 assert.equal(EUROPE_ISO3.has('FRA'),true);assert.equal(EUROPE_ISO3.has('DEU'),true);assert.equal(EUROPE_ISO3.has('JPN'),false);
});
test('carbon metric is independent of generation mix',async()=>{
 const {metric,normalizeCountry}=await subject;
 const c=normalizeCountry({iso3:'DEU',name:'Germany',carbon_intensity_gco2_kwh:300,share_pct:{wind:30,nuclear:20,coal:50}});
 assert.equal(metric(c,'carbon'),300);assert.equal(metric(c,'clean'),50);
});
