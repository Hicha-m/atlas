const test=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../api/immersive-weather.js');
function response(){
 const data={code:200,headers:{},body:null};
 return {data,setHeader(key,value){data.headers[key]=value;return this},status(n){data.code=n;return this},json(value){data.body=value;return this}};
}
test('fixed proxy refuses unsupported methods and arbitrary URLs',async()=>{
 const handler=(await modulePromise).default;
 for(const [method,kind,lat,lon,expected] of [
  ['POST','forecast','43','5',405],['GET','https://evil.example','43','5',400],
  ['GET','forecast','91','5',400],['GET','forecast','43','-181',400],
  ['GET','forecast','43;malicious','5',400],['GET','forecast',undefined,'5',400],
  ['GET','air','Infinity','5',400]]){
  const res=response();await handler({method,query:{kind,lat,lon}},res);
  assert.equal(res.data.code,expected);
 }
});
test('fixed proxy calls only Open-Meteo with exact source fields and response cache',async()=>{
 const handler=(await modulePromise).default;
 const previous=globalThis.fetch;
 const urls=[];
 globalThis.fetch=async url=>{
  urls.push(new URL(url));
  const air=url.includes('air-quality');
  return {ok:true,json:async()=>air?{current:{european_aqi:13}}:{current:{temperature_2m:18},hourly:{time:['2026-10-24T12:00']},daily:{time:['2026-10-24']}}};
 };
 try{
  for(const kind of ['forecast','air']){
   const res=response();
   await handler({method:'GET',query:{kind,lat:'43.2965',lon:'5.3698'}},res);
   assert.equal(res.data.code,200);
   assert.match(res.data.headers['Cache-Control'],/s-maxage=600/);
  }
  assert.equal(urls.length,2);
  assert.equal(urls[0].hostname,'api.open-meteo.com');
  assert.equal(urls[1].hostname,'air-quality-api.open-meteo.com');
  assert.equal(urls[0].searchParams.get('forecast_days'),'10');
 }finally{globalThis.fetch=previous;}
});
test('upstream errors are never cached and return a non-success status',async()=>{
 const handler=(await modulePromise).default;
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429});
 try{
  const res=response();
  await handler({method:'GET',query:{kind:'forecast',lat:'43',lon:'5'}},res);
  assert.equal(res.data.code,502);
  assert.equal(res.data.headers['Cache-Control'],'no-store');
 }finally{globalThis.fetch=previous;}
});
