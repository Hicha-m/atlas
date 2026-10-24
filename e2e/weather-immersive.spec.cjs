const {test,expect}=require('@playwright/test');
const start=new Date('2026-10-24T12:00:00Z');
const days=Array.from({length:10},(_,i)=>new Date(Date.UTC(2026,9,24+i)).toISOString().slice(0,10));
const times=days.flatMap(d=>Array.from({length:24},(_,h)=>d+'T'+String(h).padStart(2,'0')+':00'));
const standard={
 timezone:'Europe/Paris',
 current:{time:'2026-10-24T12:00',temperature_2m:18,relative_humidity_2m:66,apparent_temperature:16.4,precipitation:0,weather_code:2,wind_speed_10m:15,is_day:1,wind_direction_10m:210},
 hourly:{time:times,temperature_2m:times.map((_,i)=>17+(i%24)/8),weather_code:times.map((_,i)=>i%8===0?61:2),
  precipitation_probability:times.map((_,i)=>i%7===0?70:15),is_day:times.map((_,i)=>i%24<19&&i%24>=8?1:0),relative_humidity_2m:times.map(()=>66),wind_speed_10m:times.map(()=>16)},
 daily:{time:days,weather_code:[2,1,3,61,1,2,0,3,2,1],temperature_2m_max:[22,21,20,18,23,19,20,21,22,18],
  temperature_2m_min:[12,11,10,9,10,8,11,13,12,10],
  precipitation_probability_max:[20,10,40,75,15,20,2,20,50,10],precipitation_sum:[0,0,1,5,0,0,0,1,2,0],
  sunrise:days.map(d=>d+'T07:55'),sunset:days.map(d=>d+'T18:22'),uv_index_max:days.map(()=>3.7)}
};
const air={current:{european_aqi:26,pm2_5:7.3,grass_pollen:4,birch_pollen:null,olive_pollen:null}};
async function fixtures(page,opts={}){
 const counters={forecast:0,air:0,geo:0};
 await page.route('https://api.open-meteo.com/v1/forecast**',route=>{
  counters.forecast++;
  if(opts.failWeather)return route.fulfill({status:503,body:'Unavailable'});
  return route.fulfill({status:200,json:standard});
 });
 await page.route('https://air-quality-api.open-meteo.com/**',route=>{
  counters.air++;
  if(opts.failAir)return route.fulfill({status:503,body:'Unavailable'});
  return route.fulfill({status:200,json:air});
 });
 await page.route('https://geocoding-api.open-meteo.com/**',route=>{
  counters.geo++;
  return route.fulfill({status:200,json:{results:[{name:'Paris',country:'France',latitude:48.8566,longitude:2.3522}]}});
 });
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOwB+3QAAAAASUVORK5CYII=','base64')}));
 return counters;
}
test('immersion: show actual provider-based forecast, ten days, air and original layout',async({page},info)=>{
 await fixtures(page);
 await page.goto('/#/weather/immersive');
 await expect(page.getByRole('heading',{name:'Météo immersive'})).toBeVisible();
 await expect(page.locator('.wi-current-temp')).toHaveText('18°');
 await expect(page.locator('.wi-hour')).toHaveCount(18);
 await expect(page.locator('button.wi-day')).toHaveCount(10);
 await expect(page.locator('.wi-metric')).toHaveCount(8);
 await expect(page.locator('.wi-metric').nth(6)).toContainText('Correct');
 await expect(page.locator('.wi-metric').nth(7)).toContainText('grains/m³');
 await expect(page.locator('#wi-mini-map')).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(2);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:info.outputPath('immersive-'+info.project.name+'.png'),fullPage:true,animations:'disabled'});
 await page.locator('button.wi-day').nth(3).click();
 await expect(page.locator('button.wi-day').nth(3)).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#wi-day-detail')).toContainText('Pluie');
});
test('favorite places, geocoding, saved cookie and classic route work',async({page})=>{
 const count=await fixtures(page);
 await page.goto('/#/weather/immersive');
 await expect(page.locator('.wi-current-temp')).toBeVisible();
 await page.locator('#wi-favorite').click();
 await expect(page.locator('#wi-favorite')).toHaveAttribute('aria-pressed','true');
 await page.locator('#wi-location-trigger').click();
 await expect(page.getByRole('dialog',{name:'Mes lieux'})).toBeVisible();
 await expect(page.locator('#wi-favorites')).toContainText('Marseille');
 await page.locator('#wi-place-search').fill('Par');
 await expect(page.locator('#wi-search-results .wi-place').first()).toContainText('Paris',{timeout:10000});
 await page.locator('#wi-search-results .wi-place').first().click();
 await expect(page.locator('.wi-location-trigger')).toContainText('Paris');
 await expect.poll(async()=>page.context().cookies().then(cs=>cs.some(x=>x.name==='atlas_weather_location'&&decodeURIComponent(x.value).includes('Paris')))).toBeTruthy();
 await page.reload();
 await expect(page.locator('.wi-location-trigger')).toContainText('Paris');
 await page.locator('#wi-location-trigger').click();
 await expect(page.locator('#wi-favorites')).toContainText('Marseille');
 await page.getByRole('button',{name:'Fermer'}).click();
 await page.locator('.atlas-region-links a[href="#/weather/overview"]').click();
 await expect(page.getByRole('heading',{name:/Météo mondiale/})).toBeVisible();
 expect(count.geo).toBeGreaterThan(0);
});
test('unit °F persists and does not trigger a forecast fetch',async({page})=>{
 const count=await fixtures(page);
 await page.goto('/#/weather/immersive');
 await expect(page.locator('.wi-current-temp')).toHaveText('18°');
 await page.locator('#wi-settings-trigger').click();
 await expect(page.getByRole('dialog',{name:'Paramètres météo'})).toBeVisible();
 await page.getByRole('button',{name:'°F'}).click();
 await expect(page.locator('.wi-current-temp')).toHaveText('64°');
 expect(count.forecast).toBe(1);
 await page.reload();
 await expect(page.locator('.wi-current-temp')).toHaveText('64°');
});
test('optional air API outage shows unavailable instead of inventing AQI',async({page})=>{
 await fixtures(page,{failAir:true});
 await page.goto('/#/weather/immersive');
 await expect(page.locator('.wi-metric').nth(6)).toContainText('Service indisponible');
 await expect(page.locator('.wi-metric').nth(6).locator('.wi-metric-value')).toHaveText('—');
 await expect(page.locator('.wi-current-temp')).toHaveText('18°');
});
test('weather forecast outage shows actionable retry error',async({page})=>{
 await fixtures(page,{failWeather:true});
 await page.goto('/#/weather/immersive');
 await expect(page.getByRole('alert')).toContainText('Prévisions indisponibles');
 await expect(page.locator('#wi-retry')).toBeVisible();
});
test('weather view retains old Atlas routes and responsive mobile layout',async({page})=>{
 await fixtures(page);
 await page.goto('/#/weather/overview');
 await expect(page.getByRole('heading',{name:/Météo mondiale/})).toBeVisible();
 await page.getByRole('link',{name:/Météo immersive/}).last().click();
 await expect(page.getByRole('heading',{name:'Météo immersive'})).toBeVisible();
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:850});
  await expect(page.locator('.wi-hero')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 }
});

