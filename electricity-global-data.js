/**
 * Source adapters for Atlas electricity world + European views.
 * OWID annual data (incl. Ember): TWh / %, not live.
 * Fraunhofer Energy-Charts API v2: MW, country-specific recent intervals.
 * Null and missing data never become zero by accident.
 */
export const WORLD_DATA_URL='./data/electricity-world-annual.json';
export const WORLD_GEOMETRY_URL='./data/electricity-world-geometry.geojson';
export const WORLD_SOURCE='https://catalog.ourworldindata.org/energy/owid_energy/';
export const EUROPE_SOURCE='https://api.energy-charts.info/';
export const EUROPE_ENDPOINT='https://api.energy-charts.info/v2/public_power';
export const HISTORIC_METRICS=Object.freeze([
 {id:'generationTWh',label:'Production',unit:'TWh'},
 {id:'demandTWh',label:'Demande',unit:'TWh'},
 {id:'renewablesPercent',label:'Électricité renouvelable',unit:'%'},
 {id:'lowCarbonPercent',label:'Électricité bas-carbone',unit:'%'},
 {id:'carbonIntensityGco2eqKwh',label:'Intensité carbone',unit:'gCO₂e/kWh'}
]);
export const EUROPE_COUNTRIES=Object.freeze([
 ['de','DEU','Allemagne'],['fr','FRA','France'],['es','ESP','Espagne'],['it','ITA','Italie'],
 ['uk','GBR','Royaume-Uni'],['at','AUT','Autriche'],['be','BEL','Belgique'],['nl','NLD','Pays-Bas'],
 ['ch','CHE','Suisse'],['pl','POL','Pologne'],['se','SWE','Suède'],['no','NOR','Norvège'],
 ['dk','DNK','Danemark'],['fi','FIN','Finlande'],['pt','PRT','Portugal'],['cz','CZE','Tchéquie'],
 ['sk','SVK','Slovaquie'],['hu','HUN','Hongrie'],['gr','GRC','Grèce'],['ro','ROU','Roumanie'],
 ['bg','BGR','Bulgarie'],['ie','IRL','Irlande'],['hr','HRV','Croatie'],['si','SVN','Slovénie'],
 ['lt','LTU','Lituanie'],['lv','LVA','Lettonie'],['ee','EST','Estonie'],['lu','LUX','Luxembourg'],
 ['rs','SRB','Serbie'],['ba','BIH','Bosnie-Herzégovine'],['me','MNE','Monténégro'],
 ['mk','MKD','Macédoine du Nord'],['ua','UKR','Ukraine'],['ge','GEO','Géorgie'],
 ['md','MDA','Moldavie'],['cy','CYP','Chypre'],['xk','XKX','Kosovo']
].map(([api,iso,name])=>({api,iso,name})));
export function europeApiCode(iso){return EUROPE_COUNTRIES.find(c=>c.iso===iso)?.api||null;}
export function energyChartsUrl(code,now=new Date()){
 if(!EUROPE_COUNTRIES.some(c=>c.api===code))throw new Error('Pays non couvert par Energy-Charts');
 const end=now.toISOString().slice(0,10);
 const previous=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-1)).toISOString().slice(0,10);
 const url=new URL(EUROPE_ENDPOINT);
 url.searchParams.set('country',code);url.searchParams.set('start',previous);url.searchParams.set('end',end);
 return url.toString();
}
export function validNumber(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
export function parseWorldSnapshot(payload){
 if(payload?.schema!==1||!Array.isArray(payload.fields)||!payload.countries||typeof payload.countries!=='object')throw new Error('Fichier mondial invalide');
 if(!payload.fields.includes('generationTWh')||!payload.fields.includes('year'))throw new Error('Colonnes mondiales manquantes');
 return payload;
}
export function historicValue(snapshot,iso,year,metric){
 const index=snapshot.fields.indexOf(metric);
 if(index<0||!Number.isInteger(Number(year)))return null;
 const record=snapshot.countries[iso]?.history?.find(row=>row[0]===Number(year));
 return record?validNumber(record[index]):null;
}
export function availableCountries(snapshot,year,metric,allowed){
 return Object.entries(snapshot.countries).filter(([iso])=>!allowed||allowed.has(iso)).map(([iso,data])=>({iso,name:data.name,value:historicValue(snapshot,iso,year,metric)})).filter(x=>x.value!==null).sort((a,b)=>b.value-a.value);
}
export const POWER_TYPES=Object.freeze([
 {id:'nuclear',label:'Nucléaire',color:'#a371f7',keys:['nuclear']},
 {id:'hydro',label:'Hydraulique',color:'#58a6ff',keys:['hydro_run_of_river','hydro_water_reservoir','hydro_pumped_storage']},
 {id:'wind',label:'Éolien',color:'#3fb950',keys:['wind_onshore','wind_offshore']},
 {id:'solar',label:'Solaire',color:'#e3b341',keys:['solar']},
 {id:'gas',label:'Gaz fossile',color:'#f0883e',keys:['fossil_gas','fossil_coal_derived_gas']},
 {id:'coal',label:'Charbon et lignite',color:'#8b949e',keys:['fossil_hard_coal','fossil_brown_coal_lignite','fossil_peat','fossil_oil_shale']},
 {id:'bio',label:'Biomasse et déchets',color:'#7ee787',keys:['biomass','waste']},
 {id:'other',label:'Autres',color:'#f778ba',keys:['fossil_oil','geothermal','others','battery']}
]);
export function normalizeEuropeanResponse(payload){
 if(payload?.schema_version!=='2.0'||payload?.endpoint!=='public_power'||payload.unit!=='MW'||!Array.isArray(payload.data))throw new Error('Format Energy-Charts non reconnu');
 const rows=payload.data.map(point=>{
  const stamp=Date.parse(point.timestamp);
  if(!Number.isFinite(stamp)||!point.values||typeof point.values!=='object')return null;
  const v=point.values;
  const mix=POWER_TYPES.map(type=>{
   const values=type.keys.map(k=>validNumber(v[k])).filter(x=>x!==null);
   return {...type,mw:values.length?values.reduce((s,n)=>s+n,0):null};
  });
  const total=mix.reduce((s,m)=>s+(m.mw||0),0);
  const consumption=validNumber(v.load);
  if(consumption===null&&total<=0)return null;
  return {timestamp:stamp,consumptionMW:consumption,productionMW:total>0?total:null,
   renewablePercent:validNumber(v.renewable_share_of_generation),
   tradingMW:validNumber(v.cross_border_electricity_trading),mix};
 }).filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp);
 if(!rows.length)throw new Error('Aucune mesure de production publiée pour cette période');
 return {country:payload.country,timezone:payload.timezone,unit:'MW',intervalMinutes:payload.interval_minutes,rows,
  license:payload.license||'CC BY 4.0',availableUntil:payload.available_until||null};
}
