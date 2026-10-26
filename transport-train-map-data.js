/**
 * Map model for SNCF TripUpdates + SNCF railway station georeference.
 *
 * CRITICAL: GTFS-RT TripUpdates do NOT provide vehicle GPS coordinates.
 * Every returned pin is anchored to the NEXT PUBLISHED STOP, NOT the
 * vehicle location. Never animate markers or describe them as GPS positions.
 */
const text=(v,n=120)=>String(v??'').trim().slice(0,n);
export const SNCF_STATIONS_API='https://data.sncf.com/api/explore/v2.1/catalog/datasets/liste-des-gares/records';
export const SNCF_GEO_CREDIT='SNCF Réseau · Liste des gares (ODbL)';
export const SNCF_TU_CREDIT='SNCF Voyageurs · GTFS-RT TripUpdates via transport.data.gouv.fr';
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function uicFromStop(stopId){
 const s=String(stopId||'');
 // Example: "StopPoint:OCETrain TER-87763029" or "StopArea:OCE87761262".
 const m=s.match(/(?:StopPoint:[^-]*-|StopArea:OCE)(\d{8})(?!\d)/);
 return m?.[1]||null;
}
export function trainClass(id,route=''){
 const candidate=String(id||'')+' '+String(route||'');
 if(/(?:^|:)TER(?:[:\s]|$)/i.test(candidate))return 'TER';
 if(/(?:^|:)OUI(?:[:\s]|$)|OUIGO/i.test(candidate))return 'TGV';
 if(/\bTGV\b/i.test(candidate))return 'TGV';
 if(/\bINTERCIT[ÉE]S?\b|(?:^|:)IC(?:[:\s]|$)/i.test(candidate))return 'Intercités';
 return 'Train';
}
export function trainNumber(id){
 const m=String(id||'').match(/^OCESN(\d{2,8})F?/i);
 return m?m[1]:null;
}
export function mapStatus(row){
 if(row.cancelled)return 'cancelled';
 if(typeof row.delay!=='number'||!Number.isFinite(row.delay))return 'unknown';
 return row.delay>0?'late':'ontime';
}
export function normalizeSncfStations(records){
 const stations=new Map();
 for(const station of Array.isArray(records)?records:[]){
  const code=text(station?.code_uic,8);
  const name=text(station?.libelle,125);
  const loc=station?.geo_point_2d||station?.c_geo;
  const lat=finite(loc?.lat),lng=finite(loc?.lon);
  if(!/^\d{8}$/.test(code)||!name||lat===null||lng===null||
     lat<40||lat>52||lng< -6||lng>11)continue;
  if(!stations.has(code))stations.set(code,{code,name,lat,lng});
 }
 return stations;
}
export function selectSncfCandidates(decoded,{limit=320,nowMs=Date.now()}={}){
 const unique=new Set(),list=[];
 const rows=Array.isArray(decoded?.rows)?decoded.rows:[];
 // Sort by distance to current time and freshness, not source order.
 const candidates=rows.map(row=>{
  const expected=Date.parse(row.expected||'');
  const age=Date.parse(row.sourceUpdated||decoded.timestamp||'');
  const timed=Number.isFinite(expected);
  const freshness=Number.isFinite(age)?Math.max(0,nowMs-age):Infinity;
  return {row,uic:uicFromStop(row.stopId),expected,freshness,
   priority:(timed?Math.abs(nowMs-expected):Infinity)+(Number.isFinite(freshness)?Math.min(freshness,86400000)*0.2:86400000)};
 }).filter(x=>x.uic&&Number.isFinite(x.expected)&&x.expected>nowMs-2*60*1000&&x.expected<nowMs+3*3600000);
 candidates.sort((a,b)=>a.priority-b.priority);
 for(const item of candidates){
  if(unique.has(item.row.id))continue;
  unique.add(item.row.id);list.push(item.row);
  if(list.length>=Math.max(1,Math.min(500,limit)))break;
 }
 return list;
}
export function buildSncfTrainMap(rows,stationLookup,{feedUpdated=null,available=null,nowMs=Date.now()}={}){
 const lookup=stationLookup instanceof Map?stationLookup:normalizeSncfStations(stationLookup);
 const markers=[];
 for(const row of rows){
  const stopCode=uicFromStop(row.stopId),station=lookup.get(stopCode);
  if(!station)continue;
  const parsed=Date.parse(row.sourceUpdated||feedUpdated||'');
  const updated=Number.isFinite(parsed)?new Date(parsed).toISOString():null;
  const stale=!Number.isFinite(parsed)||nowMs-parsed>20*60*1000;
  markers.push({
   id:text(row.id,180),kind:trainClass(row.id,row.route),
   number:trainNumber(row.id),status:stale?'unknown':mapStatus(row),
   delay:typeof row.delay==='number'&&Number.isFinite(row.delay)?row.delay:null,
   cancelled:!!row.cancelled,stationName:station.name,stopCode,
   lat:station.lat,lng:station.lng,
   nextStopAt:row.expected,updatedAt:updated,stale,
   freshnessMinutes:Number.isFinite(parsed)?Math.max(0,Math.round((nowMs-parsed)/60000)):null,
   positionType:'next_stop_anchor',geolocationMethod:'station_reference',
   hasLivePosition:false
  });
 }
 const counts={ontime:0,late:0,unknown:0,cancelled:0,ter:0,tgv:0,intercites:0,other:0};
 for(const m of markers){
  counts[m.status]++;
  if(m.kind==='TER')counts.ter++;
  else if(m.kind==='TGV')counts.tgv++;
  else if(m.kind==='Intercités')counts.intercites++;
  else counts.other++;
 }
 const safeFeed=feedUpdated&&Number.isFinite(Date.parse(feedUpdated))?feedUpdated:null;
 return {markers,counts,totalWithAnchors:markers.length,selectedCount:rows.length,feedUpdated:safeFeed,
  sourceTotal:Number.isFinite(available)?available:null,
  locationPrecision:'next_stop_anchor_not_vehicle_position',
  caveat:'Chaque point indique le prochain arrêt déclaré pour une circulation SNCF, pas la position du train. Aucune localisation GPS de véhicule, vitesse ou trajet exact n’est fournie dans ce flux.',
  source:{updates:SNCF_TU_CREDIT,geo:SNCF_GEO_CREDIT}};
}
export function stationQuery(codes){
 const allowed=[...new Set(codes.filter(c=>/^\d{8}$/.test(c)))].slice(0,35);
 if(!allowed.length)return null;
 const url=new URL(SNCF_STATIONS_API);
 url.searchParams.set('select','code_uic,libelle,geo_point_2d');
 url.searchParams.set('where','code_uic IN ('+allowed.map(c=>"'"+c+"'").join(',')+')');
 url.searchParams.set('limit','100');
 return url.toString();
}
