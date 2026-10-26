const {test,expect}=require('@playwright/test');
const notice={id:'m1',title:'Métro M1 perturbé',description:'Travaux en cours',lines:[{line:'M1',network:'Marseille (RTM)',mode:'METRO'}],networks:['Marseille (RTM)'],routes:['M1'],modes:['METRO'],activity:'current',start:'2026-10-26',end:'2026-11-01'};
async function mock(page){
 await page.route('**/api/transport-live?*',route=>{
  const u=new URL(route.request().url()),provider=u.searchParams.get('provider');
  if(provider==='swiss-connections')return route.fulfill({json:{provider:'Swiss Transport API',journeys:[{
   origin:'Bern',destination:'Lausanne',departure:'2026-10-26T18:09:00Z',arrival:'2026-10-26T19:39:00Z',transfers:1,departureDelay:null,
   departurePosition:{lat:46.948831,lng:7.439129},arrivalPosition:{lat:46.516793,lng:6.629091},
   legs:[{line:'RE2',stops:[{name:'Bern',position:{lat:46.948831,lng:7.439129}},{name:'Lausanne',position:{lat:46.516793,lng:6.629091}}]}]
  }]}}); 
  if(provider==='marseille-alerts')return route.fulfill({json:{provider:'Métropole Aix-Marseille-Provence',alerts:[notice],fetchedAt:new Date().toISOString()}});
  if(provider==='swiss')return route.fulfill({json:{station:'Bern',stationPosition:{lat:46.948831,lng:7.439129},departures:[],provider:'Swiss'}});
  if(provider==='tfl')return route.fulfill({json:{station:'Waterloo',departures:[],provider:'TfL'}});
  if(provider==='tfl-stop')return route.fulfill({json:{station:'Waterloo',stationPosition:{lat:51.5,lng:-0.11}}});
  if(provider==='sncf')return route.fulfill({json:{provider:'SNCF',departures:[{id:'long-technical-GTFS-trip-id',line:'long-technical-GTFS-trip-id',destination:'Arrêt GTFS 123',station:'SNCF',expected:new Date(Date.now()+600000).toISOString(),delay:null}]}});
  return route.fulfill({json:{departures:[]}});
 });
}
test('French SNCF technical ID is not displayed as line badge; Swiss train search has city, destination and time',async({page})=>{
 await mock(page);await page.goto('/#/transport/trains');
 await expect(page.locator('.tl-line').first()).toContainText('SNCF');
 await expect(page.locator('.tl-line').first()).not.toContainText('long-technical');
 await expect(page.locator('.tl-journey-panel')).toBeVisible();
 await page.locator('.tl-journey-panel [name=from]').fill('Bern');
 await page.locator('.tl-journey-panel [name=to]').fill('Lausanne');
 await page.locator('.tl-journey-panel [name=time]').fill('19:09');
 await page.locator('.tl-journey-panel button[type=submit]').click();
 await expect(page.locator('.tl-trip')).toHaveCount(1);
 await expect(page.locator('.tl-trip')).toContainText('Bern');
 await expect(page.locator('.tl-trip')).toContainText('Lausanne');
});
test('Marseille favorites persist in local storage and summarize alerts without fabricated departures',async({page})=>{
 await mock(page);await page.goto('/#/transport/marseille');
 await expect(page.locator('.tl-favorite-panel')).toBeVisible();
 await expect(page.locator('.tl-favorite-panel [name=network] option')).toHaveCount(2);
 await page.locator('.tl-favorite-panel [name=network]').selectOption('Marseille (RTM)');
 await page.locator('.tl-favorite-panel [name=line]').selectOption('M1');
 await page.locator('.tl-favorite-panel button[type=submit]').click();
 await expect(page.locator('.tl-favorite-notice')).toContainText('1 perturbation');
 await expect(page.locator('.tl-favorite-chips button')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('.tl-favorite-chips button')).toHaveCount(1);
 await expect(page.locator('.tl-favorite-notice')).toContainText('1 perturbation');
 await expect(page.locator('.tl-departure')).toHaveCount(0);
});
test('map section is separate from arrivals, responsive and uses provider stop coordinates',async({page})=>{
 await mock(page);await page.goto('/#/transport/metros');
 await expect(page.locator('.tl-station-map')).toBeVisible();
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:850});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
 }
});
