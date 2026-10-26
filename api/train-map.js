import {decodeSncfGtfsRt} from '../transport-live-data.js';
import {
 buildSncfTrainMap,normalizeSncfStations,selectSncfCandidates,
 stationQuery,uicFromStop
} from '../transport-train-map-data.js';

const GTFS_RT_URL='https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates';
const GEO_BATCH_SIZE=30;
const GEO_BATCH_LIMIT=12;
const MAX_FEED_BYTES=24*1024*1024;
async function fetchLimited(url,{timeout=8500,binary=false}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:binary?'application/x-protobuf':'application/json'}});
  if(!response.ok)throw Error('Source '+response.status);
  if(binary){
   const stated=Number(response.headers?.get?.('content-length')||0);
   if(stated>MAX_FEED_BYTES)throw Error('Flux SNCF trop volumineux');
   const buffer=Buffer.from(await response.arrayBuffer());
   if(buffer.length>MAX_FEED_BYTES)throw Error('Flux SNCF trop volumineux');
   return buffer;
  }
  return response.json();
 }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'Seule la méthode GET est autorisée'});
 }
 try{
  const bytes=await fetchLimited(GTFS_RT_URL,{timeout:8000,binary:true});
  const decoded=decodeSncfGtfsRt(bytes);
  const nowMs=Date.now();
  const rows=selectSncfCandidates(decoded,{limit:320,nowMs});
  const codes=[...new Set(rows.map(r=>uicFromStop(r.stopId)).filter(Boolean))]
   .slice(0,GEO_BATCH_SIZE*GEO_BATCH_LIMIT);
  const chunks=[];
  for(let i=0;i<codes.length;i+=GEO_BATCH_SIZE){
   const url=stationQuery(codes.slice(i,i+GEO_BATCH_SIZE));
   if(url)chunks.push(url);
  }
  const results=await Promise.allSettled(chunks.map(url=>fetchLimited(url,{timeout:5500})));
  const stations=[];
  let ok=0;
  for(const result of results){
   if(result.status!=='fulfilled'||!Array.isArray(result.value?.results))continue;
   ok++;stations.push(...result.value.results);
  }
  if(chunks.length&&ok===0)throw Error('Référentiel des gares indisponible');
  const lookup=normalizeSncfStations(stations);
  const data=buildSncfTrainMap(rows,lookup,{feedUpdated:decoded.timestamp,available:decoded.entities,nowMs});
  res.setHeader('Cache-Control','public, max-age=20, s-maxage=120, stale-while-revalidate=90');
  return res.status(200).json({
   ...data,provider:'SNCF Voyageurs + SNCF Réseau',fetchedAt:new Date().toISOString(),
   mappedGares:lookup.size,referencePages:chunks.length,referencePagesOk:ok,
   referencePartial:ok!==chunks.length,
   provenance:[
    {label:'GTFS-RT TripUpdates',url:'https://transport.data.gouv.fr/datasets/horaires-sncf'},
    {label:'Liste des gares et coordonnées UIC',url:'https://data.sncf.com/explore/dataset/liste-des-gares/'}
   ]
  });
 }catch(e){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({
   error:e?.name==='AbortError'?'Le fournisseur ne répond pas dans les délais':
    'Impossible de construire la carte à partir des données SNCF actuelles'
  });
 }
}
