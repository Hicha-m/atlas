import {
 CITY_SUGGESTIONS,LOCATION_DEFAULT,validLocation,forecastUrl,airUrl,
 condition,temp,decimal,hourLabel,dayLabel,nextHours,nextDays,aqiStatus,pollenStatus,insight
} from './weather-immersive-data.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const cookieName='atlas_weather_location';
const favoriteKey='atlas_immersive_weather_favorites_v1';
const unitKey='atlas_immersive_weather_unit_v1';
const loadJson=(key,fallback)=>{
 try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}
};
function initialPlace(){
 try{
  const cookie=document.cookie.split('; ').find(x=>x.startsWith(cookieName+'='));
  if(cookie){const loc=JSON.parse(decodeURIComponent(cookie.slice(cookieName.length+1)));if(validLocation(loc))return loc;}
 }catch{}
 return LOCATION_DEFAULT;
}
const idOf=c=>Number(c.latitude).toFixed(3)+':'+Number(c.longitude).toFixed(3);
const weekday=date=>dayLabel(date,true).replace('.','');
const todayName=(date,i)=>i===0?"Aujourd’hui":weekday(date).replace(/^./,s=>s.toUpperCase());
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const getNumber=(v,defaultValue)=>numeric(v)??defaultValue;
const labelPct=v=>numeric(v)==null?'—':Math.round(v)+' %';
const saveCookie=location=>{
 document.cookie=cookieName+'='+encodeURIComponent(JSON.stringify(location))+'; Max-Age=15552000; Path=/; SameSite=Lax';
};
const safeFavorites=values=>Array.isArray(values)?values.filter(validLocation).slice(0,12):[];

function iconTile(icon,label,value,sub,extra=''){
 return '<article class="wi-metric '+extra+'"><div class="wi-metric-head"><span class="wi-icon" aria-hidden="true">'+icon+'</span><span>'+esc(label)+'</span></div>'+
 '<div class="wi-metric-value">'+esc(value)+'</div>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</article>';
}
function renderHours(hours,unit){
 if(!hours.length)return '<p class="wi-empty">Prévisions horaires indisponibles.</p>';
 const vals=hours.map(h=>numeric(h.temperature)).filter(v=>v!==null);
 const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(3,max-min);
 return '<div class="wi-hour-scroll"><div class="wi-hours" role="list" aria-label="Prévisions pour les prochaines heures">'+hours.map((h,i)=>{
  const state=condition(h.code,h.isDay);
  const y=50-(getNumber(h.temperature,min)-min)/span*28;
  return '<div role="listitem" class="wi-hour"><span class="wi-hour-label">'+(i===0?'Maintenant':hourLabel(h.time))+'</span>'+
   '<span class="wi-hour-icon" aria-label="'+esc(state.label)+'">'+state.icon+'</span>'+
   '<strong>'+temp(h.temperature,unit)+'</strong><span class="wi-hour-spark" style="--height:'+y.toFixed(1)+'px"><i></i></span>'+
   '<span class="wi-hour-rain"><span aria-hidden="true">💧</span> '+labelPct(h.rain)+'</span></div>';
 }).join('')+'</div></div>';
}
function renderDays(days,unit,selected){
 if(!days.length)return '<p class="wi-empty">Prévisions quotidiennes indisponibles.</p>';
 const min=Math.min(...days.map(d=>numeric(d.low)).filter(v=>v!==null));
 const max=Math.max(...days.map(d=>numeric(d.high)).filter(v=>v!==null));
 const span=Math.max(1,max-min);
 return '<div class="wi-day-list">'+days.map((d,i)=>{
  const st=condition(d.code);
  const left=100*(getNumber(d.low,min)-min)/span;
  const width=100*(getNumber(d.high,max)-getNumber(d.low,min))/span;
  return '<button type="button" class="wi-day'+(selected===i?' active':'')+'" data-day="'+i+'" aria-pressed="'+(selected===i)+'">'+
   '<span class="wi-day-label">'+todayName(d.date,i)+'</span><span class="wi-day-weather" title="'+esc(st.label)+'">'+st.icon+'</span>'+
   '<span class="wi-day-rain">💧 '+labelPct(d.rain)+'</span>'+
   '<span class="wi-day-low">'+temp(d.low,unit)+'</span>'+
   '<span class="wi-day-range"><span style="left:'+Math.max(0,left).toFixed(1)+'%;width:'+Math.min(100,width).toFixed(1)+'%"></span></span>'+
   '<span class="wi-day-high">'+temp(d.high,unit)+'</span></button>';
 }).join('')+'</div>';
}
function weekdayLong(date){
 if(typeof date!=='string')return '—';
 return dayLabel(date,false);
}
function compactDate(date){
 if(typeof date!=='string')return '';
 return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
}
function favoriteButton(city,favorites){
 const fav=favorites.some(c=>idOf(c)===idOf(city));
 return '<button type="button" class="wi-icon-button'+(fav?' is-active':'')+'" id="wi-favorite" aria-label="'+(fav?'Retirer des favoris':'Ajouter aux favoris')+'" title="'+(fav?'Retirer des favoris':'Ajouter aux favoris')+'" aria-pressed="'+fav+'">'+(fav?'★':'☆')+'</button>';
}
function placeItem(city,active,kind='place'){
 return '<button type="button" class="wi-place'+(active?' selected':'')+'" data-lat="'+Number(city.latitude)+'" data-lng="'+Number(city.longitude)+'" data-name="'+esc(city.name)+'" data-country="'+esc(city.country)+'">'+
 '<span class="wi-place-marker" aria-hidden="true">'+(kind==='favorite'?'★':'⌖')+'</span><span class="wi-place-info"><strong>'+esc(city.name)+'</strong><small>'+esc(city.country)+'</small></span>'+(active?'<span class="wi-place-current">Actuel</span>':'')+'</button>';
}

