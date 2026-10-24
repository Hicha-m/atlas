const test=require('node:test');
const assert=require('node:assert/strict');
const transport=()=>import('../transport.js');
const proxy=()=>import('../api/transport-catalogue.js');

const fixture=[
 {id:'a',title:'RTM Marseille',publisher:{name:'Métropole'},page_url:'https://transport.data.gouv.fr/datasets/rtm',
  resources:[{title:'Horaires',format:'GTFS',original_url:'https://example.org/gtfs.zip',is_available:true},{title:'Temps réel',format:'GTFS-RT',original_url:'https://example.org/rt.pb'}]},
 {id:'b',title:'Réseau Lyon',publisher:'Lyon',resources:[{format:'NeTEx',url:'https://example.org/data.xml'}]}
];
test('PAN metadata keeps provider URLs and distinguishes RT publication from actual departures',async()=>{
 const {normalizeCatalogue}=await transport();
 const rows=normalizeCatalogue(fixture);
 assert.equal(rows.length,2);
 assert.equal(rows[0].hasRealtime,true);
 assert.equal(rows[1].hasRealtime,false);
 assert.equal(rows[0].resources[0].format,'GTFS');
 assert.equal(rows[0].resources[0].link,'https://example.org/gtfs.zip');
 assert.equal(rows[0].page,'https://transport.data.gouv.fr/datasets/rtm');
 assert.equal(rows[1].page,null);
});
test('search, format and RT filter and CSV escaping are deterministic',async()=>{
 const {normalizeCatalogue,filterCatalogue,catalogueCsv}=await transport();
 const rows=normalizeCatalogue(fixture);
 assert.equal(filterCatalogue(rows,{query:'Marseille',format:'GTFS-RT',realtime:true}).length,1);
 assert.equal(filterCatalogue(rows,{query:'Lyon',format:'GTFS-RT'}).length,0);
 assert.match(catalogueCsv(rows),/RTM Marseille/);
 const escaped=catalogueCsv([{...rows[0],title:'Réseau "Spécial"'}]);
 assert.match(escaped,/"Réseau ""Spécial"""/);
});
test('untrusted URLs are suppressed and missing metadata does not invent realtime',async()=>{
 const {normalizeCatalogue}=await transport();
 const rows=normalizeCatalogue([{title:'Test',resources:[{title:'Test',format:'GTFS',url:'javascript:alert(1)'}]}]);
 assert.equal(rows[0].resources[0].link,null);
 assert.equal(rows[0].hasRealtime,false);
});
function makeRes(){
 const res={headers:{},code:200,body:null};
 res.setHeader=(a,b)=>{res.headers[a]=b;return res;};
 res.status=(n)=>{res.code=n;return res;};
 res.json=(payload)=>{res.body=payload;return res;};return res;
}
test('PAN proxy rejects POST without upstream network call',async()=>{
 const {default:handler}=await proxy();const r=makeRes();await handler({method:'POST'},r);
 assert.equal(r.code,405);
 assert.equal(r.headers.Allow,'GET');
});
test('PAN proxy returns bounded publisher catalogue and cache metadata',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  assert.equal(url,'https://transport.data.gouv.fr/api/datasets');
  return {ok:true,json:async()=>fixture};
 };
 try{
  const {default:handler}=await proxy();const r=makeRes();await handler({method:'GET'},r);
  assert.equal(r.code,200);
  assert.equal(r.body.datasets.length,2);
  assert.equal(r.headers['Cache-Control'].includes('s-maxage=3600'),true);
 }finally{globalThis.fetch=original;}
});
