const test=require('node:test');
const assert=require('node:assert/strict');
const mod=import('../weather-immersive-data.js');
test('official forecast request includes usable hourly and daily fields without requiring a secret',async()=>{
 const {forecastUrl,airUrl,LOCATION_DEFAULT}=await mod;
 const u=new URL(forecastUrl(LOCATION_DEFAULT)),air=new URL(airUrl(LOCATION_DEFAULT));
 assert.equal(u.hostname,'api.open-meteo.com');
 assert.equal(u.searchParams.get('timezone'),'auto');
 assert.equal(u.searchParams.get('forecast_days'),'10');
 for(const key of ['sunrise','sunset','uv_index_max','temperature_2m_max','precipitation_probability_max'])
  assert.ok(u.searchParams.get('daily').includes(key));
 assert.equal(air.hostname,'air-quality-api.open-meteo.com');
 assert.ok(air.searchParams.get('current').includes('european_aqi'));
});
test('temperature conversion and unavailable values never invent a number',async()=>{
 const {temp,decimal}=await mod;
 assert.equal(temp(18,'c'),'18°');
 assert.equal(temp(18,'f'),'64°');
 assert.equal(temp(null),'—');
 assert.equal(decimal(undefined),'—');
});
test('weather code handles night, rain and missing code correctly',async()=>{
 const {condition}=await mod;
 assert.equal(condition(0,0).icon,'🌙');
 assert.equal(condition(61).tone,'rain');
 assert.equal(condition(null).label,'Conditions indisponibles');
});
test('hour and day collections retain source timestamps and missing values',async()=>{
 const {nextHours,nextDays}=await mod;
 const data={current:{time:'2026-10-24T12:30'},hourly:{
  time:['2026-10-24T11:00','2026-10-24T12:00','2026-10-24T13:00'],
  temperature_2m:[9,10,11]},daily:{time:['2026-10-24'],temperature_2m_max:[21],temperature_2m_min:[null]}};
 const hours=nextHours(data,2);
 assert.deepEqual(hours.map(x=>x.time),['2026-10-24T13:00']);
 assert.equal(hours[0].rain,undefined);
 assert.equal(nextDays(data)[0].low,null);
});
test('AQI uses actual EEA bands; no pollen data is displayed as unavailable',async()=>{
 const {aqiStatus,pollenStatus}=await mod;
 assert.equal(aqiStatus(13).label,'Bon');
 assert.equal(aqiStatus(45).label,'Modéré');
 assert.equal(aqiStatus(89).label,'Très mauvais');
 assert.equal(aqiStatus(null).label,'Indisponible');
 assert.equal(pollenStatus({current:{grass_pollen:null,birch_pollen:null}}),'Indisponible');
 assert.ok(pollenStatus({current:{grass_pollen:17}}).includes('17'));
});
test('coordinate validation rejects malformed cookie content',async()=>{
 const {validLocation,LOCATION_DEFAULT}=await mod;
 assert.ok(validLocation(LOCATION_DEFAULT));
 assert.ok(!validLocation({name:'Oops',country:'France',latitude:100,longitude:2}));
 assert.ok(!validLocation({name:'Oops',country:'France',latitude:43,longitude:Infinity}));
});
test('insight states only broad category statements grounded in weather values',async()=>{
 const {insight}=await mod;
 assert.match(insight({current:{wind_speed_10m:43}}),/Vent/);
 assert.match(insight({daily:{precipitation_probability_max:[80]}}),/pluie/);
 assert.doesNotMatch(insight({current:{temperature_2m:20}}),/11:15/);
});
