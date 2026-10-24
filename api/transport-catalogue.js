/* Fixed-source transport catalogue adapter; never a general-purpose URL proxy.
 * This endpoint returns dataset metadata only, not live departure estimates.
 */
const PAN_URL='https://transport.data.gouv.fr/api/datasets';
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const result=await fetch(PAN_URL,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('upstream '+result.status);
  const json=await result.json();
  if(!Array.isArray(json))throw Error('unexpected response schema');
  const datasets=json.slice(0,3000).filter(x=>x&&Array.isArray(x.resources)&&x.resources.length).map(x=>({
   id:x.id??x.slug??'',title:x.title??'',publisher:x.publisher??null,
   page_url:x.page_url??null,last_update:x.last_update??null,
   resources:x.resources.slice(0,80).map(r=>({
    title:r.title??'',format:r.format??'',is_available:r.is_available??null,
    original_url:r.original_url??null,url:r.url??null,last_update:r.last_update??null
   }))
  }));
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=3600, stale-while-revalidate=900');
  return res.status(200).json({datasets});
 }catch(error){
  res.setHeader('Cache-Control','no-store');
  return res.status(502).json({error:error.name==='AbortError'?'Transport catalogue timeout':'Transport catalogue unavailable'});
 }finally{clearTimeout(timer);}
}
