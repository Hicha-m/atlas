const {test,expect}=require('@playwright/test');
const liveResponse={
 schema_version:'2.0',endpoint:'public_power',country:'de',timezone:'Europe/Berlin',
 unit:'MW',interval_minutes:15,license:'CC BY 4.0',available_until:'2026-10-22T14:00:00+02:00',
 data:Array.from({length:24},(_,i)=>({
  timestamp:'2026-10-22T'+String(7+Math.floor(i/4)).padStart(2,'0')+':'+String((i%4)*15).padStart(2,'0')+':00+02:00',
  values:{load:35000+i*100,solar:5000+i*120,wind_onshore:6000,wind_offshore:900,
   nuclear:3000,fossil_gas:3400,hydro_run_of_river:1200,
   hydro_pumped_storage_consumption:-600,cross_border_electricity_trading:-1200,
   renewable_share_of_generation:52}
 }))
};
async function mockEurope(page,status=200){
 const calls=[];
 await page.route('https://api.energy-charts.info/v2/public_power**',route=>{
  calls.push(route.request().url());
  return status===200?route.fulfill({json:liveResponse}):route.fulfill({status,contentType:'application/json',body:'{"detail":"Rate limit exceeded"}'});
 });
 return calls;
}
async function waitSnapshot(page){
 await expect(page.locator('#geo-map')).toBeVisible({timeout:16000});
 await expect(page.locator('#geo-country')).toBeVisible();
 await expect(page.locator('#geo-rank button')).not.toHaveCount(0);
}
async function noOverflow(page){
 const size=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
 expect(size.width).toBeLessThanOrEqual(size.viewport+2);
}
test('world: real 213-country static snapshot, interactive map, country selection and yearly compare',async({page},info)=>{
 await page.goto('/#/electricity/world');
 await waitSnapshot(page);
 await expect(page.getByRole('heading',{name:'Carte mondiale'})).toBeVisible();
 await expect(page.locator('#geo-status')).toContainText('213 pays');
 await expect(page.locator('#geo-details')).toContainText('États-Unis');
 await expect(page.locator('.leaflet-interactive').first()).toBeVisible();
 await page.locator('#geo-country').selectOption('FRA');
 await expect(page.locator('#geo-details')).toContainText('France');
 await page.locator('#geo-metric').selectOption('generationTWh');
 await expect(page.locator('#geo-details')).toContainText('TWh');
 await page.locator('#geo-year').fill('2020');
 await expect(page.locator('#geo-year-label')).toHaveText('2020');
 await page.locator('#geo-compare').selectOption('DEU');
 await expect(page.locator('#geo-trend-content')).toContainText('Allemagne');
 await noOverflow(page);
 await page.screenshot({path:info.outputPath('world-choropleth.png'),fullPage:true});
});
test('europe: live Fraunhofer API gives measured MW, mix and 15-min resolution; no repeated fetch for annual slider',async({page},info)=>{
 const calls=await mockEurope(page);
 await page.goto('/#/electricity/europe');
 await waitSnapshot(page);
 await expect(page.locator('#geo-details')).toContainText('Mesures récentes',{timeout:15000});
 await expect(page.locator('#geo-details')).toContainText('35', {timeout:15000});
 await expect(page.locator('#geo-details')).toContainText('GW');
 await expect(page.locator('#geo-details')).toContainText('15 min');
 await expect(page.locator('#geo-details')).toContainText('Échanges programmés');
 expect(calls).toHaveLength(1);
 expect(new URL(calls[0]).searchParams.get('country')).toBe('de');
 await page.locator('#geo-year').fill('2019');
 await page.locator('#geo-metric').selectOption('lowCarbonPercent');
 expect(calls).toHaveLength(1);
 await noOverflow(page);
 await page.screenshot({path:info.outputPath('europe-live.png'),fullPage:true});
});
test('europe: switching country respects API quota and history remains readable',async({page})=>{
 const calls=await mockEurope(page);
 await page.goto('/#/electricity/europe');
 await waitSnapshot(page);
 await expect(page.locator('#geo-details')).toContainText('GW',{timeout:15000});
 await page.locator('#geo-country').selectOption('FRA');
 await expect(page.locator('#geo-details')).toContainText('France');
 await expect(page.locator('#geo-details')).toContainText('Quota Energy-Charts');
 expect(calls).toHaveLength(1);
 await expect(page.locator('#geo-rank')).toBeVisible();
});
test('europe: live 429 displays honest error, not invented energy values',async({page})=>{
 await mockEurope(page,429);
 await page.goto('/#/electricity/europe');
 await waitSnapshot(page);
 await expect(page.locator('#geo-details')).toContainText('API Energy-Charts : HTTP 429',{timeout:16000});
 await expect(page.locator('#geo-details')).toContainText('Allemagne');
 await expect(page.locator('#geo-details')).not.toContainText('35 GW');
});
test('export world CSV and JSON of actual selected year',async({page})=>{
 await page.goto('/#/electricity/world');
 await waitSnapshot(page);
 const [csv]=await Promise.all([page.waitForEvent('download'),page.locator('#geo-csv').click()]);
 expect(csv.suggestedFilename()).toMatch(/world-2025\.csv$/);
 const [json]=await Promise.all([page.waitForEvent('download'),page.locator('#geo-json').click()]);
 expect(json.suggestedFilename()).toMatch(/world-2025\.json$/);
});
test('new electricity views fit all target viewports',async({page})=>{
 for(const screen of ['world','europe']){
  if(screen==='europe')await mockEurope(page);
  await page.goto('/#/electricity/'+screen);
  await waitSnapshot(page);
  for(const width of [360,390,600,900,1440]){
   await page.setViewportSize({width,height:900});
   await noOverflow(page);
  }
 }
});
