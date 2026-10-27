import {estimateRailPosition} from './transport-train-estimate.js';
/**
 * SNCF network view inside the existing Trains page (not a sidebar module).
 *
 * SNCF publishes real train TripUpdates but NOT GPS vehicle positions.
 * The dots are next-stop anchors at officially referenced stations.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const folds=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
const TONES={ontime:'#30d69a',late:'#f46b80',unknown:'#93abc8',cancelled:'#b58bff'};
const FAVORITES_KEY='atlas-train-followed-v1';
const formatTime=value=>value&&Number.isFinite(Date.parse(value))?
 new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
const formatDate=value=>value&&Number.isFinite(Date.parse(value))?
 new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'Non communiqué';
function readFavorites(){try{const x=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');return Array.isArray(x)?x.slice(0,60):[];}catch{return [];}}
function writeFavorites(items){try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,60)));}catch{}}
const statusName=x=>x==='ontime'?'À l’heure':x==='late'?'En retard':x==='cancelled'?'Supprimé':'Retard inconnu';
const typeName=x=>x==='TGV'?'TGV':x==='TER'?'TER':x==='Intercités'?'Intercités':'Autre train';
const shortId=entry=>entry.number?'N° '+entry.number:'Identifiant de course SNCF';
export function mountTrainMap(shell){
 if(!shell)return ()=>{};
 const head=shell.querySelector('.tl-page-head');
 const tabs=document.createElement('div');
 tabs.className='tm-view-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Vues du module Trains');
 tabs.innerHTML='<button type="button" id="tm-tab-horaires" role="tab" aria-selected="true" aria-controls="tl-results">Horaires et trajets</button>'+
  '<button type="button" id="tm-tab-direct" role="tab" aria-selected="false" aria-controls="tm-live" tabindex="-1">🗺️ Réseau en direct <span class="tm-beta">REPÈRES</span></button>';
 head?.insertAdjacentElement('afterend',tabs);
 const panel=document.createElement('section');panel.className='tm-live';panel.id='tm-live';panel.hidden=true;
 panel.setAttribute('aria-label','Carte du réseau ferroviaire SNCF et des prochains arrêts');
 panel.innerHTML='<div class="tm-section-title"><div><span class="tl-kicker">SNCF FRANCE · MISES À JOUR DES CIRCULATIONS</span><h2>Carte du réseau ferroviaire</h2><p>Trains déclarés par la SNCF, localisés à leur <strong>prochain arrêt</strong> — pas de position GPS des rames.</p></div><span class="tm-source-pill">GTFS-RT · SNCF</span></div>'+
 '<div class="tm-map-shell">'+
   '<div id="tm-map" class="tm-map" role="application" aria-label="Carte interactive des prochains arrêts SNCF"></div>'+
   '<div class="tm-top-controls"><label class="tm-search"><span aria-hidden="true">⌕</span><input type="search" id="tm-search" placeholder="Gare, ville, numéro du train…" aria-label="Chercher un train ou une gare" maxlength="90" autocomplete="off"/></label>'+
     '<div class="tm-quick-actions"><button id="tm-france" type="button">🇫🇷 France</button><button id="tm-marseille" type="button">📍 Marseille</button><button id="tm-refresh" type="button" title="Actualiser le flux SNCF">↻ Actualiser</button></div>'+
     '<div class="tm-infrastructure-controls"><label><input id="tm-rails" type="checkbox"/> Afficher les voies SNCF</label><button type="button" id="tm-rails-reload" title="Recharger les voies autour du centre" hidden>↻ Tracés</button><span id="tm-rails-status" role="status">Tracés du réseau disponibles à la demande.</span></div>'+
     '<div class="tm-filter-buttons" aria-label="Filtres de trains"><button type="button" data-kind="all" class="active">Tous</button><button type="button" data-kind="TER">TER</button><button type="button" data-kind="TGV">TGV</button><button type="button" data-kind="Intercités">Intercités</button><button type="button" data-kind="Train">Autres</button></div>'+
     '<div class="tm-filter-buttons" aria-label="Filtres de ponctualité"><button type="button" data-status="all" class="active">Tous les statuts</button><button type="button" data-status="ontime"><i class="tm-led green"></i> À l’heure</button><button type="button" data-status="late"><i class="tm-led red"></i> En retard</button><button type="button" data-status="unknown"><i class="tm-led gray"></i> Inconnu</button><button type="button" data-status="cancelled">Supprimé</button></div>'+
   '</div>'+
   '<div class="tm-legend" aria-label="Signification des repères"><span><i class="tm-led green"></i> À l’heure</span><span><i class="tm-led red"></i> Retard</span><span><i class="tm-led gray"></i> Non communiqué</span><span><i class="tm-led purple"></i> Supprimé</span></div>'+
   '<aside class="tm-drawer" id="tm-drawer" aria-label="Informations du train sélectionné">'+
     '<div class="tm-drawer-handle" aria-hidden="true"></div>'+
     '<div id="tm-drawer-content"><div class="tm-summary-heading"><strong>Réseau SNCF · prochains arrêts</strong><span class="tm-data-type">ESTIMATION GÉOGRAPHIQUE</span></div>'+
       '<div class="tm-stat-grid"><div><small>TRAINS LOCALISABLES</small><strong id="tm-stat-active">—</strong></div><div><small>À L’HEURE*</small><strong id="tm-stat-on-time">—</strong></div><div><small>EN RETARD*</small><strong id="tm-stat-late">—</strong></div></div>'+
       '<div class="tm-category-summary" id="tm-categories">Sélectionnez un train sur la carte.</div>'+
     '</div>'+
   '</aside>'+
   '<div class="tm-data-footer" id="tm-data-footer">Prévisions des arrêts · source SNCF · aucune géolocalisation GPS</div>'+
 '</div>'+
 '<div class="tm-state" id="tm-state" role="status" aria-live="polite"></div>'+
 '<p class="tm-explanation"><strong>À quoi correspondent les points ?</strong> Chaque cercle représente une ou plusieurs circulations dont le prochain arrêt déclaré est cette gare. Le point ne se trouve pas nécessairement sur le train. Les statuts proviennent des écarts GTFS-RT ; « inconnu » signifie qu’aucun retard n’a été communiqué. * Les statistiques de ponctualité ne comptent que les circulations dont le retard est renseigné.</p>'+
 '<p class="tm-provenance">Sources : <a href="https://transport.data.gouv.fr/datasets/horaires-sncf" target="_blank" rel="noopener noreferrer">SNCF · GTFS-RT TripUpdates</a> et <a href="https://data.sncf.com/explore/dataset/liste-des-gares/" target="_blank" rel="noopener noreferrer">SNCF Réseau · Liste des gares (UIC)</a> et <a href="https://data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/" target="_blank" rel="noopener noreferrer">SNCF Réseau · Géométrie des voies</a>. Données ouvertes sous conditions de réutilisation, dont ODbL.</p>';
 tabs.insertAdjacentElement('afterend',panel);
 const $=selector=>panel.querySelector(selector);
 let alive=true,visible=false,loaded=false,loading=false,lastFetch=0,abort=null,timer=null,map=null,points=null,railLayer=null,railAbort=null,railOn=false,railLoading=false,estimateLayer=null,railLines=[];
 let model={markers:[],counts:{ontime:0,late:0,unknown:0,cancelled:0},feedUpdated:null};
 // Stable Leaflet layers: filtering must not rebuild every station marker.
 const stationLayers=new Map();
 let kind='all',status='all',query='',selectedId=null,selectedStation=null,isolatedId=null;
 const isAlive=()=>alive&&panel.isConnected;
 const tabSchedules=tabs.querySelector('#tm-tab-horaires'),tabNetwork=tabs.querySelector('#tm-tab-direct');
 const controls=()=>({
  show:model.markers.filter(x=>!(kind!=='all'&&x.kind!==kind) &&
   !(status!=='all'&&x.status!==status) &&
   (!query||folds([x.stationName,x.number,x.id,x.kind].join(' ')).includes(folds(query))) &&
   (!isolatedId||x.id===isolatedId))
 });
 const stationKey=x=>x.stopCode;
 function groups(items){
  const map=new Map();
  for(const item of items){
   const key=stationKey(item);
   if(!map.has(key))map.set(key,{key,name:item.stationName,lat:item.lat,lng:item.lng,items:[]});
   map.get(key).items.push(item);
  }
  return [...map.values()];
 }
 function selectedItem(){return model.markers.find(x=>x.id===selectedId);}
 function follow(item){
  const f=readFavorites(),has=f.includes(item.id);
  writeFavorites(has?f.filter(x=>x!==item.id):[...f,item.id]);
  renderDrawer();
 }
 function renderEstimate(){
  if(!estimateLayer)return;
  estimateLayer.clearLayers();
  const item=selectedItem();
  if(!railOn||!item?.segment)return;
  const point=estimateRailPosition(item.segment,railLines);
  if(!point)return;
  L.circleMarker([point.lat,point.lng],{
   radius:10,weight:3,color:'#fff3ba',fillColor:'#ffce52',fillOpacity:.95,
   dashArray:'3,4'
  }).addTo(estimateLayer).bindTooltip(
   'Estimation horaire sur les voies SNCF · pas une position GPS',
   {direction:'top'});
 }
 function renderDrawer(){
  const holder=$('#tm-drawer-content');
  if(!selectedId){
   const shown=controls().show;
   const known=shown.filter(x=>x.status==='ontime'||x.status==='late');
   const good=known.filter(x=>x.status==='ontime').length;
   const late=known.filter(x=>x.status==='late').length;
   const rate=known.length?Math.round(100*good/known.length):null;
   holder.innerHTML='<div class="tm-summary-heading"><strong>Réseau en direct</strong><span class="tm-data-type">REPÈRES DE GARES</span></div>'+
    '<div class="tm-stat-grid"><div><small>TRAINS AVEC REPÈRE</small><strong>'+shown.length+'</strong></div>'+
    '<div><small>PONCTUELS*</small><strong class="tm-good">'+(rate===null?'—':rate+' %')+'</strong></div>'+
    '<div><small>RETARDS*</small><strong class="tm-warning">'+(known.length?Math.round(late*100/known.length)+' %':'—')+'</strong></div></div>'+
    '<div class="tm-category-summary">'+['TER','TGV','Intercités','Train'].map(k=>'<span>'+typeName(k)+' <b>'+shown.filter(x=>x.kind===k).length+'</b></span>').join('')+'</div>'+
    '<p class="tm-drawer-note">Trains recensés par le flux : '+(model.sourceTotal??'—')+' · repères obtenus : '+model.totalWithAnchors+'.</p>'+ '<div class="tm-pick-list"><span>Exemples de circulations</span>'+shown.slice(0,6).map(item=>'<button type="button" class="tm-pick-train" data-id="'+esc(item.id)+'">'+esc(item.kind)+' '+esc(item.number||'—')+' · '+esc(item.stationName)+'</button>').join('')+'</div>';
   holder.querySelectorAll('.tm-pick-train').forEach(button=>button.onclick=()=>{selectedId=button.dataset.id;renderDrawer();});
   if(estimateLayer)estimateLayer.clearLayers();
   return;
  }
  const item=selectedItem();
  if(!item){selectedId=null;renderDrawer();return;}
  const statusText=statusName(item.status);
  const followed=readFavorites().includes(item.id);
  const neighbors=model.markers.filter(x=>x.stopCode===item.stopCode&&!((kind!=='all'&&x.kind!==kind)||(status!=='all'&&x.status!==status)));
  holder.innerHTML='<div class="tm-train-top"><div class="tm-train-title"><span class="tm-train-pill tm-'+esc(item.kind).toLowerCase().replace(/[^a-z]/g,'')+'">'+esc(item.kind)+'</span>'+
   '<strong>'+esc(shortId(item))+'</strong><span class="tm-train-status" style="--tm-status-color:'+TONES[item.status]+'">'+esc(statusText)+'</span></div>'+
   '<button id="tm-close-selection" type="button" title="Retour à la synthèse" aria-label="Fermer la fiche">✕</button></div>'+
   '<div class="tm-train-fields"><div><small>PROCHAIN ARRÊT DÉCLARÉ</small><strong>'+esc(item.stationName)+'</strong></div>'+
   '<div><small>HORAIRE PRÉVU / MIS À JOUR</small><strong>'+formatTime(item.nextStopAt)+'</strong></div>'+
   '<div><small>RETARD COMMUNIQUÉ</small><strong>'+ (item.delay===null?'Non renseigné':item.delay>0?'+'+item.delay+' min':item.delay<0?item.delay+' min':'0 min')+'</strong></div>'+
   '<div><small>DERNIÈRE MISE À JOUR COURSE</small><strong>'+formatDate(item.updatedAt)+'</strong></div></div>'+
   '<p class="tm-location-caveat">📍 Repère sur la gare du prochain arrêt. Ce point n’est pas la position GPS du train.</p>'+
   (item.segment?('<div class="tm-estimate-info"><strong>Estimation horaire possible · '+esc(item.segment.fromName)+' → '+esc(item.segment.toName)+'</strong>'+
     '<p>'+ (railOn&&estimateRailPosition(item.segment,railLines)?
       'Un cercle jaune sur les voies représente une estimation horaire, jamais une observation GPS.':
       'La géométrie de ce tronçon doit être chargée et confirmée pour afficher une position estimée.')+'</p>'+
     '<button type="button" id="tm-estimate-action">⌖ Tester une estimation sur les voies</button></div>'):
     '<p class="tm-no-estimate">Position estimée indisponible : la source ne fournit pas les deux arrêts et horaires vérifiables nécessaires.</p>')+
   (neighbors.length>1?'<div class="tm-neighbors">Autres trains vers cette gare : '+neighbors.slice(0,8).map(x=>'<button data-train-id="'+esc(x.id)+'" type="button">'+esc(x.kind)+' '+esc(x.number||'')+'</button>').join('')+'</div>':'')+
   '<div class="tm-detail-actions"><button type="button" id="tm-center">⌖ Centrer</button><button type="button" id="tm-isolate">'+(isolatedId?'◧ Tous les trains':'◎ Isoler')+'</button><button type="button" id="tm-follow">'+(followed?'★ Suivi enregistré':'☆ Suivre')+'</button></div>'+
   '<details class="tm-technical"><summary>Identification technique</summary><code>'+esc(item.id)+'</code><p>Source : SNCF GTFS-RT ; arrêt UIC '+esc(item.stopCode)+'</p></details>'+
   '<button type="button" id="tm-view-all" class="tm-link-button">Retour à la synthèse du réseau</button>';
  holder.querySelector('#tm-close-selection').onclick=()=>{selectedId=null;isolatedId=null;redraw();};
  holder.querySelector('#tm-center').onclick=()=>{if(map)map.setView([item.lat,item.lng],Math.max(map.getZoom(),10));};
  holder.querySelector('#tm-isolate').onclick=()=>{isolatedId=isolatedId?null:item.id;redraw();};
  holder.querySelector('#tm-follow').onclick=()=>follow(item);
  const estimateButton=holder.querySelector('#tm-estimate-action');
  if(estimateButton)estimateButton.onclick=()=>{
   if(!map||!item.segment)return;
   railOn=true;$('#tm-rails').checked=true;$('#tm-rails-reload').hidden=false;
   const {from,to}=item.segment;
   map.fitBounds([[from.lat,from.lng],[to.lat,to.lng]],{maxZoom:10,padding:[90,90]});
   loadRails();
  };
  holder.querySelector('#tm-view-all').onclick=()=>{selectedId=null;isolatedId=null;redraw();};
  holder.querySelectorAll('[data-train-id]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.trainId;renderDrawer();});
  renderEstimate();
 }
 function drawPoints(){
  if(!map||!points)return;
  const showing=controls().show;
  const grouped=groups(showing);
  const active=new Set();
  for(const group of grouped){
   active.add(group.key);
   const hasLate=group.items.some(x=>x.status==='late');
   const isCancelled=group.items.every(x=>x.status==='cancelled');
   const hasOnTime=group.items.some(x=>x.status==='ontime');
   const tone=isCancelled?'cancelled':hasLate?'late':hasOnTime?'ontime':'unknown';
   const radius=group.items.length>1?Math.min(16,7+Math.log2(group.items.length)*2):6;
   const style={radius,weight:2,color:'#162330',fillColor:TONES[tone],fillOpacity:.91};
   let entry=stationLayers.get(group.key);
   if(!entry){
    const circle=L.circleMarker([group.lat,group.lng],style);
    entry={circle,group};
    circle.bindTooltip('',{direction:'top'});
    circle.on('click',()=>{
     const current=entry.group;
     selectedStation=current.name;
     selectedId=current.items.find(x=>x.status==='late')?.id||current.items[0]?.id||null;
     isolatedId=null;renderDrawer();
    });
    stationLayers.set(group.key,entry);
    circle.addTo(points);
   }else{
    entry.group=group;
    entry.circle.setStyle(style);
    if(entry.circle.getLatLng().lat!==group.lat||entry.circle.getLatLng().lng!==group.lng)
     entry.circle.setLatLng([group.lat,group.lng]);
   }
   entry.circle.setTooltipContent(esc(group.name)+' · '+group.items.length+' circulation(s)');
  }
  for(const [key,entry] of stationLayers){
   if(active.has(key))continue;
   points.removeLayer(entry.circle);
   stationLayers.delete(key);
  }
  renderDrawer();
  $('#tm-data-footer').textContent=showing.length+' train(s) géoréférencés · '+grouped.length+' gare(s) · GTFS-RT, sans GPS · source '+formatDate(model.feedUpdated);
 }
 function redraw(){if(isAlive()&&visible)drawPoints();}
 function initMap(){
  if(map||!window.L)return;
  map=L.map($('#tm-map'),{zoomControl:false,scrollWheelZoom:true,preferCanvas:true}).setView([46.7,2.25],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
   maxZoom:18
  }).addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  // Rail geometry must remain below train stop-anchor markers.
  map.createPane('tm-railway-geometry').style.zIndex='350';
  map.getPane('tm-railway-geometry').style.pointerEvents='none';
  railLayer=L.layerGroup().addTo(map);
  points=L.layerGroup().addTo(map);
  // Separate yellow halo is strictly optional and never calculated without
  // both temporal brackets and an official on-track geometry match.
  estimateLayer=L.layerGroup().addTo(map);
  setTimeout(()=>map.invalidateSize(),35);
 }
 async function loadRails(){
  if(!map||!railOn||railLoading||!isAlive())return;
  railAbort?.abort();railAbort=new AbortController();
  railLoading=true;$('#tm-rails-reload').disabled=true;
  $('#tm-rails-status').textContent='Chargement des voies officielles SNCF autour du centre…';
  try{
   const center=map.getCenter();
   // Fixed small bounding box: bounded upstream work regardless of map size.
   const south=Math.max(41,center.lat-.48),north=Math.min(52,center.lat+.48);
   const west=Math.max(-6,center.lng-.7),east=Math.min(11,center.lng+.7);
   if(south>=north||west>=east)throw Error('Déplacez la carte vers la France.');
   const params=new URLSearchParams({south:String(south),north:String(north),west:String(west),east:String(east)});
   const resp=await fetch('/api/rail-lines?'+params,{signal:railAbort.signal});
   const data=await resp.json();
   if(!resp.ok)throw Error(data.error||'Source SNCF indisponible');
   if(!isAlive()||!railOn)return;
   railLines=data.lines||[];
   railLayer.clearLayers();
   for(const item of data.lines||[]){
    if(!Array.isArray(item.coordinates)||item.coordinates.length<2)continue;
    L.polyline(item.coordinates,{pane:'tm-railway-geometry',color:'#266f99',weight:2.6,
      opacity:.72,interactive:false,smoothFactor:1}).addTo(railLayer);
   }
   $('#tm-rails-status').textContent=railLines.length+' segments d’infrastructure · SNCF Réseau'+
     (data.partial?' · données partielles':'')+' · pas des trajectoires de trains.';
   renderDrawer();
  }catch(error){
   if(error.name!=='AbortError'&&isAlive())$('#tm-rails-status').textContent=
    'Tracés indisponibles : '+error.message+' · repères de gares conservés.';
  }finally{railLoading=false;if(isAlive())$('#tm-rails-reload').disabled=false;}
 }
 async function refresh({manual=false}={}){
  if(!visible||loading||!isAlive())return;
  if(manual&&Date.now()-lastFetch<90000){
   $('#tm-state').textContent='Actualisation limitée : le flux SNCF est publié environ toutes les deux minutes.';return;
  }
  abort?.abort();abort=new AbortController();
  loading=true;
  lastFetch=Date.now();
  $('#tm-refresh').disabled=true;
  $('#tm-state').textContent='Lecture des circulations SNCF et rapprochement des gares UIC…';
  try{
   const response=await fetch('/api/train-map',{signal:abort.signal,headers:{Accept:'application/json'}});
   const json=await response.json();
   if(!response.ok)throw Error(json.error||'Service indisponible');
   if(!isAlive()||!visible)return;
   model=json;loaded=true;redraw();
   $('#tm-state').textContent=(json.totalWithAnchors||0)+' trains associés à un prochain arrêt · '+(json.referencePartial?'référentiel géographique partiel.':'référentiel géographique chargé.')+' Aucune position GPS fournie.';
  }catch(error){
   if(error.name!=='AbortError'&&isAlive())$('#tm-state').textContent='Impossible de mettre à jour la carte : '+error.message+(loaded?' · dernières données affichées':' · aucune donnée fictive affichée');
  }finally{
   loading=false;if(isAlive())$('#tm-refresh').disabled=false;
  }
 }
 function showMap(value){
  visible=value;
  shell.classList.toggle('tm-map-visible',visible);
  panel.hidden=!visible;
  tabSchedules.setAttribute('aria-selected',String(!visible));
  tabNetwork.setAttribute('aria-selected',String(visible));
  tabSchedules.tabIndex=visible?-1:0;
  tabNetwork.tabIndex=visible?0:-1;
  if(visible){
   initMap();setTimeout(()=>map?.invalidateSize(),40);
   if(!loaded)refresh();
   else redraw();
  }
 }
 tabSchedules.onclick=()=>showMap(false);
 tabNetwork.onclick=()=>showMap(true);
 $('#tm-france').onclick=()=>map?.setView([46.7,2.25],6);
 $('#tm-marseille').onclick=()=>map?.setView([43.45,5.3],9);
 $('#tm-refresh').onclick=()=>refresh({manual:true});
 $('#tm-rails').onchange=()=>{
  railOn=$('#tm-rails').checked;
  $('#tm-rails-reload').hidden=!railOn;
  if(!railOn){railAbort?.abort();railLines=[];railLayer?.clearLayers();estimateLayer?.clearLayers();$('#tm-rails-status').textContent='Tracés masqués.';renderDrawer();}
  else loadRails();
 };
 $('#tm-rails-reload').onclick=loadRails;
 $('#tm-search').oninput=event=>{query=event.target.value.trim();selectedId=null;isolatedId=null;redraw();};
 panel.querySelectorAll('[data-kind]').forEach(button=>button.onclick=()=>{
  kind=button.dataset.kind;panel.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('active',b===button));redraw();
 });
 panel.querySelectorAll('[data-status]').forEach(button=>button.onclick=()=>{
  status=button.dataset.status;panel.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('active',b===button));redraw();
 });
 timer=setInterval(()=>{if(visible&&!document.hidden&&!loading&&Date.now()-lastFetch>=115000)refresh();},120000);
 return ()=>{alive=false;clearInterval(timer);abort?.abort();railAbort?.abort();map?.remove();panel.remove();tabs.remove();shell.classList.remove('tm-map-visible');};
}
