
import {
 WORLD_DATA_URL,WORLD_GEOMETRY_URL,WORLD_SOURCE,EUROPE_SOURCE,EUROPE_COUNTRIES,
 HISTORIC_METRICS,parseWorldSnapshot,historicValue,availableCountries,
 normalizeEuropeanResponse,energyChartsUrl,europeApiCode
} from './electricity-global-data.js';

const WORLD_CACHE={value:null,promise:null};
const EU_CACHE=new Map();
const EU_GAP_MS=35000;
const EU_CACHE_MS=10*60*1000;
let lastEuFetch=0;
const euroSet=new Set(EUROPE_COUNTRIES.map(c=>c.iso));
const number=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1});
const fmt=x=>Number.isFinite(x)?number.format(x):'—';
const gw=x=>Number.isFinite(x)?fmt(x/1000)+' GW':'—';
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const french={FRA:'France',DEU:'Allemagne',GBR:'Royaume-Uni',USA:'États-Unis',CHN:'Chine',IND:'Inde',BRA:'Brésil',JPN:'Japon',RUS:'Russie',CAN:'Canada',AUS:'Australie'};
const metricOf=code=>HISTORIC_METRICS.find(m=>m.id===code)||HISTORIC_METRICS[0];
const palette={
 generationTWh:['#143653','#1d5374','#246e98','#318baa','#50aec6','#77c9df','#b1e8ee'],
 demandTWh:['#143653','#1d5374','#246e98','#318baa','#50aec6','#77c9df','#b1e8ee'],
 renewablesPercent:['#5a3138','#915143','#a77f45','#a59a4b','#7f9e51','#4cad70','#53d29c'],
 lowCarbonPercent:['#5a3138','#915143','#a77f45','#a59a4b','#7f9e51','#4cad70','#53d29c'],
 carbonIntensityGco2eqKwh:['#53d29c','#4cad70','#a6aa50','#c4a44c','#c98243','#a95c50','#794048']
};
export function colorForMetric(metric,value){
 if(value===null||!Number.isFinite(value))return '#30363d';
 const thresholds=metric.endsWith('Percent')?[10,25,40,55,70,85]:
 metric==='carbonIntensityGco2eqKwh'?[100,200,300,450,600,800]:[50,200,500,1200,2500,6500];
 let index=0;while(index<thresholds.length&&value>=thresholds[index])index++;
 return (palette[metric]||palette.generationTWh)[index];
}
async function loadAssets(){
 if(WORLD_CACHE.value)return WORLD_CACHE.value;
 if(!WORLD_CACHE.promise)WORLD_CACHE.promise=Promise.all([fetch(WORLD_DATA_URL),fetch(WORLD_GEOMETRY_URL)]).then(async requests=>{
  for(const r of requests)if(!r.ok)throw Error('Fichiers historiques : HTTP '+r.status);
  const [data,geometry]=await Promise.all(requests.map(r=>r.json()));
  if(geometry?.type!=='FeatureCollection')throw Error('Géométrie du monde invalide');
  return WORLD_CACHE.value={data:parseWorldSnapshot(data),geometry};
 }).catch(error=>{WORLD_CACHE.promise=null;throw error;});
 return WORLD_CACHE.promise;
}
function localTime(stamp,zone){
 try{return new Intl.DateTimeFormat('fr-FR',{timeZone:zone||'Europe/Paris',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(stamp));}
 catch{return new Date(stamp).toLocaleString('fr-FR');}
}
function svgTrend(data,iso,second,metric){
 const index=data.fields.indexOf(metric);
 const primary=data.countries[iso]?.history||[],other=data.countries[second]?.history||[];
 const items=second&&second!==iso?[primary,other]:[primary];
 const numbers=items.flatMap(a=>a.map(r=>r[index])).filter(Number.isFinite);
 if(!numbers.length)return '<p class="geo-muted">Aucune série historique pour cette sélection.</p>';
 const max=Math.max(...numbers,1),min=Math.min(0,...numbers),span=Math.max(1,max-min);
 const x=t=>66+(t-2000)/25*780,y=v=>244-(v-min)/span*194;
 const grid=Array.from({length:5},(_,i)=>'<line x1="66" x2="846" y1="'+(50+i*48.5)+'" y2="'+(50+i*48.5)+'" stroke="#30363d" stroke-dasharray="4 5"/><text class="elec-axis" x="58" y="'+(54+i*48.5)+'" text-anchor="end">'+fmt(max-span*i/4)+'</text>').join('');
 const paths=items.map((a,i)=>{
  let d='',pen=false;
  for(const row of a){const val=row[index];if(!Number.isFinite(val)){pen=false;continue;}d+=(pen?' L ':' M ')+x(row[0]).toFixed(2)+' '+y(val).toFixed(2);pen=true;}
  return '<path d="'+d+'" stroke="'+(i?'#e3b341':'#58a6ff')+'" stroke-width="3" fill="none" stroke-linecap="round"/>';
 }).join('');
 const years=[2000,2005,2010,2015,2020,2025].map(yr=>'<text class="elec-axis" x="'+x(yr)+'" y="273" text-anchor="middle">'+yr+'</text>').join('');
 return '<svg viewBox="0 0 900 285" class="geo-chart" role="img" aria-label="Évolution annuelle 2000 à 2025">'+grid+paths+years+'</svg>';
}
function svgLive(rows){
 const nums=rows.map(r=>r.consumptionMW).filter(Number.isFinite);
 if(nums.length<2)return '<p class="geo-muted">Série de demande indisponible pour ce pays.</p>';
 const lo=Math.min(...nums)*0.95,hi=Math.max(...nums)*1.05;
 let path='',pen=false;
 rows.forEach((r,i)=>{if(r.consumptionMW===null){pen=false;return;}path+=(pen?'L':'M')+(45+790*i/Math.max(1,rows.length-1)).toFixed(1)+' '+(220-(r.consumptionMW-lo)/Math.max(1,hi-lo)*180).toFixed(1)+' ';pen=true;});
 return '<svg class="geo-chart" viewBox="0 0 880 245" role="img" aria-label="Demande électrique récente"><path d="'+path+'" stroke="#58a6ff" stroke-width="3" fill="none" stroke-linejoin="round"/></svg>';
}
function save(name,type,content){
 const url=URL.createObjectURL(new Blob([content],{type:type+';charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function countryName(data,iso){return french[iso]||data.countries[iso]?.name||iso;}
const TABS=[['overview','Vue d’ensemble'],['mix','Mix énergétique'],['trends','Historique'],['data','Données'],['europe','Europe'],['world','Monde']];
function shell(mode){
 return '<div class="elec-shell geo-app"><div class="repo-heading elec-repo-heading"><div class="repo-title"><span class="repo-icon elec-repo-icon">ϟ</span><div>'+
 '<div class="repo-eyebrow">Atlas Live / Module 02 / '+(mode==='world'?'Panorama mondial':'Europe · Energy-Charts')+'</div>'+
 '<h1>Électricité <span class="state-pill">Actif</span></h1><p>'+(mode==='world'?'Évolution mondiale, mix et émissions : données annuelles de 2000 à 2025.':'Europe : mesures récentes et carte comparative annuelle.')+'</p></div></div>'+
 '<div class="actions"><button type="button" class="btn" id="geo-json">↓ JSON</button><button type="button" class="btn" id="geo-csv">↓ CSV</button></div></div>'+
 '<nav class="weather-tabs elec-tabs" aria-label="Vues du module électricité">'+TABS.map(([id,label])=>'<a href="#/electricity/'+id+'" class="weather-tab '+(id===mode?'selected':'')+'"'+(id===mode?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>'+
 '<div id="geo-content"><section class="panel" role="status">Chargement des données historiques…</section></div></div>';
}
export function mountElectricityExplore(container,mode='world'){
 const state={root:container,mode,data:null,geometry:null,map:null,layer:null,year:2024,metric:'renewablesPercent',
  country:mode==='europe'?'DEU':'USA',compare:'CHN',live:null,liveError:null,liveBusy:false,abort:null,timer:null,active:true};
 container.innerHTML=shell(mode);
 const $=selector=>container.querySelector(selector);
 const active=()=>state.active&&container.isConnected;
 const annual=(iso,metric)=>historicValue(state.data,iso,state.year,metric);
 function status(message,error=false){const el=$('#geo-status');if(el){el.textContent=message;el.className='elec-message'+(error?' elec-message-error':'');}}
 function options(list,selected){return list.map(p=>'<option value="'+p.iso+'" '+(p.iso===selected?'selected':'')+'>'+escapeHTML(p.name)+'</option>').join('');}
 function initializeUI(){
  const items=(mode==='world'?Object.entries(state.data.countries).map(([iso,v])=>({iso,name:countryName(state.data,iso)})):
   EUROPE_COUNTRIES.map(c=>({iso:c.iso,name:c.name}))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  $('#geo-content').innerHTML=
  '<section class="panel geo-toolbar"><label>Pays <select class="field" id="geo-country">'+options(items,state.country)+'</select></label>'+
  '<label>Indicateur annuel <select class="field" id="geo-metric">'+HISTORIC_METRICS.map(m=>'<option value="'+m.id+'" '+(m.id===state.metric?'selected':'')+'>'+escapeHTML(m.label)+'</option>').join('')+'</select></label>'+
  '<label>Année <output id="geo-year-label">2024</output> <input id="geo-year" type="range" min="2000" max="2025" step="1" value="2024" aria-label="Année historique"/></label>'+
  (mode==='world'?'<label>Comparer à <select class="field" id="geo-compare"><option value="">Aucun pays</option>'+options(items,state.compare)+'</select></label>':
   '<button type="button" id="geo-refresh" class="btn">↻ Mesures récentes</button>')+'</section>'+
  '<div id="geo-status" class="elec-message" role="status" aria-live="polite"></div>'+
  '<div class="geo-main"><section class="panel geo-map-panel"><h2>'+(mode==='world'?'Carte mondiale':'Carte européenne')+'</h2><p class="geo-muted" id="geo-map-caption"></p>'+
  '<div class="geo-legend" id="geo-legend"></div><div class="geo-map" id="geo-map" role="region" aria-label="Carte des pays et de l’électricité"></div>'+
  '<p class="geo-muted">Légende : gris = donnée annuelle absente. Cliquez sur un pays ou utilisez la liste.</p></section>'+
  '<aside class="geo-detail" id="geo-details"></aside></div>'+
  '<section class="panel geo-trend"><div class="geo-section-heading"><h2>Historique 2000–2025</h2><small id="geo-trend-label"></small></div><div id="geo-trend-content"></div></section>'+
  '<section class="panel geo-ranking"><div class="geo-section-heading"><h2>Classement annuel</h2><small id="geo-rank-label"></small></div><div id="geo-rank"></div></section>'+
  '<section class="panel elec-attribution geo-source"><div><strong>Sources et limites</strong>'+
  '<p>Carte, classements et comparaisons : Our World in Data, notamment données Ember. Période historique 2000–2025 (2025 encore incomplet : 90 pays, contre 195 en 2024), compilation publiée le '+escapeHTML(state.data.sourceLastUpdated)+'. TWh et % sont annuels, pas des mesures instantanées.</p>'+
  (mode==='europe'?'<p>Séries récentes : Fraunhofer ISE / Energy-Charts, en MW. Fréquence et disponibilité selon le pays. Les échanges commerciaux ne sont pas des flux physiques. API limitée (environ 2 appels/min/IP), actualisation à la demande et cache local 10 min.</p>':'<p>Les pays ne publient pas tous les mêmes indicateurs ni les mêmes années. Les cases grises représentent des valeurs manquantes.</p>')+
  '</div><div class="geo-source-links"><a href="'+WORLD_SOURCE+'" target="_blank" rel="noopener noreferrer">Our World in Data ↗</a>'+
  (mode==='europe'?'<a href="'+EUROPE_SOURCE+'" target="_blank" rel="noopener noreferrer">Energy-Charts ↗</a>':
   '<a href="https://ember-energy.org/data/electricity-data-explorer/" target="_blank" rel="noopener noreferrer">Ember ↗</a>')+'</div></section>';
  $('#geo-country').addEventListener('change',e=>{state.country=e.target.value;update();if(mode==='europe')loadLive();});
  $('#geo-metric').addEventListener('change',e=>{state.metric=e.target.value;update();});
  $('#geo-year').addEventListener('input',e=>{state.year=Number(e.target.value);update();});
  $('#geo-compare')?.addEventListener('change',e=>{state.compare=e.target.value;update();});
  $('#geo-refresh')?.addEventListener('click',()=>loadLive(true));
  $('#geo-json').addEventListener('click',()=>exportCurrent('json'));
  $('#geo-csv').addEventListener('click',()=>exportCurrent('csv'));
  if(typeof L!=='undefined'){
   state.map=L.map($('#geo-map'),{scrollWheelZoom:false,zoomControl:true,minZoom:2,maxZoom:8,attributionControl:false});
   state.map.setView(mode==='europe'?[51,15]:[19,6],mode==='europe'?3:2);
   state.layer=L.geoJSON(state.geometry,{style:f=>mapStyle(f.id),onEachFeature:(feature,layer)=>{
     layer.bindTooltip(countryName(state.data,feature.id),{sticky:true});
     layer.on('click',()=>{const iso=feature.id;if(mode==='europe'&&!euroSet.has(iso))return;if(!state.data.countries[iso])return;state.country=iso;$('#geo-country').value=iso;update();if(mode==='europe')loadLive();});
   }}).addTo(state.map);
   requestAnimationFrame(()=>{if(active())state.map.invalidateSize();});
  }else $('#geo-map').textContent='Leaflet indisponible : choisissez un pays dans le filtre ci-dessus.';
 }
 function mapStyle(iso){
  const value=mode==='europe'&&!euroSet.has(iso)?null:annual(iso,state.metric);
  return {color:iso===state.country?'#f0f6fc':'#59636e',weight:iso===state.country?2.4:0.65,fillColor:colorForMetric(state.metric,value),
   fillOpacity:mode==='europe'&&!euroSet.has(iso)?0.22:0.88};
 }
 function updateMap(){state.layer?.eachLayer(layer=>{const iso=layer.feature.id;layer.setStyle(mapStyle(iso));if(iso===state.country)layer.bringToFront();});}
 function annualCard(){
  const iso=state.country,metric=metricOf(state.metric),value=annual(iso,state.metric);
  const info=[['Production',annual(iso,'generationTWh'),'TWh'],['Demande',annual(iso,'demandTWh'),'TWh'],
   ['Bas-carbone',annual(iso,'lowCarbonPercent'),'%'],['Intensité CO₂',annual(iso,'carbonIntensityGco2eqKwh'),'gCO₂e/kWh']];
  const fields=['nuclearTWh','hydroTWh','windTWh','solarTWh','coalTWh','gasTWh'],colors=['#a371f7','#58a6ff','#3fb950','#e3b341','#8b949e','#f0883e'];
  const gen=annual(iso,'generationTWh');
  const fuel=fields.map((f,i)=>({label:['Nucléaire','Hydraulique','Éolien','Solaire','Charbon','Gaz'][i],value:annual(iso,f),color:colors[i]})).filter(f=>f.value!==null&&f.value>0);
  const latest=state.data.countries[iso]?.history.at(-1)?.[0]||'—';
  return '<section class="panel geo-card"><div class="geo-card-head"><h2>'+escapeHTML(countryName(state.data,iso))+'</h2><span>'+state.year+'</span></div>'+
   '<div class="geo-highlight">'+fmt(value)+' <small>'+escapeHTML(metric.unit)+'</small></div><p class="geo-muted">'+escapeHTML(metric.label)+(value===null?' · donnée non disponible':' · valeur annuelle')+'</p>'+
   '<div class="geo-kpi-grid">'+info.map(([label,v,unit])=>'<div><small>'+label+'</small><strong>'+fmt(v)+' '+unit+'</strong></div>').join('')+'</div>'+
   (fuel.length&&gen>0?'<h3>Filières principales</h3>'+fuel.map(f=>'<div class="geo-fuel"><div><span>'+f.label+'</span><b>'+fmt(f.value)+' TWh</b></div><i><span style="background:'+f.color+';width:'+Math.min(100,f.value/gen*100).toFixed(1)+'%"></span></i></div>').join('')+'<p class="geo-muted">Liste non exhaustive : les filières présentées ne sont pas censées sommer à 100 %.</p>':'')+
   '<p class="geo-muted">Dernière année disponible pour la production : '+latest+'.</p></section>';
 }
 function liveCard(){
  if(state.liveBusy)return '<section class="panel geo-card" role="status"><h2>Mesures récentes</h2><p>Chargement Energy-Charts…</p><div class="elec-skeleton"></div></section>';
  if(state.liveError)return '<section class="panel geo-card"><h2>Mesures récentes</h2><p class="geo-error">'+escapeHTML(state.liveError)+'</p><p class="geo-muted">Les statistiques annuelles restent disponibles. Le quota public peut limiter les changements rapides de pays.</p></section>';
  if(!state.live)return '<section class="panel geo-card"><h2>Mesures récentes</h2><p class="geo-muted">Sélectionnez un pays ou actualisez la source.</p></section>';
  const last=state.live.rows.at(-1),mix=last.mix.filter(m=>m.mw!==null&&m.mw>0).sort((a,b)=>b.mw-a.mw);
  const fields=[['Demande',gw(last.consumptionMW)],['Production couverte',gw(last.productionMW)],
   ['Renouvelables',Number.isFinite(last.renewablePercent)?fmt(last.renewablePercent)+' %':'—'],
   ['Échanges programmés',gw(last.tradingMW)]];
  return '<section class="panel geo-card"><h2>Mesures récentes · Energy-Charts</h2><p class="geo-muted">Dernier intervalle : '+
   escapeHTML(localTime(last.timestamp,state.live.timezone))+' · '+escapeHTML(state.live.timezone||'')+' · '+(state.live.intervalMinutes||'—')+' min</p>'+
   '<div class="geo-kpi-grid">'+fields.map(([k,v])=>'<div><small>'+k+'</small><strong>'+v+'</strong></div>').join('')+'</div>'+
   '<h3>Mix électrique publié</h3>'+mix.map(m=>'<div class="geo-fuel"><div><span>'+escapeHTML(m.label)+'</span><b>'+gw(m.mw)+'</b></div><i><span style="background:'+m.color+';width:'+Math.min(100,m.mw/Math.max(last.productionMW||1,1)*100).toFixed(1)+'%"></span></i></div>').join('')+
   '<h3>Évolution récente de la demande</h3>'+svgLive(state.live.rows)+
   '<p class="geo-muted">La somme des filières publiées peut différer de la consommation. Les échanges indiqués sont commerciaux, pas physiques.</p></section>';
 }
 function update(){
  if(!active()||!state.data)return;
  $('#geo-year-label').textContent=state.year;
  $('#geo-map-caption').textContent=metricOf(state.metric).label+' · '+state.year+' · sélection par clic ou filtre';
  $('#geo-legend').innerHTML=(palette[state.metric]||palette.generationTWh).map(color=>'<i style="background:'+color+'"></i>').join('')+'<span>Gris = absence de valeur</span>';
  updateMap();
  $('#geo-details').innerHTML=annualCard()+(mode==='europe'?liveCard():'');
  const second=mode==='world'&&state.compare!==state.country?state.compare:null;
  $('#geo-trend-label').textContent=metricOf(state.metric).unit;
  $('#geo-trend-content').innerHTML='<p class="geo-muted">● '+escapeHTML(countryName(state.data,state.country))+
   (second?' · <span style="color:#e3b341">● '+escapeHTML(countryName(state.data,second))+'</span>':'')+'</p>'+
   svgTrend(state.data,state.country,second,state.metric);
  const ranking=availableCountries(state.data,state.year,state.metric,mode==='europe'?euroSet:null);
  $('#geo-rank-label').textContent=ranking.length+' pays · '+state.year;
  $('#geo-rank').innerHTML='<div class="geo-rank-header"><span>Pays</span><span>'+escapeHTML(metricOf(state.metric).unit)+'</span></div>'+
   ranking.slice(0,15).map((r,i)=>'<button type="button" class="geo-rank" data-iso="'+r.iso+'"><span><b>'+String(i+1).padStart(2,'0')+'</b> '+escapeHTML(countryName(state.data,r.iso))+'</span><strong>'+fmt(r.value)+'</strong></button>').join('');
  $('#geo-rank').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.country=b.dataset.iso;$('#geo-country').value=state.country;update();if(mode==='europe')loadLive();}));
  if(mode==='world')status('✓ Données mondiales locales · '+Object.keys(state.data.countries).length+' pays · aucune requête réseau par clic sur la carte.');
 }
 function exportCurrent(ext){
  if(!state.data)return;
  const rows=availableCountries(state.data,state.year,state.metric,mode==='europe'?euroSet:null);
  const name='atlas-electricite-'+mode+'-'+state.year+'.'+ext;
  if(ext==='json')return save(name,'application/json',JSON.stringify({source:WORLD_SOURCE,year:state.year,metric:state.metric,unit:metricOf(state.metric).unit,countries:rows,live:mode==='europe'?state.live:null},null,2));
  save(name,'text/csv','\uFEFF'+'iso;country;year;'+state.metric+'\r\n'+rows.map(r=>[r.iso,r.name.replaceAll(';',','),state.year,r.value].join(';')).join('\r\n'));
 }
 async function loadLive(force=false){
  if(mode!=='europe'||!active())return;
  const iso=state.country,code=europeApiCode(iso);
  state.abort?.abort();clearTimeout(state.timer);state.timer=null;
  const cached=EU_CACHE.get(code),now=Date.now();
  if(!force&&cached&&now-cached.time<EU_CACHE_MS){
   state.live=cached.data;state.liveBusy=false;state.liveError=null;update();status('✓ Résultat Energy-Charts réutilisé : cache 10 min.');return;
  }
  const wait=Math.max(0,lastEuFetch+EU_GAP_MS-now);
  if(wait>0){
   state.live=null;state.liveError='Quota Energy-Charts : prochaine requête dans '+Math.ceil(wait/1000)+' s.';state.liveBusy=false;update();status(state.liveError);
   state.timer=setTimeout(()=>{if(active()&&state.country===iso)loadLive(force);},wait+100);
   return;
  }
  const controller=new AbortController();
  state.abort=controller;state.liveBusy=true;state.liveError=null;state.live=null;lastEuFetch=now;update();
  status('Connexion au réseau '+countryName(state.data,iso)+'…');
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(energyChartsUrl(code),{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok){
    if(response.status===429){
     const retry=Math.min(300,Math.max(35,Number(response.headers.get('Retry-After'))||120));
     lastEuFetch=Date.now()+retry*1000-EU_GAP_MS;
    }
    throw Error('API Energy-Charts : HTTP '+response.status);
   }
   const result=normalizeEuropeanResponse(await response.json());
   if(!active()||controller.signal.aborted||state.country!==iso)return;
   EU_CACHE.set(code,{data:result,time:Date.now()});state.live=result;
  }catch(error){
   if(active()&&!controller.signal.aborted&&state.country===iso)state.liveError=error.message;
   else if(active()&&state.country===iso&&error.name==='AbortError')state.liveError='Délai de réponse dépassé (15 s)';
  }finally{
   clearTimeout(timeout);
   if(active()&&state.country===iso&&state.abort===controller){
    state.liveBusy=false;state.abort=null;update();
    status(state.liveError?'Impossible de lire Energy-Charts : '+state.liveError:'✓ Relevés européens chargés.',!!state.liveError);
   }
  }
 }
 loadAssets().then(({data,geometry})=>{
  if(!active())return;
  state.data=data;state.geometry=geometry;
  // Default to the latest year with at least 70% of countries covered.
  // A newly released partial year should not paint most of the world gray.
  const total=Object.keys(data.countries).length;
  const chosen=Array.from({length:Math.max(0,data.maxYear-data.minYear+1)},(_,i)=>data.maxYear-i)
   .find(year=>availableCountries(data,year,'generationTWh').length>=Math.ceil(total*0.7));
  state.year=chosen||Math.min(data.maxYear,2024);
  initializeUI();$('#geo-year').max=String(data.maxYear);$('#geo-year').value=String(state.year);
  update();if(mode==='europe')loadLive();
 }).catch(err=>{
  if(!active())return;
  $('#geo-content').innerHTML='<section class="panel elec-error-panel" role="alert"><h2>Données mondiales indisponibles</h2><p>'+escapeHTML(err.message)+'</p><button type="button" id="geo-retry" class="btn primary">Réessayer</button></section>';
  $('#geo-retry')?.addEventListener('click',()=>{WORLD_CACHE.promise=null;state.root.innerHTML=shell(mode);loadAssets().then(({data,geometry})=>{if(!active())return;state.data=data;state.geometry=geometry;initializeUI();update();if(mode==='europe')loadLive();});});
 });
 return ()=>{state.active=false;state.abort?.abort();clearTimeout(state.timer);state.map?.remove();state.map=null;state.root=null;};
}
