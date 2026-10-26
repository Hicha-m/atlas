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
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Méthode non autorisée'});}
 const zone=String(req.query?.zone||'marseille').toLowerCase(),chosen=AVIATION_ZONES[zone];
 if(!chosen)return res.status(400).json({error:'Zone non prise en charge'});
 const [lamin,lomin,lamax,lomax]=chosen.bbox;
 const url=new URL('https://opensky-network.org/api/states/all');
 for(const [key,val] of Object.entries({lamin,lomin,lamax,lomax}))url.searchParams.set(key,String(val));
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),11500);
 try{
  const upstream=await fetch(url,{signal:ctl.signal,headers:{Accept:'application/json'}});
  if(!upstream.ok)throw Error('OpenSky '+upstream.status);
  const data=await upstream.json();
  if(!Array.isArray(data?.states))throw Error('État des avions non disponible');
  const clean=normalizeAircraftStates(data);
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=900, stale-while-revalidate=120');
  return res.status(200).json({
   ...clean,zone,zoneName:chosen.name,provider:'OpenSky Network',
   fetchedAt:new Date().toISOString(),
   caveat:'Positions ADS-B observées ; elles peuvent être absentes, différées ou incomplètes. Aucun itinéraire ni retard déduit.',
   source:'https://opensky-network.org/'});
 }catch(error){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:error.name==='AbortError'?'Délai OpenSky dépassé':'Positions aériennes temporairement indisponibles'});
 }finally{clearTimeout(timer);}
}
