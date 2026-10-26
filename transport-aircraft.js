/* Aviation observations from OpenSky: actual last reported positions, not a predicted trail. */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ZONES=[['marseille','Marseille / Provence'],['paris','Paris / Île-de-France'],['lyon','Lyon / Rhône-Alpes'],['toulouse','Toulouse / Occitanie']];
export function mountAircraft(root){
 let disposed=false,abort=null,map=null,layer=null,zone='marseille',flights=[],selected=null,showGround=true;
 root.innerHTML='<div class="ac-page">'+
 '<div class="ac-top"><a href="#/transport">← Tous les transports</a><span class="tl-kicker">ATLAS LIVE / TRANSPORTS / AVIATION</span></div>'+
 '<header class="ac-hero"><div><span class="tl-kicker">RADAR OBSERVATIONNEL</span><h1>✈ Avions · Positions observées</h1><p>Suivez les aéronefs actuellement reçus par OpenSky au-dessus de plusieurs régions françaises. Les points sont issus de positions ADS-B enregistrées, et non d’animations calculées.</p></div><span class="ac-hero-icon" aria-hidden="true">✈</span></header>'+
 '<section class="ac-controls" aria-label="Filtres du trafic aérien"><div><label for="ac-zone">Région française</label><select id="ac-zone">'+ZONES.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select></div>'+
 '<label class="ac-ground"><input type="checkbox" id="ac-ground" checked/> Inclure les aéronefs au sol</label>'+
 '<button id="ac-reload" type="button">↻ Actualiser la zone</button></section>'+
 '<p class="ac-disclaimer">Sources : OpenSky / adsb.lol · Positions reçues par des stations ADS-B, pouvant être incomplètes. Les horaires d’arrivée, retards commerciaux et trajets complets ne sont pas déduits. Cache serveur d’environ 15 minutes pour préserver les quotas.</p>'+
 '<div id="ac-status" class="ac-status" role="status" aria-live="polite">Chargement…</div>'+
 '<div class="ac-layout"><div id="ac-map" class="ac-map" aria-label="Carte des positions d’avions"></div>'+
 '<div class="ac-side"><div class="ac-side-title"><h2>Aéronefs observés</h2><span id="ac-count">0</span></div>'+
 '<div id="ac-selected" class="ac-selected"><p>Sélectionnez un appareil dans la liste ou sur la carte.</p></div>'+
 '<div id="ac-list" class="ac-list"></div></div></div>'+
 '<p class="ac-source">Sources : <a href="https://opensky-network.org/" target="_blank" rel="noopener noreferrer">OpenSky Network</a> et, en cas d’indisponibilité, <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">adsb.lol</a> (données ODbL 1.0). Les observations peuvent différer selon la couverture et la fraîcheur des fournisseurs.</p></div>';
 const el=q=>root.querySelector(q);
 const sourceMap=()=>{
  if(map||!window.L)return;
  map=L.map(el('#ac-map'),{scrollWheelZoom:false}).setView([43.5,5.3],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(map);
  layer=L.layerGroup().addTo(map);
 };
 function info(plane){
  const altitude=plane.altitudeM===null?'Inconnue':Math.round(plane.altitudeM).toLocaleString('fr-FR')+' m';
  const speed=plane.speedMs===null?'Inconnue':Math.round(plane.speedMs*3.6)+' km/h';
  return '<h3>'+esc(plane.callsign||plane.icao24)+'</h3>'+
   '<dl><div><dt>Identifiant ICAO24</dt><dd>'+esc(plane.icao24)+'</dd></div>'+
   '<div><dt>Pays déclaré</dt><dd>'+esc(plane.originCountry||'Inconnu')+'</dd></div>'+
   '<div><dt>Altitude</dt><dd>'+altitude+'</dd></div>'+
   '<div><dt>Vitesse au sol</dt><dd>'+speed+'</dd></div>'+
   '<div><dt>État déclaré</dt><dd>'+(plane.onGround?'Au sol':'En vol')+'</dd></div>'+
   '<div><dt>Dernière observation</dt><dd>'+esc(new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(plane.observedAt)))+' · '+plane.ageSeconds+' s d’âge à la capture</dd></div></dl>';
 }
 function choose(plane){
  selected=plane.icao24;el('#ac-selected').innerHTML=info(plane);
  el('#ac-list').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.hex===selected));
  if(map)map.setView([plane.lat,plane.lng],Math.max(map.getZoom(),10));
 }
 function render(){
  if(disposed)return;
  const visible=flights.filter(x=>showGround||!x.onGround);
  el('#ac-count').textContent=String(visible.length);
  el('#ac-list').innerHTML=visible.length?visible.slice(0,160).map(x=>'<button class="ac-aircraft" type="button" data-hex="'+esc(x.icao24)+'"><strong>✈ '+esc(x.callsign||x.icao24)+'</strong><small>'+esc(x.originCountry||'Origine inconnue')+' · '+(x.onGround?'Au sol':'En vol')+'</small><span>'+esc(x.altitudeM===null?'Altitude indisponible':Math.round(x.altitudeM)+' m')+'</span></button>').join(''):'<p class="ac-empty">Aucun avion observé selon ces filtres. Cela ne signifie pas que le ciel est vide.</p>';
  el('#ac-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{const p=visible.find(x=>x.icao24===b.dataset.hex);if(p)choose(p);});
  sourceMap();if(!layer)return;layer.clearLayers();
  const bounds=[];
  visible.forEach(plane=>{
   const point=[plane.lat,plane.lng];bounds.push(point);
   const marker=L.circleMarker(point,{radius:plane.onGround?4:6,color:plane.onGround?'#94a3b8':'#65baff',fillOpacity:.9,weight:1}).addTo(layer);
   marker.bindTooltip(esc(plane.callsign||plane.icao24),{direction:'top'});
   marker.on('click',()=>choose(plane));
  });
  if(bounds.length)map.fitBounds(bounds,{maxZoom:10,padding:[20,20]});
  else map.setView(zone==='paris'?[48.85,2.35]:zone==='lyon'?[45.76,4.84]:zone==='toulouse'?[43.6,1.44]:[43.3,5.37],8);
  setTimeout(()=>map.invalidateSize(),50);
 }
 async function load(){
  abort?.abort();abort=new AbortController();
  el('#ac-reload').disabled=true;el('#ac-status').textContent='Récupération des observations aériennes…';
  try{
   const response=await fetch('/api/aircraft-live?zone='+encodeURIComponent(zone),{signal:abort.signal});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Source indisponible');
   if(disposed)return;
   flights=data.aircraft||[];
   const at=data.observedAt?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(data.observedAt)):'heure indisponible';
   el('#ac-status').textContent=flights.length+' position(s) ADS-B valide(s) · '+(data.provider||'Fournisseur non précisé')+' · capture source à '+at+'.';
   render();
  }catch(error){if(error.name!=='AbortError'&&!disposed){flights=[];render();el('#ac-status').textContent='Données indisponibles : '+error.message;}}
  finally{if(!disposed)el('#ac-reload').disabled=false;}
 }
 el('#ac-zone').onchange=()=>{zone=el('#ac-zone').value;selected=null;el('#ac-selected').innerHTML='<p>Sélectionnez un appareil.</p>';load();};
 el('#ac-ground').onchange=()=>{showGround=el('#ac-ground').checked;render();};
 el('#ac-reload').onclick=load;
 load();
 return ()=>{disposed=true;abort?.abort();map?.remove();};
}
