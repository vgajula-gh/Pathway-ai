import type {Prisma} from '@prisma/client';
import {j} from '../lib/db.js';
type Db=Pick<Prisma.TransactionClient,'discoveryRun'>;
/** No timer starts a paid retry. Explicit requests may retry an empty/failed
 * group after one hour, with at most three unsuccessful attempts per UTC day. */
export async function researchRetry(db:Db,keys:string[],now=new Date()) {
  const today=now.toISOString().slice(0,10),start=new Date(today+'T00:00:00Z');
  const runs=keys.length?await db.discoveryRun.findMany({where:{kind:'discovery',status:{not:'running'},startedAt:{gte:new Date(+start-3600000)},OR:[{groupKey:{in:keys}},{groupLinks:{some:{groupKey:{in:keys}}}}]},include:{groupLinks:true},orderBy:{startedAt:'desc'},take:100}):[];
  let next=+now;
  for(const key of keys) {
    const failed=runs.filter(r=>(r.groupKey===key||r.groupLinks.some(g=>g.groupKey===key))&&(r.status==='failed'||(Array.isArray(j<any>(r.usage,{}).savedIds)&&j<any>(r.usage,{}).savedIds.length===0)));
    if(failed.filter(r=>r.startedAt.toISOString().slice(0,10)===today).length>=3)next=Math.max(next,+start+86400000);
    else if(failed[0])next=Math.max(next,+(failed[0].finishedAt||failed[0].startedAt)+3600000);
  }
  return {available:next<=+now,nextAvailableAt:next>+now?new Date(next).toISOString():null};
}
