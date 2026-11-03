import {createHash} from 'node:crypto';
import {prisma} from '../lib/db.js';
import {RunBudget} from '../discovery/config.js';
import {initializeKnowledge,KnowledgeRuntime} from './runtime.js';
import {embeddingIdentity,vectorStoreIdentity} from './contracts.js';
import {studentOpportunityIds} from './scope.js';
import {ingestKnowledge} from './service.js';
import {failureInfo,failureMessage} from '../discovery/failures.js';
async function snapshot(id:string,rt:KnowledgeRuntime) {
  const [pages,chunks]=await Promise.all([prisma.sourcePage.findMany({where:{opportunityId:id},orderBy:{sourceUrl:'asc'}}),prisma.knowledgeChunk.findMany({where:{opportunityId:id}})]);
  const model=embeddingIdentity(rt.embedder),store=vectorStoreIdentity(rt.store);
  const ready=pages.length>0&&pages.every(p=>chunks.some(c=>c.sourceUrl===p.sourceUrl&&c.contentHash===p.contentHash&&c.embeddingModel===model&&c.vectorStoreKey===store));
  const hash=createHash('sha256').update(JSON.stringify([id,model,store,pages.map(p=>[p.sourceUrl,p.contentHash]),new Date().toISOString().slice(0,7)])).digest('hex');
  return {pages,ready,key:'knowledge-attempt:'+hash};
}
export async function knowledgeStates(ids:string[],runtime?:KnowledgeRuntime|null) {
  const rt=runtime===undefined?await initializeKnowledge():runtime;
  return Object.fromEntries(await Promise.all(ids.map(async id=>{
    if(!rt)return [id,'unavailable'];const state=await snapshot(id,rt);if(state.ready)return [id,'ready'];
    const attempt=await prisma.jobLease.findUnique({where:{key:state.key}});
    return [id,attempt&&['failed','limited'].includes(attempt.owner)?'unavailable':'preparing'];
  })));
}
/** One bounded public-program preparation per invocation, shared across students.
 * A marker survives failures so a page visit never silently replays paid work.
 */
export async function prepareKnowledgeBatch(studentId?:string,deadlineAt=Infinity) {
  if(Date.now()>=deadlineAt)return 0;
  const rt=await initializeKnowledge();if(!rt)return 0;
  let ids:string[];
  if(studentId)ids=await studentOpportunityIds(studentId);
  else {
    const [picks,saved]=await Promise.all([prisma.studentPick.findMany({select:{opportunityId:true}}),prisma.savedOpportunity.findMany({where:{status:{not:'dismissed'}},select:{opportunityId:true}})]);
    ids=[...new Set([...picks,...saved].map(p=>p.opportunityId))];
  }
  for(const id of ids) {
    const state=await snapshot(id,rt);if(state.ready||await prisma.jobLease.findUnique({where:{key:state.key}}))continue;
    if(Date.now()>=deadlineAt)return 0;
    await prisma.jobLease.create({data:{key:state.key,owner:'running',expiresAt:new Date('2100-01-01')}});
    const {reserveRun,recheckOpportunity,finishRun}=await import('../discovery/jobs.js');
    const run=await reserveRun('knowledge:'+id,'knowledge');
    if(!run){await prisma.jobLease.update({where:{key:state.key},data:{owner:'limited'}});return 0;}
    const budget=new RunBudget();budget.deadlineAt=Math.min(budget.deadlineAt,deadlineAt);let status='complete',error='';
    try {
      const o=await prisma.opportunity.findUnique({where:{id}});
      if(!o)throw new Error('Program no longer exists');
      const read=o.sourceReadAt||o.sourceCheckedAt;
      if(!state.pages.length||!read||Date.now()-+read>30*86400000)
        await recheckOpportunity(id,budget,{fetch:(await import('../discovery/pages.js')).fetchOfficialPage,extract:(await import('../discovery/extraction.js')).extract,ingest:(id,b)=>ingestKnowledge(id,b,rt)});
      else await ingestKnowledge(id,budget,rt);
      if(!(await snapshot(id,rt)).ready)throw new Error('Details could not be prepared');
    }catch(e){status='failed';const failure=failureInfo(e,'index');budget.failures.push(failure);error=failureMessage(failure);}
    await finishRun(run,budget,status,error);
    // Source reads may have changed the hash. Mark that generation too, including failures.
    const final=await snapshot(id,rt);
    await prisma.jobLease.upsert({where:{key:final.key},create:{key:final.key,owner:status,expiresAt:new Date('2100-01-01')},update:{owner:status}});
    await prisma.jobLease.update({where:{key:state.key},data:{owner:status}});
    return 1;
  }
  return 0;
}
