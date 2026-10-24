/* Provider normalizers — source facts only, never fabricate departures or positions. */
const str=(v,max=140)=>String(v??'').slice(0,max);
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const iso=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function normalizeSwiss(payload,mode){
 const items=Array.isArray(payload?.stationboard)?payload.stationboard:[];
 const supported={train:'train',tram:'tram',bus:'bus',boat:'ship',cableway:'cableway'};
 const target=supported[mode]||null;
 const board=items.filter(x=>x?.stop&&(!target||(
  target==='train'? !['BUS','TRAM','SHIP','CABLEWAY'].includes(String(x.category||'').toUpperCase()):
  target==='tram'? /^(T|TRAM)$/.test(String(x.category||'').toUpperCase()):
  target==='bus'? /^(B|BUS|NFB)$/.test(String(x.category||'').toUpperCase()):
  target==='ship'? /^(BAT|SHIP|BOAT|FAE|FERRY)$/.test(String(x.category||'').toUpperCase()):
  /^(FUN|PB|CABLEWAY|GB|SL|CC)$/.test(String(x.category||'').toUpperCase())
 ))).map((x,i)=>{
  const stop=x.stop||{},predicted=iso(stop.prognosis?.departure),planned=iso(stop.departure);
  const delay=finite(stop.delay);
  return {id:str(x.name||i),line:str((x.category||'')+' '+(x.number||''),70).trim(),destination:str(x.to,110),
   planned,expected:predicted||planned,delay,platform:str(stop.prognosis?.platform||stop.platform||'',60),
   sourceUpdated:null,station:str(payload.station?.name||stop.station?.name,130),
   detail:str(x.operator||'',110),realtime:delay!==null||Boolean(predicted&&predicted!==planned),
   mode:mode||'train',cancelled:false};
 }).filter(x=>x.expected||x.planned);
 return {station:str(payload?.station?.name||'',140),departures:board.sort((a,b)=>Date.parse(a.expected)-Date.parse(b.expected)).slice(0,45)};
}
export function normalizeTfLArrivals(items){
 if(!Array.isArray(items))return {departures:[]};
 const departures=items.map((x,i)=>{
  const expected=iso(x.expectedArrival),seconds=finite(x.timeToStation);
  return {id:str(x.id||i),line:str(x.lineName||x.lineId,90),destination:str(x.destinationName||x.towards,150),
   planned:null,expected,delay:null,platform:str(x.platformName,90),
   sourceUpdated:iso(x.timestamp),station:str(x.stationName,130),detail:str(x.currentLocation,180),
   realtime:expected!==null,mode:str(x.modeName,40),seconds:seconds===null?null:Math.max(0,seconds),
   cancelled:false};
 }).filter(x=>x.expected).sort((a,b)=>Date.parse(a.expected)-Date.parse(b.expected));
 return {station:departures[0]?.station||'',departures:departures.slice(0,55)};
}
export function normalizeTfLSearch(payload){
 return (Array.isArray(payload?.matches)?payload.matches:[]).map(x=>({
  id:str(x.id||x.naptanId,100),name:str(x.name||x.commonName,170),
  modes:Array.isArray(x.modes)?x.modes.map(y=>str(y,30)):[]
 })).filter(x=>x.id&&x.name).slice(0,35);
}
export function normalizeTfLStatus(items){
 return (Array.isArray(items)?items:[]).map(item=>{
  const statuses=Array.isArray(item.lineStatuses)?item.lineStatuses:[];
  const primary=statuses.find(x=>x.statusSeverity!==10)||statuses[0];
  return {id:str(item.id,100),name:str(item.name,110),
   status:str(primary?.statusSeverityDescription||'Statut inconnu',100),
   reason:str(primary?.reason||'',700),normal:primary?.statusSeverity===10};
 }).filter(x=>x.name);
}
/* Strict, bounded GTFS-Realtime protobuf field reader without extra dependencies.
 * TripUpdate is used for observed delay/predicted station stop time, not GPS.
 * https://gtfs.org/documentation/realtime/proto/
 */