test('Atlas module entry opens explicit weather choices and highlights selected sidebar view',async({page})=>{
 await fixtures(page);
 await page.goto('/#/weather');
 await expect(page.getByRole('heading',{name:'Choisir votre météo'})).toBeVisible();
 await expect(page.locator('.module-choice')).toHaveCount(2);
 await page.locator('.module-choice[href="#/weather/immersive"]').click();
 await expect(page.locator('.wi-current-temp')).toBeVisible();
 await expect(page.locator('.atlas-region-links a[href="#/weather/immersive"]')).toHaveClass(/active/);
 await expect(page.locator('.wi-section-switch')).toHaveCount(0);
 await expect(page.locator('.wi-top-link')).toHaveCount(0);
 await expect(page.locator('.wi-hour-graph path')).toHaveAttribute('d',/L/);
 await expect(page.locator('#wi-city-quick')).toBeVisible();
 await page.locator('#wi-city-quick').click();
 await expect(page.getByRole('dialog',{name:'Mes lieux'})).toBeVisible();
});
test('electricity entry offers regions without silently starting France view',async({page})=>{
 await page.goto('/#/electricity');
 await expect(page.getByRole('heading',{name:'Explorer l’électricité'})).toBeVisible();
 await expect(page.locator('.module-choice')).toHaveCount(3);
 await expect(page.locator('#electricity-content')).toHaveCount(0);
});
test('mobile sidebar is off-canvas, opened by menu and swipe, and closes after selection',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/');
 await expect(page.locator('#sidebar-toggle')).toBeVisible();
 await expect(page.locator('#atlas-sidebar')).not.toBeInViewport();
 await page.locator('#sidebar-toggle').click();
 await expect(page.locator('#atlas-sidebar')).toBeInViewport();
 await page.locator('#atlas-sidebar a[href="#/weather"]').click();
 await expect(page.getByRole('heading',{name:'Choisir votre météo'})).toBeVisible();
 await expect(page.locator('#atlas-sidebar')).not.toBeInViewport();
 await page.evaluate(()=>{
  const start=new Touch({identifier:1,target:document.body,clientX:innerWidth-5,clientY:400});
  const end=new Touch({identifier:1,target:document.body,clientX:innerWidth-150,clientY:408});
  document.dispatchEvent(new TouchEvent('touchstart',{touches:[start],targetTouches:[start],changedTouches:[start],bubbles:true}));
  document.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:[end],bubbles:true}));
 });
 await expect(page.locator('#atlas-sidebar')).toBeInViewport();
 await page.locator('#sidebar-close').click();
 await expect(page.locator('#atlas-sidebar')).not.toBeInViewport();
});
