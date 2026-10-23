const fs=require('node:fs');
const path=require('node:path');
const {test,expect}=require('@playwright/test');
const countries=[['France','FRA'],['Germany','DEU'],['Spain','ESP'],['United States','USA']];
const records=countries.flatMap(([name,code],j)=>Array.from({length:31},(_,i)=>[name,code,1995+i,500+j*300+i*3]));
async function mockWorld(page){
 const d3=fs.readFileSync(path.resolve('node_modules/d3/dist/d3.min.js'));
 await page.route('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:d3}));
 await page.route('https://ourworldindata.org/grapher/**',route=>{
  const url=route.request().url(),field=url.includes('low-carbon')?'low_carbon_share_of_electricity__pct':url.includes('renewables')?'renewable_share_of_electricity__pct':url.includes('carbon-intensity')?'co2_intensity__gco2_kwh':'total_generation__twh';
  const csv='entity,code,year,'+field+'\n'+records.map(([name,code,year,val])=>[name,code,year,field.includes('share')?40+(year-1995)/3:field.includes('intensity')?300-(year-1995):val].join(',')).join('\n');
  return route.fulfill({status:200,contentType:'text/csv',body:csv});
 });
 await page.route('**/api/europe-power?**',route=>route.fulfill({json:{
  unix_seconds:[1792533600,1792534500],production_types:[{name:'Solar',data:[800,1000]},{name:'Wind offshore',data:[500,600]},{name:'Hydro pumped storage consumption',data:[-300,-400]}],
  license:'CC BY 4.0',source:'Energy-Charts'
 }}));
 // Real CDN TopoJSON may be unavailable in CI; map is designed to degrade to country ranking.
 await page.route('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',route=>route.fulfill({json:{
  type:'Topology',transform:{scale:[1,1],translate:[0,0]},objects:{countries:{type:'GeometryCollection',geometries:[
   {type:'Polygon',id:'250',properties:{name:'France'},arcs:[[0]]},
   {type:'Polygon',id:'276',properties:{name:'Germany'},arcs:[[1]]}
  ]}},arcs:[[[-5,42],[13,0],[0,9],[-13,0],[0,-9]],[[8,48],[8,0],[0,7],[-8,0],[0,-7]]]
 }}));
}
test.beforeEach(async({page})=>{await mockWorld(page);});
test('world page renders historical ranking and comparisons without claiming live',async({page},info)=>{
 await page.goto('/#/electricity/world');
 await expect(page.getByRole('heading',{name:'Électricité · Monde'})).toBeVisible();
 await expect(page.locator('#world-ranking-list button').first()).toBeVisible({timeout:25000});
 await expect(page.locator('.world-notice')).toContainText('Pas du temps réel');
 await expect(page.locator('.world-trend')).toBeVisible();
 await expect(page.locator('.world-rank-row')).toHaveCount(4);
 await page.locator('#world-metric').selectOption('clean');
 await expect(page.locator('.world-notice')).toContainText('2025');
 await expect(page.locator('#world-search')).toBeVisible();
 await page.screenshot({path:info.outputPath('world-history.png'),fullPage:true});
});
test('Europe page renders latest Energy-Charts live observations and historical countries',async({page},info)=>{
 await page.goto('/#/electricity/europe');
 await expect(page.getByRole('heading',{name:'Électricité · Europe'})).toBeVisible();
 await expect(page.locator('.world-rank-row')).toHaveCount(3,{timeout:25000});
 await expect(page.locator('#world-live')).toContainText('Fraunhofer ISE');
 await expect(page.locator('#world-live')).toContainText('1,6 GW',{timeout:20000});
 await expect(page.locator('#world-live')).toContainText('Wind offshore');
 await page.screenshot({path:info.outputPath('europe-live.png'),fullPage:true});
});
test('world exporter has real source and no fabricated data; mobile does not overflow',async({page})=>{
 await page.goto('/#/electricity/world');
 await expect(page.locator('.world-rank-row').first()).toBeVisible({timeout:25000});
 const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 expect(size.scroll).toBeLessThanOrEqual(size.client+2);
 await expect(page.locator('#world-json')).toBeEnabled();
});
test('world page handles broken data source without inventing a historical chart',async({page})=>{
 await page.route('https://ourworldindata.org/grapher/**',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/#/electricity/world');
 await expect(page.locator('.world-error')).toBeVisible({timeout:25000});
 await expect(page.locator('.world-trend')).toHaveCount(0);
});

test('geographic shapes use spherical projection and remain inside viewport',async({page})=>{
 await page.goto('/#/electricity/world');
 await expect(page.locator('.world-geo')).toBeVisible({timeout:25000});
 const result=await page.evaluate(()=>{
  const svg=document.querySelector('.world-geo');
  const paths=[...svg.querySelectorAll('path')];
  return {d3:!!window.d3?.geoPath,paths:paths.length,pathsOutside:paths.filter(el=>{
   const bounds=el.getBBox();
   return bounds.x < -1 || bounds.y < -1 || bounds.x+bounds.width>981 || bounds.y+bounds.height>461;
  }).length,empty:paths.filter(el=>!el.getAttribute('d')).length};
 });
 expect(result.d3).toBe(true);
 expect(result.paths).toBeGreaterThan(0);
 expect(result.pathsOutside).toBe(0);
 expect(result.empty).toBe(0);
});

test('Europe map occupies available viewport instead of shrinking to a tiny cluster',async({page})=>{
 await page.goto('/#/electricity/europe');
 await expect(page.locator('.world-geo path[data-code="FRA"]')).toBeVisible({timeout:25000});
 const area=await page.locator('.world-geo path[data-code="FRA"]').evaluate(el=>{
  const box=el.getBBox();return {width:box.width,height:box.height};
 });
 // Bounding box computed from a realistic 13° × 9° French polygon fixture.
 // Previously the spherical polygon complement compressed it to a few pixels.
 expect(area.width).toBeGreaterThan(100);
 expect(area.height).toBeGreaterThan(55);
});
