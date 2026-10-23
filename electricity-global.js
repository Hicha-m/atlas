import {GLOBAL_DATA_URL,GLOBAL_DATA_SOURCE,EUROPE_ISO3,FUELS,normalizeGlobal,metric,metricLabel,palette} from './electricity-global-data.js';
const MAP_URL='https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
const CACHE_MS=12*60*60*1000;
let cache={countries:null,at:0},mapCache=null;
let instance=null;
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=(n,d=1)=>n===null||!Number.isFinite(n)?'—':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:d}).format(n);
const TABS=[['overview','France · direct'],['world','Monde · annuel'],['europe','Europe · annuel'],['country','Pays · détail'],['mix','Mix France'],['trends','Historique France'],['data','Données France']];
function frame(view){
 return '<div class="elec-shell elec-global"><div class="repo-heading"><div class="repo-title"><span class="repo-icon">ϟ</span><div><div class="repo-eyebrow">Atlas Live / Électricité / Exploration géographique</div><h1>Électricité mondiale</h1><p>Comparer les pays sans confondre statistiques annuelles et mesures en temps réel.</p></div></div></div>'+
 '<nav class="weather-tabs elec-tabs" aria-label="Vues du module électricité">'+TABS.map(([id,label])=>'<a class="weather-tab '+(view===id?'selected':'')+'" href="#/electricity/'+id+'">'+label+'</a>').join('')+'</nav>'+
 '<div class="elec-global-warning" role="note"><strong>Statistiques annuelles — pas du temps réel.</strong> Les dernières années disponibles varient selon les pays. Pour la France en direct : <a href="#/electricity/overview">RTE éCO₂mix ↗</a>. Pour le réseau européen en direct : <a target="_blank" rel="noopener noreferrer" href="https://transparency.entsoe.eu/">ENTSO-E ↗</a> (accès API avec jeton requis).</div>'+
 '<div class="elec-global-controls"><label>Indicateur <select id="global-metric" class="field"><option value="generation">Production annuelle (TWh)</option><option value="demand">Demande annuelle (TWh)</option><option value="carbon">Intensité carbone (gCO₂/kWh)</option><option value="clean">Part bas-carbone (%)</option></select></label>'+
 '<label>Rechercher un pays <input id="global-search-country" class="field" type="search" placeholder="France, Allemagne, Japon…" autocomplete="off"/></label>'+
 '<button id="global-reload" class="btn">↻ Actualiser</button></div>'+
 '<div id="global-message" role="status" aria-live="polite">Chargement des statistiques mondiales…</div>'+
 '<div id="global-content"></div>'+
 '<section class="panel elec-global-source"><strong>Provenance et limites</strong><p>Source originale : Ember, données annuelles, licence CC BY 4.0. Format JSON par World Power Monitor. Les données ne représentent pas une mesure instantanée, et les années ne sont pas toujours identiques entre pays. Les comparaisons de mix sont celles de la production, pas de la consommation.</p><a href="'+GLOBAL_DATA_SOURCE+'" target="_blank" rel="noopener noreferrer">Télécharger et consulter la méthodologie ↗</a></section></div>';
}
function countryLink(country){return '<a href="#/electricity/country?iso='+encodeURIComponent(country.iso3)+'">'+escapeHtml(country.name)+'</a>';}
function selectedCountry(rows,iso){return rows.find(c=>c.iso3===iso)||rows.find(c=>c.iso3==='FRA')||rows[0];}
function countryDetails(c){
 if(!c)return '<p>Aucune donnée pour ce pays.</p>';
 const fuels=c.fuels.filter(f=>f.twh!==null&&f.twh>0).sort((a,b)=>b.twh-a.twh);
 return '<section class="panel elec-country-detail"><div class="elec-section-heading"><div><h2>'+escapeHtml(c.name)+'</h2><p>Dernière année publiée : '+fmt(c.year,0)+' · Source Ember</p></div><a href="#/electricity/world">← Carte mondiale</a></div>'+
 '<div class="elec-global-kpis"><article><small>Production</small><strong>'+fmt(c.generation)+' TWh</strong></article><article><small>Demande</small><strong>'+fmt(c.demand)+' TWh</strong></article><article><small>Intensité carbone</small><strong>'+fmt(c.carbon)+' gCO₂/kWh</strong></article><article><small>Importations nettes</small><strong>'+fmt(c.imports)+' TWh</strong></article></div>'+
 '<h3>Production par filière</h3><div class="elec-global-fuels">'+fuels.map(f=>'<div class="elec-global-fuel"><span>'+escapeHtml(f.label)+'</span><div class="elec-global-track"><span style="width:'+Math.min(100,Math.max(0,f.share||0))+'%;background:'+f.color+'"></span></div><strong>'+fmt(f.twh)+' TWh · '+fmt(f.share)+' %</strong></div>').join('')+'</div>'+
 '<p class="elec-global-note">La part bas-carbone regroupe ici nucléaire, hydraulique, éolien, solaire, bioénergies et autres renouvelables. Les émissions et la demande sont des indicateurs distincts de la production.</p></section>';
}
function table(rows,field){
 const sorted=[...rows].filter(c=>metric(c,field)!==null).sort((a,b)=>metric(b,field)-metric(a,field));
 return '<section class="panel elec-global-table"><h2>Classement des pays</h2><div class="elec-global-table-scroll"><table><thead><tr><th>Pays</th><th>Année</th><th>'+escapeHtml(metricLabel(field))+'</th></tr></thead><tbody>'+sorted.map(c=>'<tr><td>'+countryLink(c)+'</td><td>'+fmt(c.year,0)+'</td><td>'+fmt(metric(c,field))+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function mapMarkup(rows,field){
 return '<section class="panel elec-global-map-panel"><div class="elec-section-heading"><div><h2>Carte interactive</h2><p>Survolez un pays pour consulter sa valeur ; cliquez pour ouvrir sa fiche.</p></div><span class="elec-header-badge">'+escapeHtml(metricLabel(field))+'</span></div><div id="elec-world-map" role="img" aria-label="Carte mondiale interactive des indicateurs électriques"><div class="elec-map-loading">Chargement des contours géographiques…</div></div><p class="elec-global-note">Gris : données absentes. Les années de référence diffèrent selon les pays. Carte indicative, sans frontières politiques garanties.</p></section>';
}
function drawMap(rows,field,root,token){
 const target=root.querySelector('#elec-world-map');if(!target)return;
 const geo=mapCache;
 if(!geo){target.innerHTML='<p>Contours indisponibles. Utilisez le tableau des pays ci-dessous.</p>';return;}
 const lookup=new Map(rows.map(c=>[c.iso3,c]));
 const values=rows.map(c=>metric(c,field)).filter(v=>v!==null);
 const min=Math.min(...values),max=Math.max(...values);
 // Geometry is rendered with Leaflet's SVG renderer; no map tiles or tile API requests.
 const map=L.map(target,{zoomControl:true,scrollWheelZoom:false,worldCopyJump:false,attributionControl:false,minZoom:1,maxZoom:7});
 instance.map=map;
 map.setView([20,8],2);
 const layer=L.geoJSON(geo,{style(feature){
  const c=lookup.get(feature.id||feature.properties?.iso_a3||feature.properties?.ISO_A3);
  return {color:'#0d1728',weight:0.65,fillColor:palette(c?metric(c,field):null,min,max,field),fillOpacity:.9};
 },onEachFeature(feature,polygon){
  const c=lookup.get(feature.id||feature.properties?.iso_a3||feature.properties?.ISO_A3);
  if(!c)return;
  polygon.bindTooltip(escapeHtml(c.name)+' · '+fmt(metric(c,field))+' · '+fmt(c.year,0),{sticky:true});
  polygon.on('click',()=>{location.hash='#/electricity/country?iso='+encodeURIComponent(c.iso3);});
 }}).addTo(map);
 const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[5,5]});
 setTimeout(()=>{if(instance?.token===token)map.invalidateSize();},100);
}
async function getCountries(force,signal){
 if(!force&&cache.countries&&Date.now()-cache.at<CACHE_MS)return cache.countries;
 const response=await fetch(GLOBAL_DATA_URL,{signal});
 if(!response.ok)throw new Error('Ember / World Power Monitor : HTTP '+response.status);
 const countries=normalizeGlobal(await response.json());
 cache={countries,at:Date.now()};return countries;
}
async function getMap(signal){
 if(mapCache)return mapCache;
 const response=await fetch(MAP_URL,{signal});
 if(!response.ok)throw new Error('Contours géographiques HTTP '+response.status);
 const geo=await response.json();
 if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features))throw new Error('Format GeoJSON invalide');
 mapCache=geo;return geo;
}
function paint(){
 const x=instance;if(!x?.root?.isConnected||!x.countries)return;
 const {root,view,countries}=x;
 const query=(root.querySelector('#global-search-country')?.value||'').trim().toLocaleLowerCase();
 const field=root.querySelector('#global-metric').value;
 const list=countries.filter(c=>(view!=='europe'||EUROPE_ISO3.has(c.iso3))&&(!query||c.name.toLocaleLowerCase().includes(query)||c.iso3.toLowerCase().includes(query)));
 const holder=root.querySelector('#global-content');
 if(x.map){x.map.remove();x.map=null;}
 const iso=new URLSearchParams(location.hash.split('?')[1]||'').get('iso');
 if(view==='country'){
  const current=selectedCountry(list.length?list:countries,iso);
  holder.innerHTML='<div class="elec-global-select"><label>Pays <select class="field" id="global-country-select">'+countries.map(c=>'<option value="'+escapeHtml(c.iso3)+'" '+(c.iso3===current?.iso3?'selected':'')+'>'+escapeHtml(c.name)+'</option>').join('')+'</select></label></div>'+countryDetails(current);
  holder.querySelector('#global-country-select')?.addEventListener('change',e=>{location.hash='#/electricity/country?iso='+encodeURIComponent(e.target.value);});
  return;
 }
 const years=list.map(c=>c.year).filter(Number.isFinite);
 holder.innerHTML='<div class="elec-global-intro"><h2>'+(view==='europe'?'Europe':'Monde')+' · '+list.length+' pays</h2><p>Dernières années disponibles : '+(years.length?Math.min(...years)+'–'+Math.max(...years):'—')+'. Comparaison annuelle, pas de direct.</p></div>'+mapMarkup(list,field)+table(list,field);
 if(typeof L!=='undefined'&&mapCache)drawMap(list,field,root,x.token);
 else holder.querySelector('#elec-world-map').innerHTML='<p>Contours non disponibles. Le classement ci-dessous reste consultable.</p>';
}
async function load(force=false){
 const x=instance;if(!x)return;
 const {root,token,controller}=x;
 const status=root.querySelector('#global-message');
 status.textContent='Chargement des données historiques Ember…';
 try{
  const countries=await getCountries(force,controller.signal);
  if(instance?.token!==token)return;
  x.countries=countries;
  status.textContent='✓ '+countries.length+' pays · Données historiques Ember (annuelles) · Cache 12 h';
  paint();
  if(x.view!=='country'&&!mapCache){
   try{await getMap(controller.signal);if(instance?.token===token)paint();}
   catch(error){if(instance?.token===token)status.textContent+=' · Carte indisponible : '+error.message;}
  }
 }catch(error){
  if(instance?.token!==token)return;
  status.textContent='⚠ Impossible de charger les données mondiales : '+error.message;
  root.querySelector('#global-content').innerHTML='<div class="panel elec-global-error">Source indisponible. Réessayez plus tard. Aucune valeur fictive ne sera affichée.</div>';
 }
}
export function mountElectricityGlobal(root,view='world'){
 if(instance)disposeElectricityGlobal();
 const x={root,view,controller:new AbortController(),token:Symbol('global'),countries:null,map:null};
 instance=x;
 root.innerHTML=frame(view);
 root.querySelector('#global-metric').addEventListener('change',paint);
 root.querySelector('#global-search-country').addEventListener('input',paint);
 root.querySelector('#global-reload').addEventListener('click',()=>load(true));
 load();
 return disposeElectricityGlobal;
}
export function disposeElectricityGlobal(){
 if(!instance)return;
 instance.controller.abort();
 instance.map?.remove();
 instance=null;
}
