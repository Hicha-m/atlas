/* Vercel Node function: server-side Energy-Charts proxy.
 * Fixed upstream, allowlisted two-letter countries, three-day window only.
 * CDN cache avoids one upstream fetch per visitor; no API key is used.
 */
const ALLOWED=new Set('at ba be bg ch cy cz de dk ee es fi fr ge gr hr hu ie it lt lu lv md me mk nl no pl pt ro rs se si sk ua uk xk'.split(' '));
const TARGET='https://api.energy-charts.info/public_power';
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const country=typeof req.query.country==='string'?req.query.country.toLowerCase():'';
 if(!ALLOWED.has(country))return res.status(400).json({error:'Unsupported country'});
 const now=new Date(),start=new Date(now.getTime()-3*86400000);
 const day=date=>date.toISOString().slice(0,10);
 const url=new URL(TARGET);
 url.searchParams.set('country',country);
 url.searchParams.set('start',day(start));
 url.searchParams.set('end',day(now));
 try{
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(13000)});
  if(!response.ok){
   res.setHeader('Cache-Control','no-store');
   return res.status(502).json({error:'Energy-Charts upstream HTTP '+response.status,source:'Energy-Charts / Fraunhofer ISE'});
  }
  const payload=await response.json();
  if(!Array.isArray(payload?.unix_seconds)||!Array.isArray(payload?.production_types))
   return res.status(502).json({error:'Energy-Charts returned an invalid payload'});
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300, stale-while-revalidate=300');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(200).json(payload);
 }catch(error){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:'Energy-Charts upstream unavailable',source:'Energy-Charts / Fraunhofer ISE'});
 }
}
