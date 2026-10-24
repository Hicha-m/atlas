import {
 normalizeSwiss,normalizeTfLArrivals,normalizeTfLSearch,normalizeTfLStatus,
 decodeSncfGtfsRt,normalizeSncfBoard
} from '../transport-live-data.js';

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
