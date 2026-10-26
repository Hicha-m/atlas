const test=require('node:test');
const assert=require('node:assert/strict');
const data=()=>import('../transport-marseille-data.js');
const api=()=>import('../api/transport-live.js');
const today=new Date('2026-10-26T15:00:00Z');
const sample=[
 {id:'rtm-1',title:'Métro M1 : circulation perturbée',message:'Incident technique',category:'INCIDENTS',criticity:'Forte',
  startvalidity:'2026-10-26',endvalidity:'2026-10-29',updatedate:'2026-10-26T15:30:00+0100',
  lines:JSON.stringify([{sName:'M1',mode:'METRO',subNetwork:{name:'Marseille (RTM)'},id:'MAMP:RTM-M1'}])},
 {id:'rtm-1',title:'Métro M1 : circulation perturbée',message:'Incident technique',category:'INCIDENTS',criticity:'Forte',
  startvalidity:'2026-10-26',endvalidity:'2026-10-29',
  lines:JSON.stringify([{sName:'M2',mode:'METRO',subNetwork:{name:'Marseille (RTM)'},id:'MAMP:RTM-M2'}])},
 {id:'aix-2',title:'Travaux rue Victor Hugo',message:'Arrêt non desservi',category:'TRAVAUX',
  startvalidity:'2026-10-28',endvalidity:'2026-11-07',updatedate:'2026-10-25T15:20:00+0200',
  lines:JSON.stringify([{sName:'3',mode:'BUS',subNetwork:{name:'Aix lebus'},id:'MAMP:AIX-03'}])},
 {id:'old-3',title:'Ancienne perturbation',message:'Ne doit pas apparaître',
  startvalidity:'2026-10-12',endvalidity:'2026-10-25',lines:'[]'}
];
function response(){return {code:200,headers:{},body:null,
 setHeader(k,v){this.headers[k]=v;return this;},
 status(n){this.code=n;return this;},
 json(d){this.body=d;return this;}};
}
test('normalize metropolitan records: de-duplicate notices, merge lines, discard expired alerts',async()=>{
 const {normalizeMarseilleAlerts}=await data();
 const x=normalizeMarseilleAlerts({results:sample},{now:today});
 assert.equal(x.alerts.length,2);
 assert.equal(x.activeCount,1);
 assert.equal(x.futureCount,1);
 const r=x.alerts[0];
 assert.equal(r.id,'rtm-1');
 assert.deepEqual(r.routes,['M1','M2']);
 assert.deepEqual(r.networks,['Marseille (RTM)']);
 assert.deepEqual(r.modes,['METRO']);
 assert.equal(r.activity,'current');
 assert.equal(x.alerts[1].activity,'future');
});
test('filter by real network, transport mode, route name and incident text',async()=>{
 const {normalizeMarseilleAlerts,filterMarseilleAlerts,availableMarseilleFilters}=await data();
 const {alerts}=normalizeMarseilleAlerts(sample,{now:today});
 assert.equal(filterMarseilleAlerts(alerts,{network:'Aix lebus'}).length,1);
 assert.equal(filterMarseilleAlerts(alerts,{mode:'METRO',query:'M2'}).length,1);
 assert.equal(filterMarseilleAlerts(alerts,{mode:'BUS',query:'incident'}).length,0);
 assert.deepEqual(availableMarseilleFilters(alerts).modes,['BUS','METRO']);
});
test('safely handles malformed JSON lines and date-only validity',async()=>{
 const {normalizeMarseilleAlerts}=await data();
 const x=normalizeMarseilleAlerts([{id:'bad-1',title:'Avis',startvalidity:'2026-10-27',
 endvalidity:'2026-10-31',lines:'not json',lines_final_sname:'T3',lines_final_mode:'TRAM',
 lines_final_subnetwork_name:'RTM'}],{now:today});
 assert.equal(x.alerts[0].activity,'future');
 assert.deepEqual(x.alerts[0].routes,['T3']);
 assert.equal(x.alerts[0].end,'2026-10-31');
});
test('API paginates real metropolitan records, normalizes and caches',async()=>{
 const {default:handler}=await api();
 const old=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'data.ampmetropole.fr');
  assert.equal(parsed.pathname,'/api/explore/v2.1/catalog/datasets/ol-perturbation-la-mobilite/records');
  assert.equal(parsed.searchParams.get('limit'),'100');
  calls.push(Number(parsed.searchParams.get('offset')));
  return {ok:true,json:async()=>({
   total_count:130,
   results:parsed.searchParams.get('offset')==='0'?sample:[{id:'extra-1',title:'Nouvelle perturbation',message:'Détour',endvalidity:'2026-11-04'}]
  })};
 };
 try{
  const res=response();
  await handler({method:'GET',query:{provider:'marseille-alerts'}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.provider,'Métropole Aix-Marseille-Provence · Open Data');
  assert.equal(res.body.partial,false);
  assert.equal(res.body.publishedCount,130);
  assert.equal(res.body.alerts.length,3);
  assert.deepEqual(calls.sort((a,b)=>a-b),[0,100]);
  assert.match(res.headers['Cache-Control'],/s-maxage=180/);
 }finally{globalThis.fetch=old;}
});
test('API returns explicit failure instead of fabricated incidents when provider fails',async()=>{
 const {default:handler}=await api(),old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:503});
 try{
  const res=response();
  await handler({method:'GET',query:{provider:'marseille-alerts'}},res);
  assert.equal(res.code,502);
  assert.deepEqual(res.body,{error:'Fournisseur temporairement indisponible'});
 }finally{globalThis.fetch=old;}
});
