/* Cached same-origin forecast bridge for the immersive view.
 * Fixed Open-Meteo endpoints, validated coordinates and strict 8s timeout.
 * No API keys, arbitrary URL proxying or user-defined provider fields.
 */
import {forecastUrl,airUrl} from '../weather-immersive-data.js';

export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'Method not allowed'});
 }
 const kind=req.query?.kind;
 const latitude=Number(req.query?.lat);
 const longitude=Number(req.query?.lon);
 if(!['forecast','air'].includes(kind)||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
  Math.abs(latitude)>90||Math.abs(longitude)>180||
  typeof req.query.lat!=='string'||typeof req.query.lon!=='string'||
  !/^-?\d{1,3}(?:\.\d{1,5})?$/.test(req.query.lat)||
  !/^-?\d{1,3}(?:\.\d{1,5})?$/.test(req.query.lon)){
  res.setHeader('Cache-Control','no-store');
  return res.status(400).json({error:'Invalid weather query'});
 }
 const location={name:'Geographic coordinates',country:'',latitude,longitude};
 const url=kind==='forecast'?forecastUrl(location):airUrl(location);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok){
   res.setHeader('Cache-Control','no-store');
   return res.status(502).json({error:'Open-Meteo upstream returned '+response.status});
  }
  const data=await response.json();
  if(kind==='forecast'){
   if(!data?.current||!Array.isArray(data?.hourly?.time)||!Array.isArray(data?.daily?.time))
    return res.status(502).json({error:'Incomplete forecast response'});
  }else if(!data?.current){
   return res.status(502).json({error:'Incomplete air-quality response'});
  }
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=600, stale-while-revalidate=300');
  return res.status(200).json(data);
 }catch(error){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:error.name==='AbortError'?'Weather provider timeout':'Weather provider unavailable'});
 }finally{clearTimeout(timer);}
}
