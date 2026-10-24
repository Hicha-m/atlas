/* Actual departures: SNCF GTFS-RT (France), TfL (London), Swiss Transport API.
 * No fake realtime, no vehicle positions inferred from schedules.
 */
export const MODES={
 trains:{title:'Trains',icon:'🚆',description:'Circulations SNCF et départs des gares suisses',providers:['sncf','swiss']},
 marseille:{title:'Marseille · Info trafic',icon:'📍',description:'Alertes publiées par La Métropole Mobilité pour RTM, métro, tram, bus et navettes',providers:['marseille-alerts']},
 metros:{title:'Métros',icon:'🚇',description:'Prédictions des métros londoniens',providers:['tfl']},
 tramways:{title:'Tramways',icon:'🚊',description:'Départs des tramways suisses et londoniens',providers:['swiss','tfl']},
 bus:{title:'Bus',icon:'🚌',description:'Prochains bus sur les réseaux publiant leurs passages',providers:['tfl','swiss']},
 bateaux:{title:'Bateaux',icon:'⛴️',description:'Départs des services lacustres suisses',providers:['swiss']},
 telepheriques:{title:'Téléphériques',icon:'🚠',description:'Départs des remontées présentes dans les données nationales suisses',providers:['swiss']},
 trafic:{title:'État du réseau',icon:'⚠️',description:'Perturbations officiellement communiquées par Transport for London',providers:['tfl-status']}
};
const providerLabels={sncf:'🇫🇷 SNCF · France',swiss:'🇨🇭 Transports suisses',tfl:'🇬🇧 Transport for London','tfl-status':'🇬🇧 Statut des lignes TfL','marseille-alerts':'🇫🇷 La Métropole Mobilité · Marseille'};
const swissKind={trains:'train',tramways:'tram',bus:'bus',bateaux:'boat',telepheriques:'cableway'};
const londonKind={metros:'tube',tramways:'tram',bus:'bus'};
const PRESETS={
 trains:{swiss:[['Zürich HB','Zürich HB'],['Genève','Genève'],['Bern','Bern'],['Lausanne','Lausanne']]},
 tramways:{swiss:[['Zürich, Bellevue','Zürich, Bellevue'],['Basel, Barfüsserplatz','Basel, Barfüsserplatz'],['Genève, Cornavin','Genève, Cornavin']]},
 bus:{swiss:[['Bern, Bahnhof','Bern, Bahnhof'],['Zürich, Central','Zürich, Central']],tfl:[["Bus stop London 490005183E",'490005183E']]},
 bateaux:{swiss:[['Luzern, Bahnhofquai','Luzern, Bahnhofquai'],['Zürich, Bürkliplatz','Zürich, Bürkliplatz']]},
 telepheriques:{swiss:[['Grindelwald, Firstbahn','Grindelwald, Firstbahn'],['Zermatt, Sunnegga','Zermatt, Sunnegga']]},
 metros:{tfl:[["King's Cross St. Pancras",'940GZZLUKSX'],['Waterloo','940GZZLUWLO'],['Oxford Circus','940GZZLUOXC']]}
};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=(date,tz)=>{if(!date)return '—';const time=Date.parse(date);return Number.isFinite(time)?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:tz||'Europe/Paris'}).format(new Date(time)):'—';};
const validHref=url=>typeof url==='string'&&/^https:\/\//.test(url);
const minutes=iso=>iso&&Number.isFinite(Date.parse(iso))?Math.max(0,Math.ceil((Date.parse(iso)-Date.now())/60000)):null;
const keyOf=(page,provider)=>page+'-'+provider;
function sourceLink(provider){
 const links={sncf:'https://transport.data.gouv.fr/datasets/horaires-sncf',
 swiss:'https://transport.opendata.ch/docs.html',tfl:'https://api.tfl.gov.uk/', 'tfl-status':'https://api.tfl.gov.uk/','marseille-alerts':'https://www.data.gouv.fr/datasets/information-trafic-en-temps-reel-affectant-les-reseaux-de-transports-en-commun-de-la-metropole-daix-marseille-provence'};
 return '<a href="'+links[provider]+'" target="_blank" rel="noopener noreferrer">Consulter la source ↗</a>';
}
function overview(){
 const cards=Object.entries(MODES).map(([id,m],i)=>'<a class="tl-mode-card" href="#/transport/'+id+'"><span class="tl-mode-icon">'+m.icon+'</span><span class="tl-mode-number">0'+(i+1)+'</span><h2>'+m.title+'</h2><p>'+m.description+'</p><span class="tl-mode-open">Explorer '+m.title.toLowerCase()+' →</span></a>').join('');
 return '<div class="tl-shell"><div class="tl-hero"><div><span class="tl-kicker">ATLAS LIVE / TRANSPORTS</span><h1>Vos transports,<br>au prochain passage.</h1><p>Des données publiées par les opérateurs, séparées par mode. Sélectionnez un réseau et un arrêt pour consulter les passages réellement fournis par les API.</p></div><span class="tl-hero-symbol" aria-hidden="true">🚉</span></div>'+
 '<div class="tl-explain"><strong>Prévisions ou données théoriques ?</strong><p>Chaque horaire affiche sa provenance. Les retards ne sont montrés que lorsqu’ils sont fournis. Aucun emplacement GPS ou passage « temps réel » n’est inventé.</p></div>'+
 '<h2 class="tl-section-title">Choisir un transport</h2><div class="tl-mode-grid">'+cards+'</div>'+
 '<div class="tl-info-row"><div><h3>France : SNCF</h3><p>GTFS-RT TripUpdates nationaux : trains et retards. Les noms d’arrêts issus des codes GTFS restent à enrichir.</p></div><div><h3>Suisse : plusieurs modes</h3><p>Trains, trams, bus, bateaux et téléphériques avec heures prévues et retards si disponibles.</p></div><div><h3>Londres : TfL</h3><p>Prochains métros, bus, trams, et état des lignes via les API officielles.</p></div></div>'+
 '<p class="tl-foot">L’ancien <a href="#/transport/catalogue">catalogue de jeux de données</a> reste accessible dans les outils.</p></div>';
}
export function mountTransportLive(root,page='overview'){
 if(!MODES[page]){
  root.innerHTML=overview();return ()=>{};
 }
 const model=MODES[page],saved=()=>{try{return JSON.parse(localStorage.getItem('atlas_transport_live_stops_v1')||'{}');}catch{return {};}};
 const storage=saved();
 const initialProvider=model.providers[0];
 const state={provider:initialProvider,station:'',name:'',query:'',results:[],data:null,error:'',loading:false,searching:false,
  lastFetch:0,request:0,searchRequest:0,disposed:false,controllers:new Set(),timer:null};
 const init=provider=>{
  const key=keyOf(page,provider),preferred=storage[key];
  const fallback=PRESETS[page]?.[provider]?.[0];
  state.station=preferred?.id||fallback?.[1]||'';
  state.name=preferred?.name||fallback?.[0]||'';
 };
 init(initialProvider);
 const alive=()=>!state.disposed&&root.isConnected;
 const el=selector=>root.querySelector(selector);
 const isSearch=()=>state.provider==='tfl';
 const mode=()=>state.provider==='swiss'?swissKind[page]:londonKind[page];
 const timeZone=()=>state.provider==='tfl'?'Europe/London':state.provider==='swiss'?'Europe/Zurich':'Europe/Paris';
 function apiUrl(extra={}){
  const url=new URL('/api/transport-live',location.origin);
  const p=extra.provider||state.provider;url.searchParams.set('provider',p);
  if(p==='tfl'||p==='tfl-search')url.searchParams.set('mode',mode()||'tube');
  if(p==='swiss'){url.searchParams.set('mode',mode()||'train');url.searchParams.set('station',state.station);}
  if(p==='tfl')url.searchParams.set('id',state.station);
  if(p==='tfl-search')url.searchParams.set('q',extra.q||'');
  if(p==='sncf'&&state.query)url.searchParams.set('q',state.query);
  return url.pathname+url.search;
 }
 function cancel(){for(const controller of state.controllers)controller.abort();state.controllers.clear();}
 async function getJson(url,sequence){
  const abort=new AbortController();state.controllers.add(abort);const timer=setTimeout(()=>abort.abort(),15500);
  try{const response=await fetch(url,{signal:abort.signal,headers:{Accept:'application/json'}});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Source HTTP '+response.status);
   if(sequence!==state.request||!alive())return null;return data;
  }finally{clearTimeout(timer);state.controllers.delete(abort);}
 }
 function saveStation(){
  try{const all=saved();all[keyOf(page,state.provider)]={id:state.station,name:state.name};localStorage.setItem('atlas_transport_live_stops_v1',JSON.stringify(all));}catch{}
 }
 function initMarkup(){
  root.innerHTML='<div class="tl-shell"><div class="tl-back"><a href="#/transport">← Tous les transports</a><span class="tl-kicker">ATLAS LIVE / TRANSPORTS / '+esc(model.title.toUpperCase())+'</span></div>'+
  '<header class="tl-page-head"><div><h1><span aria-hidden="true">'+model.icon+'</span> '+esc(model.title)+'</h1><p>'+esc(model.description)+'</p></div><span class="tl-info-tag">Données fournisseurs</span></header>'+
  '<section class="tl-workspace" aria-label="Choix du réseau et de l’arrêt"><div class="tl-field"><label for="tl-provider">Réseau / pays</label><select id="tl-provider">'+model.providers.map(p=>'<option value="'+p+'">'+providerLabels[p]+'</option>').join('')+'</select></div>'+
  '<div id="tl-stop-controls" class="tl-stop-controls"></div><button type="button" id="tl-refresh" class="tl-refresh">↻ Actualiser</button></section>'+
  '<div id="tl-notice" class="tl-notice" role="status" aria-live="polite"></div>'+
  '<section class="tl-results" id="tl-results" aria-live="off"></section>'+
  '<div class="tl-source"><div id="tl-source-description"></div><div id="tl-source-link"></div></div>'+
  '<p class="tl-foot">Actualisation automatique toutes les 90 secondes lorsque la page est ouverte. Mise en cache côté serveur et limites d’appels respectées.</p></div>';
  el('#tl-provider').onchange=()=>{state.provider=el('#tl-provider').value;state.query='';state.results=[];state.error='';state.data=null;state.lastFetch=0;cancel();state.request++;init(state.provider);drawControls();draw();load(true);};
  el('#tl-refresh').onclick=()=>load(false);
 }
 function drawControls(){
  const place=el('#tl-stop-controls');
  if(state.provider==='tfl-status'||state.provider==='marseille-alerts'){
   place.innerHTML='<p class="tl-hint">'+(state.provider==='marseille-alerts'?'Alertes officielles publiées pour Marseille et la Métropole : elles ne contiennent pas les prochains départs.':'État des lignes de métro, DLR, Overground et tramway communiqué par Transport for London.')+'</p>';return;
  }
  if(state.provider==='sncf'){
   place.innerHTML='<div class="tl-field"><label for="tl-query">Rechercher un train / code GTFS</label><input id="tl-query" placeholder="Numéro de train, identifiant de course ou d’arrêt" type="search" maxlength="70" value="'+esc(state.query)+'"/></div>'+
   '<p class="tl-hint">Flux national non filtrable par nom de gare à ce stade. Les identifiants d’arrêt GTFS ne sont pas des noms de gares.</p>';
   el('#tl-query').onchange=()=>{state.query=el('#tl-query').value.trim();load(true);};
   return;
  }
  const tfl=isSearch();
  const presets=PRESETS[page]?.[state.provider]||[];
  place.innerHTML='<div class="tl-field"><label for="tl-search">'+(tfl?'Rechercher une station ou un arrêt':'Rechercher une gare ou un arrêt suisse')+'</label>'+
   '<input id="tl-search" type="search" autocomplete="off" placeholder="'+(tfl?'Ex. Waterloo, King’s Cross…':'Ex. Zürich HB, Bern, Genève…')+'" value="'+esc(state.name)+'" maxlength="80"/>'+
   '<div id="tl-search-results" class="tl-search-results" hidden></div></div>'+
   '<div class="tl-quick-stops" aria-label="Arrêts fréquents">'+presets.map(([name,id])=>'<button type="button" data-stop="'+esc(id)+'" data-name="'+esc(name)+'"'+(id===state.station?' class="selected"':'')+'>'+esc(name)+'</button>').join('')+'</div>';
  const input=el('#tl-search');let debounce;
  input.oninput=()=>{
   if(!tfl)return;
   clearTimeout(debounce);const q=input.value.trim();
   if(q.length<2){el('#tl-search-results').hidden=true;return;}
   debounce=setTimeout(()=>searchStops(q),420);
  };
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(!tfl){state.station=input.value.trim();state.name=state.station;saveStation();load(true);}}};
  if(!tfl)input.onchange=()=>{if(input.value.trim().length>=2){state.station=input.value.trim();state.name=state.station;saveStation();load(true);}};
  place.querySelectorAll('[data-stop]').forEach(button=>button.onclick=()=>{
   state.station=button.dataset.stop;state.name=button.dataset.name;state.results=[];saveStation();drawControls();load(true);
  });
 }
 async function searchStops(q){
  const searchId=++state.searchRequest;
  const node=el('#tl-search-results');if(!node)return;
  node.hidden=false;node.innerHTML='<div class="tl-search-empty">Recherche des arrêts…</div>';
  try{
   const response=await fetch(apiUrl({provider:'tfl-search',q}));
   if(!response.ok)throw Error('Recherche indisponible');
   const data=await response.json();
   if(!alive()||searchId!==state.searchRequest||state.provider!=='tfl')return;
   const result=(data.stops||[]).slice(0,15);node.innerHTML=result.length?result.map(stop=>'<button type="button" data-id="'+esc(stop.id)+'" data-name="'+esc(stop.name)+'"><strong>'+esc(stop.name)+'</strong><small>'+esc(stop.id)+'</small></button>').join(''):'<div class="tl-search-empty">Aucun arrêt trouvé.</div>';
   node.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{state.station=btn.dataset.id;state.name=btn.dataset.name;state.searchRequest++;saveStation();drawControls();load(true);});
  }catch{if(alive()&&searchId===state.searchRequest)node.innerHTML='<div class="tl-search-empty">Recherche temporairement indisponible.</div>';}
 }
 function renderRow(d,i){
  const clock=localTime(d.expected,timeZone());
  const until=minutes(d.expected);
  const lag=typeof d.delay==='number'?d.delay:null;
  const status=d.cancelled?'<span class="tl-delay bad">Supprimé</span>':lag!==null?(lag>0?'<span class="tl-delay bad">+'+lag+' min</span>':lag<0?'<span class="tl-delay">Avance '+Math.abs(lag)+' min</span>':'<span class="tl-delay good">À l’heure</span>'):
   '<span class="tl-delay subtle">Retard non fourni</span>';
  const subtitle=d.stopId?'Arrêt GTFS : '+d.stopId:(d.platform?'Quai / arrêt : '+d.platform:'Arrêt non précisé');
  return '<article class="tl-departure" aria-label="Départ '+(i+1)+'"><div class="tl-route"><span class="tl-line">'+esc(d.line||'Ligne inconnue')+'</span><div><strong>'+esc(d.destination||'Destination non renseignée')+'</strong><small>'+esc(d.station||state.name||'')+'</small></div></div>'+
   '<div class="tl-departure-status"><span class="tl-time">'+clock+'</span><span class="tl-minute">'+(until!==null&&until<=180?'dans '+until+' min':'Horaire publié')+'</span></div>'+
   '<div class="tl-metadata">'+status+'<span>'+esc(subtitle)+'</span>'+(d.detail?'<small>'+esc(d.detail)+'</small>':'')+'</div></article>';
 }
 function draw(){
  if(!alive())return;
  el('#tl-refresh').disabled=state.loading;
  const heading=state.provider==='sncf'?'Circulations et écarts communiqués par SNCF':
    state.provider==='tfl-status'?'État des lignes':state.provider==='marseille-alerts'?'Perturbations · Marseille et Métropole':'Prochains passages'+(state.name?' · '+state.name:'');
  const data=state.data;
  el('#tl-notice').textContent=state.loading?'Interrogation des API officielles…':state.error?'Données indisponibles : '+state.error:
    data?'Source : '+esc(data.provider||providerLabels[state.provider])+' · consultation '+localTime(data.fetchedAt,timeZone()):'Sélectionnez un arrêt pour afficher les passages.';
  const result=el('#tl-results');
  if(state.loading&&!data){result.innerHTML='<div class="tl-wait" role="status">Chargement des horaires et prévisions réels…</div>';return;}
  if(state.error&&!data){result.innerHTML='<div class="tl-wait tl-error" role="alert">Impossible de récupérer les passages pour ce réseau. Aucun horaire fictif n’est affiché. <button type="button" id="tl-retry">Réessayer</button></div>';el('#tl-retry').onclick=()=>load(true);return;}
  if(!data){result.innerHTML='<div class="tl-wait">Sélectionnez un arrêt valide.</div>';return;}
  const status=state.provider==='tfl-status',marseille=state.provider==='marseille-alerts';
  const items=marseille?(data.alerts||[]):status?(data.statuses||[]):(data.departures||[]);
  result.innerHTML='<div class="tl-board-title"><div><span class="tl-kicker">RÉSULTATS FOURNIS PAR LE RÉSEAU</span><h2>'+esc(heading)+'</h2></div><span class="tl-count">'+items.length+' '+(marseille?'alertes':status?'lignes':'passages')+'</span></div>'+
   ((data.feedUpdated||data.updated)?'<p class="tl-feed-time">Dernière mise à jour déclarée par le flux : '+esc(localTime(data.feedUpdated||data.updated,timeZone()))+'</p>':'')+
   (!items.length?'<div class="tl-wait">'+(marseille?'Aucune alerte textuelle n’a été fournie par le flux. Cela ne garantit pas l’absence de perturbations.':'Aucun passage fourni pour cet arrêt et ce mode. Cela ne signifie pas que les transports ne circulent pas.')+'</div>':
    marseille?'<div class="tl-status-grid">'+items.map(x=>'<article class="tl-status-card"><strong>'+esc(x.title||'Information voyageurs')+'</strong><span class="'+(x.active?'tl-issue':'tl-good')+'">'+(x.active?'Alerte en cours':'Alerte à venir / archivée')+'</span>'+(x.description?'<p>'+esc(x.description)+'</p>':'')+(x.routes?.length?'<p>Lignes : '+esc(x.routes.join(', '))+'</p>':'')+(x.to?'<small>Fin annoncée : '+esc(localTime(x.to,timeZone()))+'</small>':'')+'</article>').join('')+'</div>':
    status?'<div class="tl-status-grid">'+items.map(x=>'<article class="tl-status-card"><strong>'+esc(x.name)+'</strong><span class="'+(x.normal?'tl-good':'tl-issue')+'">'+esc(x.status)+'</span>'+(x.reason?'<p>'+esc(x.reason)+'</p>':'')+'</article>').join('')+'</div>':
    '<div class="tl-board">'+items.map(renderRow).join('')+'</div>')+
   (state.provider==='sncf'?'<p class="tl-caveat">La SNCF diffuse des prédictions par identifiants GTFS : nous n’associons pas arbitrairement ces codes à des noms de gares. Retard uniquement lorsqu’il est fourni par la source.</p>':'');
  el('#tl-source-description').textContent=data.caveat||'Les horaires prédits et les retards dépendent de la couverture du fournisseur.';
  el('#tl-source-link').innerHTML=sourceLink(state.provider);
 }
 async function load(force){
  if(!alive())return;
  if(!force&&Date.now()-state.lastFetch<29000){el('#tl-notice').textContent='Rafraîchissement limité à un appel toutes les 30 secondes. Dernières données conservées.';return;}
  if(state.provider==='tfl'&&!state.station){el('#tl-notice').textContent='Choisissez un arrêt dans la recherche avant de charger ses passages.';return;}
  if(state.provider==='swiss'&&state.station.length<2){el('#tl-notice').textContent='Saisissez un arrêt suisse valide.';return;}
  cancel();const token=++state.request;state.loading=true;state.error='';state.lastFetch=Date.now();draw();
  try{
   const json=await getJson(apiUrl(),token);if(!json||!alive())return;
   state.data=json;
  }catch(error){if(token===state.request&&alive()){state.error=error.name==='AbortError'?'Délai dépassé':error.message;state.data=null;}}
  finally{if(token===state.request&&alive()){state.loading=false;draw();}}
 }
 initMarkup();drawControls();draw();load(true);
 // This timer only runs while the view is mounted in the open browser.
 state.timer=setInterval(()=>{if(!document.hidden&&!state.loading)load(false);},90000);
 return ()=>{state.disposed=true;clearInterval(state.timer);cancel();state.searchRequest++;};
}
