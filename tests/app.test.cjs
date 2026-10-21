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
