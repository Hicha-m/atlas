const {test,expect}=require('@playwright/test');
const ROOT_TIME='2026-10-22T12:00:00Z';
const dates=['2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28'];
const hours=dates.flatMap(date=>Array.from({length:24},(_,hour)=>date+'T'+String(hour).padStart(2,'0')+':00'));
const weather={
 timezone:'Europe/Paris',
 current:{time:'2026-10-22T12:00',temperature_2m:18,relative_humidity_2m:65,apparent_temperature:17,precipitation:0,weather_code:2,wind_speed_10m:12},
 hourly:{time:hours,temperature_2m:hours.map((_,i)=>11+Math.sin(i/5)*5),
 relative_humidity_2m:hours.map(()=>70),precipitation_probability:hours.map(()=>15),wind_speed_10m:hours.map(()=>13)},
 daily:{time:dates,weather_code:[2,0,1,3,61,2,0],temperature_2m_max:[20,19,21,18,17,19,16],temperature_2m_min:[10,11,12,10,9,11,8],precipitation_sum:[0,0,0,1,3,0,0]}
};
const electricity=Array.from({length:100},(_,i)=>{
 const date=new Date(Date.parse(ROOT_TIME)-i*15*60000).toISOString();
 return {date_heure:date,consommation:45000+Math.round(2300*Math.sin(i/9)),prevision_j:44000,prevision_j1:45000,
 nucleaire:30500,hydraulique:5500,eolien:5200,solaire:Math.max(0,1900*Math.sin(i/14)),
 gaz:1500,bioenergies:700,charbon:0,fioul:40,pompage:-650,ech_physiques:-7100,taux_co2:17};
});
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date(ROOT_TIME)});
 await page.route('https://geocoding-api.open-meteo.com/**',route=>route.fulfill({json:{results:[{name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698}]}}));
 await page.route('https://api.open-meteo.com/**',route=>{
  const url=new URL(route.request().url()),coords=url.searchParams.get('latitude')||'';
  if(coords.includes(','))return route.fulfill({json:coords.split(',').map((_,i)=>({current:{temperature_2m:10+i/3}}))});
  return route.fulfill({json:weather});
 });
 await page.route('https://odre.opendatasoft.com/api/explore/**',route=>route.fulfill({json:{total_count:100,results:electricity}}));
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOwB+3QAAAAASUVORK5CYII=','base64')}));
});
async function settle(page){
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .elec-indicator,.elec-status-dot{box-shadow:none!important}'});
 await page.evaluate(()=>document.fonts.ready);
}
test('weather overview visual reference',async({page})=>{
 await page.goto('/#/weather/overview');
 await expect(page.locator('.day')).toHaveCount(7);
 await expect(page.locator('#chart .chart-point').first()).toBeVisible();
 await settle(page);
 await expect(page.locator('#app')).toHaveScreenshot('weather-overview.png',{animations:'disabled',maxDiffPixelRatio:0.015});
});
test('electricity dashboard visual reference',async({page})=>{
 await page.goto('/#/electricity/overview');
 await expect(page.locator('.elec-kpi')).toHaveCount(4);
 await expect(page.locator('.elec-chart-point').first()).toBeVisible();
 await settle(page);
 await expect(page.locator('#app')).toHaveScreenshot('electricity-overview.png',{animations:'disabled',maxDiffPixelRatio:0.015});
});
test('energy mix visual reference',async({page})=>{
 await page.goto('/#/electricity/mix');
 await expect(page.locator('.elec-mix-row')).toHaveCount(8);
 await settle(page);
 await expect(page.locator('#app')).toHaveScreenshot('electricity-mix.png',{animations:'disabled',maxDiffPixelRatio:0.015});
});
