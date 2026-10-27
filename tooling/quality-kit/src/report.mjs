import {summarize} from './metrics.mjs';

const value=(n,suffix='')=>n===null||n===undefined?'n/a':String(n)+suffix;
export function markdownReport(records,{title='Quality Kit — Rapport HTTP'}={}){
 const groups=new Map();
 for(const record of records){
  const key=[record.project,record.suite].join(' / ');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(record);
 }
 const lines=[
  '# '+title,'',
  'Rapport hors ligne : aucune requête HTTP lancée durant sa génération.','',
  '| Projet / Scénario | Requêtes | Succès | p50 | p95 | p99 | Cache HIT (connus) | Âge source max |',
  '|---|---:|---:|---:|---:|---:|---:|---:|'
 ];
 for(const [name,items]of groups){
  const s=summarize(items);
  lines.push('| '+name.replaceAll('|','/')+' | '+s.samples+' | '+value(s.successRate,'%')+
   ' | '+value(s.latencyMs.p50,' ms')+' | '+value(s.latencyMs.p95,' ms')+
   ' | '+value(s.latencyMs.p99,' ms')+' | '+value(s.cacheHitRateAmongKnown,'%')+
   ' | '+value(s.sourceAgeSecondsMax,' s')+' |');
 }
 lines.push('','## Limites de lecture','',
  '- HIT/MISS/STALE sont des observations du cache HTTP, pas une mesure directe des invocations des fonctions ni des appels aux fournisseurs.',
  '- Le taux de HIT est calculé uniquement pour les observations avec un statut HIT/MISS/STALE reconnu ; les états inconnus sont exclus.',
  '- L’âge du contenu dépend du champ de date publié et n’est pas équivalent à la valeur HTTP Age.',
  '- Une absence de trafic réel ne permet pas de prédire la capacité pour des utilisateurs simultanés.',
  '- Les tests sur un backend local ne reproduisent pas automatiquement les limites d’un hébergement cloud.',''
 );
 return lines.join('\n');
}
export function csvReport(records){
 const cols=['timestamp','project','suite','iteration','httpStatus','ok','durationMs','cacheStatus','cacheAgeSeconds','sourceAgeSeconds','fingerprint','contentBytes','error'];
 const csvCell=value=>'"'+String(value??'').replaceAll('"','""').replace(/[\r\n]/g,' ')+'"';
 return [cols.join(','),...records.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\n')+'\n';
}
