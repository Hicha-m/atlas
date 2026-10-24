const {test,expect}=require('@playwright/test');
const datasets=[
 {id:1,title:'Réseau RTM Marseille',publisher:'Métropole Marseille',page_url:'https://transport.data.gouv.fr/datasets/rtm',resources:[
  {title:'Horaires GTFS',format:'GTFS',original_url:'https://example.org/rtm.zip',is_available:true},
  {title:'Positions GTFS RT',format:'GTFS-RT',original_url:'https://example.org/rtm.pb'}]},
 {id:2,title:'Transports Lyon',publisher:'Autorité Lyon',resources:[
  {title:'Données de référence',format:'NeTEx',original_url:'https://example.org/lyon.zip'}]}
];
async function route(page,code=200){
 await page.route('**/api/transport-catalogue',handler=>code===200?handler.fulfill({status:200,json:{datasets}}):handler.fulfill({status:502,json:{error:'upstream'}}));
}
test('Transports loads real provider metadata, filters by city and format, and downloads CSV',async({page})=>{
 await route(page);
 await page.goto('/#/transport');
 await expect(page.getByRole('heading',{name:'Transports publics'})).toBeVisible();
 await expect(page.locator('.tr-card')).toHaveCount(2);
 await page.locator('#tr-search').fill('Marseille');
 await expect(page.locator('.tr-card')).toHaveCount(1);
 await expect(page.locator('.tr-card')).toContainText('GTFS-RT');
 await page.locator('#tr-rt').check();
 await expect(page.locator('.tr-card')).toHaveCount(1);
 await page.locator('#tr-format').selectOption('NETEX');
 await expect(page.locator('.tr-card')).toHaveCount(0);
 await page.locator('#tr-format').selectOption('all');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#tr-export').click()]);
 expect(download.suggestedFilename()).toBe('atlas-transports-catalogue.csv');
 await page.locator('.tr-card details').first().click();
 await expect(page.locator('.tr-resource a').first()).toHaveAttribute('href','https://example.org/rtm.zip');
});
test('Transports reports upstream failure without fake departures',async({page})=>{
 await route(page,502);
 await page.goto('/#/transport');
 await expect(page.locator('.tr-error')).toBeVisible();
 await expect(page.locator('.tr-card')).toHaveCount(0);
 await expect(page.locator('#tr-export')).toBeDisabled();
});
test('Transports does not overflow desktop or mobile and sidebar remains functional',async({page})=>{
 await route(page);
 await page.goto('/#/transport');
 await expect(page.locator('.tr-card')).toHaveCount(2);
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:850});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 }
 await page.setViewportSize({width:390,height:850});
 await page.locator('#sidebar-toggle').click();
 await expect(page.locator('#atlas-sidebar')).toBeInViewport();
 await expect(page.locator('a[href="#/transport"].nav-link')).toHaveClass(/active/);
});
