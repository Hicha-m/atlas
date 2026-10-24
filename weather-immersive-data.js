/**
 * Météo immersive: parsing & formatting of public Open-Meteo forecasts.
 * Missing fields stay unavailable; neither radar imagery nor local sensor readings are inferred.
 */
export const FORECAST_ENDPOINT='https://api.open-meteo.com/v1/forecast';
export const AIR_ENDPOINT='https://air-quality-api.open-meteo.com/v1/air-quality';
export const LOCATION_DEFAULT={name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698};
export const CITY_SUGGESTIONS=[
 {name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698},
 {name:'Paris',country:'France',latitude:48.8566,longitude:2.3522},
 {name:'Lyon',country:'France',latitude:45.764,longitude:4.8357},
 {name:'Toulouse',country:'France',latitude:43.6047,longitude:1.4442},
 {name:'Rome',country:'Italie',latitude:41.9028,longitude:12.4964},
 {name:'Londres',country:'Royaume-Uni',latitude:51.5072,longitude:-0.1276},
 {name:'Berlin',country:'Allemagne',latitude:52.52,longitude:13.405},
 {name:'New York',country:'États-Unis',latitude:40.7128,longitude:-74.006}
];
export function validLocation(value){
 return value&&typeof value.name==='string'&&typeof value.country==='string'&&
 Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90&&
 Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180;
}
export function forecastUrl(location){
 const p=new URLSearchParams({
  latitude:String(location.latitude),longitude:String(location.longitude),timezone:'auto',
  forecast_days:'10',
  current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day',
  hourly:'temperature_2m,precipitation_probability,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
  daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max'
 });
 return FORECAST_ENDPOINT+'?'+p;
}
export function airUrl(location){
 return AIR_ENDPOINT+'?'+new URLSearchParams({
  latitude:String(location.latitude),longitude:String(location.longitude),timezone:'auto',
  current:'european_aqi,pm2_5,grass_pollen,birch_pollen,olive_pollen'
 });
}
export function condition(code,isDay=1){
 if(code==null||!Number.isFinite(Number(code)))return {icon:'🌡️',label:'Conditions indisponibles',tone:'neutral'};
 if(code===0)return {icon:isDay?'☀️':'🌙',label:'Ciel dégagé',tone:'clear'};
 if(code<=3)return {icon:code===3?'☁️':isDay?'🌤️':'☁️',label:code===3?'Couvert':'Partiellement nuageux',tone:'cloud'};
 if(code<=48)return {icon:'🌫️',label:'Brouillard',tone:'cloud'};
 if(code<=57)return {icon:'🌦️',label:'Bruine',tone:'rain'};
 if(code<=67)return {icon:'🌧️',label:'Pluie',tone:'rain'};
 if(code<=77)return {icon:'🌨️',label:'Neige',tone:'snow'};
 if(code<=82)return {icon:'🌦️',label:'Averses',tone:'rain'};
 if(code<=86)return {icon:'❄️',label:'Averses de neige',tone:'snow'};
 if(code>=95)return {icon:'⛈️',label:'Orage',tone:'storm'};
 return {icon:'🌥️',label:'Conditions variables',tone:'cloud'};
}
export function temp(value,unit='c'){
 if(value==null||!Number.isFinite(Number(value)))return '—';
 return Math.round(unit==='f'?Number(value)*9/5+32:Number(value))+'°';
}
export function decimal(value,decimals=0){
 if(value==null||!Number.isFinite(Number(value)))return '—';
 return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:decimals}).format(Number(value));
}
export function hourLabel(stamp){
 if(typeof stamp!=='string')return '—';
 const m=/T(\d{2}):(\d{2})/.exec(stamp);
 return m?m[1]+':'+m[2]:'—';
}
export function dayLabel(iso,short=false){
 if(typeof iso!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(iso))return '—';
 const date=new Date(iso+'T12:00:00Z');
 return new Intl.DateTimeFormat('fr-FR',{weekday:short?'short':'long',timeZone:'UTC'}).format(date);
}
export function nextHours(data,count=18){
 const times=data?.hourly?.time||[];
 const now=data?.current?.time||times[0]||'';
 const first=Math.max(0,times.findIndex(t=>t>=now.slice(0,13)));
 return times.slice(first,first+count).map((time,i)=>{
  const n=first+i;
  return {time,temperature:data.hourly.temperature_2m?.[n],
   code:data.hourly.weather_code?.[n],isDay:data.hourly.is_day?.[n],
   rain:data.hourly.precipitation_probability?.[n],
   humidity:data.hourly.relative_humidity_2m?.[n]};
 });
}
export function nextDays(data,count=10){
 const daily=data?.daily||{};
 return (daily.time||[]).slice(0,count).map((date,i)=>({
  date,code:daily.weather_code?.[i],high:daily.temperature_2m_max?.[i],
  low:daily.temperature_2m_min?.[i],rain:daily.precipitation_probability_max?.[i],
  amount:daily.precipitation_sum?.[i],
  sunrise:daily.sunrise?.[i],sunset:daily.sunset?.[i],
  uv:daily.uv_index_max?.[i]
 }));
}
export function aqiStatus(value){
 if(!Number.isFinite(value))return {label:'Indisponible',description:'Aucune mesure disponible'};
 if(value<=20)return {label:'Bon',description:'Qualité de l’air bonne'};
 if(value<=40)return {label:'Correct',description:'Qualité de l’air correcte'};
 if(value<=60)return {label:'Modéré',description:'Qualité de l’air moyenne'};
 if(value<=80)return {label:'Mauvais',description:'Qualité de l’air dégradée'};
 if(value<=100)return {label:'Très mauvais',description:'Qualité de l’air très dégradée'};
 return {label:'Extrême',description:'Qualité de l’air extrêmement dégradée'};
}
export function pollenStatus(air){
 const pollen=['grass_pollen','birch_pollen','olive_pollen']
  .map(k=>air?.current?.[k]).filter(x=>typeof x==='number'&&Number.isFinite(x));
 if(!pollen.length)return 'Indisponible';
 const highest=Math.max(...pollen);
 // Measured pollen concentration only: no standardized universal risk score.
 return decimal(highest,0)+' grains/m³';
}
export function insight(data){
 const current=data?.current||{};
 const maxRain=data?.daily?.precipitation_probability_max?.[0];
 if(typeof maxRain==='number'&&maxRain>=60)return 'Risque de pluie important aujourd’hui : pensez à vérifier les précipitations horaires.';
 if(typeof current.wind_speed_10m==='number'&&current.wind_speed_10m>=40)return 'Vent soutenu actuellement : prudence lors de vos déplacements.';
 if(typeof current.temperature_2m==='number'&&current.temperature_2m>=30)return 'Températures élevées : privilégiez les heures les plus fraîches.';
 if(typeof current.temperature_2m==='number'&&current.temperature_2m<=0)return 'Température proche du gel : attention aux conditions extérieures.';
 return 'Les prévisions peuvent évoluer : consultez les heures à venir pour préparer votre journée.';
}
