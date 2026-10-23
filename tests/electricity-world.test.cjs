import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnnualCsv,mergeWorldSeries,observationAt,latestObservation,rankCountries,countryCodeByName} from '../electricity-world-data.js';
import {energyChartsUrl,normalizeRecentPower} from '../electricity-europe-live-data.js';

test('annual OWID csv parsing: ISO3 only; ignores groups, malformed numbers and missing rows',()=>{
 const data=parseAnnualCsv('entity,code,year,total_generation__twh\nFrance,FRA,2024,539.1\nFrance,FRA,2025,550.2\nEuropean Union,OWID_EU,2025,2500\nItaly,ITA,2025,\nItaly,ITA,2025,not-a-number\nSpain,ESP,2025,0\n');
 assert.equal(data.length,3);
 assert.deepEqual(data[0],{code:'FRA',name:'France',year:2024,value:539.1});
 assert.equal(data.at(-1).value,0);
});
test('merges series by country and same year; missing metrics not filled',()=>{
 const countries=mergeWorldSeries({generation:[{code:'FRA',name:'France',year:2024,value:545}],clean:[{code:'FRA',name:'France',year:2025,value:94}]});
 const c=countries[0];
 assert.equal(observationAt(c,'generation',2025),null);
 assert.equal(latestObservation(c,'generation',2025).year,2024);
 assert.equal(observationAt(c,'clean',2025).clean,94);
 assert.equal(rankCountries(countries,2025,'generation').length,0);
 assert.equal(rankCountries(countries,2024,'generation','europe').length,1);
});
test('map country name aliases use ISO country codes',()=>{
 const countries=[{name:'France',code:'FRA'},{name:'Spain',code:'ESP'}];
 assert.equal(countryCodeByName('France',countries),'FRA');
 assert.equal(countryCodeByName('United States of America',countries),'USA');
 assert.equal(countryCodeByName('W. Sahara',countries),null);
});
test('Fraunhofer API URL is limited to three days and supported Europe codes',()=>{
 const url=new URL(energyChartsUrl('FRA',new Date('2026-10-23T10:00:00Z')));
 assert.equal(url.searchParams.get('country'),'fr');
 assert.equal(url.searchParams.get('start'),'2026-10-20');
 assert.equal(url.searchParams.get('end'),'2026-10-23');
 assert.equal(energyChartsUrl('USA'),null);
});
test('EU real API parsing excludes pumping and invalid series but keeps energy sources',()=>{
 const data=normalizeRecentPower({unix_seconds:[1792533600,1792534500],
 production_types:[{name:'Solar',data:[200,500]},{name:'Wind onshore',data:[400,800]},
 {name:'Hydro pumped storage consumption',data:[-200,-350]},
 {name:'Gas',data:[null,100]},{name:'Unavailable',data:[null,null]}]});
 assert.equal(data.length,2);
 assert.equal(data[0].totalMW,600);
 assert.equal(data[1].totalMW,1400);
 assert.equal(data[0].timestamp,1792533600000);
});
test('empty public power data signals unavailability instead of showing invented zero',()=>{
 assert.throws(()=>normalizeRecentPower({unix_seconds:[123],production_types:[{name:'Solar',data:[null]}]}),/Pas de mesures/);
});
