/**
 * Open transport catalogue view. Values are publisher metadata, NOT live departures.
 * The national PAN catalogue is retrieved via Atlas same-origin proxy with CDN caching.
 */
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const FORMAT_TYPES=['GTFS','GTFS-RT','NETEX','SIRI','GBFS','CSV','JSON'];
export function normalizeCatalogue(payload){
 const input=Array.isArray(payload)?payload:Array.isArray(payload?.datasets)?payload.datasets:[];
 return input.filter(x=>x&&typeof x==='object').map(item=>{
  const resources=Array.isArray(item.resources)?item.resources:[];
  const normalized=resources.map(r=>({
   title:String(r.title||r.name||'Ressource sans titre').slice(0,180),
   format:String(r.format||r.type||'Autre').toUpperCase().replaceAll('_','-').slice(0,35),
   available:r.is_available===false?false:r.is_available===true?true:null,
   link:typeof r.url==='string'&&/^https:\/\//i.test(r.url)?r.url:
       typeof r.original_url==='string'&&/^https:\/\//i.test(r.original_url)?r.original_url:null,
   updated:String(r.last_update||r.updated_at||'').slice(0,24)
  })).filter(r=>r.link||r.format!=='AUTRE');
  const title=String(item.title||item.name||'Jeu de données sans titre').slice(0,220);
  const publisher=typeof item.publisher==='string'?item.publisher:String(item.publisher?.name||item.organization?.name||'Producteur non précisé').slice(0,130);
  const url=String(item.page_url||'');
  return {id:String(item.id||item.slug||title).slice(0,120),title,publisher,
   page:/^https:\/\/transport\.data\.gouv\.fr\//.test(url)?url:null,
   resources:normalized,formats:[...new Set(normalized.map(r=>r.format))],
   hasRealtime:normalized.some(r=>['GTFS-RT','SIRI','SIRI-LITE'].includes(r.format)),
   updated:String(item.last_update||item.updated_at||'').slice(0,24)};
 }).filter(item=>item.resources.length>0);
}
export function filterCatalogue(items,{query='',format='all',realtime=false}={}){
 const q=query.trim().toLocaleLowerCase('fr');
 return items.filter(item=>(!q||(item.title+' '+item.publisher+' '+item.formats.join(' ')).toLocaleLowerCase('fr').includes(q))&&
  (format==='all'||item.formats.includes(format))&&(!realtime||item.hasRealtime));
}
export function catalogueCsv(items){
 const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 return [['Jeu de données','Producteur','Formats','Temps réel publié','Page source'].map(csv).join(','),
 ...items.map(x=>[x.title,x.publisher,x.formats.join(' / '),x.hasRealtime?'Ressource temps réel':'Non indiqué',x.page||''].map(csv).join(','))].join('\r\n');
}
function formatDate(value){
 const time=Date.parse(value);
 return Number.isFinite(time)?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(time):'Non précisée';
}
export function mountTransport(root){
 const state={all:[],query:'',format:'all',realtime:false,visible:18,loading:true,error:null,abort:new AbortController(),disposed:false,lastFetch:null};
 const el=selector=>root.querySelector(selector);
 const ok=()=>!state.disposed&&root.isConnected;
 root.innerHTML='<div class="tr-page"><header class="tr-hero"><div><div class="tr-eyebrow">ATLAS LIVE / MODULE 03</div><h1>Transports publics</h1><p>Explorez les jeux de données des réseaux de transport en France, leurs formats et leurs ressources publiées.</p></div><span class="tr-hero-mark" aria-hidden="true">🚆</span></header>'+
 '<div class="tr-alert"><strong>Catalogue de données ouvertes</strong><span> Les ressources GTFS présentent généralement des horaires théoriques. La présence de GTFS-RT ou SIRI indique un flux publié, sans garantir ici ses données en direct ni son état opérationnel.</span></div>'+
 '<section class="tr-filter-panel" aria-label="Recherche transports"><div class="tr-search-wrap"><label for="tr-search">Ville, région ou réseau</label><input id="tr-search" type="search" autocomplete="off" placeholder="Ex. Marseille, Île-de-France, TER…"/></div>'+
 '<div><label for="tr-format">Format des ressources</label><select id="tr-format"><option value="all">Tous les formats</option>'+FORMAT_TYPES.map(f=>'<option value="'+f+'">'+f+'</option>').join('')+'</select></div>'+
 '<label class="tr-realtime"><input type="checkbox" id="tr-rt"> Ressource temps réel référencée</label>'+
 '<button type="button" id="tr-refresh" class="tr-refresh">↻ Actualiser</button></section>'+
 '<div class="tr-summary"><div id="tr-status" role="status" aria-live="polite">Chargement du catalogue…</div><button id="tr-export" disabled type="button">↓ Exporter la sélection CSV</button></div>'+
 '<div id="tr-results" class="tr-results"></div><button id="tr-more" class="tr-more" type="button" hidden>Afficher davantage</button>'+
 '<p class="tr-source-note">Source : <a href="https://transport.data.gouv.fr/" target="_blank" rel="noopener noreferrer">Point d’Accès National aux données de transport</a>. Données et licences propres à chaque producteur. Les dates affichées ne garantissent pas un rafraîchissement temps réel.</p></div>';
 function render(){
  if(!ok())return;
  const list=filterCatalogue(state.all,state);
  const visible=list.slice(0,state.visible);
  el('#tr-export').disabled=!list.length;
  el('#tr-more').hidden=visible.length>=list.length;
  el('#tr-status').textContent=state.loading?'Chargement du catalogue…':state.error?'Impossible de charger les données : '+state.error:
   list.length.toLocaleString('fr-FR')+' jeu(x) de données correspondant(s)'+(state.lastFetch?' · chargés à '+state.lastFetch:'');
  el('#tr-results').innerHTML=state.loading?'<div class="tr-state">Interrogation de la source nationale…</div>':state.error?'<div class="tr-state tr-error" role="alert">Source temporairement indisponible. Vérifiez votre connexion et réessayez.</div>':
   !list.length?'<div class="tr-state">Aucun résultat avec ces filtres. Essayez une autre ville ou un autre format.</div>':
   visible.map((item,i)=>'<article class="tr-card"><div class="tr-card-top"><span class="tr-number">'+String(i+1).padStart(2,'0')+'</span>'+
   (item.hasRealtime?'<span class="tr-chip">Flux temps réel référencé</span>':'<span class="tr-chip tr-theory">Horaires / données publiées</span>')+'</div>'+
   '<h2>'+escapeHtml(item.title)+'</h2><p class="tr-publisher">'+escapeHtml(item.publisher)+'</p>'+
   '<div class="tr-formats">'+item.formats.map(f=>'<span>'+escapeHtml(f)+'</span>').join('')+'</div>'+
   '<details class="tr-details"><summary>Voir les ressources ('+item.resources.length+')</summary><div class="tr-resource-list">'+item.resources.slice(0,35).map(r=>'<div class="tr-resource"><div><strong>'+escapeHtml(r.title)+'</strong><small>'+escapeHtml(r.format)+' · mise à jour : '+escapeHtml(formatDate(r.updated))+'</small></div>'+
   (r.link?'<a href="'+escapeHtml(r.link)+'" target="_blank" rel="noopener noreferrer">Accéder ↗</a>':'<span>Lien non fourni</span>')+'</div>').join('')+
   (item.resources.length>35?'<p class="tr-limit">Seules les 35 premières ressources sont affichées.</p>':'')+'</div></details>'+
   (item.page?'<a class="tr-source-link" href="'+escapeHtml(item.page)+'" target="_blank" rel="noopener noreferrer">Consulter la fiche officielle ↗</a>':'<span class="tr-source-missing">Fiche source indisponible</span>')+'</article>').join('');
 }
 const onFilter=()=>{state.query=el('#tr-search').value;state.format=el('#tr-format').value;state.realtime=el('#tr-rt').checked;state.visible=18;render();};
 el('#tr-search').addEventListener('input',onFilter);
 el('#tr-format').addEventListener('change',onFilter);
 el('#tr-rt').addEventListener('change',onFilter);
 el('#tr-more').addEventListener('click',()=>{state.visible+=18;render();});
 el('#tr-export').addEventListener('click',()=>{
  const csv=catalogueCsv(filterCatalogue(state.all,state));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='atlas-transports-catalogue.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 async function load(){
  state.abort.abort();state.abort=new AbortController();state.loading=true;state.error=null;render();
  const deadline=setTimeout(()=>state.abort.abort(),16000);
  try{
   const response=await fetch('/api/transport-catalogue',{signal:state.abort.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const json=await response.json();
   if(!Array.isArray(json?.datasets))throw Error('Format de catalogue invalide');
   const result=normalizeCatalogue(json.datasets);
   if(!ok())return;
   state.all=result;state.lastFetch=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  }catch(error){if(ok()){state.error=error.name==='AbortError'?'délai de réponse dépassé':error.message;state.all=[];}}
  finally{clearTimeout(deadline);if(ok()){state.loading=false;render();}}
 }
 el('#tr-refresh').addEventListener('click',load);
 load();
 return ()=>{state.disposed=true;state.abort.abort();};
}
