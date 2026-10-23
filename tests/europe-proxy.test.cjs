const test=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../api/europe-power.js');
function response(){
 const output={statusCode:200,headers:{},body:null};
 return {output,setHeader(k,v){output.headers[k]=v;return this},status(n){output.statusCode=n;return this},json(data){output.body=data;return this}};
}
test('EU proxy allows GET only, without making upstream calls',async()=>{
 const handler=(await modulePromise).default;
 const res=response();await handler({method:'POST',query:{country:'fr'}},res);
 assert.equal(res.output.statusCode,405);
 assert.equal(res.output.headers.Allow,'GET');
});
test('EU proxy rejects unsupported country (SSRF protection)',async()=>{
 const handler=(await modulePromise).default;
 for(const country of ['us','localhost','https://evil.example','FR;evil','']){
  const res=response();await handler({method:'GET',query:{country}},res);
  assert.equal(res.output.statusCode,400);
 }
});
test('EU proxy returns valid upstream schema with appropriate shared cache',async()=>{
 const handler=(await modulePromise).default;
 const original=globalThis.fetch;
 let called;
 globalThis.fetch=async(url)=>{called=new URL(url);return {ok:true,json:async()=>({unix_seconds:[1792533600],production_types:[{name:'Solar',data:[500]}]})};};
 try{
  const res=response();await handler({method:'GET',query:{country:'fr'}},res);
  assert.equal(res.output.statusCode,200);
  assert.equal(called.hostname,'api.energy-charts.info');
  assert.equal(called.searchParams.get('country'),'fr');
  assert.match(res.output.headers['Cache-Control'],/s-maxage=300/);
  assert.equal(res.output.body.production_types[0].name,'Solar');
 }finally{globalThis.fetch=original;}
});
test('EU proxy handles upstream rejection without caching error pages',async()=>{
 const handler=(await modulePromise).default;
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429});
 try{
  const res=response();await handler({method:'GET',query:{country:'de'}},res);
  assert.equal(res.output.statusCode,502);
  assert.equal(res.output.headers['Cache-Control'],'no-store');
  assert.match(res.output.body.error,/429/);
 }finally{globalThis.fetch=original;}
});
