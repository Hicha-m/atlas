const test=require('node:test');
const assert=require('node:assert/strict');
const parser=()=>import('../transport-live-data.js');
const endpoint=()=>import('../api/transport-live.js');
const position=(name,lat,lng)=>({station:{name,coordinate:{x:lat,y:lng}}});
const connection={
 from:{...position('Bern',46.948831,7.439129),departure:'2026-10-26T19:09:00+0100',delay:null},
 to:{...position('Lausanne',46.516793,6.629091),arrival:'2026-10-26T20:39:00+0100',delay:3},
 transfers:1,sections:[
 {journey:{category:'RE',number:'2',name:'RE2',operator:'SBB',passList:[
  {station:{name:'Bern',coordinate:{x:46.948831,y:7.439129}}},
  {station:{name:'Fribourg',coordinate:{x:46.805, y:7.153}}}
 ]},departure:{station:{name:'Bern'},departure:'2026-10-26T19:09:00+0100'},arrival:{station:{name:'Fribourg'},arrival:'2026-10-26T19:32:00+0100'}}
 ]};
function res(){return {headers:{},code:200,body:null,setHeader(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
test('journey normalization preserves only operator timetable, geography, and known delays',async()=>{
 const {normalizeSwissConnections}=await parser();
 const rows=normalizeSwissConnections({connections:[connection]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].origin,'Bern');assert.equal(rows[0].destination,'Lausanne');
 assert.equal(rows[0].transfers,1);
 assert.equal(rows[0].departureDelay,null);
 assert.equal(rows[0].arrivalDelay,3);
 assert.deepEqual(rows[0].departurePosition,{lat:46.948831,lng:7.439129});
 assert.equal(rows[0].legs[0].stops.length,2);
});
test('Swiss stationboard exposes real station coordinates without adding vehicle GPS',async()=>{
 const {normalizeSwiss}=await parser();
 const x=normalizeSwiss({station:{name:'Bern',coordinate:{x:46.948831,y:7.439129}},stationboard:[]},'train');
 assert.deepEqual(x.stationPosition,{lat:46.948831,lng:7.439129});
 assert.equal(Object.hasOwn(x,'vehiclePosition'),false);
});
test('Swiss connections API validates date, time and route; respects a fixed provider URL',async()=>{
 const {default:handler}=await endpoint();
 let r=res();await handler({method:'GET',query:{provider:'swiss-connections',from:'Bern',to:'Bern'}},r);assert.equal(r.code,400);
 r=res();await handler({method:'GET',query:{provider:'swiss-connections',from:'Bern',to:'Lausanne',date:'2026/10/26'}},r);assert.equal(r.code,400);
 const prior=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=new URL(url);assert.equal(u.hostname,'transport.opendata.ch');
  assert.equal(u.pathname,'/v1/connections');assert.equal(u.searchParams.get('from'),'Bern');
  assert.equal(u.searchParams.get('to'),'Lausanne');assert.equal(u.searchParams.get('date'),'2026-10-26');assert.equal(u.searchParams.get('time'),'19:09');
  return {ok:true,json:async()=>({connections:[connection]})};
 };
 try{
  r=res();await handler({method:'GET',query:{provider:'swiss-connections',from:'Bern',to:'Lausanne',date:'2026-10-26',time:'19:09'}},r);
  assert.equal(r.code,200);assert.equal(r.body.journeys[0].destination,'Lausanne');
  assert.match(r.headers['Cache-Control'],/s-maxage=90/);
 }finally{globalThis.fetch=prior;}
});
test('TfL stop metadata returns real official coordinates with no train position',async()=>{
 const {default:handler}=await endpoint(),prior=globalThis.fetch;
 globalThis.fetch=async url=>{
  assert.equal(url,'https://api.tfl.gov.uk/StopPoint/940GZZLUKSX');
  return {ok:true,json:async()=>({commonName:'King’s Cross',lat:51.531683,lon:-0.123538})};
 };
 try{const r=res();await handler({method:'GET',query:{provider:'tfl-stop',id:'940GZZLUKSX'}},r);
 assert.equal(r.code,200);assert.deepEqual(r.body.stationPosition,{lat:51.531683,lng:-0.123538});}finally{globalThis.fetch=prior;}
});
