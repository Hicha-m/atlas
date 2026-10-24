const test=require('node:test');
const assert=require('node:assert/strict');
const live=()=>import('../transport-live-data.js');
const endpoint=()=>import('../api/transport-live.js');
const base=Math.floor(Date.now()/1000)*1000;
function v(num){let n=BigInt(num),data=[];do{let x=Number(n&127n);n>>=7n;if(n)x|=128;data.push(x);}while(n);return Buffer.from(data);}
const field=(n,num)=>Buffer.concat([v(BigInt(n*8)),v(num)]);
const bytes=(n,p)=>Buffer.concat([v(BigInt(n*8+2)),v(p.length),p]);
const string=(n,s)=>bytes(n,Buffer.from(s));
const msg=(...p)=>Buffer.concat(p);
function fixture(){
 const e=msg(field(1,300),field(2,BigInt(base/1000+600)));
 const stop=msg(string(4,'FR:MAR:123'),bytes(3,e));
 const trip=msg(string(1,'Train-123'),string(5,'TGV'));
 const update=msg(bytes(1,trip),bytes(2,stop),field(4,base/1000));
 const entity=msg(string(1,'entity-1'),bytes(3,update));
 return msg(bytes(1,msg(string(1,'2.0'),field(3,base/1000))),bytes(2,entity));
}
function res(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
test('SNCF GTFS-RT: extract genuine predicted stop and delay, without GPS interpolation',async()=>{
 const {decodeSncfGtfsRt,normalizeSncfBoard}=await live();
 const data=decodeSncfGtfsRt(fixture(),base);
 assert.equal(data.entities,1);
 assert.equal(data.rows[0].id,'Train-123');
 assert.equal(data.rows[0].delay,5);
 assert.equal(data.rows[0].stopId,'FR:MAR:123');
 const board=normalizeSncfBoard(data,{query:'Train-123'});
 assert.equal(board.departures.length,1);
 assert.equal(board.departures[0].expected,new Date(base+600000).toISOString());
 assert.equal(normalizeSncfBoard(data,{query:'inexistant'}).departures.length,0);
 assert.throws(()=>decodeSncfGtfsRt(Buffer.from([10,130])),/Protobuf|tronqué/i);
});
test('Swiss predictions, null delay and actual route type remain differentiated',async()=>{
 const {normalizeSwiss}=await live();
 const x={station:{name:'Zürich, Central'},stationboard:[
 {name:'S17',category:'T',number:'7',to:'Gare',stop:{departure:'2026-10-24T13:15:00+0200',delay:4,platform:'3',prognosis:{departure:'2026-10-24T13:19:00+0200'}}},
 {name:'B6',category:'B',number:'6',to:'Opéra',stop:{departure:'2026-10-24T13:30:00+0200',delay:null,prognosis:{departure:null}}}
 ]};
 const tram=normalizeSwiss(x,'tram');
 assert.equal(tram.departures.length,1);
 assert.equal(tram.departures[0].delay,4);
 assert.equal(tram.departures[0].realtime,true);
 const bus=normalizeSwiss(x,'bus');
 assert.equal(bus.departures.length,1);
 assert.equal(bus.departures[0].delay,null);
 assert.equal(bus.departures[0].realtime,false);
});
test('TfL predictions, stop matching and line disruptions use provider facts',async()=>{
 const {normalizeTfLArrivals,normalizeTfLSearch,normalizeTfLStatus}=await live();
 const o=normalizeTfLArrivals([{id:'1',modeName:'tube',lineName:'Northern',destinationName:'Morden',stationName:'Kings Cross',expectedArrival:'2026-10-24T11:12:00Z',timeToStation:120}]);
 assert.equal(o.departures[0].seconds,120);
 assert.equal(o.departures[0].delay,null);
 assert.equal(normalizeTfLSearch({matches:[{id:'940ABC',name:'London Waterloo'}]})[0].id,'940ABC');
 const s=normalizeTfLStatus([{id:'northern',name:'Northern',lineStatuses:[{statusSeverity:6,statusSeverityDescription:'Severe Delays',reason:'Signal failure'}]}]);
 assert.equal(s[0].normal,false);assert.equal(s[0].reason,'Signal failure');
});
test('fixed API disallows arbitrary upstream URL and unsupported modes',async()=>{
 const {default:handler}=await endpoint();
 const a=res();await handler({method:'POST',query:{provider:'tfl'}},a);assert.equal(a.code,405);
 const b=res();await handler({method:'GET',query:{provider:'tfl',mode:'invalid',id:'https://evil'}},b);assert.equal(b.code,400);
 const c=res();await handler({method:'GET',query:{provider:'unknown',url:'https://bad.test/'}},c);assert.equal(c.code,400);
});
test('Swiss API serves actual provider response and caches valid results',async()=>{
 const {default:handler}=await endpoint();
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=new URL(url);
  assert.equal(u.hostname,'transport.opendata.ch');
  assert.equal(u.searchParams.get('station'),'Bern');
  assert.equal(u.searchParams.getAll('transportations[]')[0],'train');
  return {ok:true,json:async()=>({station:{name:'Bern'},stationboard:[]})};
 };
 try{const r=res();await handler({method:'GET',query:{provider:'swiss',mode:'train',station:'Bern'}},r);assert.equal(r.code,200);assert.equal(r.body.station,'Bern');assert.match(r.headers['Cache-Control'],/s-maxage=30/);}finally{globalThis.fetch=old;}
});
test('SNCF API emits trimmed structured predictions with source timestamp',async()=>{
 const {default:handler}=await endpoint();
 const old=globalThis.fetch;const binary=fixture();
 globalThis.fetch=async url=>{
  assert.equal(url,'https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates');
  return {ok:true,headers:{get:()=>String(binary.length)},arrayBuffer:async()=>Uint8Array.from(binary).buffer};
 };
 try{const r=res();await handler({method:'GET',query:{provider:'sncf'}},r);
 assert.equal(r.code,200);assert.equal(r.body.departures[0].line,'TGV');assert.equal(r.body.feedUpdated,new Date(base).toISOString());}
 finally{globalThis.fetch=old;}
});
