const modules = [
 ['weather','Météo mondiale','Conditions et prévisions, température, pluie et vent','☁️','Open-Meteo'],
 ['electricity','Électricité','Production, consommation et mix énergétique','⚡','RTE éCO2mix'],
 ['transport','Transports','Horaires, retards et positions disponibles','🚆','transport.data.gouv.fr'],
 ['bikes','Vélos partagés','Disponibilité des vélos et bornes','🚲','GBFS'],
 ['planes','Avions en vol','Trajectoires, altitude et vitesse','✈️','OpenSky'],
 ['earthquakes','Séismes','Événements sismiques et magnitudes','🌍','USGS'],
 ['air','Qualité de l’air','Polluants et observations des capteurs','🌫️','OpenAQ'],
 ['rivers','Cours d’eau','Hauteurs et débits des stations','💧','HydroPortail'],
 ['fuel','Carburants','Prix et historique par station','⛽','Prix-carburants'],
 ['crypto','Cryptomonnaies','Transactions et cours des actifs','₿','Kraken'],
 ['stocks','Marchés financiers','Cours et indicateurs de marché','📈','Alpha Vantage'],
 ['ships','Navires','Positions AIS et routes maritimes','🚢','AISStream'],
 ['satellites','Satellites','Orbites et suivi des satellites','🛰️','CelesTrak'],
 ['radio','Radios','Stations et catalogue mondial','📻','Radio Browser'],
 ['cyber','Cybermenaces','Observations d’URL malveillantes','🛡️','URLhaus']
];
const $ = s => document.querySelector(s);
const safe = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let weatherMap=null, weatherMarker=null, weatherRequest=0, heatRequest=0, heatOverlay=null;
const WEATHER_PAGES=['overview','map','heatmap','data'];
let currentWeatherPage='overview';
let selectedForecastDay=null, citySearchTimer=null, citySearchSequence=0, heatRefreshTimer=null;
const FEATURED_CITIES=[{name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698},{name:'Paris',country:'France',latitude:48.8566,longitude:2.3522},{name:'Lyon',country:'France',latitude:45.764,longitude:4.8357},{name:'Toulouse',country:'France',latitude:43.6047,longitude:1.4442},{name:'Bordeaux',country:'France',latitude:44.8378,longitude:-0.5792},{name:'Lille',country:'France',latitude:50.6292,longitude:3.0573},{name:'Rome',country:'Italie',latitude:41.9028,longitude:12.4964},{name:'Londres',country:'Royaume-Uni',latitude:51.5072,longitude:-0.1276},{name:'Berlin',country:'Allemagne',latitude:52.52,longitude:13.405},{name:'New York',country:'États-Unis',latitude:40.7128,longitude:-74.006}];
function weatherPageFromHash(hash){const page=hash.split('/')[1]||'overview';return WEATHER_PAGES.includes(page)?page:'overview';}
function savedWeatherLocation(){try{const m=document.cookie.match(/(?:^|; )atlas_weather_location=([^;]*)/);if(!m)return null;const p=JSON.parse(decodeURIComponent(m[1]));if(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)return null;return {name:String(p.name||'Position enregistrée').slice(0,100),country:String(p.country||'').slice(0,100),latitude:p.latitude,longitude:p.longitude};}catch{return null;}}
function rememberWeatherLocation(){document.cookie='atlas_weather_location='+encodeURIComponent(JSON.stringify(city))+'; Max-Age=15552000; Path=/; SameSite=Lax';}

