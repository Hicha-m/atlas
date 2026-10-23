const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function expression(expr) {
  const sandbox = { URLSearchParams, Date, console };
  vm.createContext(sandbox);
  // Do not run the browser initialization; inspect tested pure functions instead.
  vm.runInContext(js.replace(/window\.addEventListener\('hashchange',render\);[\s\S]*$/, ''), sandbox);
  return vm.runInContext(expr, sandbox);
}

test('the page includes required application assets and landmarks', () => {
  for (const asset of ['app.js', 'styles.css']) assert.ok(html.includes(asset), `${asset} missing`);
  for (const selector of ['id="nav"', 'id="app"', 'id="clock"']) assert.ok(html.includes(selector), `${selector} missing`);
});

test('catalogue contains exactly 15 distinct modules', () => {
  const ids = Array.from(expression('modules.map(m => m[0])'));
  assert.equal(ids.length, 15);
  assert.equal(new Set(ids).size, 15);
  assert.equal(ids[0], 'weather');
});

test('HTML escaping prevents injected markup in dynamic text', () => {
  assert.equal(expression('safe(`<img src="x" onerror="bad()">`)'), '&lt;img src=&quot;x&quot; onerror=&quot;bad()&quot;&gt;');
});

test('missing weather values are rendered safely', () => {
  assert.equal(expression('fmt(null)'), '—');
  assert.equal(expression('fmt(12.34,1)'), '12.3');
});

test('weather categorization covers clear skies and storms', () => {
  assert.equal(expression('conditions(0)[1]'), 'Ciel dégagé');
  assert.equal(expression('conditions(95)[1]'), 'Orage');
});

test('weather API, geocoding and exports are implemented', () => {
  assert.match(js, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(js, /geocoding-api\.open-meteo\.com\/v1\/search/);
  assert.match(js, /function exportData/);
  assert.match(js, /application\/json/);
  assert.match(js, /text\/csv/);
});

test('responsive styles exist', () => {
  assert.match(css, /@media/);
});


test('selectable map UI has a supported map library and visible coordinates', () => {
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(js, /weatherMap\.on\('click'/);
  assert.match(js, /id="weather-map"/);
  assert.match(js, /updateCoordinates\(/);
});
test('chart exposes time labels, units, legends and point values', () => {
  assert.match(js, /chartMetrics=/);
  assert.match(js, /id="chart-summary"/);
  assert.match(js, /chart-tooltip/);
  assert.match(js, /chart-axis-label/);
  assert.match(js, /chart-point/);
});
test('constant series produces finite chart points', () => {
  const data = Array.from(expression('graphPoints([4,4,4])'));
  assert.equal(data.length,3);
  assert.ok(data.every(({x,y})=>Number.isFinite(x)&&Number.isFinite(y)));
});
test('chart metric declarations include units', () => {
  const units = Array.from(expression('Object.values(chartMetrics).map(metric=>metric.unit)'));
  assert.deepEqual(units,['°C','%','%','km/h']);
});


test('weather module exposes four navigable subpages', () => {
  for (const route of ['overview','map','heatmap','data']) assert.match(js,new RegExp("['\"]"+route+"['\"]"));
  assert.match(js, /function weatherPageFromHash/);
  assert.match(js, /weather-tabs/);
  assert.equal(expression("weatherPageFromHash('weather/heatmap')"),'heatmap');
  assert.equal(expression("weatherPageFromHash('weather/unknown')"),'overview');
});
test('zoom accepts Ctrl + wheel and does not capture ordinary scrolling', () => {
  assert.match(js,/e\.ctrlKey/);
  assert.match(js,/e\.preventDefault\(\)/);
  assert.match(js,/weatherMap\.setZoom/);
  assert.match(js,/passive:false/);
});
test('location cookies are constrained and may be deleted', () => {
  assert.match(js,/atlas_weather_location/);
  assert.match(js,/SameSite=Lax/);
  assert.match(js,/Max-Age=0/);
  assert.match(js,/Math\.abs\(p\.latitude\)>90/);
});
test('heatmap uses actual forecast grid samples with interpolation', () => {
  assert.match(js,/function heatGrid/);
  assert.match(js,/function ensureHeatCanvas/);
  assert.match(js,/L.GridLayer.extend/);
  assert.match(js,/heatOverlay.redraw/);
  assert.doesNotMatch(js,/weatherMap.on\('zoomend',scheduleHeatmap\)/);
  assert.doesNotMatch(js,/L.imageOverlay/);
  assert.match(js,/current:'temperature_2m'/);
  assert.match(js,/Actualiser la zone/);
});
test('temperature legend colors remain RGB values', () => {
  const c=Array.from(expression('temperatureColor(10,-5,30)'));
  assert.equal(c.length,3);
  assert.ok(c.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
});
test('repository shell includes global header and search', () => {
  assert.match(html,/class="global-header"/);
  assert.match(html,/id="global-search"/);
});
