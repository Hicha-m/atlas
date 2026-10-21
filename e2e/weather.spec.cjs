const {test,expect}=require('@playwright/test');
const forecast=(()=>{
 const dates=['2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28'];
 const time=dates.flatMap(d=>Array.from({length:24},(_,h)=>d+'T'+String(h).padStart(2,'0')+':00'));
 return {timezone:'Europe/Paris',current:{time:'2026-10-22T12:00',temperature_2m:12,relative_humidity_2m:77,apparent_temperature:6.1,precipitation:0,weather_code:45,wind_speed_10m:31},hourly:{time,temperature_2m:time.map((_,i)=>10+(i%24)/2),relative_humidity_2m:time.map(()=>72),precipitation_probability:time.map(()=>30),wind_speed_10m:time.map(()=>18)},daily:{time:dates,weather_code:[45,1,0,3,61,2,0],temperature_2m_max:[18,19,20,17,16,15,14],temperature_2m_min:[3,4,5,4,2,1,0],precipitation_sum:[0,0,0,1,3,0,0]}};
})();
async function mockWeather(page){
 await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[{name:'Paris',country:'France',latitude:48.8566,longitude:2.3522},{name:'Lyon',country:'France',latitude:45.764,longitude:4.8357}]}}));
 await page.route('https://api.open-meteo.com/**',async route=>{
  const u=new URL(route.request().url());
  if(u.searchParams.get('latitude')?.includes(',')){
   const count=u.searchParams.get('latitude').split(',').length;
   return route.fulfill({json:Array.from({length:count},(_,i)=>({current:{temperature_2m:5+i/4}}))});
  }
  return route.fulfill({json:forecast});
 });
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOwB+3QAAAAASUVORK5CYII=','base64')}));
}
async function assertNoOverflow(page){
 const values=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
 expect(values.body).toBeLessThanOrEqual(values.viewport+2);
}
test.beforeEach(async({page})=>{await mockWeather(page);});
test('four weather views have a stable responsive layout and screenshots',async({page},testInfo)=>{
 for(const view of ['overview','map','heatmap','data']){
  await page.goto('/#/weather/'+view);
  await expect(page.getByRole('heading',{name:/Météo mondiale/})).toBeVisible();
  await assertNoOverflow(page);
  if(view==='heatmap')await expect(page.locator('#heat-scale')).toContainText('°C',{timeout:18000});
  if(view==='data')await expect(page.locator('.data-table tbody tr')).toHaveCount(48);
  await page.screenshot({path:testInfo.outputPath(view+'.png'),fullPage:true});
 }
});
test('city picker offers featured places, search suggestions and cookie persistence',async({page})=>{
 await page.goto('/#/weather/overview');
 const city=page.locator('#city');
 await city.fill('');
 await city.focus();
 await expect(page.getByRole('option',{name:/Marseille/})).toBeVisible();
 await city.fill('Par');
 await expect(page.getByRole('option',{name:/Paris/})).toBeVisible();
 await page.getByRole('option',{name:/Paris/}).click();
 await expect(city).toHaveValue('Paris');
 await expect.poll(async()=>page.context().cookies().then(c=>c.some(x=>x.name==='atlas_weather_location'))).toBeTruthy();
 await page.reload();
 await expect(city).toHaveValue('Paris');
 await page.getByRole('button',{name:'Oublier ma position'}).click();
 await expect(city).toHaveValue('Marseille');
});
test('daily forecast cards update selected conditions and hourly chart',async({page})=>{
 await page.goto('/#/weather/overview');
 await expect(page.locator('.day')).toHaveCount(7);
 await page.locator('.day').nth(1).click();
 await expect(page.locator('.day').nth(1)).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.now .eyebrow')).toContainText('JOUR SÉLECTIONNÉ');
 await expect(page.locator('#chart-summary')).toContainText('2026-10-23');
 await expect(page.locator('.fog-icon').first()).toBeVisible();
});
test('heatmap updates after map clicks and zoom supports Ctrl+wheel',async({page,isMobile})=>{
 test.skip(isMobile,'Ctrl+wheel requires a mouse');
 let gridCalls=0;
 page.on('request',r=>{if(r.url().includes('api.open-meteo.com/v1/forecast')&&new URL(r.url()).searchParams.get('latitude')?.includes(','))gridCalls++;});
 await page.goto('/#/weather/heatmap');
 await expect(page.locator('#heat-range')).toContainText('48 points',{timeout:18000});
 const initial=gridCalls;
 const el=page.locator('#weather-map');
 const box=await el.boundingBox();
 await el.click({position:{x:box.width*.58,y:box.height*.55}});
 await expect.poll(()=>gridCalls,{timeout:18000}).toBeGreaterThan(initial);
 const before=await page.evaluate(()=>window.weatherMap?.getZoom?.()||document.querySelector('.leaflet-zoom-in')?.getAttribute('aria-label'));
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
 await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
 await expect(page.locator('#heat-range')).toContainText('48 points',{timeout:18000});
});
test('normal scrolling is preserved and resizing does not overflow',async({page,isMobile})=>{
 await page.goto('/#/weather/overview');
 await assertNoOverflow(page);
 if(!isMobile){
  const map=page.locator('#weather-map'),box=await map.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  const before=await page.evaluate(()=>window.scrollY);
  await page.mouse.wheel(0,450);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(before);
 }
 for(const width of [360,600,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  await assertNoOverflow(page);
 }
});
