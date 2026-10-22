const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const subject=import('../electricity-global-data.js');
test('real OWID snapshot has at least 200 countries and 20 years of France',async()=>{
 const api=await subject;
 const data=api.parseWorldSnapshot(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/electricity-world-annual.json'),'utf8')));
 assert.ok(Object.keys(data.countries).length>=200);
 assert.ok(data.countries.FRA.history.length>=20);
 const production=api.historicValue(data,'FRA',2025,'generationTWh');
 assert.ok(production>300&&production<900);
 assert.equal(api.historicValue(data,'ZZZ',2025,'generationTWh'),null);
 assert.equal(api.historicValue(data,'FRA',2100,'generationTWh'),null);
 const rankings=api.availableCountries(data,2025,'generationTWh');
 assert.ok(rankings.length>=80); // 2025 remains incomplete: only 90 countries in source
 const prior=api.availableCountries(data,2024,'generationTWh');
 assert.ok(prior.length>=180); // 2024 has ~195 countries with published totals
 assert.ok(rankings.every(x=>x.value!==null));
 assert.ok(rankings[0].value>=rankings[1].value);
});
test('null and missing numeric fields cannot become false zero readings',async()=>{
 const {validNumber}=await subject;
 assert.equal(validNumber(null),null);assert.equal(validNumber(''),null);
 assert.equal(validNumber(undefined),null);assert.equal(validNumber('abc'),null);
 assert.equal(validNumber('0'),0);assert.equal(validNumber(42.2),42.2);
});
test('Energy-Charts v2 country URL uses only supported codes and explicit dates',async()=>{
 const {energyChartsUrl,europeApiCode}=await subject;
 assert.equal(europeApiCode('GBR'),'uk');
 assert.equal(europeApiCode('DEU'),'de');
 assert.equal(europeApiCode('USA'),null);
 const url=new URL(energyChartsUrl('de',new Date('2026-10-22T12:00:00Z')));
 assert.equal(url.searchParams.get('country'),'de');
 assert.equal(url.searchParams.get('start'),'2026-10-21');
 assert.equal(url.searchParams.get('end'),'2026-10-22');
 assert.throws(()=>energyChartsUrl('us'),/non couvert/);
});
test('normalize real Energy-Charts v2 fields in MW, excluding negative pumping load',async()=>{
 const {normalizeEuropeanResponse}=await subject;
 const value={schema_version:'2.0',endpoint:'public_power',country:'de',unit:'MW',timezone:'Europe/Berlin',interval_minutes:15,
 data:[{timestamp:'2026-10-22T12:00:00+02:00',values:{
   solar:10000,wind_onshore:3000,hydro_run_of_river:1000,fossil_gas:2000,nuclear:0,
   hydro_pumped_storage_consumption:-750,load:18000,cross_border_electricity_trading:-1200,
   renewable_share_of_generation:80
 }},{timestamp:'2026-10-22T12:15:00+02:00',values:{
   solar:null,load:null,wind_onshore:null
 }}]};
 const output=normalizeEuropeanResponse(value);
 assert.equal(output.rows.length,1);
 const row=output.rows[0];
 assert.equal(row.consumptionMW,18000);
 assert.equal(row.productionMW,16000);
 assert.equal(row.renewablePercent,80);
 assert.equal(row.tradingMW,-1200);
 assert.equal(row.mix.find(x=>x.id==='solar').mw,10000);
 assert.equal(row.mix.find(x=>x.id==='nuclear').mw,0);
 assert.equal(row.mix.find(x=>x.id==='coal').mw,null);
});
test('reject invalid and forecast-only European API payloads',async()=>{
 const {normalizeEuropeanResponse}=await subject;
 assert.throws(()=>normalizeEuropeanResponse({data:[]}),/Format/);
 assert.throws(()=>normalizeEuropeanResponse({schema_version:'2.0',endpoint:'public_power',unit:'MW',data:[{timestamp:'2026-10-23T00:00Z',values:{load:null,solar:null}}]}),/Aucune mesure/);
});
