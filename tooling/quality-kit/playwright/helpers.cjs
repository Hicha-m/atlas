/**
 * Optional Playwright helpers. Framework-specific adapter stays outside core.
 * Requires @playwright/test in the CONSUMER project; quality-kit core does not.
 */
async function viewportOverflow(page){
 return page.evaluate(()=>Math.max(0,
  document.documentElement.scrollWidth-document.documentElement.clientWidth));
}
async function browserResourceSummary(page){
 return page.evaluate(()=>{
  const assets=performance.getEntriesByType('resource');
  const durations=assets.map(r=>r.duration).sort((a,b)=>a-b);
  const p95=durations.length?durations[Math.ceil(durations.length*.95)-1]:null;
  return {
   resourceCount:assets.length,
   resourceDurationP95Ms:p95===null?null:Math.round(p95*100)/100,
   transferSizeBytes:assets.reduce((sum,r)=>sum+(r.transferSize||0),0),
   navigationType:performance.getEntriesByType('navigation')[0]?.type||null
  };
 });
}
async function assertNoHorizontalOverflow(page,{maxPx=2}={}){
 const overflow=await viewportOverflow(page);
 if(overflow>maxPx)throw Error('Horizontal overflow: '+overflow+'px > '+maxPx+'px');
 return overflow;
}
module.exports={viewportOverflow,browserResourceSummary,assertNoHorizontalOverflow};
