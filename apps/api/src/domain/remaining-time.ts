import {addDays,minOf,sod} from './time.js';
import {expand} from './schedule.js';
import type {AvailabilityRules,CalEvent} from './types.js';

type Interval=[number,number];
/** Today's portions of a local clock window. Equal endpoints mean no window;
 * an overnight window contributes its morning and evening portions today. */
function windows(start:string,end:string,day:Date):Interval[] {
  const from=sod(day),to=addDays(from,1),s=minOf(start),e=minOf(end);
  const at=(minute:number)=>+new Date(from.getFullYear(),from.getMonth(),from.getDate(),0,minute);
  if(s===e)return [];
  return (s<e?[[at(s),at(e)]]:[[+from,at(e)],[at(s),+to]] as Interval[])
    .map(([a,b])=>[Math.max(+from,a),Math.min(+to,b)] as Interval).filter(([a,b])=>b>a);
}
function openDuration(from:number,to:number,blocked:Interval[]) {
  if(to<=from)return 0;
  const busy=blocked.map(([s,e])=>[Math.max(from,s),Math.min(to,e)] as Interval)
    .filter(([s,e])=>e>s).sort((a,b)=>a[0]-b[0]);
  let cursor=from,free=0;
  for(const [s,e] of busy){free+=Math.max(0,s-cursor);cursor=Math.max(cursor,e);}
  return free+Math.max(0,to-cursor);
}
const minutes=(ms:number)=>Math.max(0,Math.floor(ms/60000));

/** Read-only Today display quantities. Keep full-day planning capacity intact.
 * The caller supplies the student's local wall-clock time, not server UTC. */
export function remainingTime(events:CalEvent[],rules:AvailabilityRules,now:Date) {
  const day=sod(now),end=addDays(day,1),rest=windows(rules.downtimeStart,rules.downtimeEnd,day);
  // Include the preceding recurrence in case it continues across midnight.
  const busy:Interval[]=expand(events,addDays(day,-1),end).filter(o=>o.e>o.s).map(o=>[+o.s,+o.e]);
  const future=(ranges:Interval[])=>ranges.map(([s,e])=>[Math.max(s,+now),e] as Interval).filter(([s,e])=>e>s);
  const study=future(windows(rules.studyStart,rules.studyEnd,day)),downtime=future(rest);
  const windowRemaining=minutes(study.reduce((sum,[s,e])=>sum+e-s,0));
  const inWindow=minutes(study.reduce((sum,[s,e])=>sum+openDuration(s,e,[...busy,...rest]),0));
  const downtimeRemaining=minutes(downtime.reduce((sum,[s,e])=>sum+e-s,0));
  const downtimeFree=minutes(downtime.reduce((sum,[s,e])=>sum+openDuration(s,e,busy),0));
  return {inWindow,windowRemaining,downtime:downtimeFree,downtimeRemaining,downtimeBusy:downtimeRemaining-downtimeFree};
}
