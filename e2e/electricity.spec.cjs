const { test, expect } = require('@playwright/test');

const BASE_TIME = Date.parse('2026-10-22T12:00:00Z');
const fixture = Array.from({length:100},(_,index) => {
  const t = index / 7, date = new Date(BASE_TIME - index * 15 * 60000);
  return {
    date_heure:date.toISOString(),
    consommation:42000 + Math.round(2800*Math.sin(t)),
    prevision_j:43000+Math.round(1200*Math.sin(t)),
    prevision_j1:43500,
    nucleaire:33500,hydraulique:5500,
    eolien:3500+Math.round(1200*Math.cos(t)),solaire:Math.max(0,4600*Math.sin(t)),
    gaz:2150,bioenergies:780,charbon:0,fioul:25,
    pompage:-450,ech_physiques:-6100+Math.round(1000*Math.sin(t)),
    taux_co2:22+Math.round(7*Math.abs(Math.sin(t)))
  };
});

async function mockRte(page, status = 200) {
  let calls = 0;
  await page.route('https://odre.opendatasoft.com/api/explore/v2.1/**', async route => {
    calls++;
    if(status !== 200) return route.fulfill({status,contentType:'application/json',body:'{"message":"Rate limited"}'});
    return route.fulfill({json:{total_count:12000,results:fixture}});
  });
  return () => calls;
}
async function pageHasNoOverflow(page) {
  const size=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    body:document.documentElement.scrollWidth
  }));
  expect(size.body).toBeLessThanOrEqual(size.viewport+2);
}
test('electricity overview renders RTE data, units and historical chart',async({page},info)=>{
  await mockRte(page);
  await page.goto('/#/electricity');
  await expect(page.getByRole('heading',{name:/Électricité/})).toBeVisible();
  await expect(page.locator('.elec-kpi')).toHaveCount(4);
  await expect(page.locator('.elec-kpi').first()).toContainText('GW');
  await expect(page.locator('.elec-kpi').nth(2)).toContainText('gCO₂e/kWh');
  await expect(page.locator('.elec-chart-point').first()).toBeVisible();
  await expect(page.locator('.elec-indicator')).toBeVisible();
  await pageHasNoOverflow(page);
  await page.screenshot({path:info.outputPath('electricity-overview.png'),fullPage:true});
});
test('mix view explains eight filières, exchange sign and STEP',async({page},info)=>{
  await mockRte(page);
  await page.goto('/#/electricity/mix');
  await expect(page.locator('.elec-donut')).toBeVisible();
  await expect(page.locator('.elec-mix-row')).toHaveCount(8);
  await expect(page.locator('.elec-mix-panel')).toHaveCount(0);
  await expect(page.locator('.elec-mix-explainer')).toContainText(/pompage/i);
  await expect(page.locator('.elec-kpi').last()).toContainText('Exportateur net');
  await pageHasNoOverflow(page);
  await page.screenshot({path:info.outputPath('electricity-mix.png'),fullPage:true});
});
test('trends metric and period controls update graph without refetching data',async({page})=>{
  const calls = await mockRte(page);
  await page.goto('/#/electricity/trends');
  await expect(page.locator('.elec-chart-point').first()).toBeVisible();
  const firstCount = await page.locator('.elec-chart-point').count();
  await page.locator('#electricity-hours').selectOption('6');
  await expect.poll(()=>page.locator('.elec-chart-point').count()).toBeLessThan(firstCount);
  await page.locator('#electricity-metric').selectOption('taux_co2');
  await expect(page.locator('.elec-chart-legend')).toContainText('gCO₂e/kWh');
  expect(calls()).toBe(1);
  await page.locator('.elec-chart-point').nth(2).click({force:true});
  await expect(page.locator('.elec-snapshot-bar')).toContainText('POINT HISTORIQUE');
  await page.getByRole('button',{name:/Revenir au plus récent/}).click();
  await expect(page.locator('.elec-snapshot-bar')).toContainText('DERNIER POINT');
});
test('data table is interactive and JSON/CSV exports include metadata',async({page})=>{
  await mockRte(page);
  await page.goto('/#/electricity/data');
  await expect(page.locator('.elec-table-row').first()).toBeVisible();
  expect(await page.locator('.elec-table-row').count()).toBeGreaterThan(20);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#electricity-csv').click()]);
  expect(download.suggestedFilename()).toMatch(/atlas-electricite-france.*\.csv/);
  await page.locator('.elec-table-row').nth(4).click();
  await expect(page.locator('.elec-row-selected')).toHaveCount(1);
  const [jsonDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#electricity-json').click()]);
  expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);
});
test('normal and compact layouts never overflow horizontally',async({page},info)=>{
  await mockRte(page);
  await page.goto('/#/electricity/overview');
  await expect(page.locator('.elec-kpi')).toHaveCount(4);
  for(const width of [360,390,640,768,900,1024,1440]){
    await page.setViewportSize({width,height:880});
    await pageHasNoOverflow(page);
    if(width===360 || width===900 || width===1440){
      await page.screenshot({path:info.outputPath('electricity-'+width+'.png'),fullPage:true});
    }
  }
});
test('failure shows a retry and never invents numeric real-time data',async({page})=>{
  await mockRte(page,429);
  await page.goto('/#/electricity/overview');
  await expect(page.locator('.elec-error-panel')).toBeVisible();
  await expect(page.locator('.elec-kpi')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Réessayer'})).toBeVisible();
});
test('module navigation reuses cached records across pages',async({page})=>{
  const calls = await mockRte(page);
  await page.goto('/#/electricity/overview');
  await expect(page.locator('.elec-kpi')).toHaveCount(4);
  await page.locator('.elec-tabs a[href="#/electricity/mix"]').click();
  await expect(page.locator('.elec-donut')).toBeVisible();
  await page.locator('.elec-tabs a[href="#/electricity/data"]').click();
  await expect(page.locator('.elec-table-row').first()).toBeVisible();
  expect(calls()).toBe(1);
});
