/**
 * Historical country-level electricity statistics from Ember (CC BY 4.0),
 * republished as a compact JSON summary by World Power Monitor.
 * These are annual observations, NOT live network measurements.
 */
export const GLOBAL_DATA_URL='https://worldpowermonitor.com/data/files/country-summary.json';
export const GLOBAL_DATA_SOURCE='https://worldpowermonitor.com/data/ember-annual/';
export const EUROPE_ISO3=new Set('ALB AND AUT BEL BIH BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ITA LVA LTU LUX MLT MDA MNE NLD MKD NOR POL PRT ROU SRB SVK SVN ESP SWE CHE TUR UKR GBR BLR RUS XKX GEO ARM AZE'.split(' '));
export const FUELS=[
 ['nuclear','Nucléaire','#a371f7'],['hydro','Hydraulique','#58a6ff'],
 ['wind','Éolien','#3fb950'],['solar','Solaire','#e3b341'],
 ['bioenergy','Bioénergies','#7ee787'],['other_renewables','Autres renouvelables','#39c5bb'],
 ['gas','Gaz','#f0883e'],['coal','Charbon','#cf6b6b'],['other_fossil','Autres fossiles','#8b949e']
];
export function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
export function normalizeCountry(row){
 if(!row||typeof row!=='object'||!row.iso3||!row.name)return null;
 const generation=row.generation_twh&&typeof row.generation_twh==='object'?row.generation_twh:{};
 const shares=row.share_pct&&typeof row.share_pct==='object'?row.share_pct:{};
 const fuels=FUELS.map(([id,label,color])=>({id,label,color,twh:num(generation[id]),share:num(shares[id])}));
 return {id:String(row.id||row.iso3),iso3:String(row.iso3).toUpperCase(),name:String(row.name),
  year:num(row.year),generation:num(row.total_generation_twh),demand:num(row.demand_twh),
  carbon:num(row.carbon_intensity_gco2_kwh),imports:num(row.net_imports_twh),
  emissions:num(row.total_emissions_mtco2),fuels};
}
export function normalizeGlobal(payload){
 if(!Array.isArray(payload?.countries))throw new Error('Format de données mondiales inattendu');
 const countries=payload.countries.map(normalizeCountry).filter(Boolean);
 if(!countries.length)throw new Error('Aucun pays exploitable dans les données Ember');
 return countries.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}
export function metric(country,field){
 if(field==='clean')return country.fuels.filter(f=>['nuclear','hydro','wind','solar','bioenergy','other_renewables'].includes(f.id)).reduce((sum,f)=>sum+(f.share||0),0);
 return country[field]??null;
}
export function metricLabel(field){
 return {generation:'Production (TWh/an)',demand:'Demande (TWh/an)',carbon:'Intensité carbone (gCO₂/kWh)',clean:'Part bas-carbone (%)'}[field]||field;
}
export function palette(value,min,max,field){
 if(value===null)return '#303b4d';
 const ratio=max===min?0.5:Math.max(0,Math.min(1,(value-min)/(max-min)));
 const hue=field==='carbon'?155-155*ratio:215-175*ratio;
 return 'hsl('+hue.toFixed(0)+' 58% '+(25+ratio*33).toFixed(0)+'%)';
}