/**
 * Independent view mounted only for #/weather/immersive.
 * All handlers, fetches, geocoding and Leaflet instance are disposed on route exit.
 */
export function mountImmersive(root){
 const state={
  city:initialPlace(),favorites:safeFavorites(loadJson(favoriteKey,[])),
  unit:localStorage.getItem(unitKey)==='f'?'f':'c',
  forecast:null,air:null,loading:true,error:null,airLoading:true,airError:null,
  selectedDay:0,dialog:null,query:'',searching:false,suggestions:[],
  currentRequest:0,searchRequest:0,forecastAbort:null,airAbort:null,searchAbort:null,
  disposed:false,map:null,searchTimer:null,updated:null
 };
 const alive=()=>!state.disposed&&root.isConnected;
 const rootHtml=()=>'<div class="wi-page">'+
  '<header class="wi-toolbar"><div class="wi-brand"><span class="wi-brand-icon">◈</span><div><span class="wi-overline">ATLAS LIVE / MÉTÉO</span><h1>Météo immersive</h1></div></div>'+
  '<div class="wi-header-actions"><a href="#/weather/overview" class="wi-top-link">↗ Vue Atlas</a>'+
  '<button id="wi-refresh" type="button" class="wi-icon-button" title="Actualiser les prévisions" aria-label="Actualiser les prévisions">↻</button>'+
  '<button id="wi-settings-trigger" type="button" class="wi-icon-button" title="Paramètres météo" aria-label="Paramètres météo">⚙</button></div></header>'+
  '<nav class="wi-section-switch" aria-label="Choisir une interface météo"><a href="#/weather/overview">Météo Atlas</a><a href="#/weather/immersive" aria-current="page" class="active">Météo immersive <span>Nouveau</span></a></nav>'+
  '<div id="wi-body" aria-live="off"></div><div id="wi-dialog-portal"></div>'+
  '<footer class="wi-footer">Prévisions : <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · Air et pollens : <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Open-Meteo / CAMS</a> · Fond cartographique : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>. Données modélisées, disponibilités variables. Aucun radar de pluie réel.</footer></div>';
 root.innerHTML=rootHtml();
 const el=selector=>root.querySelector(selector);
 const signalStatus=text=>{
  const status=el('#wi-status');
  if(status)status.textContent=text;
 };
 function build(){
  if(!alive())return;
  if(state.map){state.map.remove();state.map=null;}
  const city=state.city,forecast=state.forecast,air=state.air;
  const d=forecast?.daily||{},current=forecast?.current||{},days=nextDays(forecast,10);
  const today=days[0]||{},selected=days[state.selectedDay]||today;
  const nowCondition=condition(current.weather_code,current.is_day);
  const airValue=numeric(air?.current?.european_aqi);
  const aqi=aqiStatus(airValue);
  const loading=state.loading;
  const weatherLoaded=!!forecast;
  const panel=el('#wi-body');
  if(loading&&!weatherLoaded){
   panel.innerHTML='<div class="wi-skeleton" role="status">Chargement des prévisions pour '+esc(city.name)+'…</div>';
   return;
  }
  if(state.error&&!weatherLoaded){
   panel.innerHTML='<section class="wi-error" role="alert"><h2>Prévisions indisponibles</h2><p>'+esc(state.error)+'</p><button class="wi-primary" id="wi-retry">Réessayer</button></section>';
   el('#wi-retry')?.addEventListener('click',()=>loadForecast(true));
   return;
  }
  const unit=state.unit;
  const icon=nowCondition.icon;
  const updated=state.updated?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(state.updated):'—';
  const AQI=state.airLoading?'Chargement…':airValue==null?'—':String(Math.round(airValue));
  panel.innerHTML=
   '<section class="wi-hero wi-tone-'+nowCondition.tone+'"><div class="wi-hero-top"><div><span class="wi-section-name">LES CONDITIONS ACTUELLES</span><div class="wi-place-heading"><button id="wi-location-trigger" class="wi-location-trigger" type="button" aria-label="Choisir une ville">'+esc(city.name)+' <span aria-hidden="true">⌄</span></button>'+
   favoriteButton(city,state.favorites)+'</div><p class="wi-region">'+esc(city.country)+' · '+decimal(city.latitude,3)+'°, '+decimal(city.longitude,3)+'°</p></div><div class="wi-live-label"><span class="wi-live-dot"></span> Prévisions actualisées à '+esc(updated)+'</div></div>'+
   '<div class="wi-hero-main"><div><div class="wi-current-temp">'+temp(current.temperature_2m,unit)+'</div>'+
   '<h2>'+esc(nowCondition.label)+'</h2><p class="wi-feels">Ressenti '+temp(current.apparent_temperature,unit)+' <span aria-hidden="true">·</span> Max. '+temp(today.high,unit)+' / Min. '+temp(today.low,unit)+'</p></div>'+
   '<div class="wi-weather-art" aria-hidden="true"><span class="wi-halo"></span><span class="wi-weather-symbol">'+icon+'</span></div></div>'+
   '<div class="wi-hero-bottom"><span>✦ '+esc(insight(forecast))+'</span><button type="button" id="wi-hero-settings">⚙ Personnaliser</button></div></section>'+
   '<div class="wi-main-grid"><section class="wi-surface wi-hour-card"><div class="wi-panel-heading"><div><span class="wi-eyebrow">PROCHAINES HEURES</span><h2>Prévisions horaires</h2></div><span class="wi-panel-extra">18 prochaines heures →</span></div>'+
   renderHours(nextHours(forecast,18),unit)+'</section>'+
   '<section class="wi-surface wi-day-card"><div class="wi-panel-heading"><div><span class="wi-eyebrow">VOIR PLUS LOIN</span><h2>Prévisions sur 10 jours</h2></div><span class="wi-panel-extra">Min. — max.</span></div>'+
   renderDays(days,unit,state.selectedDay)+
   '<div class="wi-day-detail" id="wi-day-detail"><div><span>'+esc(weekdayLong(selected.date))+' '+esc(compactDate(selected.date))+'</span><strong>'+esc(condition(selected.code).label)+'</strong></div>'+
   '<div>💧 '+labelPct(selected.rain)+' · '+(numeric(selected.amount)===null?'Précipitations indisponibles':decimal(selected.amount,1)+' mm')+'</div></div></section>'+
   '<section class="wi-details"><div class="wi-panel-heading"><div><span class="wi-eyebrow">EN DÉTAIL</span><h2>Votre météo en un regard</h2></div></div>'+
   '<div class="wi-metrics">'+
   iconTile('💨','Vent',numeric(current.wind_speed_10m)==null?'—':decimal(current.wind_speed_10m)+' km/h','Vitesse actuelle')+
   iconTile('💧','Humidité',numeric(current.relative_humidity_2m)==null?'—':decimal(current.relative_humidity_2m)+' %','Humidité relative')+
   iconTile('☀️','Indice UV',numeric(today.uv)==null?'—':decimal(today.uv,1),'Maximum prévu aujourd’hui')+
   iconTile('🌅','Lever du soleil',hourLabel(today.sunrise),'Heure locale')+
   iconTile('🌇','Coucher du soleil',hourLabel(today.sunset),'Heure locale')+
   iconTile('🌧️','Pluie prévue',labelPct(today.rain),'Probabilité maximale aujourd’hui')+
   iconTile('🌬️','Qualité de l’air',AQI,state.airLoading?'Chargement…':state.airError?'Service indisponible':aqi.label+' · AQI européen')+
   iconTile('🌿','Pollens',state.airLoading?'…':pollenStatus(air),'Maximum parmi les pollens disponibles · CAMS')+
   '</div></section>'+
   '<section class="wi-surface wi-map-card"><div class="wi-panel-heading"><div><span class="wi-eyebrow">EXPLORER AUTOUR DE VOUS</span><h2>Cartes et températures</h2></div><a href="#/weather/heatmap" class="wi-map-link">Ouvrir la carte →</a></div>'+
   '<div class="wi-mini-map" id="wi-mini-map" aria-label="Carte OpenStreetMap autour de '+esc(city.name)+'"><div class="wi-map-fallback">Carte géographique en chargement…</div></div>'+
   '<div class="wi-map-bottom"><span>⌖ '+esc(city.name)+' · Carte géographique, pas un radar de pluie</span><a href="#/weather/map">Carte interactive ↗</a></div></section></div>'+
   '<div class="wi-bottom-line"><span id="wi-status" role="status" aria-live="polite">'+(state.error?'Anciennes prévisions affichées ; erreur de rafraîchissement.':'Données Open-Meteo, fuseau '+esc(forecast.timezone||'local'))+'</span>'+
   '<span>Actualisation manuelle · Pas de géolocalisation automatique</span></div>';
  el('#wi-location-trigger').onclick=()=>openDialog('places');
  el('#wi-favorite').onclick=toggleFavorite;
  el('#wi-settings-trigger').onclick=()=>openDialog('settings');
  el('#wi-hero-settings').onclick=()=>openDialog('settings');
  root.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{
   state.selectedDay=Number(button.dataset.day);
   const item=days[state.selectedDay];
   root.querySelectorAll('[data-day]').forEach(node=>{const active=node===button;node.classList.toggle('active',active);node.setAttribute('aria-pressed',String(active));});
   const detail=el('#wi-day-detail');
   if(detail&&item)detail.innerHTML='<div><span>'+esc(weekdayLong(item.date))+' '+esc(compactDate(item.date))+'</span><strong>'+esc(condition(item.code).label)+'</strong></div>'+
    '<div>💧 '+labelPct(item.rain)+' · '+(numeric(item.amount)===null?'Précipitations indisponibles':decimal(item.amount,1)+' mm')+'</div>';
  }));
  startMap();
 }
 function startMap(){
  const node=el('#wi-mini-map');
  if(!node)return;
  if(typeof window.L==='undefined'){
   node.innerHTML='<div class="wi-map-fallback">Carte indisponible · <a href="#/weather/map">Ouvrir la vue Atlas</a></div>';
   return;
  }
  node.innerHTML='';
  const map=window.L.map(node,{zoomControl:false,scrollWheelZoom:false,dragging:false,keyboard:false,touchZoom:false,doubleClickZoom:false,attributionControl:true,fadeAnimation:false})
   .setView([state.city.latitude,state.city.longitude],8);
  state.map=map;
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  window.L.circleMarker([state.city.latitude,state.city.longitude],{radius:10,color:'#67ddc1',fillColor:'#67ddc1',weight:2,fillOpacity:.28}).addTo(map);
  requestAnimationFrame(()=>{if(!state.disposed&&state.map===map)map.invalidateSize();});
 }
 function openDialog(type){
  if(!alive())return;
  state.dialog=type;
  drawDialog();
  if(type==='places')el('#wi-place-search')?.focus();else el('#wi-settings-close')?.focus();
 }
 function closeDialog(){
  state.dialog=null;state.searchRequest++;clearTimeout(state.searchTimer);state.searchAbort?.abort();state.searchAbort=null;
  el('#wi-dialog-portal').innerHTML='';
 }
 function drawDialog(){
  const portal=el('#wi-dialog-portal');
  if(!portal||!state.dialog)return;
  const places=state.dialog==='places';
  portal.innerHTML='<div class="wi-dialog-backdrop" id="wi-dialog-backdrop">'+
   '<section class="wi-dialog" role="dialog" aria-modal="true" aria-labelledby="wi-dialog-title"><header class="wi-dialog-header"><div><span class="wi-eyebrow">ATLAS WEATHER</span>'+
   '<h2 id="wi-dialog-title">'+(places?'Mes lieux':'Paramètres météo')+'</h2></div><button class="wi-icon-button" id="wi-settings-close" aria-label="Fermer">✕</button></header>'+
   (places?'<label class="wi-field-label" for="wi-place-search">Rechercher une ville</label><input id="wi-place-search" class="wi-dialog-input" type="search" autocomplete="off" placeholder="Ville ou commune…" value="'+esc(state.query)+'">'+
    '<p class="wi-dialog-subtitle">Lieux favoris</p><div class="wi-place-list" id="wi-favorites">'+
    (state.favorites.length?state.favorites.map(c=>placeItem(c,idOf(c)===idOf(state.city),'favorite')).join(''):'<p class="wi-empty">Aucun favori. Utilisez ☆ à côté de la ville pour l’enregistrer.</p>')+'</div>'+
    '<p class="wi-dialog-subtitle">'+(state.query?'Résultats de recherche':'Quelques villes à explorer')+'</p><div class="wi-place-list" id="wi-search-results">'+
    (state.searching?'<p class="wi-empty">Recherche en cours…</p>':(state.query?state.suggestions:CITY_SUGGESTIONS).map(c=>placeItem(c,idOf(c)===idOf(state.city))).join('')||'<p class="wi-empty">Aucun résultat disponible</p>')+'</div>':
    '<div class="wi-setting"><div><strong>Unité de température</strong><small>Modifie seulement l’affichage, pas les données sources.</small></div><div class="wi-unit-switch">'+
    '<button type="button" data-unit="c" aria-pressed="'+(state.unit==='c')+'" class="'+(state.unit==='c'?'active':'')+'">°C</button>'+
    '<button type="button" data-unit="f" aria-pressed="'+(state.unit==='f')+'" class="'+(state.unit==='f'?'active':'')+'">°F</button></div></div>'+
    '<div class="wi-setting"><div><strong>Actualisation</strong><small>Manuelle pour éviter les requêtes inutiles. Dernière mise à jour affichée dans l’en-tête.</small></div><span>↻</span></div>'+
    '<div class="wi-setting"><div><strong>Confidentialité</strong><small>La dernière ville sélectionnée est partagée avec la vue Atlas via un cookie fonctionnel. Vos favoris restent stockés localement dans le navigateur.</small></div></div>'+
    '<button id="wi-erase-preference" type="button" class="wi-secondary">Réinitialiser la position et les favoris</button>')+
   '</section></div>';
  el('#wi-settings-close').onclick=closeDialog;
  el('#wi-dialog-backdrop').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDialog();});
  if(places){
   const input=el('#wi-place-search');
   input.addEventListener('input',()=>{state.query=input.value.trim();searchPlaces(state.query);});
   portal.querySelectorAll('.wi-place').forEach(button=>button.onclick=()=>{
    chooseCity({name:button.dataset.name,country:button.dataset.country,latitude:Number(button.dataset.lat),longitude:Number(button.dataset.lng)});
   });
  }else{
   portal.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>{
    state.unit=button.dataset.unit;localStorage.setItem(unitKey,state.unit);closeDialog();build();
   });
   el('#wi-erase-preference').onclick=()=>{
    localStorage.removeItem(favoriteKey);state.favorites=[];
    document.cookie=cookieName+'=; Max-Age=0; Path=/; SameSite=Lax';
    chooseCity(LOCATION_DEFAULT);
   };
  }
 }
 async function searchPlaces(query){
  clearTimeout(state.searchTimer);state.searchAbort?.abort();state.searching=false;
  const field=el('#wi-place-search');
  if(!query){state.suggestions=[];drawDialog();el('#wi-place-search')?.focus();return;}
  const term=query.toLocaleLowerCase('fr-FR');
  state.suggestions=CITY_SUGGESTIONS.filter(c=>(c.name+' '+c.country).toLocaleLowerCase('fr-FR').includes(term));
  if(query.length<2){drawDialog();el('#wi-place-search')?.focus();return;}
  const sequence=++state.searchRequest;
  state.searching=true;
  // Preserve typed focus/caret: redraw only the results, not the search input.
  const results=el('#wi-search-results');
  if(results)results.innerHTML='<p class="wi-empty">Recherche en cours…</p>';
  state.searchTimer=setTimeout(async()=>{
   const controller=new AbortController();state.searchAbort=controller;
   try{
    const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query,count:8,language:'fr',format:'json'}),{signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    const json=await response.json();
    if(sequence!==state.searchRequest||!alive()||state.dialog!=='places')return;
    const filtered=(json.results||[]).map(c=>({name:c.name,country:c.country||'',latitude:c.latitude,longitude:c.longitude})).filter(validLocation);
    state.suggestions=filtered.length?filtered:state.suggestions;
   }catch(error){if(error.name!=='AbortError')console.warn('Geocoding unavailable:',error);}
   finally{
    if(sequence===state.searchRequest&&alive()&&state.dialog==='places'){
     state.searching=false;
     const placeList=el('#wi-search-results');
     if(placeList){
      placeList.innerHTML=state.suggestions.length?state.suggestions.map(c=>placeItem(c,idOf(c)===idOf(state.city))).join(''):'<p class="wi-empty">Aucune ville trouvée</p>';
      placeList.querySelectorAll('.wi-place').forEach(button=>button.onclick=()=>chooseCity({name:button.dataset.name,country:button.dataset.country,latitude:Number(button.dataset.lat),longitude:Number(button.dataset.lng)}));
     }
    }
   }
  },300);
 }
 function chooseCity(next){
  if(!validLocation(next))return;
  state.city={name:next.name,country:next.country,latitude:Number(next.latitude),longitude:Number(next.longitude)};
  saveCookie(state.city);
  state.selectedDay=0;
  state.query='';closeDialog();loadForecast(true);
 }
 function toggleFavorite(){
  const exists=state.favorites.some(c=>idOf(c)===idOf(state.city));
  state.favorites=exists?state.favorites.filter(c=>idOf(c)!==idOf(state.city)):[state.city,...state.favorites].slice(0,12);
  localStorage.setItem(favoriteKey,JSON.stringify(state.favorites));
  build();
 }
 function providerUrl(kind,place){
  // Local static development uses the public provider directly. Vercel production
  // uses a cached same-origin function, avoiding browser/CORS stalls.
  if(['localhost','127.0.0.1'].includes(window.location.hostname))
   return kind==='forecast'?forecastUrl(place):airUrl(place);
  const params=new URLSearchParams({kind,lat:String(place.latitude),lon:String(place.longitude)});
  return '/api/immersive-weather?'+params;
 }
 async function fetchWithDeadline(url,controller){
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},12000);
  try{
   const response=await fetch(url,{signal:controller.signal});
   if(!response.ok){
    let message='HTTP '+response.status;
    try{const payload=await response.json();if(payload?.error)message+=' · '+payload.error;}catch{}
    throw Error(message);
   }
   return await response.json();
  }catch(error){
   if(timedOut)throw Error('délai fournisseur dépassé (12 s)');
   throw error;
  }finally{clearTimeout(timer);}
 }
 async function loadForecast(refresh=false){
  if(!alive())return;
  const sequence=++state.currentRequest,location={...state.city};
  state.forecastAbort?.abort();state.airAbort?.abort();
  state.forecastAbort=new AbortController();state.airAbort=new AbortController();
  state.loading=true;state.error=null;state.airLoading=true;state.airError=null;state.air=null;
  if(!state.forecast||refresh&&idOf(location)!==idOf(state.previousLocation||LOCATION_DEFAULT))state.forecast=null;
  build();
  const req=fetchWithDeadline(providerUrl('forecast',location),state.forecastAbort).then(json=>{
   if(sequence!==state.currentRequest||!alive())return;
   if(!json?.current||!Array.isArray(json?.daily?.time)||!Array.isArray(json?.hourly?.time))throw Error('Réponse météo incomplète');
   state.forecast=json;state.previousLocation=location;state.loading=false;state.updated=new Date();build();
  }).catch(error=>{
   if(sequence!==state.currentRequest||!alive())return;
   if(error.name==='AbortError')return;
   state.error='Impossible de charger Open-Meteo ('+error.message+').';
   state.loading=false;build();
  });
  const aq=fetchWithDeadline(providerUrl('air',location),state.airAbort).then(json=>{
   if(sequence!==state.currentRequest||!alive())return;
   state.air=json;state.airLoading=false;
   if(state.forecast)updateAirMetrics();
  }).catch(error=>{
   if(sequence!==state.currentRequest||!alive())return;
   if(error.name==='AbortError')return;
   state.airError=error.message;state.airLoading=false;
   if(state.forecast)updateAirMetrics();
  });
  await Promise.allSettled([req,aq]);
 }
 function updateAirMetrics(){
  // Update the two cards without remounting the Leaflet map or resetting the 10-day selection.
  const metricEls=root.querySelectorAll('.wi-metric');
  if(metricEls.length<8)return;
  const aqi=numeric(state.air?.current?.european_aqi);
  metricEls[6].querySelector('.wi-metric-value').textContent=state.airLoading?'Chargement…':aqi==null?'—':String(Math.round(aqi));
  metricEls[6].querySelector('p').textContent=state.airError?'Service indisponible':aqiStatus(aqi).label+' · AQI européen';
  metricEls[7].querySelector('.wi-metric-value').textContent=state.airLoading?'…':pollenStatus(state.air);
 }
 const handleKey=e=>{if(e.key==='Escape'&&state.dialog)closeDialog();};
 root.addEventListener('keydown',handleKey);
 el('#wi-refresh').onclick=()=>loadForecast(true);
 el('#wi-settings-trigger').onclick=()=>openDialog('settings');
 loadForecast();
 // Root may be detached by the client-side router; callers always invoke dispose on route exit.
 return ()=>{
  state.disposed=true;state.currentRequest++;state.searchRequest++;
  clearTimeout(state.searchTimer);state.forecastAbort?.abort();state.airAbort?.abort();state.searchAbort?.abort();
  if(state.map)state.map.remove();state.map=null;
  root.removeEventListener('keydown',handleKey);
 };
}
