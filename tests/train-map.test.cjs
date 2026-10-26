const test=require('node:test');
const assert=require('node:assert/strict');
const mod=()=>import('../transport-train-map-data.js');
const handler=()=>import('../api/train-map.js');
const now=Date.now();
const stops=[
 {code_uic:'87763029',libelle:'Valence-TGV',geo_point_2d:{lat:44.9927,lon:4.9785}},
 {code_uic:'87763029',libelle:'Valence-TGV',geo_point_2d:{lat:44.9911,lon:4.9788}},
 {code_uic:'87545244',libelle:'Montluçon',geo_point_2d:{lat:46.34,lon:2.59}}
];
function varint(input){let num=BigInt(input),out=[];do{let x=Number(num&127n);num>>=7n;if(num)x|=128;out.push(x);}while(num);return Buffer.from(out);}
const field=(n,v)=>Buffer.concat([varint(n*8),varint(v)]);
const bytes=(n,v)=>Buffer.concat([varint(n*8+2),varint(v.length),v]);
const string=(n,v)=>bytes(n,Buffer.from(v,'utf8'));
const message=(...parts)=>Buffer.concat(parts);
function feedFixture(at=Date.now()){
 const next=Math.floor((at+8*60*1000)/1000);
 const stop=message(string(4,'StopPoint:OCETrain TER-87763029'),bytes(3,message(field(1,120),field(2,next))));
 const trip=message(string(1,'OCESN87654F1187_F:TER:FR:Line::ABC'));
 const update=message(bytes(1,trip),bytes(2,stop),field(4,Math.floor(at/1000)));
 const entity=message(string(1,'e1'),bytes(3,update));
 return message(bytes(1,message(string(1,'2.0'),field(3,Math.floor(at/1000)))),bytes(2,entity));
}
function response(){return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
test('GTFS next-stop identifiers resolve exact 8-digit UIC codes without guesses',async()=>{
 const {uicFromStop,trainClass,trainNumber}=await mod();
 assert.equal(uicFromStop('StopPoint:OCETrain TER-87763029'),'87763029');
 assert.equal(uicFromStop('StopPoint:OCETGV INOUI-87763029'),'87763029');
 assert.equal(uicFromStop('StopArea:OCE87545244'),'87545244');
 assert.equal(uicFromStop('bogus'),'null'.replace('null','')||null);
 assert.equal(trainClass('OCESN87654F1187_F:TER:FR:Line::ABC'),'TER');
 assert.equal(trainClass('OCESN9706F1187_F:OUI:FR:Line::ABC'),'TGV');
 assert.equal(trainNumber('OCESN87654F1187_F:TER:FR'),'87654');
});
test('official UIC georeference is normalized and duplicates do not create fake train locations',async()=>{
 const {normalizeSncfStations,buildSncfTrainMap}=await mod();
 const look=normalizeSncfStations(stops);
 assert.equal(look.size,2);
 const rows=[
  {id:'OCESN87654F1187_F:TER:FR',route:'',stopId:'StopPoint:OCETrain TER-87763029',expected:new Date(now+600000).toISOString(),sourceUpdated:new Date(now-60000).toISOString(),delay:5,cancelled:false},
  {id:'OCESN9766F1187_F:OUI:FR',route:'',stopId:'StopArea:OCE87545244',expected:new Date(now+500000).toISOString(),sourceUpdated:new Date(now-5000).toISOString(),delay:0,cancelled:false},
  {id:'OCESN11111F',route:'',stopId:'missing',expected:new Date(now+600000).toISOString(),delay:null}
 ];
 const map=buildSncfTrainMap(rows,look,{nowMs:now,feedUpdated:new Date(now).toISOString(),available:20});
 assert.equal(map.totalWithAnchors,2);
 assert.equal(map.sourceTotal,20);
 assert.equal(map.counts.late,1);
 assert.equal(map.counts.ontime,1);
 assert.deepEqual([map.markers[0].lat,map.markers[0].lng],[44.9927,4.9785]);
 assert.equal(map.markers[0].positionType,'next_stop_anchor');
 assert.equal(map.markers[0].hasLivePosition,false);
 assert.equal(map.markers[0].stationName,'Valence-TGV');
 assert.equal(Object.hasOwn(map.markers[0],'speed'),false);
});
test('unknown or expired delay never becomes green on-time',async()=>{
 const {buildSncfTrainMap,normalizeSncfStations}=await mod();
 const rows=[
  {id:'OCESN1F',stopId:'StopArea:OCE87545244',expected:new Date(now+600000).toISOString(),delay:null,sourceUpdated:new Date(now).toISOString()},
  {id:'OCESN2F',stopId:'StopArea:OCE87545244',expected:new Date(now+600000).toISOString(),delay:0,sourceUpdated:new Date(now-50*60000).toISOString()}
 ];
 const x=buildSncfTrainMap(rows,normalizeSncfStations(stops),{nowMs:now});
 assert.deepEqual(x.markers.map(m=>m.status),['unknown','unknown']);
 assert.equal(x.counts.ontime,0);
});
test('only official fixed-host station API gets a strictly bounded UIC query',async()=>{
 const {stationQuery}=await mod();
 const url=new URL(stationQuery(['87763029','87545244','untrusted-OR-1','87763029']));
 assert.equal(url.hostname,'data.sncf.com');
 assert.equal(url.pathname,'/api/explore/v2.1/catalog/datasets/liste-des-gares/records');
 assert.equal(url.searchParams.get('where'),"code_uic IN ('87763029','87545244')");
 assert.equal(stationQuery(['../evil']),null);
});
test('server joins a real GTFS-RT fixture with UIC stop locations and caches the result',async()=>{
 const {default:api}=await handler(),original=globalThis.fetch;
 const body=feedFixture(),calls=[];
 globalThis.fetch=async url=>{
  const target=String(url);calls.push(target);
  if(target.startsWith('https://proxy.transport.data.gouv.fr/')){
   return {ok:true,headers:{get:()=>String(body.length)},arrayBuffer:async()=>Uint8Array.from(body).buffer};
  }
  assert.equal(new URL(target).hostname,'data.sncf.com');
  assert.match(new URL(target).searchParams.get('where'),/87763029/);
  return {ok:true,json:async()=>({total_count:1,results:stops.slice(0,1)})};
 };
 try{
  const r=response();await api({method:'GET',query:{}},r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.totalWithAnchors,1);
  assert.equal(r.body.markers[0].kind,'TER');
  assert.equal(r.body.markers[0].delay,2);
  assert.equal(r.body.markers[0].hasLivePosition,false);
  assert.equal(r.body.markers[0].stationName,'Valence-TGV');
  assert.match(r.headers['Cache-Control'],/s-maxage=120/);
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=original;}
});
test('provider failure does not produce markers or cache fictitious data',async()=>{
 const {default:api}=await handler(),original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429});
 try{
  const r=response();await api({method:'GET',query:{}},r);
  assert.equal(r.statusCode,502);
  assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{globalThis.fetch=original;}
});
