import zipcodes from 'zipcodes';

// Public US postal centroids, median by city to resist outlier/post-office coordinates.
// Never a student's address or device location.
const cache=new Map<string,{lat:number;lon:number}|null>();
function centroid(city:string,state:string) {
  const key=city.trim().toLowerCase()+'|'+state.toUpperCase();
  if(cache.has(key))return cache.get(key)!;
  const places=zipcodes.lookupByName(city.trim(),state.toUpperCase()).filter(p=>p.country==='US'&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
  const median=(values:number[])=>{values.sort((a,b)=>a-b);const middle=Math.floor(values.length/2);return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;};
  const value=places.length?{lat:median(places.map(p=>p.latitude)),lon:median(places.map(p=>p.longitude))}:null;
  if(cache.size>1000)cache.clear();cache.set(key,value);return value;
}
export function cityDistanceMiles(a:{city?:string|null;state?:string|null},b:{city?:string|null;state?:string|null}) {
  if(!a.city||!a.state||!b.city||!b.state)return null;
  const x=centroid(a.city,a.state),y=centroid(b.city,b.state);if(!x||!y)return null;
  const rad=(n:number)=>n*Math.PI/180;
  const h=Math.sin(rad(y.lat-x.lat)/2)**2+Math.cos(rad(x.lat))*Math.cos(rad(y.lat))*Math.sin(rad(y.lon-x.lon)/2)**2;
  return Math.round(3958.8*2*Math.asin(Math.min(1,Math.sqrt(h))));
}
