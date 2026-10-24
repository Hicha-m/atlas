// Poll the public, same-origin Vercel revision endpoint until the requested SHA is live.
// Unlike an unconditional sleep, this never tests the previous deployment by accident.
const base=process.env.ATLAS_PRODUCTION_URL||'https://atlas-live-data-studio.vercel.app';
const expected=process.env.GITHUB_SHA;
if(!expected||!/^[a-f0-9]{40}$/i.test(expected))throw new Error('A full GitHub commit SHA is required');
const maxMs=120_000,delayMs=3_000,start=Date.now();
let last='not reachable';
while(Date.now()-start<maxMs){
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  let response;
  try{response=await fetch(new URL('/api/deployment-revision?cache='+Date.now(),base),{signal:controller.signal,headers:{'Cache-Control':'no-cache'}});}
  finally{clearTimeout(timer);}
  const json=await response.json();
  if(response.ok&&json?.sha===expected){
   console.log('Vercel production ready for '+expected+' after '+((Date.now()-start)/1000).toFixed(1)+'s');
   process.exit(0);
  }
  last='HTTP '+response.status+', revision '+String(json?.sha||json?.error||'absent');
 }catch(error){last=error.message;}
 console.log('Waiting for production revision ('+last+')...');
 await new Promise(resolve=>setTimeout(resolve,delayMs));
}
console.error('Deployment readiness timed out after '+((Date.now()-start)/1000).toFixed(1)+'s. Last: '+last);
process.exit(1);
