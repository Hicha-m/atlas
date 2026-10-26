import {
 normalizeSwiss,normalizeTfLArrivals,normalizeTfLSearch,normalizeTfLStatus,
 decodeSncfGtfsRt,normalizeSncfBoard,decodeGtfsServiceAlerts,normalizeSwissConnections
} from '../transport-live-data.js';
import {MARSEILLE_API,MARSEILLE_SOURCE,normalizeMarseilleAlerts} from '../transport-marseille-data.js';

const ALLOWED_MODES=new Set(['train','tram','bus','boat','cableway']);
const TFL_MODES=new Set(['tube','bus','tram','dlr','overground','elizabeth-line','river-bus']);
const JSON_HEADERS={'Accept':'application/json'};
const text=v=>typeof v==='string'?v.trim().slice(0,85):'';
async function readUpstream(url,{binary=false}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11500);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:binary?{'Accept':'application/x-protobuf'}:JSON_HEADERS});
  if(!response.ok)throw Error('Source HTTP '+response.status);
  const length=Number(response.headers?.get?.('content-length')||0);
  if(binary&&length>24*1024*1024)throw Error('Flux trop volumineux');
  if(binary){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>24*1024*1024)throw Error('Flux trop volumineux');return bytes;}
  return await response.json();
 }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Méthode non autorisée'});}
 const type=text(req.query?.provider);
 const mode=text(req.query?.mode);
 const q=text(req.query?.q);
 const station=text(req.query?.station);
 const id=text(req.query?.id);
 try{
  let response,cache='public, max-age=20, s-maxage=30, stale-while-revalidate=25';
  if(type==='swiss'){
   if(!ALLOWED_MODES.has(mode)||station.length<2) return res.status(400).json({error:'Mode ou station invalide'});
   const url=new URL('https://transport.opendata.ch/v1/stationboard');
   url.searchParams.set('station',station);url.searchParams.set('limit','40');
   url.searchParams.append('transportations[]',mode==='boat'?'ship':mode);
   const json=await readUpstream(url.toString());
   response={...normalizeSwiss(json,mode),provider:'Swiss Transport API',fetchedAt:new Date().toISOString(),
    caveat:'Retards/projections uniquement lorsque renseignés par le réseau. Aucun suivi GPS.',
    source:'https://transport.opendata.ch/docs.html'};
   cache='public, max-age=20, s-maxage=30, stale-while-revalidate=30';
  }else if(type==='swiss-connections'){
   const from=text(req.query?.from),to=text(req.query?.to);
   const date=text(req.query?.date),time=text(req.query?.time);
   if(from.length<2||to.length<2||from.toLocaleLowerCase()===to.toLocaleLowerCase()||
      (date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))||
      (time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))
    return res.status(400).json({error:'Départ, destination, date ou heure invalide'});
   const url=new URL('https://transport.opendata.ch/v1/connections');
   url.searchParams.set('from',from);url.searchParams.set('to',to);url.searchParams.set('limit','6');
   if(date)url.searchParams.set('date',date);
   if(time)url.searchParams.set('time',time);
   const json=await readUpstream(url.toString());
   response={provider:'Swiss Transport API',journeys:normalizeSwissConnections(json),fetchedAt:new Date().toISOString(),
     source:'https://transport.opendata.ch/docs.html',
     caveat:'Itinéraires calculés à partir des horaires publiés. Retards uniquement lorsqu’ils sont présents ; aucune position GPS déduite.'};
   cache='public, max-age=30, s-maxage=90, stale-while-revalidate=45';
  }else if(type==='tfl-stop'){
   if(!(/^[A-Za-z0-9-]{5,42}$/.test(id)))return res.status(400).json({error:'Arrêt invalide'});
   const json=await readUpstream('https://api.tfl.gov.uk/StopPoint/'+encodeURIComponent(id));
   const lat=Number(json?.lat),lng=Number(json?.lon);
   response={station:String(json?.commonName||'').slice(0,140),
     stationPosition:Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null,
     provider:'Transport for London',fetchedAt:new Date().toISOString()};
   cache='public, max-age=60, s-maxage=1800, stale-while-revalidate=300';
  }else if(type==='tfl'){
   if(!TFL_MODES.has(mode)||!(/^[A-Za-z0-9-]{5,42}$/.test(id)))return res.status(400).json({error:'Mode ou arrêt invalide'});
   const json=await readUpstream('https://api.tfl.gov.uk/StopPoint/'+encodeURIComponent(id)+'/Arrivals');
   const board=normalizeTfLArrivals(json);
   response={...board,departures:board.departures.filter(x=>x.mode===mode),provider:'Transport for London',
    fetchedAt:new Date().toISOString(),caveat:'Heures prévues par TfL. Position textuelle uniquement si publiée.',
    source:'https://api.tfl.gov.uk/'};
   cache='public, max-age=10, s-maxage=25, stale-while-revalidate=15';
  }else if(type==='tfl-search'){
   if(!TFL_MODES.has(mode)||q.length<2)return res.status(400).json({error:'Recherche ou mode invalide'});
   const url='https://api.tfl.gov.uk/StopPoint/Search/'+encodeURIComponent(q)+'?modes='+encodeURIComponent(mode)+'&maxResults=25';
   const json=await readUpstream(url);
   response={stops:normalizeTfLSearch(json),provider:'Transport for London'};
   cache='public, max-age=60, s-maxage=3600, stale-while-revalidate=3600';
  }else if(type==='tfl-status'){
   const json=await readUpstream('https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,tram,elizabeth-line/Status');
   response={statuses:normalizeTfLStatus(json),provider:'Transport for London',
    fetchedAt:new Date().toISOString(),source:'https://api.tfl.gov.uk/'};
   cache='public, max-age=30, s-maxage=90, stale-while-revalidate=45';
  }else if(type==='marseille-alerts'){
   // Verified provider-maintained Opendatasoft records. The former GTFS-RT
   // download link returned HTTP 502 and must not silently fall back to fake alerts.
   const select='id,title,message,category,criticity,level,lines,lines_final_sname,lines_final_mode,lines_final_subnetwork_name,startvalidity,endvalidity,updatedate';
   const urlFor=offset=>{
    const url=new URL(MARSEILLE_API);
    url.searchParams.set('limit','100');
    url.searchParams.set('offset',String(offset));
    url.searchParams.set('select',select);
    url.searchParams.set('order_by','updatedate DESC');
    return url.toString();
   };
   const first=await readUpstream(urlFor(0));
   if(!Array.isArray(first?.results))throw Error('Schéma source métropolitaine invalide');
   const published=Math.max(0,Number(first.total_count)||first.results.length);
   const pageCount=Math.min(5,Math.ceil(published/100));
   const remaining=await Promise.allSettled(Array.from({length:Math.max(0,pageCount-1)},(_,i)=>readUpstream(urlFor((i+1)*100))));
   const all=first.results.slice();
   let partial=published>500;
   for(const part of remaining){
    if(part.status==='fulfilled'&&Array.isArray(part.value?.results))all.push(...part.value.results);
    else partial=true;
   }
   const incidents=normalizeMarseilleAlerts(all,{max:500});
   response={provider:'Métropole Aix-Marseille-Provence · Open Data',fetchedAt:new Date().toISOString(),
    ...incidents,publishedCount:published,partial,
    source:MARSEILLE_SOURCE,
    caveat:'Perturbations publiées par la Métropole. Validité évaluée à la journée : les plages horaires indiquées dans les messages restent à consulter. Aucun prochain passage ou suivi GPS déduit.'};
   cache='public, max-age=30, s-maxage=180, stale-while-revalidate=90';
  }else if(type==='sncf'){
   if(q.length>80)return res.status(400).json({error:'Filtre trop long'});
   const bytes=await readUpstream('https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates',{binary:true});
   const board=normalizeSncfBoard(decodeSncfGtfsRt(bytes),{query:q});
   response={...board,provider:'SNCF Voyageurs via PAN',fetchedAt:new Date().toISOString(),
    caveat:'Actualisation GTFS-RT de trains nationaux. Les identifiants GTFS ne sont pas les noms de gares ; aucune position GPS déduite.',
    source:'https://transport.data.gouv.fr/datasets/horaires-sncf'};
   cache='public, max-age=45, s-maxage=90, stale-while-revalidate=40';
  }else return res.status(400).json({error:'Fournisseur non pris en charge'});
  res.setHeader('Cache-Control',cache);
  return res.status(200).json(response);
 }catch(error){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:error.name==='AbortError'?'Délai du fournisseur dépassé':'Fournisseur temporairement indisponible'});
 }
}
