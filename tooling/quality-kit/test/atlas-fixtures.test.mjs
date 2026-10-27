import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturesEnabled,weatherFixture,trainFixture,railFixture} from '../../../api/_benchmark-fixtures.js';
import weather from '../../../api/immersive-weather.js';
import trains from '../../../api/train-map.js';
import rails from '../../../api/rail-lines.js';

const pid='prj_iGyTqULtKYGxtUj9kRCRR46CYxuy';
const testEnv={ATLAS_TEST_FIXTURES:'1',ATLAS_TEST_PROJECT_ID:pid,VERCEL_PROJECT_ID:pid};
function response(){
 const headers={};
 return {headers,statusCode:200,body:null,
  setHeader(k,v){headers[k.toLowerCase()]=v;return this;},
  status(value){this.statusCode=value;return this;},
  json(value){this.body=value;return this;}};
}
test('fixtures require double opt-in AND correct Vercel project',()=>{
 assert.equal(fixturesEnabled({}),false);
 assert.equal(fixturesEnabled({ATLAS_TEST_FIXTURES:'1'}),false);
 assert.equal(fixturesEnabled({...testEnv,VERCEL_PROJECT_ID:'prj_production'}),false);
 assert.equal(fixturesEnabled({...testEnv,ATLAS_TEST_PROJECT_ID:'prj_production'}),false);
 assert.equal(fixturesEnabled(testEnv),true);
});
test('forecast/air fixtures provide browser-compatible 10-day and hourly contracts',()=>{
 const forecast=weatherFixture('forecast',43.2965,5.3698);
 assert.equal(forecast.daily.time.length,10);
 assert.equal(forecast.hourly.time.length,240);
 assert.equal(typeof forecast.current.temperature_2m,'number');
 assert.equal(weatherFixture('air',43.2965,5.3698).current.european_aqi>0,true);
});
test('train/rail fixtures are normalized through REAL Atlas data builders',()=>{
 const train=trainFixture();
 assert.equal(train.fixture,true);
 assert.ok(train.markers.length>=10);
 assert.equal(train.locationPrecision,'next_stop_anchor_not_vehicle_position');
 const rail=railFixture({south:42.9,north:43.8,west:4.7,east:5.9});
 assert.equal(rail.fixture,true);
 assert.ok(rail.lines.length>=2);
});
test('all three Vercel handlers use fixtures without any network call when enabled',async()=>{
 const previous={ATLAS_TEST_FIXTURES:process.env.ATLAS_TEST_FIXTURES,
  ATLAS_TEST_PROJECT_ID:process.env.ATLAS_TEST_PROJECT_ID,
  VERCEL_PROJECT_ID:process.env.VERCEL_PROJECT_ID};
 const oldFetch=globalThis.fetch;
 Object.assign(process.env,testEnv);
 globalThis.fetch=async()=>{throw Error('Unexpected external API request');};
 try{
  const w=response();
  await weather({method:'GET',query:{kind:'forecast',lat:'43.2965',lon:'5.3698'}},w);
  assert.equal(w.statusCode,200);
  assert.equal(w.headers['x-atlas-data-mode'],'fixture');
  assert.equal(w.body.daily.time.length,10);
  const a=response();
  await weather({method:'GET',query:{kind:'air',lat:'43.2965',lon:'5.3698'}},a);
  assert.equal(a.statusCode,200);
  const t=response();
  await trains({method:'GET',query:{}},t);
  assert.equal(t.statusCode,200);
  assert.ok(t.body.markers.length>=10);
  const l=response();
  await rails({method:'GET',query:{south:'42.9',north:'43.8',west:'4.7',east:'5.9'}},l);
  assert.equal(l.statusCode,200);
  assert.ok(l.body.lines.length>=2);
  assert.equal(l.headers['x-atlas-data-mode'],'fixture');
  const bad=response();
  await weather({method:'GET',query:{kind:'forecast',lat:'999',lon:'5'}},bad);
  assert.equal(bad.statusCode,400);
 }finally{
  globalThis.fetch=oldFetch;
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[key];
   else process.env[key]=value;
  }
 }
});
