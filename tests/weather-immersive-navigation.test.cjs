const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'weather-immersive.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'weather-immersive.css'), 'utf8');

test('weather view switch exists in the persistent shell, before async weather data', () => {
 const shell = source.slice(source.indexOf('const rootHtml='), source.indexOf('root.innerHTML=rootHtml()'));
 assert.match(shell, /<nav class="wi-section-switch" aria-label="Choisir une interface météo">/);
 assert.match(shell, /href="#\\/weather\\/overview"/);
 assert.match(shell, /href="#\\/weather\\/immersive"/);
 assert.ok(shell.indexOf('wi-section-switch') < shell.indexOf('id="wi-body"'));
});

test('loading and error render only in data panel, not in weather view selector', () => {
 const build = source.slice(source.indexOf('function build(){'), source.indexOf('function startMap(){'));
 assert.match(build, /panel\.innerHTML='<div class="wi-skeleton"/);
 assert.match(build, /panel\.innerHTML='<section class="wi-error"/);
 assert.doesNotMatch(build, /panel\.innerHTML='<div class="wi-section-switch"/);
});

test('mobile switch remains readable and keyboard reachable', () => {
 assert.match(css, /\.wi-section-switch a:focus-visible/);
 assert.match(css, /\.wi-section-switch\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
