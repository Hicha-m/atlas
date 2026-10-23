/* Public electricity by country: annual OWID Grapher/Ember-derived historical series.
 * Do not label this live. No API key and no server-side credentials.
 */
export const WORLD_SOURCES=Object.freeze({
 generation:'https://ourworldindata.org/grapher/electricity-mix.csv?csvType=full&useColumnShortNames=true',
 clean:'https://ourworldindata.org/grapher/share-electricity-low-carbon.csv?csvType=full&useColumnShortNames=true',
 renewables:'https://ourworldindata.org/grapher/share-electricity-renewables.csv?csvType=full&useColumnShortNames=true',
 carbon:'https://ourworldindata.org/grapher/carbon-intensity-electricity.csv?csvType=full&useColumnShortNames=true'
});
export const EUROPE_ISO3=new Set('ALB AND AUT BEL BIH BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ITA LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU SMR SRB SVK SVN ESP SWE CHE UKR GBR TUR RUS BLR GEO ARM AZE XKX'.split(' '));
export const WORLD_METRICS=Object.freeze([
 {id:'generation',label:'Production électrique',unit:'TWh',decimals:1},
 {id:'clean',label:'Électricité bas-carbone',unit:'%',decimals:1},
 {id:'renewables',label:'Part renouvelable',unit:'%',decimals:1},
 {id:'carbon',label:'Intensité carbone',unit:'gCO₂/kWh',decimals:0}
]);
export function parseAnnualCsv(csv){
 const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines.length<2)throw new Error('Fichier CSV vide');
 const headings=lines.shift().split(',').map(x=>x.trim().toLowerCase());
 const code=headings.indexOf('code'),entity=headings.indexOf('entity'),year=headings.indexOf('year');
 const value=headings.findIndex((_,i)=>i!==code&&i!==entity&&i!==year);
 if(Math.min(code,entity,year,value)<0)throw new Error('Colonnes CSV incompatibles');
 const rows=[];
 for(const line of lines){
   const parts=line.split(',');
   const id=(parts[code]||'').trim(),name=(parts[entity]||'').trim();
   const y=Number(parts[year]),n=Number(parts[value]);
   if(!/^[A-Z]{3}$/.test(id)||!name||!Number.isInteger(y)||y<1980||y>2100||!parts[value]?.trim()||!Number.isFinite(n))continue;
   rows.push({code:id,name,year:y,value:n});
 }
 return rows;
}
export function mergeWorldSeries(series){
 const countries=new Map();
 for(const [key,rows] of Object.entries(series)){
   for(const {code,name,year,value} of rows){
     if(!countries.has(code))countries.set(code,{code,name,years:{}});
     const country=countries.get(code);
     country.years[year]??={year};
     country.years[year][key]=value;
   }
 }
 return [...countries.values()].map(c=>({...c,years:Object.values(c.years).sort((a,b)=>a.year-b.year)})).sort((a,b)=>a.name.localeCompare(b.name));
}
export function latestObservation(country,metric,year){
 if(!country)return null;
 const candidates=country.years.filter(row=>row.year<=year&&Number.isFinite(row[metric]));
 return candidates.length?candidates[candidates.length-1]:null;
}
export function observationAt(country,metric,year){
 return country?.years.find(row=>row.year===year&&Number.isFinite(row[metric]))||null;
}
export function rankCountries(countries,year,metric,region='world'){
 return countries.filter(c=>region!=='europe'||EUROPE_ISO3.has(c.code))
   .map(c=>({country:c,row:observationAt(c,metric,year)}))
   .filter(x=>x.row)
   .sort((a,b)=>b.row[metric]-a.row[metric]);
}
export function countryCodeByName(name,countries){
 const fixes={'United States of America':'USA','Russia':'RUS','Turkey':'TUR','Czechia':'CZE',
 'Dem. Rep. Congo':'COD','Democratic Republic of the Congo':'COD','Republic of the Congo':'COG',
 'United Kingdom':'GBR','South Korea':'KOR','North Korea':'PRK','Iran':'IRN','Vietnam':'VNM',
 'Venezuela':'VEN','Bolivia':'BOL','Tanzania':'TZA','Laos':'LAO','Syria':'SYR',
 'Taiwan':'TWN','W. Sahara':null,'Kosovo':'XKX','Macedonia':'MKD'};
 if(Object.hasOwn(fixes,name))return fixes[name];
 const canonical=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 return countries.find(c=>canonical(c.name)===canonical(name))?.code||null;
}
