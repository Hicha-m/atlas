const {test,expect}=require('@playwright/test');

test('train station markers remain selectable across repeated filters without another API request',async({page})=>{
 let requests=0;
 await page.route('**/api/transport-live?*',route=>route.fulfill({json:{provider:'SNCF',departures:[]}}));
 await page.route('**/api/train-map',route=>{
  requests++;
  return route.fulfill({json:{
   sourceTotal:3,totalWithAnchors:3,selectedCount:3,feedUpdated:new Date().toISOString(),referencePartial:false,
   markers:[
    {id:'ter-1',kind:'TER',number:'111',status:'ontime',delay:0,stopCode:'87751009',stationName:'Marseille Saint-Charles',lat:43.302,lng:5.38},
    {id:'tgv-2',kind:'TGV',number:'222',status:'late',delay:7,stopCode:'87751009',stationName:'Marseille Saint-Charles',lat:43.302,lng:5.38},
    {id:'ter-3',kind:'TER',number:'333',status:'unknown',delay:null,stopCode:'87751016',stationName:'Gare voisine',lat:43.42,lng:5.33}
   ]
  }});
 });
 await page.goto('/#/transport/trains');
 await page.locator('#tm-tab-direct').click();
 await expect(page.locator('#tm-data-footer')).toContainText('3 train(s) géoréférencés · 2 gare(s)');
 const map=page.locator('#tm-map');
 await expect(map.locator('canvas.leaflet-zoom-animated')).toHaveCount(1);
 await page.locator('[data-kind="TGV"]').click();
 await expect(page.locator('#tm-data-footer')).toContainText('1 train(s) géoréférencés · 1 gare(s)');
 await page.locator('[data-kind="all"]').click();
 await expect(page.locator('#tm-data-footer')).toContainText('3 train(s) géoréférencés · 2 gare(s)');
 await page.locator('#tm-search').fill('gare voisine');
 await expect(page.locator('#tm-data-footer')).toContainText('1 train(s) géoréférencés · 1 gare(s)');
 await page.locator('#tm-search').fill('');
 await expect(page.locator('#tm-data-footer')).toContainText('3 train(s) géoréférencés · 2 gare(s)');
 expect(requests).toBe(1);
});
