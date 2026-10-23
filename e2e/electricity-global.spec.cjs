const {test,expect}=require('@playwright/test');
const countries=[
 {id:'france',name:'France',iso3:'FRA',year:2025,total_generation_twh:550,demand_twh:480,carbon_intensity_gco2_kwh:45,net_imports_twh:-70,generation_twh:{nuclear:350,hydro:65,wind:55,solar:45,gas:35},share_pct:{nuclear:63.6,hydro:11.8,wind:10,solar:8.2,gas:6.4}},
 {id:'germany',name:'Germany',iso3:'DEU',year:2024,total_generation_twh:500,demand_twh:510,carbon_intensity_gco2_kwh:320,net_imports_twh:10,generation_twh:{coal:100,wind:140,solar:70},share_pct:{coal:20,wind:28,solar:14}},
 {id:'japan',name:'Japan',iso3:'JPN',year:2024,total_generation_twh:950,demand_twh:980,carbon_intensity_gco2_kwh:450,net_imports_twh:30,generation_twh:{gas:300},share_pct:{gas:31.6}}
];
const shapes={type:'FeatureCollection',features:[
 {type:'Feature',id:'FRA',properties:{name:'France'},geometry:{type:'Polygon',coordinates:[[[0,42],[8,42],[8,51],[0,51],[0,42]]]}},
 {type:'Feature',id:'DEU',properties:{name:'Germany'},geometry:{type:'Polygon',coordinates:[[[8,47],[15,47],[15,55],[8,55],[8,47]]]}},
 {type:'Feature',id:'JPN',properties:{name:'Japan'},geometry:{type:'Polygon',coordinates:[[[130,31],[141,31],[141,44],[130,44],[130,31]]]}}
]};
test.beforeEach(async({page})=>{
 await page.route('https://worldpowermonitor.com/data/files/country-summary.json',r=>r.fulfill({json:{meta:{source:'Ember'},countries}}));
 await page.route('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',r=>r.fulfill({json:shapes}));
});
test('world view displays map, historical disclaimer, 3 countries and country details',async({page})=>{
 await page.goto('/#/electricity/world');
 await expect(page.locator('#global-message')).toContainText('3 pays');
 await expect(page.locator('#elec-world-map .leaflet-interactive').first()).toBeVisible();
 await expect(page.locator('.elec-global-warning')).toContainText('pas du temps réel');
 await page.locator('#global-search-country').fill('Japan');
 await expect(page.locator('.elec-global-table tbody tr')).toHaveCount(1);
 await page.locator('.elec-global-table tbody a').click();
 await expect(page.locator('.elec-country-detail h2')).toContainText('Japan');
 await expect(page.locator('.elec-global-kpis')).toContainText('950');
});
test('Europe excludes Japan and allows switching to carbon metric',async({page})=>{
 await page.goto('/#/electricity/europe');
 await expect(page.locator('#global-message')).toContainText('3 pays');
 await expect(page.locator('.elec-global-table tbody tr')).toHaveCount(2);
 await expect(page.locator('.elec-global-table')).not.toContainText('Japan');
 await page.locator('#global-metric').selectOption('carbon');
 await expect(page.locator('.elec-global-table tbody tr').first()).toContainText('Germany');
});
test('missing source is reported without invented country values',async({page})=>{
 await page.route('https://worldpowermonitor.com/data/files/country-summary.json',r=>r.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/#/electricity/world');
 await expect(page.locator('#global-message')).toContainText('HTTP 503');
 await expect(page.locator('.elec-global-error')).toContainText('Aucune valeur fictive');
});