let weather=null, city={name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698},lastUpdate=null;
function nav(){ $('#nav').innerHTML=`<a class="nav-link ${location.hash==='#/'||!location.hash?'active':''}" href="#/"><span class="sym">▦</span> Vue d'ensemble</a>`+modules.map(m=>`<a class="nav-link ${(location.hash==='#/'+m[0]||location.hash.startsWith('#/'+m[0]+'/'))?'active':''}" href="#/${m[0]}"><span class="sym">${m[3]}</span> ${m[1]} ${m[0]==='weather'?'<small>●</small>':''}</a>`).join(''); }
function render(){
 if(weatherMap){weatherMap.remove();weatherMap=null;weatherMarker=null;heatOverlay=null;}
 clearTimeout(heatRefreshTimer);clearTimeout(citySearchTimer);heatRequest++;citySearchSequence++;
 let id=decodeURIComponent(location.hash.startsWith('#/')?location.hash.slice(2):'');
 const root=id.split('/')[0]||'';
 nav();
 $('#crumb').textContent=root?'Atlas / '+(modules.find(m=>m[0]===root)?.[1]||'Module'):'Atlas / Explorer';
 if(!root)home();else if(root==='weather'){currentWeatherPage=weatherPageFromHash(location.hash.startsWith('#/')?location.hash.slice(2):'');weatherView();}else placeholder(modules.find(m=>m[0]===root));
 window.scrollTo({top:0,behavior:'instant'});
}
function home(){ $('#app').innerHTML=`<section class="hero"><div class="eyebrow">◉ EXPLOREZ LE MONDE EN DONNÉES</div><h1>Le monde, <span class="accent">en direct.</span><br/>À portée de clic.</h1><p class="lead">Un seul espace pour explorer, comparer, visualiser et exporter les données publiques. Quinze univers, une expérience unifiée.</p><div class="stats"><div class="stat"><b>15</b><small>Univers de données</small></div><div class="stat"><b>01</b><small>Module opérationnel</small></div><div class="stat"><b>∞</b><small>Possibilités d'exploration</small></div></div></section><div class="section-head"><div><h2>Explorer les données</h2><p>Chaque univers possède son propre tableau de bord interactif.</p></div><input id="filter" class="searchbar" placeholder="⌕  Rechercher un univers..." aria-label="Rechercher un univers" /></div><div class="grid" id="catalog"></div>`;$('#filter').addEventListener('input',e=>catalog(e.target.value));catalog(''); }
function catalog(query){const list=modules.filter(m=>`${m[1]} ${m[2]} ${m[4]}`.toLowerCase().includes(query.toLowerCase()));$('#catalog').innerHTML=list.map(m=>`<a href="#/${m[0]}" class="card"><span class="pill ${m[0]==='weather'?'ready':''}">${m[0]==='weather'?'ACTIF':'À VENIR'}</span><span class="card-icon">${m[3]}</span><h3>${m[1]}</h3><p>${m[2]}</p><span class="arrow">↗</span></a>`).join('')||'<p>Aucun résultat.</p>';}
function placeholder(m){if(!m){home();return;}$('#app').innerHTML=`<a class="back" href="#/">← Tous les modules</a><div class="eyebrow">MODULE EN PRÉPARATION</div><h1>${m[3]} ${m[1]}</h1><p class="lead">${m[2]}</p><div class="empty"><h2>Ce module sera développé prochainement.</h2><p>Fournisseur prévu : ${safe(m[4])}. Il sera intégré à la même architecture que le module Météo, avec des outils adaptés à ces données.</p><a class="btn" href="#/">Revenir au catalogue →</a></div>`;}
function weatherView(){
 const p=currentWeatherPage;
 const tabs=[['overview','◫','Vue d’ensemble'],['map','◉','Carte interactive'],['heatmap','◈','Carte des chaleurs'],['data','▤','Données horaires']];
 $('#app').innerHTML=`<div class="repo-heading"><div class="repo-title"><span class="repo-icon">☁</span><div><div class="repo-eyebrow">Atlas Live / Module 01</div><h1>Météo mondiale <span class="state-pill">Actif</span></h1><p>Prévisions ouvertes, cartes interactives et données exportables.</p></div></div><div class="actions"><button class="btn" id="exportjson">↓ JSON</button><button class="btn" id="exportcsv">↓ CSV</button><button class="btn" id="refresh">↻ Actualiser</button></div></div>
 <nav class="weather-tabs" aria-label="Vues du module météo">${tabs.map(([key,icon,label])=>`<a href="#/weather/${key}" class="weather-tab ${p===key?'selected':''}" ${p===key?'aria-current="page"':''}><span class="tab-icon">${icon}</span>${label}</a>`).join('')}</nav>
 <div class="panel controls-panel"><form id="searchform" class="controls"><div class="control city"><label for="city">Localisation</label><input id="city" class="field" placeholder="Chercher ou choisir une ville" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="city-suggestions" aria-expanded="false" value="${city.name==='Point sélectionné'?'':safe(city.name)}" required /><div id="city-suggestions" class="city-suggestions" role="listbox" hidden></div></div><div class="control"><label for="days">Période</label><select id="days" class="field"><option value="3">3 jours</option><option value="7" selected>7 jours</option><option value="14">14 jours</option></select></div><div class="control"><button class="btn primary" type="submit">⌕ Rechercher</button></div><button type="button" class="btn reset-location" id="forget-location" title="Effacer le cookie de position">Oublier ma position</button></form><div class="message" id="status" role="status" aria-live="polite"></div></div>
 ${p==='overview'||p==='map'? `<section class="panel map-panel"><div class="map-heading"><div><h3>${p==='map'?'Explorer la carte':'Localiser un point'}</h3><p>Cliquez sur un lieu pour ses prévisions. Ctrl + molette pour zoomer.</p></div><div id="coordinates" class="coordinates"></div></div><div id="weather-map" class="${p==='map'?'map-full':''}" aria-label="Carte mondiale interactive"></div><div class="map-help">© OpenStreetMap contributors · La dernière position est retenue 180 jours dans un cookie fonctionnel.</div></section>`:''}
 ${p==='heatmap'?`<section class="panel map-panel"><div class="map-heading"><div><h3>Carte des températures</h3><p>Couche de chaleur calculée à partir de points d'échantillonnage Open-Meteo, interpolation indicative (non satellitaire).</p></div><button id="reload-heat" class="btn">↻ Actualiser la zone</button></div><div id="weather-map" class="map-full" aria-label="Carte de chaleur des températures"></div><div class="heat-legend"><span>Froid</span><div class="heat-gradient" aria-label="Gradient de températures du froid au chaud"></div><span>Chaud</span><strong id="heat-range">Chargement…</strong></div><div id="heat-scale" class="heat-scale" aria-label="Correspondance couleurs et températures">Échelle en chargement…</div><p class="map-help">Déplacez, zoomez ou cliquez sur la carte : la couche thermique se met à jour automatiquement. Les valeurs sont modélisées et interpolées, pas relevées en continu.</p><div id="coordinates" class="coordinates heat-coordinates"></div></section>`:''}
 <div id="result"></div>
 <div class="panel sources"><strong>Données & confidentialité</strong><p>Météo : <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. Carte : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>. Un cookie strictement fonctionnel atlas_weather_location conserve uniquement votre dernière position sélectionnée. Le bouton « Oublier ma position » le supprime. Aucune géolocalisation automatique.</p></div>`;
 $('#searchform').addEventListener('submit',searchCity);
 initCityPicker();
 $('#refresh').onclick=()=>p==='heatmap'?loadHeatmap():loadWeather();
 $('#exportjson').onclick=()=>exportData('json');
 $('#exportcsv').onclick=()=>exportData('csv');
 $('#days').onchange=()=>loadWeather();
 $('#forget-location').onclick=()=>{document.cookie='atlas_weather_location=; Max-Age=0; Path=/; SameSite=Lax';city={name:'Marseille',country:'France',latitude:43.2965,longitude:5.3698};$('#city').value='Marseille';if(weatherMap){weatherMap.setView([city.latitude,city.longitude],6);weatherMarker?.setLatLng([city.latitude,city.longitude]);}updateCoordinates();loadWeather();status('Préférence effacée. Marseille est désormais le point affiché.');};
 if(p!=='data')initWeatherMap();
 if(p==='heatmap'){$('#reload-heat').onclick=loadHeatmap;loadHeatmap();}
 loadWeather();
}
function initWeatherMap(){
 const el=$('#weather-map');if(!el)return;
 if(typeof L==='undefined'){el.textContent='La carte est indisponible : bibliothèque cartographique non chargée.';return;}
 weatherMap=L.map(el,{scrollWheelZoom:false,zoomControl:true}).setView([city.latitude,city.longitude],currentWeatherPage==='heatmap'?5:6);
 // Zoom intentionally requires Ctrl when pointer is above the map, avoiding accidental page-scroll capture.
 el.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();weatherMap.setZoom(weatherMap.getZoom()+(e.deltaY<0?1:-1));},{passive:false});
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(weatherMap);
 weatherMarker=L.marker([city.latitude,city.longitude]).addTo(weatherMap);
 updateCoordinates();
 weatherMap.on('click',async ({latlng})=>{
   city={name:'Point sélectionné',country:'Coordonnées GPS',latitude:+latlng.lat.toFixed(5),longitude:+latlng.lng.toFixed(5)};
   $('#city').value=''; updateCoordinates();
   weatherMarker.setLatLng(latlng);rememberWeatherLocation();selectedForecastDay=null;
   await loadWeather();if(currentWeatherPage==='heatmap')scheduleHeatmap();
 });
 if(currentWeatherPage==='heatmap')weatherMap.on('moveend',scheduleHeatmap);
 setTimeout(()=>weatherMap?.invalidateSize(),0);
}
function updateCoordinates(){const el=$('#coordinates');if(el)el.textContent=city.latitude.toFixed(4)+'°, '+city.longitude.toFixed(4)+'°';}
function applyCity(candidate){
 city={name:candidate.name,country:candidate.country||'',latitude:candidate.latitude,longitude:candidate.longitude};
 selectedForecastDay=null;
 $('#city').value=city.name;hideCitySuggestions();rememberWeatherLocation();updateCoordinates();
 if(weatherMap){weatherMap.setView([city.latitude,city.longitude],9);weatherMarker?.setLatLng([city.latitude,city.longitude]);}
 loadWeather();if(currentWeatherPage==='heatmap')scheduleHeatmap();
}
function hideCitySuggestions(){const list=$('#city-suggestions'),field=$('#city');if(list)list.hidden=true;if(field)field.setAttribute('aria-expanded','false');}
function showCitySuggestions(items){
 const list=$('#city-suggestions'),input=$('#city');if(!list||!input)return;
 list.replaceChildren();
 items.forEach((c,index)=>{
  const item=document.createElement('button');item.type='button';item.className='city-option';item.setAttribute('role','option');item.id='city-option-'+index;
  item.textContent=c.name+' · '+(c.country||'');
  item.addEventListener('mousedown',e=>e.preventDefault());
  item.addEventListener('click',()=>applyCity(c));list.appendChild(item);
 });
 list.hidden=items.length===0;input.setAttribute('aria-expanded',String(items.length>0));
}
function initCityPicker(){
 const input=$('#city');if(!input)return;
 const featured=()=>FEATURED_CITIES.filter(c=>c.name.toLowerCase().includes(input.value.trim().toLowerCase()));
 input.addEventListener('focus',()=>showCitySuggestions(featured()));
 input.addEventListener('input',()=>{
  clearTimeout(citySearchTimer);const query=input.value.trim(),serial=++citySearchSequence;
  showCitySuggestions(featured());
  if(query.length<2)return;
  citySearchTimer=setTimeout(async()=>{
   try{const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query,count:8,language:'fr',format:'json'}));
    if(!response.ok)throw Error('Recherche indisponible');
    const data=await response.json();if(serial!==citySearchSequence)return;
    const cities=(data.results||[]).map(c=>({name:c.name,country:c.country,latitude:c.latitude,longitude:c.longitude}));
    showCitySuggestions(cities.length?cities:featured());
   }catch{if(serial===citySearchSequence)showCitySuggestions(featured());}
  },280);
 });
 input.addEventListener('keydown',event=>{
  const list=$('#city-suggestions'),items=[...(list?.querySelectorAll('.city-option')||[])];
  if(event.key==='Escape')hideCitySuggestions();
  if(event.key==='ArrowDown'&&items.length){event.preventDefault();items[0].focus();}
 });
 $('#city-suggestions')?.addEventListener('keydown',e=>{
  const items=[...$('#city-suggestions').querySelectorAll('.city-option')],index=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();items[(index+1)%items.length]?.focus();}
  if(e.key==='ArrowUp'){e.preventDefault();items[(index-1+items.length)%items.length]?.focus();}
  if(e.key==='Escape'){hideCitySuggestions();input.focus();}
 });
 document.addEventListener('pointerdown',event=>{if(!input.isConnected)return;if(!event.target.closest('.control.city'))hideCitySuggestions();});
}

async function searchCity(e){
 e.preventDefault();const name=$('#city').value.trim();if(!name)return;
 hideCitySuggestions();status('Recherche de la ville…');
 try{const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name,count:1,language:'fr',format:'json'}));
  if(!response.ok)throw Error('API localisation : HTTP '+response.status);
  const data=await response.json();if(!data.results?.length)throw Error('Aucune ville trouvée.');
  applyCity(data.results[0]);
 }catch(error){status(error.message,true);}
}
function scheduleHeatmap(){clearTimeout(heatRefreshTimer);heatRefreshTimer=setTimeout(()=>{if(currentWeatherPage==='heatmap'&&weatherMap)loadHeatmap();},450);}
async function loadWeather(){const requestId=++weatherRequest;const n=$('#days')?.value||7;status('Récupération des prévisions…');try{const params=new URLSearchParams({latitude:city.latitude,longitude:city.longitude,timezone:'auto',forecast_days:n,current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'});const r=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);if(!r.ok)throw Error(`API météo : HTTP ${r.status}`);const response=await r.json();if(requestId!==weatherRequest)return;weather=response;if(selectedForecastDay&&!weather.daily.time.includes(selectedForecastDay))selectedForecastDay=null;lastUpdate=new Date();showWeather();status(`✓ Données chargées à ${lastUpdate.toLocaleTimeString('fr-FR')} · ${city.name}, ${city.country} · Fuseau : ${weather.timezone}`);}catch(err){if(requestId===weatherRequest)status(`Erreur : ${err.message}`,true);}}
function status(msg,isError=false){const el=$('#status');if(el){el.textContent=msg;el.className='message'+(isError?' error':'');}}
const conditions=code=>code===0?['☀️','Ciel dégagé']:code<=3?['⛅','Nuageux']:code<=48?['≋','Brouillard']:code<=67?['🌧️','Pluie']:code<=77?['❄️','Neige']:code<=82?['🌦️','Averses']:code<=86?['🌨️','Neige']:code>=95?['⛈️','Orage']:['🌤️','Variable'];
const fmt=(n,d=0)=>n==null?'—':Number(n).toFixed(d);
function showWeather(){if(!weather)return;if(currentWeatherPage==='heatmap'){showHeatSelection();return;}if(currentWeatherPage==='data'){showWeatherTable();return;}if(currentWeatherPage==='map'){showMapSelection();return;}const d=weather.daily,dayIndex=selectedForecastDay?d.time.indexOf(selectedForecastDay):-1;const c=weather.current,w=conditions(dayIndex>=0?d.weather_code[dayIndex]:c.weather_code);$('#result').innerHTML=`<div class="weather-grid"><section class="panel now"><div class="eyebrow">${dayIndex>=0?'JOUR SÉLECTIONNÉ · '+safe(selectedForecastDay):'CONDITIONS ACTUELLES · MODÈLE MÉTÉO'}</div><div class="now-city">${safe(city.name)} <small style="font-size:13px;color:#abc2d3">${safe(city.country)}</small></div><div class="temp">${fmt(dayIndex>=0?d.temperature_2m_max[dayIndex]:c.temperature_2m)}° <span style="font-size:42px">${w[0]}</span></div><div class="description">${w[1]} · ${dayIndex>=0?'Min '+fmt(d.temperature_2m_min[dayIndex])+' °C':'Ressenti '+fmt(c.apparent_temperature)+' °C'}</div><div class="metrics"><div class="metric"><small>Humidité</small><strong>${fmt(c.relative_humidity_2m)} %</strong></div><div class="metric"><small>Vent</small><strong>${fmt(c.wind_speed_10m)} km/h</strong></div><div class="metric"><small>Précipitations</small><strong>${fmt(c.precipitation,1)} mm</strong></div><div class="metric"><small>Heure du relevé</small><strong style="font-size:16px">${safe(c.time?.slice(11)||'—')}</strong></div></div></section><section class="panel"><div class="section-head" style="margin:0 0 16px"><div><h3>Évolution horaire</h3><p>Prochaines 24 heures disponibles à partir de l'heure actuelle</p></div><select id="metric" class="field" style="width:auto"><option value="temperature_2m">Température (°C)</option><option value="relative_humidity_2m">Humidité (%)</option><option value="precipitation_probability">Probabilité de pluie (%)</option><option value="wind_speed_10m">Vent (km/h)</option></select></div><div class="chart-summary" id="chart-summary"></div><div id="chart" class="chart-wrap"></div><div id="chart-tooltip" class="chart-tooltip" role="status">Survolez un point de la courbe pour consulter ses valeurs.</div></section></div><section class="panel"><h3>Prévisions quotidiennes</h3><p class="daily-hint">Cliquez sur un jour pour afficher son évolution horaire et ses conditions.</p><div class="days">${d.time.map((day,i)=>`<button type="button" class="day ${selectedForecastDay===day?'chosen':''}" data-day="${day}" aria-pressed="${selectedForecastDay===day}"><b>${new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'})}</b><span class="emoji ${d.weather_code[i]>=45&&d.weather_code[i]<=48?'fog-icon':''}" title="${conditions(d.weather_code[i])[1]}" aria-label="${conditions(d.weather_code[i])[1]}">${conditions(d.weather_code[i])[0]}</span><strong>${fmt(d.temperature_2m_max[i])}° / ${fmt(d.temperature_2m_min[i])}°</strong><small>☔ ${fmt(d.precipitation_sum[i],1)} mm</small></button>`).join('')}</div></section>`;$('#metric').onchange=drawChart;$('#result').querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{selectedForecastDay=button.dataset.day;showWeather();}));drawChart();}
const chartMetrics={
 temperature_2m:{label:'Température',unit:'°C'},
 relative_humidity_2m:{label:'Humidité relative',unit:'%'},
 precipitation_probability:{label:'Probabilité de pluie',unit:'%'},
 wind_speed_10m:{label:'Vitesse du vent',unit:'km/h'}
};
function graphPoints(values,baseline=44,height=180){const lo=Math.min(...values),hi=Math.max(...values);const min=lo===hi?lo-1:Math.floor(lo-1),max=lo===hi?hi+1:Math.ceil(hi+1);return values.map((value,i)=>({x:62+i*630/Math.max(1,values.length-1),y:baseline+height-(value-min)/(max-min)*height,value}));}
function drawChart(){
 const selector=$('#metric');if(!selector||!weather)return;
 const key=selector.value,metric=chartMetrics[key],hr=weather.hourly;
 const current=weather.current.time.slice(0,13);
 const index=hr.time.findIndex(t=>selectedForecastDay?t.startsWith(selectedForecastDay):t.slice(0,13)>=current);
 const start=index<0?0:index;
 const values=hr[key].slice(start,start+24),times=hr.time.slice(start,start+24);
 if(!values.length){$('#chart').textContent='Aucune mesure disponible.';return;}
 const points=graphPoints(values);
 const lo=Math.min(...values),hi=Math.max(...values),min=lo===hi?lo-1:Math.floor(lo-1),max=lo===hi?hi+1:Math.ceil(hi+1);
 const path=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
 const grid=Array.from({length:5},(_,i)=>{const y=44+i*45,v=max-(max-min)*i/4;return `<line x1="62" y1="${y}" x2="692" y2="${y}" class="chart-grid"/><text x="52" y="${y+4}" text-anchor="end" class="chart-label">${fmt(v,1)}</text>`;}).join('');
 const ticks=times.map((t,i)=>i%4===0?`<text x="${points[i].x}" y="245" text-anchor="middle" class="chart-label">${t.slice(11,16)}</text>`:'').join('');
 const circles=points.map((p,i)=>`<circle data-index="${i}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="5" class="chart-point" tabindex="0" role="button" aria-label="${safe(times[i])}: ${p.value} ${metric.unit}"><title>${safe(times[i])}: ${p.value} ${metric.unit}</title></circle>`).join('');
 $('#chart-summary').innerHTML=`<span class="legend-key"><span class="legend-dot"></span>${metric.label} (${metric.unit})</span><span>Minimum <strong>${fmt(lo,1)} ${metric.unit}</strong></span><span>Maximum <strong>${fmt(hi,1)} ${metric.unit}</strong></span><span>${selectedForecastDay?'Journée du '+selectedForecastDay:'24 prochaines heures'}</span>`;
 $('#chart').innerHTML=`<svg class="weather-chart" viewBox="0 0 740 270" role="img" aria-label="Évolution horaire de ${metric.label} en ${metric.unit}">${grid}${ticks}<path class="chart-area" d="${path} L${points.at(-1).x} 224 L62 224 Z"/><path class="chart-line" d="${path}"/>${circles}<text x="62" y="18" class="chart-axis-label">${metric.unit}</text><text x="692" y="264" text-anchor="end" class="chart-axis-label">Heure locale</text></svg>`;
 const tooltip=$('#chart-tooltip');
 $('#chart').querySelectorAll('.chart-point').forEach(node=>{
  const update=()=>{const i=Number(node.dataset.index);tooltip.textContent=`${new Date(times[i]).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} à ${times[i].slice(11,16)} — ${metric.label} : ${fmt(values[i],1)} ${metric.unit}`;};
  node.addEventListener('mouseenter',update);node.addEventListener('focus',update);node.addEventListener('click',update);
 });
}

