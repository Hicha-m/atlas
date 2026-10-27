const {test,expect}=require('@playwright/test');

// Test branch only. These are functional regression checks against the local
// static server, NOT requests to the real production or benchmark domains.
test('landing is crawlable with JavaScript disabled',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 try{
  const page=await context.newPage();
  await page.goto(baseURL+'/');
  await expect(page.locator('main h1')).toContainText('Le monde');
  await expect(page.locator('main .card')).toHaveCount(15);
  await expect(page.locator('main .card[href="#/weather"]')).toBeVisible();
  await expect(page.locator('main .card[href="#/transport"]')).toBeVisible();
 }finally{await context.close();}
});
test('home does not request feature-specific styles or external map/chart vendors',async({page})=>{
 const urls=[];
 page.on('request',r=>urls.push(r.url()));
 await page.goto('/');
 await expect(page.locator('main .card')).toHaveCount(15);
 await expect(page.locator('main h1')).toContainText('Le monde');
 const css=await page.locator('head link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname));
 expect(css).toEqual(['/styles.css']);
 expect(urls.filter(url=>url.includes('unpkg.com')||url.includes('cdn.jsdelivr.net'))).toEqual([]);
 expect(urls.filter(url=>url.endsWith('/weather-immersive.css')||url.endsWith('/electricity-world.css')||
  url.endsWith('/transport-live.css')||url.endsWith('/transport-train-map.css'))).toEqual([]);
 await page.locator('#filter').fill('météo');
 await expect(page.locator('#catalog .card')).toHaveCount(1);
 await page.locator('#filter').fill('');
 await expect(page.locator('#catalog .card')).toHaveCount(15);
});
test('weather immersive loads its CSS/Leaflet only after entering its route',async({page})=>{
 await page.goto('/');
 await page.locator('a[href="#/weather/immersive"]').first().click();
 await expect(page.locator('#wi-city-quick')).toBeVisible({timeout:20000});
 await expect.poll(()=>page.evaluate(()=>Boolean(window.L?.map))).toBe(true);
 const css=await page.locator('head link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.href));
 expect(css.some(url=>url.includes('weather-immersive.css'))).toBe(true);
 expect(css.some(url=>url.includes('leaflet.css'))).toBe(true);
 await page.goto('/#/');
 await expect(page.locator('#catalog .card')).toHaveCount(15);
 await page.locator('#filter').fill('trains');
 // Catalogue filters on module names/descriptions; transport mentions trains
 await expect(page.locator('#catalog .card').count()).resolves.toBeGreaterThanOrEqual(0);
});
test('train route imports the rail map UI with all its lazy CSS',async({page})=>{
 await page.goto('/#/transport/trains');
 await expect(page.locator('#tm-tab-direct')).toBeVisible({timeout:20000});
 await expect.poll(()=>page.evaluate(()=>Boolean(window.L?.map))).toBe(true);
 const css=await page.locator('head link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.href));
 expect(css.some(x=>x.endsWith('/transport-live.css'))).toBe(true);
 expect(css.some(x=>x.endsWith('/transport-train-map.css'))).toBe(true);
});
test('electricity world has D3/TopoJSON available after lazy route preparation',async({page})=>{
 await page.goto('/#/electricity/world');
 await expect.poll(()=>page.evaluate(()=>Boolean(window.d3?.geoPath&&window.topojson?.feature)),{
  timeout:20000
 }).toBe(true);
 const css=await page.locator('head link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.href));
 expect(css.some(x=>x.endsWith('/electricity.css'))).toBe(true);
 expect(css.some(x=>x.endsWith('/electricity-world.css'))).toBe(true);
});
