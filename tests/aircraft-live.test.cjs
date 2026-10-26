const test=require('node:test');
const assert=require('node:assert/strict');
const aviation=()=>import('../api/aircraft-live.js');
const now=new Date('2026-10-26T18:15:00Z').getTime();
function state(lastContact,extra=[]){
 return ['39b415','AFR123 ','France',lastContact,lastContact,5.2,43.42,1200,false,195.3,182.3,0,null,1400,'1000',false,0,...extra];
}
const mockRes=()=>({code:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(value){this.body=value;return this;}});
test('OpenSky state normalization exposes actual geographic observation and excludes stale vectors',async()=>{
 const {normalizeAircraftStates}=await aviation();
 const timestamp=Math.floor(now/1000);
 const result=normalizeAircraftStates({time:timestamp,states:[
  state(timestamp-30),state(timestamp-700).map((v,i)=>i===0?'39b416':v),
  [...state(timestamp-25)].map((v,i)=>i===5?null:i===0?'39b417':v)]},{now});
 assert.equal(result.aircraft.length,1);
 assert.equal(result.aircraft[0].icao24,'39b415');
 assert.deepEqual([result.aircraft[0].lat,result.aircraft[0].lng],[43.42,5.2]);
 assert.equal(result.aircraft[0].altitudeM,1400);
 assert.equal(result.aircraft[0].ageSeconds,30);
 assert.equal(Object.hasOwn(result.aircraft[0],'destination'),false);
 assert.equal(Object.hasOwn(result.aircraft[0],'delay'),false);
});
test('aviation rejects unknown regions and POST to prevent open proxy',async()=>{
 const {default:handler}=await aviation();
 const a=mockRes();await handler({method:'GET',query:{zone:'entire-world'}},a);assert.equal(a.code,400);
 const b=mockRes();await handler({method:'POST',query:{zone:'marseille'}},b);assert.equal(b.code,405);
});
test('aviation calls only fixed OpenSky bounds and caches valid data',async()=>{
 const {default:handler}=await aviation(),prev=globalThis.fetch;
 globalThis.fetch=async url=>{
  const parsed=new URL(url);
  assert.equal(parsed.origin,'https://opensky-network.org');
  assert.equal(parsed.pathname,'/api/states/all');
  assert.equal(parsed.searchParams.get('lamin'),'42.85');
  assert.equal(parsed.searchParams.get('lomax'),'6.3');
  return {ok:true,json:async()=>({time:Math.floor(Date.now()/1000),states:[state(Math.floor(Date.now()/1000)-15)]})};
 };
 try{const r=mockRes();await handler({method:'GET',query:{zone:'marseille'}},r);
  assert.equal(r.code,200);assert.equal(r.body.aircraft.length,1);
  assert.match(r.headers['Cache-Control'],/s-maxage=900/);}
 finally{globalThis.fetch=prev;}
});
test('aviation errors are explicit and never cached',async()=>{
 const {default:handler}=await aviation(),prev=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429});
 try{const r=mockRes();await handler({method:'GET',query:{zone:'paris'}},r);
  assert.equal(r.code,502);assert.equal(r.headers['Cache-Control'],'no-store');}
 finally{globalThis.fetch=prev;}
});

test('adsb.lol fallback converts published feet and knots into SI measurements',async()=>{
 const {normalizeAdsbLolStates}=await aviation();
 const capture=new Date('2026-10-26T18:00:00Z').getTime();
 const x=normalizeAdsbLolStates({now:capture,ac:[
 {hex:'39b415',flight:'AFR123 ',lat:43.3,lon:5.4,seen_pos:4.5,alt_geom:10000,gs:200,track:90},
 {hex:'39b416',lat:43.2,lon:5.5,seen_pos:300,alt_geom:12000}
 ]},{now:capture});
 assert.equal(x.aircraft.length,1);
 assert.equal(x.aircraft[0].altitudeM,3048);
 assert.ok(Math.abs(x.aircraft[0].speedMs-102.8888)<0.001);
 assert.equal(x.aircraft[0].ageSeconds,5);
 assert.equal(x.aircraft[0].originCountry,'Non communiqué');
});
test('when OpenSky fails a fixed-radius adsb.lol endpoint supplies source-attributed positions',async()=>{
 const {default:handler}=await aviation(),old=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async url=>{
  calls.push(String(url));
  if(String(url).startsWith('https://opensky-network.org/'))return {ok:false,status:503};
  assert.equal(String(url),'https://api.adsb.lol/v2/lat/43.3/lon/5.37/dist/125');
  return {ok:true,json:async()=>({now:Date.now(),ac:[{hex:'39b415',flight:'AFR123',lat:43.3,lon:5.4,seen_pos:2,alt_geom:10000,gs:200}]})};
 };
 try{
  const r=mockRes();await handler({method:'GET',query:{zone:'marseille'}},r);
  assert.equal(r.code,200);
  assert.equal(r.body.aircraft.length,1);
  assert.equal(r.body.provider,'adsb.lol (ODbL 1.0)');
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;}
});