function varint(b,start,end){
 let shift=0n,num=0n,offset=start;
 for(let i=0;i<10;i++){
  if(offset>=end)throw Error('Protobuf tronqué');
  const c=b[offset++];
  num|=BigInt(c&127)<<shift;
  if(!(c&128))return {value:num,next:offset};
  shift+=7n;
 }
 throw Error('Protobuf varint invalide');
}
function* fields(b,start=0,end=b.length){
 let at=start;
 while(at<end){
  const key=varint(b,at,end);at=key.next;
  const field=Number(key.value>>3n),wire=Number(key.value&7n);
  if(field<1)throw Error('Champ protobuf invalide');
  if(wire===0){const v=varint(b,at,end);at=v.next;yield [field,wire,v.value];}
  else if(wire===2){const len=varint(b,at,end);at=len.next;const size=Number(len.value);
   if(size<0||size>end-at)throw Error('Longueur protobuf invalide');
   yield [field,wire,b.subarray(at,at+size)];at+=size;
  }else if(wire===1){if(at+8>end)throw Error('Champ protobuf tronqué');at+=8;}
  else if(wire===5){if(at+4>end)throw Error('Champ protobuf tronqué');at+=4;}
  else throw Error('Type protobuf invalide');
 }
}
const fieldString=value=>Buffer.from(value).toString('utf8');
function tripDescription(b){
 const x={id:'',route:'',cancelled:false};
 for(const [f,w,v] of fields(b)){if(w===2){if(f===1)x.id=str(fieldString(v),120);if(f===5)x.route=str(fieldString(v),100);}
 else if(f===4)x.cancelled=Number(v)===3;}
 return x;
}
function stopEvent(b){
 const x={time:null,delay:null};
 for(const [f,w,v] of fields(b))if(w===0){
  if(f===1)x.delay=Number(BigInt.asIntN(32,v));
  if(f===2&&v>0n&&v<BigInt(Number.MAX_SAFE_INTEGER))x.time=Number(v)*1000;
 }
 return x;
}
function stopUpdate(b){
 const x={stopId:'',arrive:null,depart:null,skip:false};
 for(const [f,w,v] of fields(b)){
  if(f===4&&w===2)x.stopId=str(fieldString(v),130);
  if(f===2&&w===2)x.arrive=stopEvent(v);
  if(f===3&&w===2)x.depart=stopEvent(v);
  if(f===5&&w===0)x.skip=Number(v)===1;
 }
 return x;
}
function trainUpdate(b,nowMs){
 let trip={id:'',route:'',cancelled:false},updates=[],tripDelay=null,sourceTime=null;
 for(const [f,w,v] of fields(b)){
  if(f===1&&w===2)trip=tripDescription(v);
  if(f===2&&w===2&&updates.length<90)updates.push(stopUpdate(v));
  if(f===4&&w===0)sourceTime=Number(v)*1000;
  if(f===5&&w===0)tripDelay=Number(BigInt.asIntN(32,v));
 }
 const options=updates.map(stop=>{
  const event=stop.depart||stop.arrive;
  return {stop,when:event?.time??null,delay:event?.delay??tripDelay};
 }).filter(x=>x.when!==null&&x.when>nowMs-2*60*1000&&x.when<nowMs+3*3600000&& !x.stop.skip);
 const next=options.sort((a,b)=>a.when-b.when)[0]||null;
 if(!next&&!trip.cancelled)return null;
 const delay=next?.delay??tripDelay;
 return {id:trip.id||trip.route,route:trip.route,stopId:next?.stop.stopId||'',
  expected:next?new Date(next.when).toISOString():null,
  delay:delay===null?null:Math.round(delay/60),
  sourceUpdated:sourceTime?new Date(sourceTime).toISOString():null,
  cancelled:trip.cancelled,realTime:true,kind:'train'};
}
export function decodeSncfGtfsRt(bytes,nowMs=Date.now()){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length>24*1024*1024)throw Error('Flux SNCF trop volumineux');
 let timestamp=null,rows=[],entities=0;
 for(const [f,w,v] of fields(bytes)){
  if(f===1&&w===2){for(const [ff,ww,vv] of fields(v))if(ff===3&&ww===0&&vv>0n)timestamp=new Date(Number(vv)*1000).toISOString();}
  if(f===2&&w===2){
   entities++;if(entities>35000)break;
   for(const [ff,ww,vv] of fields(v)){if(ff===3&&ww===2){
    const row=trainUpdate(vv,nowMs);if(row)rows.push(row);
   }}
  }
 }
 rows=rows.filter(x=>x.id).sort((a,b)=>(Date.parse(a.expected)||Infinity)-(Date.parse(b.expected)||Infinity));
 return {timestamp,entities,rows};
}
export function normalizeSncfBoard(decoded,{query='',max=65}={}){
 const q=String(query).trim().toLocaleLowerCase('fr');
 const list=decoded.rows.filter(row=>!q||[row.id,row.route,row.stopId].some(v=>String(v).toLocaleLowerCase('fr').includes(q)));
 return {station:'Circulations SNCF (France)',departures:list.slice(0,Math.min(80,max)).map(row=>({
  id:row.id,line:row.route||('Train '+row.id),destination:row.stopId?'Arrêt GTFS '+row.stopId:'Non renseignée',
  stopId:row.stopId,expected:row.expected,planned:null,delay:row.delay,platform:'',
  sourceUpdated:row.sourceUpdated||decoded.timestamp,station:'Réseau national SNCF',
  detail:'Train / course '+row.id,realtime:true,cancelled:row.cancelled,
  mode:'train'
 })),matches:list.length,feedUpdated:decoded.timestamp,total:decoded.entities};
}


