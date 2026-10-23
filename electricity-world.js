import {energyChartsUrl,normalizeRecentPower} from './electricity-europe-live-data.js';
import {WORLD_SOURCES,WORLD_METRICS,EUROPE_ISO3,parseAnnualCsv,mergeWorldSeries,rankCountries,observationAt,latestObservation,countryCodeByName} from './electricity-world-data.js';
const TOPO_URL='https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const CACHE_MS=24*60*60*1000;
const store={countries:[],at:0,topology:null,promise:null,live:new Map()};
const fmt=(n,decimals=1)=>n==null?'—':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:decimals}).format(n);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionTitle=r=>r==='europe'?'Europe':'Monde';
const metricInfo=id=>WORLD_METRICS.find(m=>m.id===id)||WORLD_METRICS[0];
async function readData(signal){
 if(store.countries.length&&Date.now()-store.at<CACHE_MS)return store.countries;
 if(store.promise)return store.promise;
 const operation=async()=>{
  const result=await Promise.allSettled(Object.entries(WORLD_SOURCES).map(async([key,url])=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),20000);
   try{
    const response=await fetch(url,{headers:{Accept:'text/csv'},signal:controller.signal});
    if(!response.ok)throw Error(key+' : HTTP '+response.status);
    const rows=parseAnnualCsv(await response.text());
    if(rows.length<100)throw Error(key+' : série insuffisante');
    return [key,rows];
   }finally{clearTimeout(timer);}
  }));
  const series=Object.fromEntries(result.filter(x=>x.status==='fulfilled').map(x=>x.value));
  if(!series.generation)throw new Error('La source mondiale de production électrique est indisponible. '+result.map(x=>x.status==='rejected'?x.reason.message:'').filter(Boolean).join(' · '));
  store.countries=mergeWorldSeries(series);
  store.at=Date.now();
  return store.countries;
 };
 store.promise=operation().finally(()=>{store.promise=null;});
 return store.promise;
}
async function readTopology(){
 if(store.topology)return store.topology;
 const response=await fetch(TOPO_URL);
 if(!response.ok)throw Error('Fond cartographique : HTTP '+response.status);
 store.topology=await response.json();
 return store.topology;
}
function makeChart(country,metric,endYear){
 const series=(country?.years||[]).filter(x=>x.year<=endYear&&Number.isFinite(x[metric])).slice(-35);
 if(series.length<2)return '<p class="world-muted">Historique insuffisant pour tracer une courbe.</p>';
 const w=760,h=222,left=56,right=18,top=20,bottom=33;
 const values=series.map(x=>x[metric]),lo=Math.min(...values),hi=Math.max(...values);
 const minimum=Math.max(0,lo-(hi-lo)*.16),maximum=hi+(hi-lo||10)*.16;
 const y=v=>top+(maximum-v)/(maximum-minimum)*(h-top-bottom);
 const x=i=>left+i*(w-left-right)/(series.length-1);
 const path=series.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(v[metric]).toFixed(2)).join(' ');
 const dots=series.map((v,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v[metric]).toFixed(1)+'" r="3" fill="#58a6ff"><title>'+v.year+' : '+fmt(v[metric])+'</title></circle>').join('');
 const years=[series[0].year,series[Math.floor(series.length/2)].year,series.at(-1).year];
 const ticks=years.map((year,index)=>'<text x="'+(left+index*(w-left-right)/2)+'" y="216" text-anchor="middle" fill="#9198a1" font-size="14">'+year+'</text>').join('');
 return '<svg class="world-trend" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Évolution annuelle de '+safe(metricInfo(metric).label)+'">'+
 [0,.25,.5,.75,1].map(t=>'<path d="M'+left+' '+y(minimum+(maximum-minimum)*t)+'H'+(w-right)+'" stroke="#30363d" stroke-dasharray="3 6"/>'+
 '<text x="'+(left-7)+'" y="'+(y(minimum+(maximum-minimum)*t)+4)+'" text-anchor="end" fill="#9198a1" font-size="12">'+fmt(minimum+(maximum-minimum)*t,0)+'</text>').join('')+
 '<path d="'+path+'" stroke="#58a6ff" fill="none" stroke-width="3"/>'+dots+ticks+'</svg>';
}
function mapShade(value,min,max){
 if(!Number.isFinite(value))return '#29313b';
 const ratio=Math.max(0,Math.min(1,(value-min)/(max-min||1)));
 const hue=210-155*ratio;
 return 'hsl('+hue+' 61% '+(25+23*ratio)+'%)';
}
function buildMap(topo,countries,year,metric,region,selected){
 if(!window.topojson?.feature)return '<p class="world-muted">Fond cartographique non chargé. Le classement reste accessible.</p>';
 const fc=window.topojson.feature(topo,topo.objects.countries);
 const allowed=fc.features.filter(f=>region==='world'||EUROPE_ISO3.has(countryCodeByName(f.properties.name,countries)));
 const vals=rankCountries(countries,year,metric,region).map(x=>x.row[metric]);
 const sorted=vals.slice().sort((a,b)=>a-b);
 const min=sorted[Math.floor(sorted.length*.03)]??0,max=sorted[Math.floor(sorted.length*.97)]??1;
 const W=980,H=region==='world'?460:530;
 // GeoJSON polygons are geographic surfaces, not unwrapped SVG polylines.
 // D3's spherical clipping correctly handles the antimeridian, polar bounds,
 // holes and countries overlapping the Europe viewport.
 if(!window.d3?.geoPath || !window.d3?.geoMercator || !window.d3?.geoNaturalEarth1)
  return '<p class="world-muted">Projection cartographique indisponible. Le classement reste utilisable.</p>';
 const europeViewport={type:'Polygon',coordinates:[[
  [-13,33],[44,33],[44,73],[-13,73],[-13,33]
 ]]};
 const projection=region==='world'
  ? window.d3.geoNaturalEarth1().fitExtent([[10,10],[W-10,H-10]],{type:'Sphere'})
  : window.d3.geoMercator().fitExtent([[8,8],[W-8,H-8]],europeViewport);
 projection.clipExtent([[0,0],[W,H]]);
 const geometryPath=window.d3.geoPath(projection);
 return '<svg class="world-geo" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Carte électrique '+regionTitle(region)+', année '+year+'">'+
 allowed.map(f=>{
  const code=countryCodeByName(f.properties.name,countries);
  const row=observationAt(countries.find(c=>c.code===code),metric,year);
  const value=row?.[metric];
  return '<path d="'+(geometryPath(f)||'')+'" fill="'+mapShade(value,min,max)+'" class="world-country'+(selected===code?' active':'')+'"'+
   (code?' data-code="'+safe(code)+'" tabindex="0" role="button" aria-label="'+safe(f.properties.name)+'"':'')+'><title>'+safe(f.properties.name)+' · '+(Number.isFinite(value)?fmt(value)+' '+metricInfo(metric).unit:'Données non disponibles')+'</title></path>';
 }).join('')+'</svg>'+
 '<div class="world-map-scale"><span>Faible</span><span class="world-gradient"></span><span>Élevé</span><small>Gris : données absentes · Pas une carte temps réel</small></div>';
}
function download(rows,type,region,metric,year){
 const data=rows.map(({country,row})=>({country:country.name,iso3:country.code,year,value:row[metric],unit:metricInfo(metric).unit,source:'Our World in Data / Ember'}));
 const text=type==='json'?JSON.stringify(data,null,2):
  'country;iso3;year;value;unit\n'+data.map(v=>[v.country,v.iso3,v.year,v.value,v.unit].join(';')).join('\n');
 const blob=new Blob([type==='json'?text:'\uFEFF'+text],{type:type==='json'?'application/json':'text/csv'});
 const href=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=href;link.download='atlas-electricite-'+region+'-'+metric+'-'+year+'.'+type;
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function mountElectricityWorld(root,mode='world'){
 let liveRequest=0;
 const state={mode:mode==='europe'?'europe':'world',countries:[],metric:'generation',year:2025,country:mode==='europe'?'FRA':'USA',liveCountry:null,liveLoading:false,liveError:null,livePoints:[],error:null,loading:true,topology:null,active:true,sort:'desc',query:''};
 root.innerHTML='<div class="elec-shell world-shell"><div class="repo-heading elec-repo-heading"><div class="repo-title">'+
 '<span class="repo-icon elec-repo-icon" aria-hidden="true">🌐</span><div><div class="repo-eyebrow">Atlas Live / Module 02 / Comparaisons internationales</div>'+
 '<h1>Électricité · '+regionTitle(state.mode)+'</h1><p>Statistiques annuelles des systèmes électriques. Pas de mesures en temps réel.</p></div></div></div>'+
 '<nav class="weather-tabs elec-tabs" aria-label="Couverture géographique">'+
 '<a class="weather-tab" href="#/electricity/overview">🇫🇷 France · temps réel</a>'+
 '<a class="weather-tab'+(state.mode==='europe'?' selected':'')+'" href="#/electricity/europe">🇪🇺 Europe · annuel</a>'+
 '<a class="weather-tab'+(state.mode==='world'?' selected':'')+'" href="#/electricity/world">🌍 Monde · annuel</a></nav>'+
 '<div id="world-body" role="region" aria-label="Données électriques internationales"><div class="panel world-loading" role="status">Chargement des séries historiques mondiales…</div></div>'+
 '<section class="panel elec-attribution"><div><strong>Sources : Our World in Data et Ember</strong>'+
 '<p>Données nationales annuelles historiques. Chaque cellule porte son année propre ; les données manquantes ne sont pas interpolées. Comparaison de production, de parts bas-carbone et renouvelable et d’intensité CO₂. Ces séries ne sont pas identiques aux données instantanées RTE.</p>'+
 '<p>Sources : <a href="https://ourworldindata.org/grapher/electricity-mix" target="_blank" rel="noopener">OWID Electricity mix ↗</a> · <a href="https://ember-energy.org/data/yearly-electricity-data/" target="_blank" rel="noopener">Ember Yearly Electricity Data ↗</a>. Vérifier les licences des jeux sources avant republication.</p></div></section></div>';
 const R=()=>root.querySelector('#world-body');
 function render(){
  if(!state.active)return;
  if(state.loading){R().innerHTML='<section class="panel world-loading" role="status">Connexion aux données ouvertes mondiales…</section>';return;}
  if(state.error){R().innerHTML='<section class="panel world-error" role="alert"><strong>Données non disponibles</strong><p>'+safe(state.error)+'</p><button class="btn primary" id="world-retry">Réessayer</button></section>';root.querySelector('#world-retry').onclick=refresh;return;}
  const region=state.mode,metric=state.metric,year=state.year;
  const eligible=state.countries.filter(c=>region==='world'||EUROPE_ISO3.has(c.code));
  const ranks=rankCountries(eligible,year,metric,region);
  const chosen=eligible.find(c=>c.code===state.country)||ranks[0]?.country;
  const observation=observationAt(chosen,metric,year),metricUnit=metricInfo(metric).unit;
  const filtered=ranks.filter(v=>v.country.name.toLowerCase().includes(state.query.toLowerCase())||v.country.code.toLowerCase().includes(state.query.toLowerCase()));
  const years=[...new Set(eligible.flatMap(c=>c.years.filter(r=>Number.isFinite(r.generation)).map(r=>r.year)))].sort((a,b)=>b-a);
  const current=observation?.[metric];
  const prev=observationAt(chosen,metric,year-1)?.[metric];
  const delta=Number.isFinite(current)&&Number.isFinite(prev)?current-prev:null;
  R().innerHTML='<div class="panel world-controls"><label>Indicateur<select class="field" id="world-metric">'+
   WORLD_METRICS.map(m=>'<option value="'+m.id+'"'+(metric===m.id?' selected':'')+'>'+safe(m.label)+'</option>').join('')+'</select></label>'+
   '<label>Année<select class="field" id="world-year">'+years.map(y=>'<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'</option>').join('')+'</select></label>'+
   '<label>Pays<select class="field" id="world-country">'+eligible.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>'<option value="'+c.code+'"'+(c.code===chosen?.code?' selected':'')+'>'+safe(c.name)+'</option>').join('')+'</select></label>'+
   '<button type="button" class="btn" id="world-json">↓ JSON</button><button type="button" class="btn" id="world-csv">↓ CSV</button>'+
   '<button type="button" class="btn" id="world-refresh">↻ Actualiser</button></div>'+
   '<div class="world-notice">● Série historique annuelle · '+year+' · '+regionTitle(region)+' · '+ranks.length+' territoires disposant de cet indicateur · Source OWID / Ember · <strong>Pas du temps réel</strong></div>'+
   '<div class="elec-kpi-grid">'+
   '<article class="elec-kpi"><div class="elec-kpi-heading">Pays choisi</div><strong>'+safe(chosen?.name||'—')+'</strong><small>Code ISO : '+safe(chosen?.code||'—')+'</small></article>'+
   '<article class="elec-kpi"><div class="elec-kpi-heading">'+safe(metricInfo(metric).label)+'</div><strong>'+fmt(current,metricInfo(metric).decimals)+' <small>'+safe(metricUnit)+'</small></strong><small>Pour l’année '+year+'</small></article>'+
   '<article class="elec-kpi"><div class="elec-kpi-heading">Variation annuelle</div><strong>'+(delta===null?'—':(delta>0?'+':'')+fmt(delta,1))+' <small>'+safe(metricUnit)+'</small></strong><small>Écart absolu versus '+(year-1)+'</small></article>'+
   '<article class="elec-kpi"><div class="elec-kpi-heading">Pays couverts</div><strong>'+ranks.length+'</strong><small>Présents pour l’année et l’indicateur sélectionnés</small></article></div>'+
   (region==='europe'?'<section id="world-live" class="panel world-live-panel" aria-label="Production électrique européenne récente"></section>':'')+
   '<div class="world-layout"><section class="panel world-map-panel"><div class="elec-section-heading"><div><h3>Carte géographique</h3><p>'+safe(metricInfo(metric).label)+' · '+year+' · cliquez sur un pays</p></div></div>'+
   '<div id="world-map" class="world-map" role="region" aria-label="Carte mondiale">Chargement du fond cartographique…</div></section>'+
   '<section class="panel world-ranking"><div class="elec-section-heading"><div><h3>Classement des pays</h3><p>Année '+year+' · '+safe(metricUnit)+'</p></div></div>'+
   '<input class="field" id="world-search" placeholder="Rechercher un pays…" value="'+safe(state.query)+'" aria-label="Rechercher un pays"/>'+
   '<div id="world-ranking-list" class="world-ranking-list"></div></section></div>'+
   '<section class="panel world-history"><div class="elec-section-heading"><div><h3>Évolution historique · '+safe(chosen?.name||'')+'</h3><p>'+safe(metricInfo(metric).label)+' · Série annuelle, sans interpolation</p></div></div>'+makeChart(chosen,metric,year)+'</section>';
  function fillLive(){
   const panel=root.querySelector('#world-live');
   if(!panel)return;
   const target=state.liveCountry;
   const date=x=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date(x.timestamp));
   const point=state.livePoints.at(-1);
   panel.innerHTML='<div class="elec-section-heading"><div><h3>Production européenne récente · '+safe(chosen?.name||'')+'</h3>'+
    '<p>Energy-Charts / Fraunhofer ISE · production publique nette en MW, hors autoconsommation industrielle · source et horodatage distincts des données annuelles</p></div>'+
    '<span class="world-live-badge">Mesures récentes, selon disponibilité</span></div>'+
    (state.liveLoading?'<p role="status">Chargement de la série européenne…</p>':
      state.liveError?'<p role="alert" class="world-live-error">'+safe(state.liveError)+'</p>':
      target!==chosen?.code?'<p>Sélection du pays…</p>':
      point?'<div class="world-live-head"><div><small>Dernière mesure disponible</small><strong>'+date(point)+'</strong></div>'+
       '<div><small>Production publique nette calculée</small><strong>'+fmt(point.totalMW/1000,2)+' GW</strong></div>'+
       '<div><small>Relevés disponibles</small><strong>'+state.livePoints.length+'</strong></div></div>'+
       '<div class="world-live-sources">'+point.sources.filter(v=>v.mw>0).slice(0,9).map(v=>
        '<div class="world-live-source"><span>'+safe(v.name)+'</span><b>'+fmt(v.mw/1000,2)+' GW</b></div>').join('')+'</div>'+
       '<p class="world-muted">Production publique nette partielle suivant les filières et pays disponibles. Ne pas assimiler cette somme à la consommation nationale, ni aux séries totales RTE.</p>':
       '<p>Pas de mesure exploitable publiée récemment.</p>')+
    '<a href="https://energy-charts.info/" target="_blank" rel="noopener noreferrer">Consulter Energy-Charts ↗</a>';
  }
  fillLive();
  if(region==='europe'&&state.liveCountry!==chosen?.code)loadLive(chosen?.code);
  const putRows=()=>{
   const list=root.querySelector('#world-ranking-list');
   if(!list)return;
   const items=rankCountries(eligible,year,metric,region).filter(v=>v.country.name.toLowerCase().includes(state.query.toLowerCase())||v.country.code.toLowerCase().includes(state.query.toLowerCase())).slice(0,120);
   list.innerHTML=items.map((r,i)=>'<button class="world-rank-row'+(r.country.code===chosen?.code?' selected':'')+'" type="button" data-code="'+r.country.code+'"><span>'+(i+1)+'. '+safe(r.country.name)+'</span><strong>'+fmt(r.row[metric],metricInfo(metric).decimals)+'</strong></button>').join('')||'<p>Aucun pays correspondant.</p>';
   list.querySelectorAll('button').forEach(button=>button.onclick=()=>{state.country=button.dataset.code;render();});
  };
  putRows();
  root.querySelector('#world-search').oninput=e=>{state.query=e.target.value;putRows();};
  root.querySelector('#world-metric').onchange=e=>{state.metric=e.target.value;render();};
  root.querySelector('#world-year').onchange=e=>{state.year=Number(e.target.value);render();};
  root.querySelector('#world-country').onchange=e=>{state.country=e.target.value;render();};
  root.querySelector('#world-json').onclick=()=>download(ranks,'json',region,metric,year);
  root.querySelector('#world-csv').onclick=()=>download(ranks,'csv',region,metric,year);
  root.querySelector('#world-refresh').onclick=()=>refresh(true);
  const map=root.querySelector('#world-map');
  if(state.topology){
   map.innerHTML=buildMap(state.topology,eligible,year,metric,region,chosen?.code);
   map.querySelectorAll('[data-code]').forEach(el=>{
    const choose=()=>{state.country=el.dataset.code;render();};
    el.addEventListener('click',choose);el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
   });
  }else{
   map.innerHTML='<p class="world-muted">Fond cartographique indisponible. Le classement et l’historique restent opérationnels.</p>';
  }
 }
 async function loadLive(iso3){
  state.liveCountry=iso3;state.livePoints=[];state.liveError=null;
  const url=energyChartsUrl(iso3);
  if(!url){state.liveLoading=false;state.liveError='Pas de connecteur Energy-Charts disponible pour ce pays.';if(state.active)render();return;}
  const cached=store.live.get(iso3);
  if(cached&&Date.now()-cached.at<10*60*1000){
   state.livePoints=cached.points;state.liveLoading=false;if(state.active)render();return;
  }
  state.liveLoading=true;
  const panel=root.querySelector('#world-live');
  if(panel)panel.innerHTML='<p role="status">Chargement de la production récente pour '+safe(iso3)+'…</p>';
  const request=++liveRequest;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  try{
   // Same-origin Vercel endpoint avoids provider CORS restrictions in browsers.
   const response=await fetch('/api/europe-power?country='+encodeURIComponent(new URL(url).searchParams.get('country')),{signal:controller.signal});
   if(!response.ok)throw Error('Energy-Charts : HTTP '+response.status);
   const points=normalizeRecentPower(await response.json());
   if(!state.active||request!==liveRequest||state.liveCountry!==iso3)return;
   state.livePoints=points;store.live.set(iso3,{points,at:Date.now()});
  }catch(error){
   if(!state.active||request!==liveRequest||state.liveCountry!==iso3)return;
   state.liveError='Connecteur européen indisponible : '+error.message;
  }finally{
   clearTimeout(timer);
   if(state.active&&request===liveRequest){state.liveLoading=false;render();}
  }
 }
 async function refresh(force=false){
  state.loading=true;state.error=null;render();
  try{
   if(force)store.at=0;
   const countries=await readData();
   if(!state.active)return;
   state.countries=countries;
   const years=countries.flatMap(c=>c.years.filter(row=>Number.isFinite(row.generation)).map(row=>row.year));
   const recent=Math.max(...years);
   if(!Number.isFinite(recent))throw new Error('Pas de séries annuelles utilisables');
   if(!state.year||state.year>recent)state.year=recent;
   else if(state.year===2025&&!years.includes(2025))state.year=recent;
   state.loading=false;render();
   try{const topology=await readTopology();if(state.active){state.topology=topology;render();}}catch(error){console.warn('Fond cartographique indisponible :',error);}
  }catch(error){if(!state.active)return;state.loading=false;state.error=error.message;render();}
 }
 refresh();
 return ()=>{state.active=false;liveRequest++;};
}
