const {test,expect}=require('@playwright/test');
const PROD=process.env.ATLAS_PRODUCTION_URL||'https://atlas-live-data-studio.vercel.app';
const live=test.extend({});

// This suite intentionally does not intercept/mimic APIs.
// Kept separate from deterministic PR checks: an external outage is not a code regression.
test('production: electricity uses live RTE measurements and real units',async({page},info)=>{
  const seen=[];
  page.on('response',response=>{
    if(response.url().includes('odre.opendatasoft.com/api/explore/'))seen.push({url:response.url(),status:response.status()});
  });
  await page.goto(PROD+'/#/electricity/overview',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#electricity-content')).toBeVisible();
  await expect.poll(async()=>{
    if(await page.locator('.elec-error-panel').count()){
      const message=await page.locator('.elec-error-panel').innerText();
      throw Error('RTE/ODRE production error: '+message);
    }
    return page.locator('.elec-kpi').count();
  },{timeout:30000,intervals:[1000,2000,3000]}).toBe(4);
  await expect(page.locator('.elec-message')).toContainText('relevés');
  await expect(page.locator('.elec-chart-point').first()).toBeVisible();
  expect(seen.some(x=>x.status===200&&new URL(x.url).searchParams.get('where')==='consommation IS NOT NULL')).toBeTruthy();
  const result=await page.locator('.elec-kpi').first().innerText();
  expect(result).toContain('GW');
  await page.screenshot({path:info.outputPath('production-electricity-live.png'),fullPage:true});
});
test('production: weather receives a real Open-Meteo forecast',async({page},info)=>{
  const requests=[];
  page.on('response',r=>{if(r.url().includes('api.open-meteo.com/v1/forecast'))requests.push(r.status());});
  await page.goto(PROD+'/#/weather/overview',{waitUntil:'domcontentloaded'});
  await expect.poll(async()=>{
    const msg=await page.locator('#status').innerText();
    if(msg.startsWith('Erreur'))throw Error('Open-Meteo production error: '+msg);
    return msg.includes('Données chargées');
  },{timeout:30000}).toBeTruthy();
  await expect(page.locator('.now .temp')).toContainText('°');
  await expect(page.locator('#chart .chart-point').first()).toBeVisible();
  expect(requests.includes(200)).toBeTruthy();
  await page.screenshot({path:info.outputPath('production-weather-live.png'),fullPage:true});
});
test('production: deployed pages and navigation do not overflow',async({page},info)=>{
  await page.goto(PROD+'/#/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#catalog .card')).toHaveCount(15);
  await page.getByRole('link',{name:/Électricité/}).first().click();
  await expect(page.getByRole('heading',{name:/Électricité/})).toBeVisible();
  const measurements=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(measurements.scroll).toBeLessThanOrEqual(measurements.client+2);
  await page.screenshot({path:info.outputPath('production-navigation.png'),fullPage:true});
});

// More costly 30-coordinate live forecast is opt-in, not in every scheduled run.
test('production: optional live temperature heatmap overlay',async({page},info)=>{
  test.skip(process.env.ATLAS_CHECK_LIVE_HEATMAP!=='1','Opt-in to avoid consuming Open-Meteo multi-coordinate quota');
  await page.goto(PROD+'/#/weather/heatmap',{waitUntil:'domcontentloaded'});
  await expect.poll(async()=>{
    const msg=await page.locator('#status').innerText();
    if(msg.includes('HTTP 429'))throw Error('Open-Meteo rate limit (429): '+msg);
    if(msg.includes('Carte thermique :')&&!msg.includes('cache')&&!msg.includes('points'))throw Error(msg);
    return page.locator('#heat-range').innerText();
  },{timeout:45000}).toContain('points');
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();
  await page.screenshot({path:info.outputPath('production-heatmap-live.png'),fullPage:true});
});

test('production: world data and real geographic map load without external API mocks',async({page},info)=>{
 await page.goto(PROD+'/#/electricity/world',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#geo-map')).toBeVisible({timeout:20000});
 await expect(page.locator('#geo-status')).toContainText('213 pays');
 await expect(page.locator('#geo-rank button')).not.toHaveCount(0);
 await expect(page.locator('#geo-details')).toContainText('États-Unis');
 await page.screenshot({path:info.outputPath('production-world-choropleth.png'),fullPage:true});
});
test('production: Energy-Charts Europe responds from the real browser with a measured interval',async({page},info)=>{
 test.skip(info.project.name==='live-mobile','Only one shared-IP live Energy-Charts request per run to honor strict quotas.');
 const upstream=[];
 page.on('response',r=>{if(r.url().startsWith('https://api.energy-charts.info/v2/public_power'))upstream.push({status:r.status(),url:r.url()});});
 await page.goto(PROD+'/#/electricity/europe',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#geo-map')).toBeVisible({timeout:20000});
 await expect(page.locator('#geo-details')).toContainText('Mesures récentes');
 await expect.poll(async()=>{
  const msg=await page.locator('#geo-status').innerText();
  if(msg.includes('Impossible')||msg.includes('HTTP 429'))throw Error('Fraunhofer Energy-Charts upstream unavailable: '+msg);
  return msg.includes('Relevés européens chargés');
 },{timeout:35000,intervals:[1000,2000,3000]}).toBeTruthy();
 expect(upstream.some(r=>r.status===200&&new URL(r.url).searchParams.get('country')==='de')).toBeTruthy();
 await expect(page.locator('#geo-details')).toContainText('GW');
 await page.screenshot({path:info.outputPath('production-europe-live.png'),fullPage:true});
});
