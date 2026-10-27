/**
 * Atlas Test ONLY. Deterministic provider-free data for low-volume Vercel
 * observability checks. Never enabled for the public production project.
 * Nothing in this module makes outbound network calls.
 */
import {buildSncfTrainMap,normalizeSncfStations} from '../transport-train-map-data.js';
import {normalizeRailGeometry} from '../transport-rail-lines-data.js';
const TEST_PROJECT='prj_iGyTqULtKYGxtUj9kRCRR46CYxuy';
export function fixturesEnabled(env=process.env){
 return env.ATLAS_TEST_FIXTURES==='1' &&
  env.ATLAS_TEST_PROJECT_ID===TEST_PROJECT &&
  (!env.VERCEL_PROJECT_ID||env.VERCEL_PROJECT_ID===TEST_PROJECT);
}
export const fixtureHeaders=res=>{
 res.setHeader('X-Atlas-Data-Mode','fixture');
 res.setHeader('X-Atlas-Environment','preproduction');
 return res;
};
const isoLocal=d=>d.toISOString().slice(0,16);
const hour=(d,n)=>isoLocal(new Date(d.getTime()+n*3600000));
const day=(d,n)=>new Date(d.getTime()+n*86400000).toISOString().slice(0,10);
export function weatherFixture(kind,latitude,longitude,now=new Date()){
 const base=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),now.getUTCHours()));
 const shift=Math.round((latitude+longitude)*10)%6;
 if(kind==='air')return {
  latitude,longitude,timezone:'UTC',
  current:{time:hour(base,0),european_aqi:24+shift,pm2_5:7.5,
   grass_pollen:1.4,birch_pollen:0,olive_pollen:0}
 };
 const count=240;
 const hourly={time:Array.from({length:count},(_,i)=>hour(base,i)),
  temperature_2m:Array.from({length:count},(_,i)=>19+shift+Math.sin(i/6)*4),
  precipitation_probability:Array.from({length:count},(_,i)=>i%7===0?25:8),
  weather_code:Array.from({length:count},(_,i)=>i%7===0?3:1),
  is_day:Array.from({length:count},(_,i)=>i%24>=7&&i%24<=19?1:0),
  relative_humidity:Array.from({length:count},(_,i)=>55+i%17),
  wind_speed_10m:Array.from({length:count},(_,i)=>6+i%8)};
 const dates=Array.from({length:10},(_,i)=>day(base,i));
 const daily={
  time:dates,
  weather_code:dates.map((_,i)=>i%3===0?3:1),
  temperature_2m_max:dates.map((_,i)=>23+shift+i%3),
  temperature_2m_min:dates.map((_,i)=>12+shift+i%2),
  precipitation_probability_max:dates.map((_,i)=>10+i*2),
  precipitation_sum:dates.map(()=>0),
  sunrise:dates.map(d=>d+'T07:15'),
  sunset:dates.map(d=>d+'T18:30'),
  uv_index_max:dates.map(()=>3)
 };
 return {
  latitude,longitude,timezone:'UTC',
  current:{time:hour(base,0),temperature_2m:19+shift,relative_humidity_2m:61,
   apparent_temperature:18+shift,precipitation:0,weather_code:1,
   wind_speed_10m:10,wind_direction_10m:180,is_day:1},hourly,daily
 };
}
export function trainFixture(now=new Date()){
 const stations=Array.from({length:18},(_,i)=>({
  code_uic:String(87751008+i),libelle:'Gare démo Atlas '+(i+1),
  code_ligne:'930000',
  geo_point_2d:{lat:43.30+i*.01,lon:5.35+i*.01}
 }));
 const rows=Array.from({length:54},(_,i)=>({
  id:'OCESN'+(52000+i)+'F:TER:FR:line',
  stopId:'StopArea:OCE'+stations[i%stations.length].code_uic,
  route:'TER',
  expected:new Date(now.getTime()+(i+5)*60000).toISOString(),
  sourceUpdated:now.toISOString(),delay:0,cancelled:false
 }));
 const data=buildSncfTrainMap(rows,normalizeSncfStations(stations),{
  feedUpdated:now.toISOString(),available:rows.length,nowMs:now.getTime()
 });
 return {...data,provider:'SNCF Voyageurs + SNCF Réseau — simulation Atlas Test',
  fetchedAt:now.toISOString(),mappedGares:stations.length,
  referencePages:1,referencePagesOk:1,timeBracketCandidates:0,
  referencePartial:false,fixture:true,
  provenance:[]};
}
export function railFixture(bounds){
 const records=Array.from({length:18},(_,i)=>{
  const lon=4.9+(i%6)*.13,lat=43.05+Math.floor(i/6)*.18;
  return {code_ligne:'930000',mnemo:'EXPLOITE',
   geo_shape:{type:'LineString',coordinates:[
    [lon,lat],[lon+.05,lat+.03],[lon+.11,lat+.08]
   ]}};
 });
 const data=normalizeRailGeometry(records);
 return {...data,bounds,published:records.length,partial:false,
  provider:'SNCF Réseau — simulation Atlas Test',
  source:null,referenceDate:null,nature:'railway_infrastructure_not_vehicle_track',
  fixture:true,caveat:'Géométrie fictive de préproduction. Ne représente aucune voie ferroviaire réelle.'};
}
