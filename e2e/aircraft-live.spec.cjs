const {test,expect}=require('@playwright/test');
async function route(page){
 await page.route('**/api/aircraft-live?*',handler=>{
  const zone=new URL(handler.request().url()).searchParams.get('zone');
  return handler.fulfill({json:{
   zone,zoneName:'Marseille · Provence',provider:'OpenSky Network',
   observedAt:new Date().toISOString(),
   aircraft:[
    {icao24:'39b415',callsign:'AFR123',originCountry:'France',lat:43.42,lng:5.2,
     altitudeM:1450,speedMs:180,onGround:false,headingDeg:192,ageSeconds:12,observedAt:new Date().toISOString()},
    {icao24:'39b416',callsign:null,originCountry:'France',lat:43.43,lng:5.22,
     altitudeM:0,speedMs:0,onGround:true,headingDeg:null,ageSeconds:12,observedAt:new Date().toISOString()}
   ]}});
 });
}
test('Avions is a distinct active transport subsection with truthful ADS-B source states',async({page})=>{
 await route(page);
 await page.goto('/#/transport/avions');
 await expect(page.getByRole('heading',{name:/Avions/})).toBeVisible();
 await expect(page.locator('.ac-aircraft')).toHaveCount(2);
 await expect(page.locator('.atlas-region-links a[href="#/transport/avions"]')).toHaveClass(/active/);
 await page.locator('.ac-aircraft').first().click();
 await expect(page.locator('.ac-selected')).toContainText('AFR123');
 await expect(page.locator('.ac-selected')).toContainText('1 450 m');
 await expect(page.locator('.ac-selected')).not.toContainText('Retard');
});
test('Aircraft filters and regional selection update observations without layout overflow',async({page})=>{
 await route(page);
 await page.goto('/#/transport/avions');
 await expect(page.locator('.ac-aircraft')).toHaveCount(2);
 await page.locator('#ac-ground').uncheck();
 await expect(page.locator('.ac-aircraft')).toHaveCount(1);
 await page.locator('#ac-zone').selectOption('paris');
 await expect(page.locator('.ac-aircraft')).toHaveCount(1);
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:850});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 }
});
