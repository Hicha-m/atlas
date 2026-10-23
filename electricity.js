import {
  ELECTRICITY_SOURCE, ENERGY_SOURCES, METRIC_OPTIONS, electricityApiUrl,
  normaliseElectricityResponse, windowRecords, mixBreakdown, lowCarbonShare,
  exchangeStatus, freshness, metricValue, finiteNumber
} from './electricity-data.js';

const EUR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const PRECISE = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TABS = [
  { id: 'overview', title: 'Vue d’ensemble', icon: '◫' },
  { id: 'mix', title: 'Mix énergétique', icon: '◉' },
  { id: 'trends', title: 'Historique', icon: '⌁' },
  { id: 'data', title: 'Données', icon: '▤' },
  { id: 'europe', title: 'Europe', icon: '🇪🇺' },
  { id: 'world', title: 'Monde', icon: '🌍' }
];
const CACHE_DURATION_MS = 5 * 60 * 1000;
const electricalCache = { rows: [], fetchedAt: 0 };
const state = { root: null, active: false, page: 'overview', hours: 24, metric: 'consommation',
  selectedTimestamp: null, busy: false, error: null, loaded: false, request: 0, abort: null,
  showForecast: true };
const E = selector => state.root?.querySelector(selector) || null;

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}
function localTime(value, compact = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit', month: compact ? '2-digit' : 'short',
    hour: '2-digit', minute: '2-digit',
    ...(compact ? {} : { year: 'numeric' })
  }).format(new Date(value));
}
function fmt(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return (digits ? PRECISE : EUR).format(value);
}
function power(value, digits = 1) {
  const n = finiteNumber(value);
  return n === null ? '—' : fmt(n / 1000, digits) + ' GW';
}
function numberWithUnit(value, unit = '', digits = 0) {
  const n = finiteNumber(value);
  return n === null ? '—' : fmt(n, digits) + (unit ? ' ' + unit : '');
}
function usable() {
  return windowRecords(electricalCache.rows, state.hours);
}
function selection() {
  const rows = usable();
  return rows.find(row => row.timestamp === state.selectedTimestamp) || rows[rows.length - 1] || null;
}
function latest() {
  return electricalCache.rows[electricalCache.rows.length - 1] || null;
}
function indicator(row) {
  if (!row) return '<span class="elec-indicator elec-stale">Données non chargées</span>';
  const info = freshness(row.timestamp);
  return '<span class="elec-indicator elec-' + info.status + '"><span class="elec-status-dot"></span>' +
    (info.status === 'recent' ? 'Données récentes' : info.status === 'delayed' ? 'Données retardées' : 'Données anciennes') +
    '</span>';
}
function shell(page) {
  return '<div class="repo-heading elec-repo-heading">' +
    '<div class="repo-title"><span class="repo-icon elec-repo-icon" aria-hidden="true">ϟ</span>' +
    '<div><div class="repo-eyebrow">Atlas Live / Module 02 / RTE éCO₂mix</div>' +
    '<h1>Électricité <span class="state-pill">Actif</span></h1>' +
    '<p>Production, consommation et empreinte carbone du système électrique français.</p></div></div>' +
    '<div class="actions"><button type="button" class="btn" id="electricity-json">↓ JSON</button>' +
    '<button type="button" class="btn" id="electricity-csv">↓ CSV</button>' +
    '<button type="button" class="btn primary" id="electricity-refresh">↻ Actualiser</button></div></div>' +
    '<nav class="weather-tabs elec-tabs" aria-label="Vues du module électricité">' +
    TABS.map(tab => '<a class="weather-tab ' + (page === tab.id ? 'selected' : '') +
      '" href="#/electricity/' + tab.id + '"' + (page === tab.id ? ' aria-current="page"' : '') +
      '><span class="tab-icon" aria-hidden="true">' + tab.icon + '</span>' + tab.title + '</a>').join('') +
    '</nav><section class="elec-toolbar panel" aria-label="Filtres électricité">' +
    '<div class="elec-region"><span class="elec-flag" aria-hidden="true">🇫🇷</span><div><strong>France entière</strong>' +
    '<small>Données nationales RTE · Pas de 15 minutes</small></div></div>' +
    '<div class="elec-filters"><label for="electricity-hours">Période <select class="field" id="electricity-hours">' +
    '<option value="6">6 heures</option><option value="12">12 heures</option><option value="24">24 heures</option>' +
    '</select></label></div></section>' +
    '<div id="electricity-message" class="elec-message" role="status" aria-live="polite"></div>' +
    '<div id="electricity-content"></div>' +
    '<section class="panel elec-attribution"><div><strong>Source : RTE — éCO₂mix (ODRE)</strong>' +
    '<p>Mesures, télémesures et estimations provisoires publiées généralement toutes les 15 minutes. ' +
    'Il ne s’agit pas de mesures instantanées garanties. Certaines valeurs peuvent être manquantes ou révisées. ' +
    'Les émissions sont une estimation de la production française, non de l’électricité consommée.</p>' +
    '<p>Licence Ouverte / Open Licence v2.0. Les flux physiques négatifs indiquent un solde exportateur ; ' +
    'le pompage STEP est une consommation et n’est pas inclus dans les parts de production.</p></div>' +
    '<a href="' + ELECTRICITY_SOURCE + '" target="_blank" rel="noopener noreferrer">' +
    'Voir le jeu de données officiel ↗</a></section>';
}
function summaryCard(label, value, note, icon, semantic = '') {
  return '<article class="elec-kpi ' + semantic + '"><div class="elec-kpi-heading"><span>' + safe(label) +
    '</span><span class="elec-kpi-icon" aria-hidden="true">' + icon + '</span></div>' +
    '<strong>' + safe(value) + '</strong><small>' + safe(note) + '</small></article>';
}
function kpis(record) {
  if (!record) return '';
  const exchange = exchangeStatus(record.ech_physiques);
  const exchangeValue = record.ech_physiques === null ? '—' : power(Math.abs(record.ech_physiques));
  return '<div class="elec-kpi-grid">' +
    summaryCard('Consommation', power(record.consommation), 'Puissance soutirée par le réseau', '↘') +
    summaryCard('Production', power(record.production), 'Total des 8 filières disponibles', '⚡') +
    summaryCard('Intensité carbone', numberWithUnit(record.taux_co2, 'gCO₂e/kWh'), 'Estimation à la production', '♧') +
    summaryCard('Échanges physiques', exchangeValue, exchange.label, '⇄',
      exchange.sign === 'export' ? 'elec-export' : '') + '</div>';
}
function overview() {
  const record = selection();
  const recent = latest();
  if (!record) return emptyState();
  const change = record.consommation !== null && record.prevision_j !== null
    ? record.consommation - record.prevision_j : null;
  const difference = change === null ? '—' : (change > 0 ? '+' : '') + fmt(change / 1000, 1) + ' GW';
  const compared = change === null ? 'Prévision indisponible' :
    change > 0 ? 'Au-dessus de la prévision J' : change < 0 ? 'En dessous de la prévision J' : 'Conforme à la prévision J';
  const mix = mixBreakdown(record);
  return snapshotBar(record, recent) + kpis(record) +
    '<div class="elec-overview-grid"><section class="panel elec-chart-panel">' +
    chartHeading('Consommation et production', 'Comparez les valeurs réalisées et les prévisions au fil du temps.') +
    chart('consommation', true) + '</section>' +
    '<section class="panel elec-mix-panel"><div class="elec-section-heading"><div><h3>Mix de production</h3>' +
    '<p>Répartition au point sélectionné · en MW</p></div><a href="#/electricity/mix">Détails ↗</a></div>' +
    mixBars(mix, 5) + '</section></div>' +
    '<div class="elec-insight-grid">' +
    '<article class="panel elec-insight"><span class="elec-eyebrow">PRÉVISION DE CONSOMMATION</span>' +
    '<strong>' + safe(difference) + '</strong><p>' + compared +
    '</p><small>Écart réalisé − prévision du jour, au point sélectionné.</small></article>' +
    '<article class="panel elec-insight"><span class="elec-eyebrow">PRODUCTION BAS-CARBONE</span>' +
    '<strong>' + numberWithUnit(lowCarbonShare(record), '%', 1) + '</strong>' +
    '<p>Nucléaire + hydraulique + éolien + solaire</p>' +
    '<small>Part de ces filières dans la production affichée.</small></article>' +
    '<article class="panel elec-insight"><span class="elec-eyebrow">POMPAGE STEP</span>' +
    '<strong>' + power(record.pompage === null ? null : Math.abs(record.pompage)) + '</strong>' +
    '<p>Puissance liée au pompage</p><small>Consommation dédiée au stockage hydraulique, hors mix.</small></article></div>';
}
function chartHeading(title, subtitle) {
  return '<div class="elec-section-heading"><div><h3>' + safe(title) + '</h3><p>' + safe(subtitle) + '</p></div>' +
    '<span class="elec-header-badge">Échelle horaire · Europe/Paris</span></div>';
}
function snapshotBar(row, current) {
  const isHistorical = row && current && row.timestamp !== current.timestamp;
  return '<div class="elec-snapshot-bar"><div><span class="elec-eyebrow">' +
    (isHistorical ? 'POINT HISTORIQUE SÉLECTIONNÉ' : 'DERNIER POINT DISPONIBLE') +
    '</span><strong>' + localTime(row?.timestamp) + '</strong></div>' + indicator(current) +
    (isHistorical ? '<button class="btn elec-reset" id="electricity-latest">Revenir au plus récent ↗</button>' : '') +
    '</div>';
}
function mixBars(mix, limit = Infinity) {
  if (!mix.length) return '<div class="elec-empty">Composition indisponible pour cet horaire.</div>';
  return '<div class="elec-mix-bars">' + mix.slice(0, limit).map(row =>
    '<div class="elec-mix-row"><div class="elec-mix-label"><span class="elec-key" style="background:' + row.color + '"></span>' +
    '<span>' + row.label + '</span><strong>' + fmt(row.share, 1) + ' %</strong></div>' +
    '<div class="elec-progress"><span style="background:' + row.color + ';width:' + Math.max(0, row.share).toFixed(3) + '%"></span></div>' +
    '<small>' + power(row.mw) + '</small></div>').join('') + '</div>';
}
function donut(mix) {
  if (!mix.length) return '<div class="elec-empty">Répartition indisponible.</div>';
  let current = 0;
  const stops = mix.map(row => {
    const from = current;
    current += row.share;
    return row.color + ' ' + from.toFixed(3) + '% ' + current.toFixed(3) + '%';
  });
  const sum = mix.reduce((a, b) => a + b.mw, 0);
  return '<div class="elec-donut" role="img" aria-label="Répartition de la production par filière" style="background:conic-gradient(' +
    stops.join(',') + ')"><div class="elec-donut-center"><small>PRODUCTION</small><strong>' +
    power(sum) + '</strong><span>8 filières</span></div></div>';
}
function mixPage() {
  const row = selection(), mix = mixBreakdown(row);
  if (!row) return emptyState();
  return snapshotBar(row, latest()) + kpis(row) +
    '<div class="elec-mix-detail"><section class="panel"><div class="elec-section-heading"><div>' +
    '<h3>Répartition de la production</h3><p>Instant sélectionné · parts calculées à partir des MW par filière</p></div></div>' +
    '<div class="elec-donut-layout">' + donut(mix) + mixBars(mix) + '</div></section>' +
    '<section class="panel elec-mix-explainer"><h3>Comprendre le mix français</h3>' +
    '<p>La production totale additionne les filières suivantes : nucléaire, hydraulique, éolien, solaire, gaz, bioénergies, charbon et fioul.</p>' +
    '<p>Les pourcentages décrivent la <strong>production française</strong>, pas les origines de la consommation française. ' +
    'Les importations, exportations, pertes et consommations de stockage ne sont pas des filières de production.</p>' +
    '<div class="elec-fact"><small>Production des filières dites bas-carbone*</small><strong>' +
    numberWithUnit(lowCarbonShare(row), '%', 1) + '</strong></div>' +
    '<div class="elec-fact"><small>Solde des échanges physiques</small><strong>' +
    power(row.ech_physiques) + '</strong></div>' +
    '<div class="elec-fact"><small>Pompage STEP (valeur publiée)</small><strong>' +
    power(row.pompage) + '</strong></div>' +
    '<small>* Nucléaire, hydraulique, éolien et solaire, classification simplifiée pour la visualisation.</small>' +
    '</section></div>';
}
function trendsPage() {
  const record = selection(), selected = METRIC_OPTIONS.find(item => item.key === state.metric);
  if (!record) return emptyState();
  const values = usable().map(row => metricValue(row, state.metric)).filter(value => value !== null);
  const smallest = values.length ? Math.min(...values) : null;
  const largest = values.length ? Math.max(...values) : null;
  return snapshotBar(record, latest()) +
    '<section class="panel elec-trends-panel"><div class="elec-section-heading"><div><h3>Évolution du système électrique</h3>' +
    '<p>Sélectionnez une mesure et cliquez sur un point pour inspecter son détail.</p></div>' +
    '<label class="elec-metric-control">Indicateur <select id="electricity-metric" class="field">' +
    METRIC_OPTIONS.map(o => '<option value="' + o.key + '"' + (state.metric === o.key ? ' selected' : '') +
      '>' + o.label + '</option>').join('') + '</select></label></div>' +
    chart(state.metric, state.metric === 'consommation' && state.showForecast) +
    '<div class="elec-summary-stats"><div><small>Minimum sur la période</small><strong>' +
    numberWithUnit(smallest, selected.unit, 1) + '</strong></div>' +
    '<div><small>Maximum sur la période</small><strong>' +
    numberWithUnit(largest, selected.unit, 1) + '</strong></div>' +
    '<div><small>Points disponibles</small><strong>' + values.length + '</strong></div></div>' +
    '<p class="elec-hint">Les courbes relient des mesures espacées d’environ 15 minutes. ' +
    'Une absence de donnée n’est pas interprétée comme zéro.</p></section>';
}
function dataPage() {
  const rows = usable().slice().reverse();
  if (!rows.length) return emptyState();
  return '<section class="panel elec-table-panel"><div class="elec-section-heading"><div>' +
    '<h3>Historique des relevés</h3><p>Les ' + rows.length +
    ' derniers points disponibles sur la période · cliquez sur une ligne pour l’inspecter.</p></div>' +
    '<span class="elec-header-badge">Puissance : MW · CO₂ : gCO₂e/kWh</span></div>' +
    '<div class="table-scroll"><table class="data-table elec-table"><thead><tr>' +
    '<th>Heure (Paris)</th><th>Consommation</th><th>Prévision J</th><th>Production</th>' +
    '<th>CO₂</th><th>Échanges</th></tr></thead><tbody>' +
    rows.map(row => '<tr class="elec-table-row' + (selection()?.timestamp === row.timestamp ? ' elec-row-selected' : '') +
      '" tabindex="0" role="button" data-timestamp="' + row.timestamp + '" aria-label="Consulter le relevé du ' +
      safe(localTime(row.timestamp)) + '"><td>' + safe(localTime(row.timestamp,true)) +
      '</td><td>' + numberWithUnit(row.consommation,'MW') +
      '</td><td>' + numberWithUnit(row.prevision_j,'MW') +
      '</td><td>' + numberWithUnit(row.production,'MW') +
      '</td><td>' + numberWithUnit(row.taux_co2,'g/kWh') +
      '</td><td>' + numberWithUnit(row.ech_physiques,'MW') + '</td></tr>').join('') +
    '</tbody></table></div></section>';
}
function chart(metric, forecast = false) {
  const rows = usable();
  const descriptor = METRIC_OPTIONS.find(o => o.key === metric);
  if (rows.length < 2) return '<div class="elec-empty">Historique insuffisant pour un graphique.</div>';
  const series = [{ key: metric, label: descriptor.label, color: descriptor.color }];
  if (forecast && metric === 'consommation') series.push({ key: 'prevision_j', label: 'Prévision J', color: '#d2a8ff' });
  if (metric === 'consommation' && state.page === 'overview') series.push({ key: 'production', label: 'Production', color: '#3fb950' });
  const values = series.flatMap(serie => rows.map(row => metricValue(row, serie.key))).filter(value => value !== null);
  if (values.length < 2) return '<div class="elec-empty">Données manquantes pour cette mesure.</div>';
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.09;
  min -= pad; max += pad;
  const x = stamp => 72 + 842 * (stamp - rows[0].timestamp) / Math.max(1, rows[rows.length - 1].timestamp - rows[0].timestamp);
  const y = value => 258 - (value - min) / (max - min) * 206;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ypos = 52 + index * 51.5, val = max - index / 4 * (max - min);
    return '<line x1="72" x2="914" y1="' + ypos.toFixed(1) + '" y2="' + ypos.toFixed(1) +
      '" stroke="#30363d" stroke-dasharray="4 6"/><text x="61" y="' + (ypos + 4).toFixed(1) +
      '" text-anchor="end" class="elec-axis">' + fmt(val,1) + '</text>';
  }).join('');
  const step = Math.max(1, Math.ceil(rows.length / 6));
  const ticks = rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map(row =>
    '<text x="' + x(row.timestamp).toFixed(1) + '" y="286" text-anchor="middle" class="elec-axis">' +
    localTime(row.timestamp,true).split(' ').slice(-1)[0] + '</text>').join('');
  const paths = series.map(serie => {
    let continuous = false, path = '';
    for (const row of rows) {
      const value = metricValue(row, serie.key);
      if (value === null) { continuous = false; continue; }
      path += (continuous ? 'L' : 'M') + x(row.timestamp).toFixed(1) + ' ' + y(value).toFixed(1) + ' ';
      continuous = true;
    }
    return '<path d="' + path + '" fill="none" stroke="' + serie.color +
      '" stroke-width="' + (serie.key === metric ? 3 : 2) + '"' +
      (serie.key === 'prevision_j' ? ' stroke-dasharray="6 5"' : '') +
      ' stroke-linecap="round" stroke-linejoin="round"/>';
  }).join('');
  const circles = rows.map((row, index) => {
    const val = metricValue(row, metric);
    if (val === null) return '';
    const chosen = state.selectedTimestamp === row.timestamp;
    return '<circle class="elec-chart-point' + (chosen ? ' elec-chart-selected' : '') +
      '" tabindex="0" data-stamp="' + row.timestamp + '" data-value="' + safe(fmt(val,1)) +
      '" cx="' + x(row.timestamp).toFixed(1) + '" cy="' + y(val).toFixed(1) +
      '" r="' + (chosen ? 6 : 4) +
      '" role="button" aria-label="' + localTime(row.timestamp) + ' : ' + safe(fmt(val,1)) +
      ' ' + safe(descriptor.unit) + '" />'; 
  }).join('');
  const legend = '<div class="elec-chart-legend">' + series.map(serie =>
    '<span><i style="background:' + serie.color + '"></i>' + serie.label + '</span>').join('') +
    '<small>Valeurs en ' + descriptor.unit + '</small></div>';
  const selected = selection();
  const tip = selected ? descriptor.label + ' · ' + localTime(selected.timestamp) + ' · ' +
    numberWithUnit(metricValue(selected, metric),descriptor.unit,1) : 'Cliquez sur un point pour consulter son relevé';
  return legend + '<div class="elec-chart-container"><svg class="elec-svg" viewBox="0 0 960 310" role="img" aria-label="' +
    'Évolution de ' + safe(descriptor.label) + ' sur les ' + state.hours + ' dernières heures.">' +
    grid + ticks + paths + circles +
    '<text x="72" y="20" class="elec-axis">' + safe(descriptor.unit) + '</text>' +
    '<text x="914" y="305" text-anchor="end" class="elec-axis">Heure locale · Paris</text>' +
    '</svg></div><div class="elec-chart-tooltip" id="electricity-tooltip" role="status" aria-live="polite">' +
    safe(tip) + '</div>';
}
function emptyState() {
  return '<div class="panel elec-empty"><strong>Aucune donnée exploitable</strong><p>' +
    'La source peut être momentanément indisponible. Aucune valeur fictive n’est affichée.</p></div>';
}
function renderContents() {
  const container = E('#electricity-content');
  if (!container) return;
  if (state.error && !electricalCache.rows.length) {
    container.innerHTML = '<section class="panel elec-error-panel"><h3>Impossible de charger RTE éCO₂mix</h3><p>' +
      safe(state.error) + '</p><p>Vérifiez votre connexion, puis réessayez. ' +
      'Le serveur ODRE peut appliquer des quotas d’accès.</p>' +
      '<button type="button" class="btn primary" id="electricity-retry">Réessayer</button>' +
      '<a href="' + ELECTRICITY_SOURCE + '" target="_blank" rel="noopener noreferrer">Vérifier la source ↗</a></section>';
    E('#electricity-retry')?.addEventListener('click', () => load(true));
    return;
  }
  if (!electricalCache.rows.length) {
    container.innerHTML = '<div class="elec-loading-grid" role="status" aria-label="Chargement des données RTE">' +
      Array.from({ length: 4 }, () => '<div class="elec-skeleton"></div>').join('') + '</div>' +
      '<section class="panel elec-loading-chart">Chargement des données RTE…</section>';
    return;
  }
  const views = { overview, mix: mixPage, trends: trendsPage, data: dataPage };
  container.innerHTML = views[state.page]();
  E('#electricity-latest')?.addEventListener('click', () => {
    state.selectedTimestamp = null; renderContents();
  });
  E('#electricity-metric')?.addEventListener('change', event => {
    state.metric = event.target.value; renderContents();
  });
  container.querySelectorAll('.elec-chart-point').forEach(point => {
    const describe = () => {
      const row = usable().find(record => record.timestamp === Number(point.dataset.stamp));
      if (!row) return;
      const tooltip = E('#electricity-tooltip');
      if (tooltip) tooltip.textContent = localTime(row.timestamp) + ' · ' +
        (METRIC_OPTIONS.find(item => item.key === (state.page === 'overview' ? 'consommation' : state.metric))?.label || 'Valeur') +
        ' : ' + point.dataset.value + ' ' +
        (state.page === 'overview' ? 'GW' : METRIC_OPTIONS.find(item => item.key === state.metric)?.unit);
    };
    point.addEventListener('mouseenter', describe);
    point.addEventListener('focus', describe);
    point.addEventListener('click', () => {
      state.selectedTimestamp = Number(point.dataset.stamp); renderContents();
    });
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); state.selectedTimestamp = Number(point.dataset.stamp); renderContents();
      }
    });
  });
  container.querySelectorAll('.elec-table-row').forEach(row => {
    const select = () => { state.selectedTimestamp = Number(row.dataset.timestamp); renderContents(); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    });
  });
}
function showStatus() {
  const node = E('#electricity-message');
  if (!node) return;
  const end = latest();
  const fetched = electricalCache.fetchedAt ? ' · Reçu à ' +
    new Intl.DateTimeFormat('fr-FR',{timeStyle:'short'}).format(new Date(electricalCache.fetchedAt)) : '';
  node.className = 'elec-message' + (state.error ? ' elec-message-error' : '');
  if (state.busy) node.textContent = electricalCache.rows.length ?
    'Actualisation RTE en cours… données précédentes conservées.' : 'Connexion à RTE éCO₂mix…';
  else if (state.error) node.textContent = '⚠ ' + state.error + (end ? ' · Anciennes données conservées' : '');
  else if (end) node.textContent = '✓ ' + electricalCache.rows.length +
    ' relevés · Dernier point RTE : ' + localTime(end.timestamp) +
    ' (Europe/Paris)' + fetched;
  else node.textContent = 'En attente des données RTE…';
}
async function load(force = false) {
  if (!state.active) return;
  const fresh = Date.now() - electricalCache.fetchedAt < CACHE_DURATION_MS;
  if (!force && fresh && electricalCache.rows.length) {
    showStatus(); renderContents(); return;
  }
  if (state.busy && !force) return;
  const request = ++state.request;
  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;
  state.busy = true; state.error = null; showStatus(); renderContents();
  const timer = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(electricityApiUrl(), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Réponse du portail ODRE : HTTP ' + response.status);
    const payload = await response.json();
    const rows = normaliseElectricityResponse(payload);
    if (rows.length === 0) throw new Error('Le portail a répondu mais aucun relevé valide n’a été trouvé.');
    if (request !== state.request || !state.active) return;
    electricalCache.rows = rows; electricalCache.fetchedAt = Date.now();
    if (!usable().some(row => row.timestamp === state.selectedTimestamp)) state.selectedTimestamp = null;
    state.error = null;
  } catch (error) {
    if (request !== state.request || !state.active) return;
    state.error = error.name === 'AbortError' ? 'Délai d’attente dépassé (16 secondes)' :
      'Échec de la récupération : ' + error.message;
  } finally {
    clearTimeout(timer);
    if (request === state.request && state.active) {
      state.busy = false; state.abort = null; showStatus(); renderContents();
    }
  }
}
function exportData(type) {
  const rows = usable();
  if (!rows.length) return;
  const header = ['date_heure','consommation','prevision_j','prevision_j1','production',
    'taux_co2','ech_physiques','pompage',...ENERGY_SOURCES.map(source => source.key)];
  let output, mime;
  if (type === 'json') {
    output = JSON.stringify({
      source: ELECTRICITY_SOURCE, publisher: 'RTE / ODRE',
      license: 'Licence Ouverte v2.0', retrievedAt: new Date(electricalCache.fetchedAt).toISOString(),
      dataTimezone: 'ISO 8601 UTC; display in Europe/Paris', periodHours: state.hours, records: rows
    },null,2); mime='application/json';
  } else {
    output = '\uFEFF' + [header.join(';'),...rows.map(row =>
      header.map(field => row[field] ?? '').join(';'))].join('\r\n');
    mime='text/csv';
  }
  const url = URL.createObjectURL(new Blob([output], {type:mime+';charset=utf-8'}));
  const element = document.createElement('a');
  element.href=url; element.download='atlas-electricite-france-'+state.hours+'h.'+type;
  document.body.appendChild(element); element.click(); element.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function mountElectricity(container, page = 'overview') {
  state.root = container;
  state.page = TABS.some(tab => tab.id === page && !['europe','world'].includes(tab.id)) ? page : 'overview';
  state.active = true; state.busy=false;state.error=null;state.selectedTimestamp=null;state.request++;
  container.innerHTML = '<div class="elec-shell">' + shell(state.page) + '</div>';
  E('#electricity-hours').value = String(state.hours);
  E('#electricity-hours').addEventListener('change',event => {
    state.hours=Number(event.target.value);
    state.selectedTimestamp=null;renderContents();showStatus();
  });
  E('#electricity-refresh').addEventListener('click',()=>load(true));
  E('#electricity-json').addEventListener('click',()=>exportData('json'));
  E('#electricity-csv').addEventListener('click',()=>exportData('csv'));
  showStatus();renderContents();load();
  return disposeElectricity;
}
export function disposeElectricity() {
  state.active=false;
  state.request++;
  state.abort?.abort();state.abort=null;state.busy=false;
  state.root=null;
}
