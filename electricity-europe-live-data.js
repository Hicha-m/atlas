/* Energy-Charts Fraunhofer ISE: recent European net public production per fuel.
   Production is not the same as demand or total generation including self-producers. */
export const ENERGY_CHARTS_API='https://api.energy-charts.info/public_power';
export const EUROPE_CODES=Object.freeze({
 AUT:'at',BEL:'be',BIH:'ba',BGR:'bg',HRV:'hr',CYP:'cy',CZE:'cz',DNK:'dk',EST:'ee',FIN:'fi',FRA:'fr',
 DEU:'de',GRC:'gr',HUN:'hu',IRL:'ie',ITA:'it',LVA:'lv',LTU:'lt',LUX:'lu',MDA:'md',MNE:'me',NLD:'nl',
 MKD:'mk',NOR:'no',POL:'pl',PRT:'pt',ROU:'ro',SRB:'rs',SVK:'sk',SVN:'si',ESP:'es',SWE:'se',
 CHE:'ch',UKR:'ua',GBR:'uk',GEO:'ge',XKX:'xk'
});
export function energyChartsUrl(iso3,now=new Date()){
 const code=EUROPE_CODES[iso3];
 if(!code)return null;
 const start=new Date(now.getTime()-3*86400000);
 const day=d=>d.toISOString().slice(0,10);
 const url=new URL(ENERGY_CHARTS_API);
 url.searchParams.set('country',code);
 url.searchParams.set('start',day(start));
 url.searchParams.set('end',day(now));
 return url.toString();
}
export function normalizeRecentPower(payload){
 if(!payload||!Array.isArray(payload.unix_seconds)||!Array.isArray(payload.production_types))
  throw new Error('Structure Energy-Charts invalide');
 const {unix_seconds,production_types}=payload;
 const points=[];
 for(let i=0;i<unix_seconds.length;i++){
  const ts=Number(unix_seconds[i]);
  if(!Number.isFinite(ts))continue;
  let total=0,valid=0;
  const sources=[];
  for(const item of production_types){
   const n=item?.data?.[i];
   if(typeof n!=='number'||!Number.isFinite(n)||n<0)continue;
   const name=String(item.name||'');
   // Aggregates and pumping represent load or duplicative totals, not production technologies.
   if(/pumped storage consumption|load|total|aggregate|battery consumption/i.test(name))continue;
   sources.push({name,mw:n});total+=n;valid++;
  }
  if(valid&&total>0)points.push({timestamp:ts*1000,totalMW:total,sources:sources.sort((a,b)=>b.mw-a.mw)});
 }
 if(!points.length)throw new Error('Pas de mesures de production exploitables');
 return points;
}
