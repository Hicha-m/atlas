import {summarize} from './metrics.mjs';

function bySuite(records){
 const grouped=new Map();
 for(const record of records){
  const key=String(record.project||'')+' / '+String(record.suite||'');
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(record);
 }
 return grouped;
}
const delta=(before,after)=>before===null||after===null?null:
 Math.round((after-before)*100)/100;
const display=(value,suffix='')=>value===null?'n/a':String(value)+suffix;
export function compareCampaigns(baseline,current){
 const left=bySuite(baseline),right=bySuite(current);
 const keys=[...new Set([...left.keys(),...right.keys()])].sort();
 return keys.map(key=>{
  const a=summarize(left.get(key)||[]),b=summarize(right.get(key)||[]);
  return {
   scenario:key,
   baselineSamples:a.samples,currentSamples:b.samples,
   sufficientSamples:a.samples>=30&&b.samples>=30,
   baselineSuccessRate:a.successRate,currentSuccessRate:b.successRate,
   deltaSuccessPoints:delta(a.successRate,b.successRate),
   baselineP95Ms:a.latencyMs.p95,currentP95Ms:b.latencyMs.p95,
   deltaP95Ms:delta(a.latencyMs.p95,b.latencyMs.p95),
   baselineHitRate:a.cacheHitRateAmongKnown,currentHitRate:b.cacheHitRateAmongKnown,
   deltaHitPoints:delta(a.cacheHitRateAmongKnown,b.cacheHitRateAmongKnown),
   baselineErrors:a.failed,currentErrors:b.failed
  };
 });
}
export function markdownComparison(baseline,current){
 const rows=compareCampaigns(baseline,current);
 const lines=[
  '# Quality Kit — Comparaison de campagnes','',
  'Rapport hors réseau. Les différences ne prouvent pas une causalité.','',
  '| Suite | Avant → après (n) | Succès Δ (points) | p95 Δ (ms) | Cache HIT Δ (points) | Solidité de l’échantillon |',
  '|---|---:|---:|---:|---:|---|'
 ];
 for(const r of rows){
  lines.push('| '+r.scenario.replaceAll('|','/')+' | '+r.baselineSamples+' → '+r.currentSamples+
   ' | '+display(r.deltaSuccessPoints)+' | '+display(r.deltaP95Ms)+
   ' | '+display(r.deltaHitPoints)+' | '+(r.sufficientSamples?'≥ 30 chacun':'Insuffisant pour conclure')+' |');
 }
 lines.push('','**Interprétation :** les campagnes doivent utiliser le même chemin, la même configuration et des conditions comparables. Les écarts p95 sur de petits échantillons ne sont que des signaux exploratoires.',
  'Les caches CDN et les appels fournisseurs externes doivent être corrélés aux métriques hébergeur pour conclure sur les économies ou la capacité.','');
 return lines.join('\n');
}
