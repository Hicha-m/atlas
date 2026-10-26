const {test,expect}=require('@playwright/test');
const date=()=>new Date().toISOString();
async function mock(page){
 const calls={map:0};
 await page.route('**/api/transport-live?*',route=>{
  const provider=new URL(route.request().url()).searchParams.get('provider');
  if(provider==='sncf')return route.fulfill({json:{
    provider:'SNCF Voyageurs',fetchedAt:date(),departures:[],
    station:'SNCF',feedUpdated:date()
  }});
  return route.fulfill({json:{departures:[],provider:'Other'}});
 });
 await page.route('**/api/train-map',route=>{
  calls.map++;
  return route.fulfill({json:{
   provider:'SNCF Voyageurs + SNCF Réseau',fetchedAt:date(),feedUpdated:date(),
   sourceTotal:918,selectedCount:3,totalWithAnchors:3,mappedGares:2,
   referencePartial:false,locationPrecision:'next_stop_anchor_not_vehicle_position',
   counts:{ontime:1,late:1,unknown:1,cancelled:0,ter:2,tgv:1,intercites:0,other:0},
   markers:[
    {id:'OCESN87654F1187_F:TER:FR:Line::A',kind:'TER',number:'87654',status:'ontime',delay:0,
     cancelled:false,stationName:'Marseille Saint-Charles',stopCode:'87751008',lat:43.303,lng:5.38,
     nextStopAt:date(),updatedAt:date(),hasLivePosition:false,positionType:'next_stop_anchor'},
    {id:'OCESN9706F1187_F:OUI:FR:Line::B',kind:'TGV',number:'9706',status:'late',delay:8,
     cancelled:false,stationName:'Valence-TGV',stopCode:'87763029',lat:44.9927,lng:4.9785,
     nextStopAt:date(),updatedAt:date(),hasLivePosition:false,positionType:'next_stop_anchor'},
    {id:'OCESN87653F1187_F:TER:FR:Line::C',kind:'TER',number:'87653',status:'unknown',delay:null,
     cancelled:false,stationName:'Marseille Saint-Charles',stopCode:'87751008',lat:43.303,lng:5.38,
     nextStopAt:date(),updatedAt:date(),hasLivePosition:false,positionType:'next_stop_anchor'}
   ]
  }});
 });
 return calls;
}
test('train network map is a tab on the Trains page, not a new sidebar section',async({page})=>{
 const calls=await mock(page);
 await page.goto('/#/transport/trains');
 await expect(page.locator('#tm-tab-horaires')).toBeVisible();
 await expect(page.locator('#tm-tab-direct')).toBeVisible();
 await expect(page.locator('#tm-live')).toBeHidden();
 expect(calls.map).toBe(0);
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('#tm-tab-direct')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#tm-live')).toBeVisible();
 await expect(page.locator('#tm-state')).toContainText('3 trains associés');
 await expect(page.locator('#tm-drawer')).toContainText('Réseau en direct');
 await expect(page.locator('#tm-drawer')).toContainText('50 %');
 await expect(page.locator('#tm-drawer')).toContainText('3');
 await expect(page.locator('#tm-live')).toContainText('pas de position GPS');
 expect(calls.map).toBe(1);
 await page.locator('#tm-tab-horaires').click();
 await expect(page.locator('.tl-workspace')).toBeVisible();
 await expect(page.locator('#tm-live')).toBeHidden();
 await expect(page.locator('.atlas-region-links a[href="#/transport/trains"]')).toHaveClass(/active/);
});
test('network filters and search change map model, detail, isolate and persistent follow',async({page})=>{
 await mock(page);await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('.tm-pick-train')).toHaveCount(3);
 await page.locator('[data-status="late"]').click();
 await expect(page.locator('.tm-pick-train')).toHaveCount(1);
 await expect(page.locator('#tm-drawer')).toContainText('100 %');
 await page.locator('[data-status="all"]').click();
 await page.locator('#tm-search').fill('Valence');
 await expect(page.locator('.tm-pick-train')).toHaveCount(1);
 await page.locator('.tm-pick-train').click();
 await expect(page.locator('#tm-drawer')).toContainText('Valence-TGV');
 await expect(page.locator('#tm-drawer')).toContainText('+8 min');
 await expect(page.locator('#tm-drawer')).toContainText('position GPS');
 await page.locator('#tm-follow').click();
 await expect(page.locator('#tm-follow')).toContainText('Suivi enregistré');
 await page.locator('#tm-isolate').click();
 await expect(page.locator('#tm-isolate')).toContainText('Tous les trains');
 await page.reload();
 await page.locator('#tm-tab-direct').click();
 await page.locator('#tm-search').fill('Valence');
 await page.locator('.tm-pick-train').click();
 await expect(page.locator('#tm-follow')).toContainText('Suivi enregistré');
});
test('train map responsive on desktop tablet and narrow mobile, with no horizontal overflow',async({page})=>{
 await mock(page);await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('#tm-state')).toContainText('trains associés');
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:860});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await expect(page.locator('#tm-search')).toBeVisible();
  await expect(page.locator('#tm-map')).toBeVisible();
 }
 await page.setViewportSize({width:390,height:860});
 await page.locator('#sidebar-toggle').click();
 await expect(page.locator('#atlas-sidebar')).toBeInViewport();
});
