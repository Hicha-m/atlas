/**
 * Métropole Aix-Marseille-Provence transport alerts (Opendatasoft).
 * This is public operator traffic information, not vehicle tracking or stop ETAs.
 * Every route/network and validity date comes from provider fields.
 */
const sourceText=(value,max=1500)=>String(value??'').trim().slice(0,max);
export const MARSEILLE_DATASET='ol-perturbation-la-mobilite';
export const MARSEILLE_SOURCE='https://data.ampmetropole.fr/explore/assets/ol-perturbation-la-mobilite/';
export const MARSEILLE_API='https://data.ampmetropole.fr/api/explore/v2.1/catalog/datasets/'+MARSEILLE_DATASET+'/records';
const dateOnly=value=>{
 const date=sourceText(value,35).slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
};
const localDay=(now=new Date())=>{
 const segments=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const v=Object.fromEntries(segments.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return [v.year,v.month,v.day].join('-');
};
function extractLines(row){
 const raw=row?.lines;
 let all=[];
 if(Array.isArray(raw))all=raw;
 else if(typeof raw==='string'){
  try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))all=parsed;}catch{}
 }
 if(!all.length&&row?.lines_final_sname){
  all=[{sName:row.lines_final_sname,mode:row.lines_final_mode,
    subNetwork:{name:row.lines_final_subnetwork_name}}];
 }
 return all.slice(0,150).filter(x=>x&&typeof x==='object').map(item=>({
  line:sourceText(item.sName||item.shortName||item.id,40),
  mode:sourceText(item.mode,30).toUpperCase(),
  network:sourceText(item.subNetwork?.name||row?.lines_final_subnetwork_name,100),
  id:sourceText(item.id,100)
 })).filter(x=>x.line||x.network);
}
export function normalizeMarseilleAlerts(payload,{now=new Date(),max=300}={}){
 const source=Array.isArray(payload)?payload:Array.isArray(payload?.results)?payload.results:[];
 const today=localDay(now),map=new Map();
 for(const row of source){
  if(!row||typeof row!=='object')continue;
  const id=sourceText(row.id,120);
  const title=sourceText(row.title,220);
  const description=sourceText(row.message,1800);
  if(!id||(!title&&!description))continue;
  const start=dateOnly(row.startvalidity),end=dateOnly(row.endvalidity);
  if(end&&end<today)continue; // Never show past notices as current.
  const lines=extractLines(row);
  const existing=map.get(id);
  const activity=start&&start>today?'future':'current'; // Day validity, not hour-specific service status.
  if(existing){
   const seen=new Set(existing.lines.map(x=>[x.id,x.line,x.network,x.mode].join('|')));
   for(const line of lines){
    const key=[line.id,line.line,line.network,line.mode].join('|');
    if(!seen.has(key)){existing.lines.push(line);seen.add(key);}
   }
   continue;
  }
  const updated=sourceText(row.updatedate||row.issuedate,40);
  map.set(id,{
   id,title:title||'Information voyageurs',description,
   category:sourceText(row.category,75),severity:sourceText(row.criticity||row.level,60),
   start,end,updated:!Number.isNaN(Date.parse(updated))?new Date(updated).toISOString():null,
   activity,lines
  });
 }
 const alerts=[...map.values()].map(x=>({
  ...x,
  routes:[...new Set(x.lines.map(l=>l.line).filter(Boolean))].slice(0,60),
  networks:[...new Set(x.lines.map(l=>l.network).filter(Boolean))].slice(0,60),
  modes:[...new Set(x.lines.map(l=>l.mode).filter(Boolean))].slice(0,15)
 })).sort((a,b)=>Number(a.activity==='future')-Number(b.activity==='future')||
    (Date.parse(b.updated)||0)-(Date.parse(a.updated)||0)).slice(0,max);
 return {alerts,updated:alerts.reduce((latest,a)=>a.updated&&(!latest||a.updated>latest)?a.updated:latest,null),
   activeCount:alerts.filter(x=>x.activity==='current').length,
   futureCount:alerts.filter(x=>x.activity==='future').length};
}
export function filterMarseilleAlerts(alerts,{network='all',mode='all',query=''}={}){
 const q=String(query).trim().toLocaleLowerCase('fr');
 return (Array.isArray(alerts)?alerts:[]).filter(a=>
  (network==='all'||a.networks.includes(network))&&
  (mode==='all'||a.modes.includes(mode))&&
  (!q||[a.title,a.description,a.category,...a.routes,...a.networks].join(' ').toLocaleLowerCase('fr').includes(q)));
}
export function availableMarseilleFilters(alerts){
 return {networks:[...new Set(alerts.flatMap(x=>x.networks))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'fr')),
  modes:[...new Set(alerts.flatMap(x=>x.modes))].filter(Boolean).sort()};
}