function weatherSmallCard(){
 const c=weather?.current;if(!c)return '';
 return `<section class="panel"><div class="map-selection"><div><small>EMPLACEMENT SÉLECTIONNÉ</small><h3>${safe(city.name)}</h3><p>${safe(city.country)} · ${city.latitude.toFixed(4)}°, ${city.longitude.toFixed(4)}°</p></div><div class="selection-temp">${fmt(c.temperature_2m,1)} °C</div><div><small>Ressenti</small><strong>${fmt(c.apparent_temperature,1)} °C</strong></div><div><small>Vent</small><strong>${fmt(c.wind_speed_10m)} km/h</strong></div></div></section>`;
}
function showMapSelection(){$('#result').innerHTML=weatherSmallCard();}
function showHeatSelection(){$('#result').innerHTML=weatherSmallCard();}
function showWeatherTable(){
 const h=weather.hourly,now=weather.current.time.slice(0,13),i=Math.max(0,h.time.findIndex(t=>t.slice(0,13)>=now));
 const rows=h.time.slice(i,i+48).map((t,j)=>{const n=i+j;return `<tr><td>${safe(t.replace('T',' '))}</td><td>${fmt(h.temperature_2m[n],1)} °C</td><td>${fmt(h.relative_humidity_2m[n])} %</td><td>${fmt(h.precipitation_probability[n])} %</td><td>${fmt(h.wind_speed_10m[n],1)} km/h</td></tr>`;}).join('');
 $('#result').innerHTML=`<section class="panel data-panel"><h3>Prévisions horaires — ${safe(city.name)}</h3><p>48 heures, horaires locaux · valeurs modélisées</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Heure</th><th>Température</th><th>Humidité</th><th>Risque pluie</th><th>Vent</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function heatGrid(bounds,rows=6,columns=8){
 const south=Math.max(-85,bounds.getSouth()),north=Math.min(85,bounds.getNorth());
 const west=Math.max(-180,bounds.getWest()),east=Math.min(180,bounds.getEast());
 if(north<=south||east<=west)throw Error('Zone trop large : zoomez sur une région');
 const points=[];
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)points.push({latitude:north-(north-south)*r/(rows-1),longitude:west+(east-west)*c/(columns-1)});
 return {points,bounds:[[south,west],[north,east]],rows,columns};
}
function temperatureColor(value,min,max){
 const p=Math.max(0,Math.min(1,(value-min)/Math.max(1,max-min)));
 const stops=[[31,88,190],[35,171,218],[57,191,123],[244,199,64],[230,96,53],[167,39,70]];
 const x=p*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),t=x-i;
 return stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*t));
}
function drawHeatImage(samples,rows,columns){
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas indisponible');
 const pixels=ctx.createImageData(canvas.width,canvas.height);
 const min=Math.min(...samples),max=Math.max(...samples);
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const col=x/(canvas.width-1)*(columns-1),row=y/(canvas.height-1)*(rows-1);
   const c=Math.min(columns-2,Math.floor(col)),r=Math.min(rows-2,Math.floor(row)),fx=col-c,fy=row-r;
   const a=samples[r*columns+c],b=samples[r*columns+c+1],d=samples[(r+1)*columns+c],e=samples[(r+1)*columns+c+1];
   if(![a,b,d,e].every(Number.isFinite))continue;
   const value=a*(1-fx)*(1-fy)+b*fx*(1-fy)+d*(1-fx)*fy+e*fx*fy;
   const rgb=temperatureColor(value,min,max),p=(y*canvas.width+x)*4;
   pixels.data[p]=rgb[0];pixels.data[p+1]=rgb[1];pixels.data[p+2]=rgb[2];pixels.data[p+3]=174;
 }
 ctx.putImageData(pixels,0,0);return {url:canvas.toDataURL('image/png'),min,max};
}
async function loadHeatmap(){
 if(!weatherMap||currentWeatherPage!=='heatmap')return;
 const request=++heatRequest,button=$('#reload-heat'),label=$('#heat-range');
 if(button){button.disabled=true;button.textContent='Chargement…';}
 if(label)label.textContent='Récupération des températures…';
 try{
  const grid=heatGrid(weatherMap.getBounds());
  const params=new URLSearchParams({latitude:grid.points.map(p=>p.latitude.toFixed(4)).join(','),longitude:grid.points.map(p=>p.longitude.toFixed(4)).join(','),current:'temperature_2m',timezone:'GMT'});
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params);
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(request!==heatRequest||!weatherMap)return;
  if(!Array.isArray(data)||data.length!==grid.points.length)throw Error('Grille incomplète');
  const temps=data.map(v=>v.current?.temperature_2m);
  if(!temps.every(Number.isFinite))throw Error('Points sans température');
  const img=drawHeatImage(temps,grid.rows,grid.columns);
  if(heatOverlay)weatherMap.removeLayer(heatOverlay);
  heatOverlay=L.imageOverlay(img.url,grid.bounds,{opacity:0.8,interactive:false,alt:'Températures interpolées'}).addTo(weatherMap);
  if(label)label.textContent=`${fmt(img.min,1)} °C — ${fmt(img.max,1)} °C · ${temps.length} points`;
  const scale=$('#heat-scale');if(scale){scale.replaceChildren();for(let i=0;i<=5;i++){const tick=document.createElement('span');tick.textContent=fmt(img.min+(img.max-img.min)*i/5,1)+' °C';scale.appendChild(tick);}}
  status('✓ Carte de chaleur chargée. Cliquez sur la carte pour sélectionner un point.');
 }catch(e){if(request===heatRequest){if(label)label.textContent='Indisponible';status('Carte de chaleur : '+e.message,true);}}
 finally{if(button&&request===heatRequest){button.disabled=false;button.textContent='↻ Actualiser la zone';}}
}
function exportData(format){if(!weather){status('Chargez des données avant de les exporter.',true);return;}let str,type,ext;if(format==='json'){str=JSON.stringify({city,downloaded_at:lastUpdate?.toISOString(),data:weather},null,2);type='application/json';ext='json';}else{const h=weather.hourly,keys=Object.keys(h).filter(k=>Array.isArray(h[k]));str=[keys.join(','),...h.time.map((_,i)=>keys.map(k=>h[k][i]??'').join(','))].join('\n');type='text/csv';ext='csv';}const blob=new Blob([str],{type:`${type};charset=utf-8`}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`atlas-meteo-${city.name.toLowerCase().replace(/[^a-z0-9]/g,'-')}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
if(typeof document!=='undefined'){const saved=savedWeatherLocation();if(saved)city=saved;const search=$('#global-search');if(search){search.addEventListener('input',e=>{if(location.hash!=='#/'&&location.hash!==''){location.hash='#/';setTimeout(()=>{$('#filter').value=e.target.value;catalog(e.target.value);},0);}else{const filter=$('#filter');if(filter){filter.value=e.target.value;catalog(e.target.value);}}});}}
window.addEventListener('hashchange',render);$('#clock').textContent=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});render();
