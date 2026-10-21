/**
 * RTE éCO2mix via ODRE, national provisional real-time dataset.
 * Dataset license: Licence Ouverte / Open Licence v2.0, attribution RTE / ODRE.
 * Production is generation (MW). Pumping is separately a load, not generation.
 * Physical exchanges: negative = France net exporter, positive = importer.
 */
export const ELECTRICITY_ENDPOINT =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-national-tr/records';
export const ELECTRICITY_SOURCE =
  'https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/';
export const ENERGY_SOURCES = Object.freeze([
  { key: 'nucleaire', label: 'Nucléaire', color: '#a371f7', lowCarbon: true },
  { key: 'hydraulique', label: 'Hydraulique', color: '#58a6ff', lowCarbon: true },
  { key: 'eolien', label: 'Éolien', color: '#3fb950', lowCarbon: true },
  { key: 'solaire', label: 'Solaire', color: '#e3b341', lowCarbon: true },
  { key: 'gaz', label: 'Gaz', color: '#f0883e', lowCarbon: false },
  { key: 'bioenergies', label: 'Bioénergies', color: '#7ee787', lowCarbon: false },
  { key: 'charbon', label: 'Charbon', color: '#8b949e', lowCarbon: false },
  { key: 'fioul', label: 'Fioul', color: '#f85149', lowCarbon: false }
]);
export const METRIC_OPTIONS = Object.freeze([
  { key: 'consommation', label: 'Consommation', unit: 'GW', factor: 1000, color: '#58a6ff' },
  { key: 'prevision_j', label: 'Prévision du jour', unit: 'GW', factor: 1000, color: '#d2a8ff' },
  { key: 'production', label: 'Production totale', unit: 'GW', factor: 1000, color: '#3fb950' },
  { key: 'taux_co2', label: 'Intensité carbone', unit: 'gCO₂e/kWh', factor: 1, color: '#e3b341' },
  { key: 'ech_physiques', label: 'Solde des échanges', unit: 'GW', factor: 1000, color: '#f0883e' }
]);
export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function productionMW(record) {
  if (!record) return null;
  const values = ENERGY_SOURCES.map(source => finiteNumber(record[source.key]));
  if (values.some(value => value === null)) return null;
  return values.reduce((sum, value) => sum + Math.max(0, value), 0);
}
export function mixBreakdown(record) {
  const total = productionMW(record);
  if (total === null || total <= 0) return [];
  return ENERGY_SOURCES.map(source => {
    const mw = Math.max(0, finiteNumber(record[source.key]) || 0);
    return { ...source, mw, share: mw / total * 100 };
  }).sort((a, b) => b.mw - a.mw);
}
export function lowCarbonShare(record) {
  const mix = mixBreakdown(record);
  if (!mix.length) return null;
  return mix.filter(row => row.lowCarbon).reduce((sum, row) => sum + row.share, 0);
}
export function normaliseElectricityRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const stamp = Date.parse(record.date_heure);
  if (!Number.isFinite(stamp)) return null;
  const fields = [
    'consommation','prevision_j','prevision_j1','taux_co2','ech_physiques',
    'pompage','stockage_batterie','destockage_batterie',
    ...ENERGY_SOURCES.map(source => source.key)
  ];
  const result = { date_heure: new Date(stamp).toISOString(), timestamp: stamp };
  for (const field of fields) result[field] = finiteNumber(record[field]);
  result.production = productionMW(result);
  return result;
}
export function normaliseElectricityResponse(payload) {
  if (!payload || !Array.isArray(payload.results)) throw new Error('Réponse RTE invalide : liste absente.');
  const unique = new Map();
  for (const raw of payload.results) {
    const record = normaliseElectricityRecord(raw);
    if (record && record.consommation !== null) unique.set(record.timestamp, record);
  }
  return Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp);
}
export function windowRecords(rows, hours) {
  if (!rows.length) return [];
  const maximum = rows[rows.length - 1].timestamp;
  const threshold = maximum - hours * 60 * 60 * 1000;
  return rows.filter(item => item.timestamp >= threshold);
}
export function metricValue(row, metricKey) {
  if (!row) return null;
  const key = METRIC_OPTIONS.find(option => option.key === metricKey);
  const value = finiteNumber(row[metricKey]);
  return key && value !== null ? value / key.factor : null;
}
export function exchangeStatus(value) {
  const number = finiteNumber(value);
  if (number === null) return { label: 'Indisponible', detail: 'Solde non publié', sign: 'missing' };
  if (number < 0) return { label: 'Exportateur net', detail: 'La France exporte davantage qu’elle n’importe', sign: 'export' };
  if (number > 0) return { label: 'Importateur net', detail: 'La France importe davantage qu’elle n’exporte', sign: 'import' };
  return { label: 'Échanges équilibrés', detail: 'Solde physique nul', sign: 'neutral' };
}
export function freshness(timestamp, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60000));
  return { minutes, status: minutes <= 45 ? 'recent' : minutes <= 180 ? 'delayed' : 'stale' };
}
export function electricityApiUrl() {
  const url = new URL(ELECTRICITY_ENDPOINT);
  url.searchParams.set('limit', '100');
  url.searchParams.set('order_by', 'date_heure desc');
  url.searchParams.set('timezone', 'Europe/Paris');
  return url.toString();
}
