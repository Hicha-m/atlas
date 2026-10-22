const test = require('node:test');
const assert = require('node:assert/strict');

const subject = import('../electricity-data.js');
const fixture = () => ({
  date_heure: '2026-10-22T08:00:00+02:00',
  consommation: 45000,
  prevision_j: 45250, prevision_j1: 46500,
  nucleaire: 30000, hydraulique: 5000,
  eolien: 3500, solaire: 1200, gaz: 2500,
  bioenergies: 900, charbon: 0, fioul: 50,
  ech_physiques: -7200, taux_co2: 22, pompage: -650
});
test('ODRE endpoint targets the national time-series dataset, latest 100 records', async () => {
  const mod = await subject, url = new URL(mod.electricityApiUrl());
  assert.equal(url.hostname, 'odre.opendatasoft.com');
  assert.match(url.pathname,/eco2mix-national-tr\/records/);
  assert.equal(url.searchParams.get('limit'),'100');
  assert.equal(url.searchParams.get('order_by'),'date_heure desc');
  assert.equal(url.searchParams.get('where'),'consommation IS NOT NULL');
});
test('returns missing values as null instead of inventing zeros', async () => {
  const {finiteNumber,normaliseElectricityRecord} = await subject;
  assert.equal(finiteNumber(''),null);
  assert.equal(finiteNumber(null),null);
  assert.equal(finiteNumber(undefined),null);
  assert.equal(finiteNumber('unavailable'),null);
  assert.equal(finiteNumber(0),0);
  const row = normaliseElectricityRecord({...fixture(),taux_co2:null});
  assert.equal(row.taux_co2,null);
});
test('production sums generation only and excludes STEP pumping', async () => {
  const {normaliseElectricityRecord,productionMW} = await subject;
  const record = normaliseElectricityRecord(fixture());
  assert.equal(productionMW(record),43150);
  assert.equal(record.production,43150);
  assert.equal(record.pompage,-650);
});
test('missing production source prevents misleading complete mix', async () => {
  const {normaliseElectricityRecord,mixBreakdown,productionMW} = await subject;
  const row = normaliseElectricityRecord({...fixture(),nucleaire:null});
  assert.equal(productionMW(row),null);
  assert.equal(mixBreakdown(row).length,0);
});
test('mix percentages sum approximately 100 percent and preserve source labels', async () => {
  const {normaliseElectricityRecord,mixBreakdown,lowCarbonShare} = await subject;
  const record=normaliseElectricityRecord(fixture());
  const rows=mixBreakdown(record);
  assert.equal(rows.length,8);
  assert.equal(rows[0].label,'Nucléaire');
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.share,0)-100)<0.0001);
  assert.ok(lowCarbonShare(record)>80 && lowCarbonShare(record)<100);
});
test('exports have correct unit conversions and absence handling', async () => {
  const {normaliseElectricityRecord,metricValue}=await subject;
  const row=normaliseElectricityRecord(fixture());
  assert.equal(metricValue(row,'consommation'),45);
  assert.equal(metricValue(row,'taux_co2'),22);
  assert.equal(metricValue(row,'ech_physiques'),-7.2);
  assert.equal(metricValue({...row,taux_co2:null},'taux_co2'),null);
  assert.equal(metricValue(row,'made_up'),null);
});
test('national physical exchange signs follow RTE conventions', async () => {
  const {exchangeStatus}=await subject;
  assert.equal(exchangeStatus(-1000).sign,'export');
  assert.equal(exchangeStatus(2500).sign,'import');
  assert.equal(exchangeStatus(0).sign,'neutral');
  assert.equal(exchangeStatus(null).sign,'missing');
});
test('normalization sorts by absolute time, removes duplicates and invalid rows', async () => {
  const {normaliseElectricityResponse}=await subject;
  const base=fixture();
  const one={...base,date_heure:'2026-10-22T06:00:00+00:00'};
  const two={...base,date_heure:'2026-10-22T05:45:00+00:00',consommation:44900};
  const rows=normaliseElectricityResponse({results:[one,{...base,date_heure:'invalid'},two,base]});
  assert.equal(rows.length,2);
  assert.ok(rows[0].timestamp<rows[1].timestamp);
  assert.equal(rows[0].consommation,44900);
  assert.throws(()=>normaliseElectricityResponse({}),/invalide/);
});
test('a 6-hour period filters using UTC timestamps and not browser timezone', async () => {
  const {normaliseElectricityResponse,windowRecords}=await subject;
  const base=fixture();
  const rows=normaliseElectricityResponse({results:[
    {...base,date_heure:'2026-10-21T18:00:00+00:00'},
    {...base,date_heure:'2026-10-22T00:00:00+00:00'},
    {...base,date_heure:'2026-10-22T06:00:00+00:00'}
  ]});
  assert.equal(windowRecords(rows,6).length,2);
  assert.equal(windowRecords(rows,12).length,3);
});
test('freshness does not present stale records as real-time', async () => {
  const {freshness}=await subject;
  const now=Date.parse('2026-10-22T12:00:00Z');
  assert.equal(freshness(now-15*60000,now).status,'recent');
  assert.equal(freshness(now-120*60000,now).status,'delayed');
  assert.equal(freshness(now-600*60000,now).status,'stale');
});

test('forecast-only records cannot displace the latest measured consumption', async () => {
  const { normaliseElectricityResponse } = await subject;
  const actual = {...fixture(),date_heure:'2026-10-22T11:00:00+00:00'};
  const prediction = {...fixture(),date_heure:'2026-10-23T22:45:00+00:00',consommation:null,nucleaire:null,prevision_j:null};
  const rows = normaliseElectricityResponse({results:[prediction,actual]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].consommation,45000);
});
