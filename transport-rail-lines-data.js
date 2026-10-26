/**
 * SNCF Réseau official physical rail geometries, viewport limited.
 * Infrastructure is NOT a specific train's itinerary.
 */
export const RAIL_GEOMETRY_SOURCE='https://data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/';
export const RAIL_GEOMETRY_API='https://data.sncf.com/api/explore/v2.1/catalog/datasets/formes-des-lignes-du-rfn/records';
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const round=n=>Math.round(n*10000)/10000;
export function validateRailBounds(query){
 const n=v=>v!==undefined&&v!==null&&String(v).trim()!==''?Number(v):NaN;
 const south=n(query?.south),north=n(query?.north),west=n(query?.west),east=n(query?.east);
 if(![south,north,west,east].every(Number.isFinite)||
    south<41||north>52||west< -6||east>11||
    south>=north||west>=east||
    north-south>1.4||east-west>1.8||
    north-south<0.005||east-west<0.005)return null;
 return {south:round(south),north:round(north),west:round(west),east:round(east)};
}
export function railLinesQuery(bounds,{offset=0,limit=100}={}){
 if(!bounds||!Number.isInteger(offset)||offset<0||offset>200||!Number.isInteger(limit)||limit<1||limit>100)
  return null;
 const url=new URL(RAIL_GEOMETRY_API);
 const {west,east,south,north}=bounds;
 const polygon='POLYGON(('+west+' '+south+', '+east+' '+south+', '+east+' '+north+', '+west+' '+north+', '+west+' '+south+'))';
 url.searchParams.set('where',"mnemo = 'EXPLOITE' AND intersects(geo_shape, geom'"+polygon+"')");
 url.searchParams.set('select','code_ligne,mnemo,geo_shape');
 url.searchParams.set('limit',String(limit));
 url.searchParams.set('offset',String(offset));
 return url.toString();
}
export function normalizeRailGeometry(records,{maxSegments=230,maxPoints=50000}={}){
 const lines=[],codeSet=new Set();
 let pointCount=0;
 function append(raw,code){
  if(lines.length>=maxSegments||pointCount>=maxPoints||!Array.isArray(raw))return;
  const coordinates=[];
  const stride=Math.max(1,Math.ceil(raw.length/1400));
  for(let i=0;i<raw.length;i+=stride){
   const pair=raw[i];
   const lon=finite(pair?.[0]),lat=finite(pair?.[1]);
   if(lon===null||lat===null||lat<41||lat>52||lon< -6||lon>11)continue;
   coordinates.push([round(lat),round(lon)]);
   if(pointCount+coordinates.length>=maxPoints)break;
  }
  const last=raw.at(-1);
  if(last&&Array.isArray(last)&&coordinates.length&&
     finite(last[1])!==null&&finite(last[0])!==null){
   const lastPoint=[round(last[1]),round(last[0])];
   const prev=coordinates.at(-1);
   if((prev[0]!==lastPoint[0]||prev[1]!==lastPoint[1])&&
     lastPoint[0]>=41&&lastPoint[0]<=52&&lastPoint[1]>= -6&&lastPoint[1]<=11)
     coordinates.push(lastPoint);
  }
  if(coordinates.length<2)return;
  lines.push({code,coordinates});
  codeSet.add(code);
  pointCount+=coordinates.length;
 }
 for(const record of Array.isArray(records)?records:[]){
  if(record?.mnemo!=='EXPLOITE')continue;
  const code=String(record.code_ligne??'').trim();
  if(!/^\d{6}$/.test(code))continue;
  const shape=record.geo_shape;
  const geometry=shape?.type==='Feature'?shape.geometry:shape;
  if(geometry?.type==='LineString')append(geometry.coordinates,code);
  else if(geometry?.type==='MultiLineString')for(const line of geometry.coordinates||[])append(line,code);
  if(lines.length>=maxSegments||pointCount>=maxPoints)break;
 }
 return {lines,pointCount,distinctLines:codeSet.size};
}
