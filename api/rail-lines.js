import {fixturesEnabled,fixtureHeaders,railFixture} from './_benchmark-fixtures.js';
import {
 validateRailBounds,railLinesQuery,normalizeRailGeometry,RAIL_GEOMETRY_SOURCE
} from '../transport-rail-lines-data.js';
async function readRailPage(url){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
 try{
  const res=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Source géographique '+res.status);
  const len=Number(res.headers?.get?.('content-length')||0);
  if(len>6*1024*1024)throw Error('Réponse trop volumineuse');
  const raw=typeof res.text==='function'?await res.text():null;
  if(raw!==null){
   if(raw.length>6*1024*1024)throw Error('Réponse trop volumineuse');
   return JSON.parse(raw);
  }
  return res.json();
 }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'Méthode non autorisée'});
 }
 const bounds=validateRailBounds(req.query);
 if(!bounds)return res.status(400).json({error:'Carte : zoomez sur une zone ferroviaire française'});
 if(fixturesEnabled()){
  fixtureHeaders(res);
  res.setHeader('Cache-Control','public, max-age=120, s-maxage=86400, stale-while-revalidate=3600');
  return res.status(200).json(railFixture(bounds));
 }
 try{
  const first=await readRailPage(railLinesQuery(bounds));
  if(!Array.isArray(first?.results))throw Error('Schéma du référentiel invalide');
  const published=Math.max(0,Number(first.total_count)||first.results.length);
  const count=Math.min(3,Math.ceil(published/100));
  const pages=await Promise.allSettled(Array.from({length:Math.max(0,count-1)},(_,i)=>
    readRailPage(railLinesQuery(bounds,{offset:(i+1)*100}))));
  let partial=published>300;
  const records=first.results.slice();
  for(const p of pages){
   if(p.status==='fulfilled'&&Array.isArray(p.value?.results))records.push(...p.value.results);
   else partial=true;
  }
  const geo=normalizeRailGeometry(records);
  res.setHeader('Cache-Control','public, max-age=120, s-maxage=86400, stale-while-revalidate=3600');
  return res.status(200).json({
   ...geo,bounds,published,partial,provider:'SNCF Réseau',
   source:RAIL_GEOMETRY_SOURCE,
   referenceDate:'2026-02-19',
   nature:'railway_infrastructure_not_vehicle_track',
   caveat:'Tracés de l’infrastructure exploitée SNCF, référentiel 2026. Ils ne confirment pas le parcours d’un train précis ni sa localisation.'
  });
 }catch(e){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:e?.name==='AbortError'?'Délai de chargement du réseau dépassé':'Tracé ferroviaire temporairement indisponible'});
 }
}
