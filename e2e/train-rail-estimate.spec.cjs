const {test,expect}=require('@playwright/test');
async function mock(page){
 let railCalls=0;
 await page.route('**/api/transport-live?*',route=>route.fulfill({json:{provider:'SNCF',departures:[]}}));
 await page.route('**/api/train-map',route=>route.fulfill({json:{
  sourceTotal:3,totalWithAnchors:1,selectedCount:1,segmentEligible:1,
  feedUpdated:new Date().toISOString(),referencePartial:false,
  markers:[{
   id:'OCESN83900F1187_F:TER:FR',kind:'TER',number:'83900',status:'ontime',delay:0,
   stopCode:'87751009',stationName:'Gare B',lat:43.35,lng:5.05,
   nextStopAt:new Date(Date.now()+600000).toISOString(),updatedAt:new Date().toISOString(),
   segment:{
    fromName:'Gare A',toName:'Gare B',
    from:{lat:43.3,lng:5},to:{lat:43.35,lng:5.05},
    lineCode:'930000',progress:.5,
    fromTime:new Date(Date.now()-600000).toISOString(),
    toTime:new Date(Date.now()+600000).toISOString()
   }
  }]
 }}));
 await page.route('**/api/rail-lines?*',route=>{
  railCalls++;
  return route.fulfill({json:{provider:'SNCF Réseau',published:1,partial:false,
   lines:[{code:'930000',coordinates:[[43.3,5],[43.35,5],[43.35,5.05]]}],
   nature:'railway_infrastructure_not_vehicle_track'}});
 });
 return ()=>railCalls;
}
test('desktop footer does not overlap Leaflet zoom, and rails are fetched only when requested',async({page})=>{
 const calls=await mock(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('#tm-state')).toContainText('1 trains associés');
 await expect(page.locator('#tm-data-footer')).toBeVisible();
 await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
 const footer=await page.locator('#tm-data-footer').boundingBox();
 const zoom=await page.locator('#tm-map .leaflet-control-zoom').boundingBox();
 expect(footer.x+footer.width).toBeLessThan(zoom.x);
 expect(calls()).toBe(0);
 await page.locator('#tm-rails').check();
 await expect(page.locator('#tm-rails-status')).toContainText('1 segments d’infrastructure');
 expect(calls()).toBe(1);
 await page.locator('#tm-rails').uncheck();
 await expect(page.locator('#tm-rails-status')).toContainText('Tracés masqués');
 await page.locator('#tm-tab-horaires').click();
 await expect(page.locator('.tl-workspace')).toBeVisible();
});
test('a matched timetable bracket can show an explicit NOT-GPS estimate along real rails',async({page})=>{
 await mock(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('.tm-pick-train')).toHaveCount(1);
 await page.locator('.tm-pick-train').click();
 await expect(page.locator('#tm-drawer')).toContainText('Estimation horaire possible');
 await expect(page.locator('#tm-drawer')).toContainText('Gare A → Gare B');
 await page.locator('#tm-estimate-action').click();
 await expect(page.locator('#tm-rails-status')).toContainText('1 segments d’infrastructure');
 await expect(page.locator('#tm-drawer')).toContainText('Un cercle jaune sur les voies');
 await expect(page.locator('#tm-drawer')).toContainText('jamais une observation GPS');
});
test('map infrastructure controls do not create horizontal overflow on mobile',async({page})=>{
 await mock(page);
 await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:860});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await expect(page.locator('#tm-rails')).toBeVisible();
 }
});
