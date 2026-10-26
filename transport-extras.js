/* Additional provider-backed interactions for Atlas Transports.
 * No vehicle-marker animation unless an operator supplies live coordinates.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Zurich'}).format(new Date(value)):'—';
const key='atlas_transport_marseille_favorites_v1';
const favorites=()=>{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x.slice(0,30):[];}catch{return [];}};
const save=items=>{try{localStorage.setItem(key,JSON.stringify(items.slice(0,30)));}catch{}};
const getUrl=(provider,params={})=>{
 const u=new URL('/api/transport-live',location.origin);u.searchParams.set('provider',provider);
 for(const [k,v]of Object.entries(params))if(v)u.searchParams.set(k,v);
 return u.pathname+u.search;
};
export function mountTransportExtras(root,page){
 if(page==='trains')return mountJourney(root);
 if(page==='marseille')return mountFavorites(root);
 if(['metros','tramways','bus','bateaux','telepheriques'].includes(page))return mountStopsMap(root,page);
 return ()=>{};
}
function mountJourney(root){
 const panel=document.createElement('section');panel.className='tl-extra-panel tl-journey-panel';
 panel.innerHTML='<div class="tl-extra-heading"><h2>Rechercher un trajet par départ et destination</h2><span>API suisse vérifiée</span></div>'+
 '<p>Choisissez deux gares, une date et une heure. Les itinéraires, correspondances et retards sont ceux du fournisseur, pas des estimations Atlas. La recherche par villes françaises nécessite encore un index GTFS SNCF.</p>'+
 '<form class="tl-extra-form"><label>Départ<input name="from" required minlength="2" placeholder="Ex. Bern" value="Bern"/></label>'+
 '<label>Destination<input name="to" required minlength="2" placeholder="Ex. Lausanne" value="Lausanne"/></label>'+
 '<label>Date<input name="date" type="date"/></label><label>Heure<input name="time" type="time"/></label><button type="submit">Rechercher</button></form>'+
 '<div class="tl-extra-status" role="status"></div><div class="tl-journey-results"></div><div class="tl-extra-map-wrap"><h3>Carte des trajets trouvés</h3><p>Tracés reliant les gares publiées, pas le mouvement des trains.</p><div class="tl-extra-map"></div></div>';
 const workspace=root.querySelector('.tl-workspace');workspace?.parentNode?.insertBefore(panel,workspace);
 const status=panel.querySelector('.tl-extra-status'),result=panel.querySelector('.tl-journey-results');
 let controller=null,map=null,layers=null;
 panel.querySelector('form').onsubmit=async event=>{
  event.preventDefault();controller?.abort();controller=new AbortController();
  const f=new FormData(event.target);const from=String(f.get('from')).trim(),to=String(f.get('to')).trim();
  result.replaceChildren();status.textContent='Recherche des correspondances officielles…';
  try{
   const response=await fetch(getUrl('swiss-connections',{from,to,date:f.get('date'),time:f.get('time')}),{signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error||'API indisponible');
   const journeys=data.journeys||[];
   status.textContent=journeys.length+' itinéraire(s) publié(s) · réseau suisse';
   result.innerHTML=journeys.length?journeys.map(j=>'<article class="tl-trip"><div class="tl-trip-times"><strong>'+fmt(j.departure)+' → '+fmt(j.arrival)+'</strong><span>'+esc(j.origin)+' → '+esc(j.destination)+'</span></div><p>'+esc(j.legs.map(l=>l.line).filter(Boolean).join(' · '))+'</p><small>'+esc(j.transfers??0)+' correspondance(s) · '+(j.departureDelay===null?'Retard non communiqué':esc(j.departureDelay)+' min de retard publié')+'</small></article>').join(''):'<p>Aucun trajet fourni pour ces critères.</p>';
   if(window.L){
    const container=panel.querySelector('.tl-extra-map');
    if(!map){map=L.map(container,{scrollWheelZoom:false}).setView([46.8,7.4],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(map);layers=L.layerGroup().addTo(map);}
    layers.clearLayers();const bounds=[];
    for(const j of journeys.slice(0,4)){
     const pts=j.legs.flatMap(l=>(l.stops||[]).filter(s=>s.position).map(s=>({name:s.name,...s.position})));
     if(j.departurePosition)pts.unshift({name:j.origin,...j.departurePosition});
     if(j.arrivalPosition)pts.push({name:j.destination,...j.arrivalPosition});
     const coords=pts.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);
     if(coords.length>1){L.polyline(coords,{color:'#63b1ff',weight:3,dashArray:'5 6'}).addTo(layers);bounds.push(...coords);}
     for(const p of [pts[0],pts.at(-1)])if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng))L.marker([p.lat,p.lng]).bindPopup(esc(p.name)).addTo(layers);
    }
    if(bounds.length)map.fitBounds(bounds,{maxZoom:10,padding:[25,25]});setTimeout(()=>map.invalidateSize(),50);
   }
  }catch(err){if(err.name!=='AbortError')status.textContent='Recherche indisponible : '+err.message;}
 };
 return ()=>{controller?.abort();map?.remove();panel.remove();};
}
function mountFavorites(root){
 const section=document.createElement('section');section.className='tl-extra-panel tl-favorite-panel';
 section.innerHTML='<div class="tl-extra-heading"><h2>★ Mes lignes favorites</h2><span>Enregistrées sur cet appareil</span></div>'+
 '<p>Sélectionnez un réseau et une ligne à suivre. Les alertes de vos favoris sont calculées uniquement à partir des avis publiés par la Métropole.</p>'+
 '<form class="tl-extra-form"><label>Réseau<select name="network" required><option value="">Choisir un réseau</option></select></label>'+
 '<label>Ligne<select name="line" required><option value="">Choisir une ligne</option></select></label><button type="submit">☆ Suivre la ligne</button></form>'+
 '<div class="tl-favorite-chips"></div><div class="tl-favorite-notice" role="status"></div>';
 const host=root.querySelector('.tl-workspace');host?.parentNode?.insertBefore(section,host);
 let data=[],controller=new AbortController(),alive=true;
 const n=section.querySelector('[name=network]'),l=section.querySelector('[name=line]');
 const chips=section.querySelector('.tl-favorite-chips'),notice=section.querySelector('.tl-favorite-notice');
 function render(){
  chips.innerHTML=favorites().map((f,i)=>'<button type="button" data-index="'+i+'" title="Ne plus suivre cette ligne">★ '+esc(f.line)+' · '+esc(f.network)+' ✕</button>').join('')||'<span>Aucun favori enregistré.</span>';
  chips.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>{const current=favorites();current.splice(Number(button.dataset.index),1);save(current);render();});
  const alerts=data.filter(a=>a.lines?.some(x=>favorites().some(f=>f.line===x.line&&f.network===x.network)));
  notice.innerHTML='<strong>'+alerts.length+' perturbation(s) pour vos lignes suivies</strong>'+
   (alerts.length?'<div class="tl-favorite-alerts">'+alerts.slice(0,12).map(a=>'<article><strong>'+esc(a.title)+'</strong><p>'+esc(a.description)+'</p><small>'+esc(a.start||'')+' au '+esc(a.end||'')+'</small></article>').join('')+'</div>':'<p>Aucune alerte publiée pour ces lignes dans le flux chargé. Cela ne garantit pas l’absence de perturbations.</p>');
 }
 function updateLines(){
  const rows=[...new Map(data.flatMap(a=>a.lines||[]).filter(x=>x.network===n.value&&x.line).map(x=>[x.line,x])).values()];
  l.innerHTML='<option value="">Choisir une ligne</option>'+rows.sort((a,b)=>a.line.localeCompare(b.line,'fr',{numeric:true})).map(x=>'<option value="'+esc(x.line)+'">'+esc(x.line)+'</option>').join('');
 }
 n.onchange=updateLines;
 section.querySelector('form').onsubmit=e=>{
  e.preventDefault();const f={network:n.value,line:l.value};if(!f.network||!f.line)return;
  if(!favorites().some(x=>x.network===f.network&&x.line===f.line))save([...favorites(),f]);render();
 };
 fetch(getUrl('marseille-alerts'),{signal:controller.signal}).then(async response=>{
  if(!response.ok)throw Error('Source indisponible');return response.json();
 }).then(x=>{
  if(!alive)return;data=x.alerts||[];
  const networks=[...new Set(data.flatMap(a=>a.networks||[]))].sort((a,b)=>a.localeCompare(b,'fr'));
  n.innerHTML='<option value="">Choisir un réseau</option>'+networks.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  render();
 }).catch(()=>{if(alive)notice.textContent='Les alertes sont temporairement indisponibles. Les favoris enregistrés restent sur cet appareil.';});
 render();
 return ()=>{alive=false;controller.abort();section.remove();};
}
function mountStopsMap(root,page){
 const section=document.createElement('section');section.className='tl-extra-panel tl-station-map';
 section.innerHTML='<div class="tl-extra-heading"><h2>Carte des arrêts</h2><span>Localisation fournie par les opérateurs</span></div>'+
 '<p>La carte localise l’arrêt sélectionné. Elle ne simule pas de véhicules ni d’itinéraires qui ne sont pas présents dans les API.</p>'+
 '<button type="button" class="tl-map-refresh">Localiser l’arrêt choisi</button><div class="tl-extra-status" role="status"></div><div class="tl-extra-map"></div>';
 root.querySelector('.tl-results')?.insertAdjacentElement('afterend',section);
 let map=null,marker=null,abort=new AbortController();
 const status=section.querySelector('.tl-extra-status');
 section.querySelector('button').onclick=async()=>{
  abort.abort();abort=new AbortController();
  const provider=root.querySelector('#tl-provider')?.value;
  const stop=root.querySelector('#tl-search')?.value.trim();
  const id=root.querySelector('.tl-quick-stops .selected')?.dataset.stop;
  status.textContent='Récupération des coordonnées du fournisseur…';
  try{
   let position,name;
   if(provider==='swiss'){
    if(!stop)throw Error('Sélectionnez un arrêt.');
    const mode={tramways:'tram',bus:'bus',bateaux:'boat',telepheriques:'cableway'}[page]||'train';
    const r=await fetch(getUrl('swiss',{mode,station:stop}),{signal:abort.signal});if(!r.ok)throw Error('Arrêt indisponible');
    const j=await r.json();position=j.stationPosition;name=j.station;
   }else if(provider==='tfl'){
    if(!id)throw Error('Choisissez un arrêt prédéfini ou sélectionné.');
    const r=await fetch(getUrl('tfl-stop',{id}),{signal:abort.signal});if(!r.ok)throw Error('Arrêt indisponible');
    const j=await r.json();position=j.stationPosition;name=j.station;
   }
   if(!position)throw Error('L’opérateur ne publie pas de coordonnées pour cet arrêt.');
   if(!window.L)throw Error('Leaflet indisponible');
   if(!map){map=L.map(section.querySelector('.tl-extra-map'),{scrollWheelZoom:false}).setView([position.lat,position.lng],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(map);}
   if(marker)map.removeLayer(marker);
   marker=L.marker([position.lat,position.lng]).bindPopup(esc(name||stop)).addTo(map);
   map.setView([position.lat,position.lng],13);setTimeout(()=>map.invalidateSize(),30);
   status.textContent='Arrêt localisé : '+(name||stop)+' · aucun véhicule GPS indiqué.';
  }catch(err){if(err.name!=='AbortError')status.textContent='Carte indisponible : '+err.message;}
 };
 return ()=>{abort.abort();map?.remove();section.remove();};
}
