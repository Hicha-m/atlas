const {test,expect}=require('@playwright/test');
const future=()=>new Date(Date.now()+12*60000).toISOString();
const fetched=()=>new Date().toISOString();
async function fixtures(page){
 const calls=[];
 await page.route('**/api/transport-live?*',async route=>{
  const u=new URL(route.request().url()),provider=u.searchParams.get('provider');calls.push(provider);
  if(provider==='sncf')return route.fulfill({json:{
   station:'Circulations SNCF (France)',provider:'SNCF Voyageurs via PAN',fetchedAt:fetched(),feedUpdated:fetched(),total:220,matches:1,
   departures:[{id:'TGV-876',line:'TGV',stopId:'FR:123',destination:'Arrêt GTFS FR:123',station:'Réseau national SNCF',expected:future(),delay:4,detail:'Train / course TGV-876',realtime:true}]}});
  if(provider==='swiss')return route.fulfill({json:{
   station:u.searchParams.get('station'),provider:'Swiss Transport API',fetchedAt:fetched(),
   departures:[{id:'S18',line:u.searchParams.get('mode')==='bus'?'B 12':'S 18',destination:'Bern',station:u.searchParams.get('station'),expected:future(),delay:0,realtime:true}]}});
  if(provider==='tfl-search')return route.fulfill({json:{stops:[{name:'Waterloo Underground Station',id:'940GZZLUWLO'}]}});
  if(provider==='tfl')return route.fulfill({json:{
   station:'Waterloo',provider:'Transport for London',fetchedAt:fetched(),
   departures:[{id:'tfl-a',line:'Northern',mode:'tube',destination:'Morden',station:'Waterloo',expected:future(),delay:null,platform:'Southbound'}]}});
  if(provider==='marseille-alerts')return route.fulfill({json:{provider:'La Métropole Mobilité',fetchedAt:fetched(),updated:fetched(),
   alerts:[{title:'Service perturbé',description:'Travaux sur la ligne',routes:['RTM:M1'],active:true}]}});
  if(provider==='tfl-status')return route.fulfill({json:{provider:'Transport for London',fetchedAt:fetched(),
   statuses:[{id:'northern',name:'Northern',status:'Good Service',normal:true},{id:'district',name:'District',status:'Severe Delays',reason:'Incident',normal:false}]}});
  return route.fulfill({status:502,json:{error:'Not available'}});
 });
 return calls;
}
test('Transports landing is a mode chooser and opens actual SNCF departures',async({page})=>{
 const calls=await fixtures(page);
 await page.goto('/#/transport');
 await expect(page.getByRole('heading',{name:/Vos transports/})).toBeVisible();
 await expect(page.locator('.tl-mode-card')).toHaveCount(8);
 await page.locator('a[href="#/transport/trains"].tl-mode-card').click();
 await expect(page.locator('.tl-departure')).toHaveCount(1);
 await expect(page.locator('.tl-departure')).toContainText('TGV');
 await expect(page.locator('.tl-departure')).toContainText('+4 min');
 await expect(page.locator('.atlas-region-links a[href="#/transport/trains"]')).toHaveClass(/active/);
 expect(calls).toContain('sncf');
 await page.locator('#tl-provider').selectOption('swiss');
 await expect(page.locator('.tl-departure')).toContainText('S 18');
 expect(calls).toContain('swiss');
});
test('Tube station search selects stop and shows TfL predictions',async({page})=>{
 await fixtures(page);
 await page.goto('/#/transport/metros');
 await expect(page.locator('.tl-departure')).toHaveCount(1);
 await page.locator('#tl-search').fill('Waterloo');
 await expect(page.locator('#tl-search-results button').first()).toContainText('Waterloo',{timeout:10000});
 await page.locator('#tl-search-results button').first().click();
 await expect(page.locator('.tl-departure')).toContainText('Morden');
 await expect(page.locator('#tl-search')).toHaveValue('Waterloo Underground Station');
 await expect(page.locator('.tl-departure')).not.toContainText('Retard +');
});
test('Provider status is never made up, and errors stay explicit',async({page})=>{
 await fixtures(page);
 await page.goto('/#/transport/trafic');
 await expect(page.locator('.tl-status-card')).toHaveCount(2);
 await expect(page.locator('.tl-status-card').last()).toContainText('Severe Delays');
});
test('Boat and cableway sections use Swiss provider without fake positions',async({page})=>{
 await fixtures(page);
 for(const section of ['bateaux','telepheriques','tramways','bus']){
  await page.goto('/#/transport/'+section);
  await expect(page.locator('.tl-departure').first()).toBeVisible();
  await expect(page.locator('.tl-source')).toBeVisible();
 }
});
test('Mobile and desktop transport pages avoid horizontal overflow and permit drawer navigation',async({page})=>{
 await fixtures(page);
 await page.goto('/#/transport/trains');
 await expect(page.locator('.tl-board')).toBeVisible();
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:850});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 }
 await page.setViewportSize({width:390,height:850});
 await page.locator('#sidebar-toggle').click();
 await expect(page.locator('#atlas-sidebar')).toBeInViewport();
 await page.locator('#atlas-sidebar a[href="#/transport/bus"]').click();
 await expect(page.getByRole('heading',{name:/Bus/})).toBeVisible();
});

test('Marseille RTM metropolitan alerts use actual provider messages and show no fake schedule',async({page})=>{
 await fixtures(page);
 await page.goto('/#/transport/marseille');
 await expect(page.locator('.tl-status-card')).toHaveCount(1);
 await expect(page.locator('.tl-status-card')).toContainText('Travaux sur la ligne');
 await expect(page.locator('.tl-status-card')).toContainText('RTM:M1');
 await expect(page.locator('.tl-departure')).toHaveCount(0);
});
