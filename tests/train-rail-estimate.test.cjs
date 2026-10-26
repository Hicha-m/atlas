const test=require('node:test');
const assert=require('node:assert/strict');
const rails=()=>import('../transport-rail-lines-data.js');
const estimate=()=>import('../transport-train-estimate.js');
const parser=()=>import('../transport-live-data.js');
const geocode=()=>import('../transport-train-map-data.js');
const endpoint=()=>import('../api/rail-lines.js');
function reply(){return {code:200,headers:{},body:null,
 setHeader(k,v){this.headers[k]=v;return this;},
 status(n){this.code=n;return this;},json(x){this.body=x;return this;}};}
const line={code_ligne:'930000',mnemo:'EXPLOITE',
 geo_shape:{type:'Feature',geometry:{type:'LineString',coordinates:[[5,43],[5,43.05],[5.05,43.05]]}}};
const segment={
 fromName:'A',toName:'B',
 from:{lat:43,lng:5},to:{lat:43.05,lng:5.05},lineCode:'930000',
 fromTime:'2026-10-26T14:00:00Z',toTime:'2026-10-26T14:30:00Z',progress:.5
};
test('rail bounds are constrained to France and to small viewports, never arbitrary API URLs',async()=>{
 const {validateRailBounds,railLinesQuery}=await rails();
 assert.equal(validateRailBounds({south:42,north:49,west:0,east:6}),null);
 assert.equal(validateRailBounds({south:42.9,north:43.8,west:4.7,east:5.9})?.east,5.9);
 assert.equal(validateRailBounds({south:44,north:43,west:5,east:6}),null);
 const url=new URL(railLinesQuery({south:42.9,north:43.8,west:4.7,east:5.9}));
 assert.equal(url.hostname,'data.sncf.com');
 assert.equal(url.pathname,'/api/explore/v2.1/catalog/datasets/formes-des-lignes-du-rfn/records');
 assert.match(url.searchParams.get('where'),/mnemo = 'EXPLOITE' AND intersects/);
 assert.match(url.searchParams.get('where'),/POLYGON/);
 assert.equal(railLinesQuery({south:42,north:43,west:4,east:5},{limit:120}),null);
});
test('official geo_shape coordinates convert to Leaflet and exclude inactive rails',async()=>{
 const {normalizeRailGeometry}=await rails();
 const data=normalizeRailGeometry([line,
  {...line,mnemo:'FERME',code_ligne:'930001'},
  {...line,code_ligne:'bad'},
  {...line,code_ligne:'930002',geo_shape:{type:'MultiLineString',coordinates:[[[5,43],[5.02,43.02]]]}}]);
 assert.equal(data.lines.length,2);
 assert.deepEqual(data.lines[0].coordinates[0],[43,5]);
 assert.deepEqual(data.lines[1].coordinates[1],[43.02,5.02]);
 assert.equal(data.distinctLines,2);
});
test('interpolator stays on official curved railway, never a straight chord',async()=>{
 const {estimateRailPosition,distanceMeters}=await estimate(),{normalizeRailGeometry}=await rails();
 const data=normalizeRailGeometry([line]);
 const p=estimateRailPosition(segment,data.lines);
 assert.ok(p);
 assert.equal(p.lineCode,'930000');
 assert.equal(p.isGps,false);
 assert.equal(p.precision,'estimated_on_reference_track');
 assert.ok(p.lat>43.035,'half distance falls on the northbound section of bent railway');
 assert.ok(p.lng<5.015,'half distance not on straight diagonal line');
 assert.ok(distanceMeters(p,segment.from)>1500);
});
test('no estimate for an unverified line, distant station, missing times or inconsistent track',async()=>{
 const {estimateRailPosition}=await estimate(),{normalizeRailGeometry}=await rails();
 const curves=normalizeRailGeometry([line]).lines;
 assert.equal(estimateRailPosition({...segment,lineCode:'930001'},curves),null);
 assert.equal(estimateRailPosition({...segment,from:{lat:44,lng:6}},curves),null);
 assert.equal(estimateRailPosition({...segment,progress:1.2},curves),null);
 assert.equal(estimateRailPosition({...segment,toTime:null},curves),null);
 assert.equal(estimateRailPosition(segment,[]),null);
});
test('only a matching UIC infrastructure line may connect published temporal brackets',async()=>{
 const {normalizeSncfStations,buildSncfTrainMap}=await geocode();
 const records=[
 {code_uic:'87751008',libelle:'A',code_ligne:'930000',geo_point_2d:{lat:43,lon:5}},
 {code_uic:'87751009',libelle:'B',code_ligne:'930000',geo_point_2d:{lat:43.05,lon:5.05}}
 ];
 const time=Date.now(),iso=ms=>new Date(ms).toISOString();
 const row={id:'OCESN12345F1187_F:TER:FR:Line::',stopId:'StopArea:OCE87751009',
  expected:iso(time+10*60000),sourceUpdated:iso(time),
  segment:{fromStopId:'StopArea:OCE87751008',toStopId:'StopArea:OCE87751009',
   fromTime:iso(time-10*60000),toTime:iso(time+10*60000),progress:.5}};
 const m=buildSncfTrainMap([row],normalizeSncfStations(records),{nowMs:time});
 assert.equal(m.segmentEligible,1);
 assert.equal(m.markers[0].segment.lineCode,'930000');
 assert.equal(m.markers[0].segment.isGps,false);
 const m2=buildSncfTrainMap([row],normalizeSncfStations(records.map((x,i)=>({...x,code_ligne:i?'939001':'930000'}))),{nowMs:time});
 assert.equal(m2.segmentEligible,0);
});
function varint(value){let n=BigInt(value),arr=[];do{let b=Number(n&127n);n>>=7n;if(n)b|=128;arr.push(b);}while(n);return Buffer.from(arr);}
const field=(n,v)=>Buffer.concat([varint(n*8),varint(v)]);
const bytes=(n,v)=>Buffer.concat([varint(n*8+2),varint(v.length),v]);
const string=(n,s)=>bytes(n,Buffer.from(s,'utf8'));
const msg=(...parts)=>Buffer.concat(parts);
test('GTFS trip needs actual past/future time brackets in same trip, never fabricates a segment',async()=>{
 const {decodeSncfGtfsRt}=await parser();
 const now=Math.floor(Date.now()/1000)*1000;
 const stop=(n,id,seconds,seq)=>msg(field(1,seq),bytes(n===1?3:2,msg(field(2,seconds))),string(4,id));
 const trip=msg(string(1,'OCESN12345F'));
 const frame=msg(bytes(1,trip),
  bytes(2,stop(1,'StopArea:OCE87751008',now/1000-600,1)),
  bytes(2,stop(2,'StopArea:OCE87751009',now/1000+600,2)),
  field(4,now/1000));
 const entity=msg(string(1,'e1'),bytes(3,frame));
 const feed=msg(bytes(1,msg(string(1,'2.0'),field(3,now/1000))),bytes(2,entity));
 const parsed=decodeSncfGtfsRt(feed,now);
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].segment?.fromStopId,'StopArea:OCE87751008');
 assert.equal(parsed.rows[0].segment?.toStopId,'StopArea:OCE87751009');
 assert.equal(parsed.rows[0].segment?.progress,0.5);
 const noPast=msg(bytes(1,trip),bytes(2,stop(2,'StopArea:OCE87751009',now/1000+600,2)),field(4,now/1000));
 const parsed2=decodeSncfGtfsRt(msg(bytes(1,msg(string(1,'2.0'),field(3,now/1000))),
  bytes(2,msg(string(1,'e2'),bytes(3,noPast)))),now);
 assert.equal(parsed2.rows[0].segment,null);
});
test('rail infrastructure endpoint validates region and caches official network lines',async()=>{
 const {default:handler}=await endpoint(),old=globalThis.fetch;let count=0;
 globalThis.fetch=async url=>{
  count++;const u=new URL(url);
  assert.equal(u.hostname,'data.sncf.com');assert.match(u.searchParams.get('where'),/intersects/);
  return {ok:true,headers:{get:()=>null},json:async()=>({total_count:1,results:[line]})};
 };
 try{
  const q={south:'42.9',north:'43.8',west:'4.7',east:'5.9'};
  const r=reply();await handler({method:'GET',query:q},r);
  assert.equal(r.code,200);assert.equal(r.body.lines.length,1);
  assert.equal(r.body.nature,'railway_infrastructure_not_vehicle_track');
  assert.match(r.headers['Cache-Control'],/s-maxage=86400/);
  assert.equal(count,1);
  const invalid=reply();await handler({method:'GET',query:{...q,north:'52'}},invalid);
  assert.equal(invalid.code,400);
 }finally{globalThis.fetch=old;}
});
test('rail provider 502 never returns fake tracks',async()=>{
 const {default:handler}=await endpoint(),old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429});
 try{
  const r=reply();await handler({method:'GET',query:{south:42.9,north:43.8,west:4.7,east:5.9}},r);
  assert.equal(r.code,502);assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{globalThis.fetch=old;}
});
