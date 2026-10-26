/**
 * Conservative train position estimate along ONE continuous official
 * SNCF Réseau rail line. Never create a train position if timing OR
 * track/stop matching is insufficient.
 *
 * No GPS, no observed motion, no interpolation across unrelated lines.
 */
const radians=x=>x*Math.PI/180;
export function distanceMeters(a,b){
 if(!a||!b)return Infinity;
 const lat1=Number(a.lat),lon1=Number(a.lng),lat2=Number(b.lat),lon2=Number(b.lng);
 if(![lat1,lon1,lat2,lon2].every(Number.isFinite))return Infinity;
 const p1=radians(lat1),p2=radians(lat2),dp=p2-p1,dl=radians(lon2-lon1);
 const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function projectionAlong(point,polyline){
 if(!point||!Array.isArray(polyline)||polyline.length<2)return null;
 const lat0=radians(point.lat),factor=Math.cos(lat0);
 const xy=p=>({x:radians(p.lng)*6371000*factor,y:radians(p.lat)*6371000});
 const target=xy(point);let nearest=null,accumulated=0;
 for(let i=1;i<polyline.length;i++){
  const a=polyline[i-1],b=polyline[i];
  const len=distanceMeters(a,b);
  if(!(len>0)&&len!==0)continue;
  if(len>50000){accumulated+=len;continue;}
  const pa=xy(a),pb=xy(b),dx=pb.x-pa.x,dy=pb.y-pa.y;
  const sq=dx*dx+dy*dy;
  if(sq<1){accumulated+=len;continue;}
  const t=Math.max(0,Math.min(1,((target.x-pa.x)*dx+(target.y-pa.y)*dy)/sq));
  const near={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
  const distance=distanceMeters(point,near);
  if(!nearest||distance<nearest.distance)
   nearest={distance,metres:accumulated+len*t,coordinate:near};
  accumulated+=len;
 }
 return nearest?{...nearest,total:accumulated}:null;
}
function positionAt(polyline,metres){
 if(!Array.isArray(polyline)||polyline.length<2||!Number.isFinite(metres))return null;
 let walked=0;
 for(let i=1;i<polyline.length;i++){
  const a=polyline[i-1],b=polyline[i],len=distanceMeters(a,b);
  if(!Number.isFinite(len)||len<.01)continue;
  if(walked+len>=metres){
   const f=Math.max(0,Math.min(1,(metres-walked)/len));
   return {lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f};
  }
  walked+=len;
 }
 return polyline.at(-1);
}
export function estimateRailPosition(segment,railLines){
 if(!segment||!Array.isArray(railLines))return null;
 const {from,to,progress,lineCode,fromTime,toTime}=segment;
 const pct=Number(progress);
 const fromAt=Date.parse(fromTime||''),toAt=Date.parse(toTime||'');
 const direct=distanceMeters(from,to);
 if(!/^\d{6}$/.test(String(lineCode||''))||!Number.isFinite(pct)||
  pct<=0||pct>=1||
  !Number.isFinite(fromAt)||!Number.isFinite(toAt)||toAt-fromAt<120000||
  toAt-fromAt>150*60000||
  !Number.isFinite(direct)||direct<400||direct>110000)return null;
 let best=null;
 for(const entry of railLines){
  if(entry?.code!==lineCode||!Array.isArray(entry.coordinates)||entry.coordinates.length>5000)continue;
  const polyline=entry.coordinates.filter(p=>Array.isArray(p)&&p.length===2&&
     Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>({lat:p[0],lng:p[1]}));
  if(polyline.length<2)continue;
  const start=projectionAlong(from,polyline),end=projectionAlong(to,polyline);
  if(!start||!end||start.distance>1200||end.distance>1200)continue;
  const trackDistance=Math.abs(end.metres-start.metres);
  if(trackDistance<400||trackDistance<direct*.8||trackDistance>direct*2.8)continue;
  const target=start.metres+(end.metres-start.metres)*pct;
  const point=positionAt(polyline,target);
  if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))continue;
  const score=start.distance+end.distance;
  if(!best||score<best.score){
   best={...point,score,trackDistanceKm:Math.round(trackDistance/100)/10,
    progress:pct,lineCode,precision:'estimated_on_reference_track',isGps:false,
    source:'GTFS-RT + SNCF Réseau RFN',from:segment.fromName,to:segment.toName};
  }
 }
 if(!best)return null;
 delete best.score;
 return best;
}