/* GTFS-RT Service Alerts: only publisher-authored incidents, never inferred ones. */
function alertText(buf){
 let alternatives=[];
 for(const [field,wire,value] of fields(buf))if(field===1&&wire===2){
  let text='',language='';
  for(const [f,w,v] of fields(value))if(w===2){
   if(f===1)text=str(fieldString(v),1000);
   if(f===2)language=str(fieldString(v),15);
  }
  if(text)alternatives.push({text,language});
 }
 return alternatives.find(x=>/^fr\b/i.test(x.language))?.text||alternatives[0]?.text||'';
}
function alertPeriod(buf){
 const p={start:null,end:null};
 for(const [f,w,v] of fields(buf))if(w===0&&v>0n&&v<BigInt(Number.MAX_SAFE_INTEGER)){
  if(f===1)p.start=new Date(Number(v)*1000).toISOString();
  if(f===2)p.end=new Date(Number(v)*1000).toISOString();
 }
 return p;
}
function alertSelector(buf){
 let route='',stop='';
 for(const [f,w,v] of fields(buf))if(w===2){
  if(f===2)route=str(fieldString(v),90);
  if(f===5)stop=str(fieldString(v),90);
 }
 return {route,stop};
}
function parseAlert(buf,nowMs){
 const a={title:'',description:'',routes:[],stops:[],from:null,to:null,effect:null,cause:null};
 const periods=[];
 for(const [f,w,v] of fields(buf)){
  if(f===1&&w===2)periods.push(alertPeriod(v));
  if(f===5&&w===2){const sel=alertSelector(v);if(sel.route)a.routes.push(sel.route);if(sel.stop)a.stops.push(sel.stop);}
  if(f===6&&w===0)a.cause=Number(v);
  if(f===7&&w===0)a.effect=Number(v);
  if(f===10&&w===2)a.title=alertText(v);
  if(f===11&&w===2)a.description=alertText(v);
 }
 if(periods.length){
  const match=periods.find(p=>(!p.start||Date.parse(p.start)<=nowMs)&&(!p.end||Date.parse(p.end)>=nowMs))
    ||periods.find(p=>!p.end||Date.parse(p.end)>=nowMs)||periods[0];
  a.from=match.start;a.to=match.end;
 }
 a.active=periods.length===0||periods.some(p=>(!p.start||Date.parse(p.start)<=nowMs)&&(!p.end||Date.parse(p.end)>=nowMs));
 a.routes=[...new Set(a.routes)].slice(0,12);a.stops=[...new Set(a.stops)].slice(0,12);
 return a;
}
export function decodeGtfsServiceAlerts(bytes,nowMs=Date.now()){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length>12*1024*1024)throw Error('Flux d’alertes trop volumineux');
 let updated=null,alerts=[],entities=0;
 for(const [f,w,v] of fields(bytes)){
  if(f===1&&w===2){for(const [ff,ww,val] of fields(v))if(ff===3&&ww===0&&val>0n)updated=new Date(Number(val)*1000).toISOString();}
  if(f!==2||w!==2)continue;
  entities++;if(entities>10000)break;
  for(const [ef,ew,ev] of fields(v))if(ef===5&&ew===2){
   const a=parseAlert(ev,nowMs);
   if(a.title||a.description)alerts.push(a);
  }
 }
 alerts.sort((a,b)=>Number(b.active)-Number(a.active));
 return {updated,alerts:alerts.slice(0,90),entities};
}
