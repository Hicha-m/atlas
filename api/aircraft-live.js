/* OpenSky public state vectors, restricted to predetermined French airspaces.
 * Aircraft positions are source observations only. No extrapolated flight path.
 */
export const AVIATION_ZONES={
 marseille:{name:'Marseille · Provence',bbox:[42.85,4.4,44.2,6.3]},
 paris:{name:'Paris · Île-de-France',bbox:[48.15,1.45,49.35,3.8]},
 lyon:{name:'Lyon · Rhône-Alpes',bbox:[45.1,3.8,46.5,6]},
 toulouse:{name:'Toulouse · Occitanie',bbox:[42.65,0.55,44.15,2.8]}
};
const bounded=(v,max=100)=>String(v??'').trim().slice(0,max);
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
export function normalizeAircraftStates(payload,{now=Date.now(),max=240}={}){
 const time=Number(payload?.time);
 const states=Array.isArray(payload?.states)?payload.states:[];
 const aircraft=states.slice(0,4000).map(s=>{
  if(!Array.isArray(s))return null;
  const lat=finite(s[6]),lng=finite(s[5]),seen=finite(s[4])||finite(s[3]);
  if(lat===null||lng===null||Math.abs(lat)>90||Math.abs(lng)>180||seen===null)return null;
  const age=Math.max(0,Math.round(now/1000-seen));
  if(age>240||age<0)return null;
  return {
   icao24:bounded(s[0],20).toLowerCase(),
   callsign:bounded(s[1],18)||null,
   originCountry:bounded(s[2],85),
   lat,lng,observedAt:new Date(seen*1000).toISOString(),ageSeconds:age,
   altitudeM:finite(s[13])??finite(s[7]),
   speedMs:finite(s[9]),headingDeg:finite(s[10]),
   onGround:s[8]===true,
   verticalRateMs:finite(s[11]),
   squawk:bounded(s[14],12)||null
  };
 }).filter(x=>x&&/^[a-f0-9]{6}$/.test(x.icao24));
 return {observedAt:Number.isFinite(time)&&time>0?new Date(time*1000).toISOString():null,
  aircraft:aircraft.slice(0,max),totalObserved:aircraft.length};
}

/* Public adsb.lol (ODbL 1.0) fallback for temporary OpenSky unavailability.
 * ADS-B altitude is in feet and groundspeed in knots: convert before display.
 */
export function normalizeAdsbLolStates(payload,{now=Date.now(),max=240}={}){
 const records=Array.isArray(payload?.ac)?payload.ac:[];
 const capture=Number(payload?.now),at=Number.isFinite(capture)&&capture>0?capture:now;
 const aircraft=records.slice(0,4000).map(x=>{
  if(!x||typeof x!=='object')return null;
  const lat=finite(x.lat),lng=finite(x.lon),elapsed=finite(x.seen_pos);
  if(lat===null||lng===null||elapsed===null||elapsed>240||elapsed<0||Math.abs(lat)>90||Math.abs(lng)>180)return null;
  const altFeet=finite(x.alt_geom)??finite(x.alt_baro);
  const speedKt=finite(x.gs);
  return {
   icao24:bounded(x.hex,20).toLowerCase(),callsign:bounded(x.flight,18)||null,
   originCountry:'Non communiqué',lat,lng,
   observedAt:new Date(at-elapsed*1000).toISOString(),ageSeconds:Math.round(elapsed),
   altitudeM:altFeet===null?null:Math.round(altFeet*0.3048),
   speedMs:speedKt===null?null:speedKt*0.514444,
   headingDeg:finite(x.track),onGround:x.alt_baro==='ground',
   verticalRateMs:finite(x.baro_rate)===null?null:finite(x.baro_rate)*0.3048/60,
   squawk:bounded(x.squawk,12)||null
  };
 }).filter(x=>x&&/^[a-f0-9]{6}$/.test(x.icao24));
 return {observedAt:new Date(at).toISOString(),aircraft:aircraft.slice(0,max),totalObserved:aircraft.length};
}
async function readLimited(url,timeoutMs){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Fournisseur HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Méthode non autorisée'});}
 const zone=String(req.query?.zone||'marseille').toLowerCase(),chosen=AVIATION_ZONES[zone];
 if(!chosen)return res.status(400).json({error:'Zone non prise en charge'});
 const [lamin,lomin,lamax,lomax]=chosen.bbox;
 const url=new URL('https://opensky-network.org/api/states/all');
 for(const [key,val] of Object.entries({lamin,lomin,lamax,lomax}))url.searchParams.set(key,String(val));
 let clean=null,provider='',source='';
 try{
  try{
   const data=await readLimited(url,4800);
   if(!Array.isArray(data?.states))throw Error('Source OpenSky sans positions');
   clean=normalizeAircraftStates(data);
   provider='OpenSky Network';source='https://opensky-network.org/';
  }catch{
   // A fixed, modest radius around the selected region; never an open proxy.
   const centres={
    marseille:[43.3,5.37],paris:[48.85,2.35],lyon:[45.76,4.84],toulouse:[43.6,1.44]
   };
   const [lat,lng]=centres[zone];
   const backup='https://api.adsb.lol/v2/lat/'+lat+'/lon/'+lng+'/dist/125';
   const data=await readLimited(backup,5400);
   if(!Array.isArray(data?.ac))throw Error('Source ADSB.lol sans positions');
   clean=normalizeAdsbLolStates(data);
   provider='adsb.lol (ODbL 1.0)';source='https://www.adsb.lol/';
  }
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=900, stale-while-revalidate=120');
  return res.status(200).json({
   ...clean,zone,zoneName:chosen.name,provider,source,
   fetchedAt:new Date().toISOString(),
   caveat:'Positions ADS-B observées par '+provider+'. Elles peuvent être absentes, différées ou incomplètes ; aucun retard, destination ni itinéraire déduit.'});
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:'Positions aériennes temporairement indisponibles auprès des fournisseurs'});
 }
}
