import { prisma,j } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { limit } from '../lib/ai-limits.js';
import { personalPicks } from '../lib/picks.js';
import { interestGroups } from './groups.js';
import { discoveryConfigured,setting } from './config.js';
import { transaction,stateIn,refreshDays,shortBuckets } from './refresh.js';
import { failureMessage,FailureInfo } from './failures.js';

type Binding={key:string;since:string};
const pending=['queued','running'];
const groupPending=['queued','queued_manual','running'];
const snapshot=(value:string)=>j<{phase?:string;savedIds?:string[];failures?:FailureInfo[]}>(value,{});
export async function enqueueSearch(studentId:string,kind:'initial'|'manual'|'monthly',now=new Date()) {
  if(!discoveryConfigured()) {
    if(kind==='manual')throw new HttpError(503,"Opportunity search isn't available right now.");
    return {requested:false};
  }
  await settleSearchRequests(studentId);
  const short=await shortBuckets(studentId),cached=kind!=='manual'&&!short.length;
  const cachedPicks=cached?await personalPicks(studentId):[];
  return transaction(async tx=>{
    const student=await tx.student.update({where:{id:studentId},data:{updatedAt:now}});
    if(!student.aiConsent) {
      if(kind==='manual')throw new HttpError(403,'Turn on AI help in You → Privacy to search.');
      return {requested:false};
    }
    const groups=interestGroups({grade:student.grade,interests:j(student.interests,[]),region:student.region});
    if(!groups.length) {
      await tx.opportunitySearchRequest.updateMany({where:{studentId,status:{in:pending}},data:{status:'cancelled',finishedAt:now}});
      if(kind==='manual')throw new HttpError(422,'Add an interest before searching for opportunities.');
      return {requested:false};
    }
    const signature=groups.map(g=>g.key).join('||');
    const active=await tx.opportunitySearchRequest.findFirst({where:{studentId,status:{in:pending}},orderBy:{createdAt:'desc'}});
    if(active&&active.signature===signature)return {requested:false,requestId:active.id};
    if(active)await tx.opportunitySearchRequest.update({where:{id:active.id},data:{status:'cancelled',finishedAt:now}});
    if(kind==='initial'&&!cached) {
      const recent=await tx.opportunitySearchRequest.findFirst({where:{studentId,createdAt:{gte:new Date(+now-refreshDays()*86400000)}},orderBy:{createdAt:'desc'}});
      if(recent&&recent.signature!==signature&&!(recent.status==='limited'&&recent.createdAt.toISOString().slice(0,7)!==now.toISOString().slice(0,7)))return {requested:false};
    }
    const previous=kind!=='manual'?await tx.opportunitySearchRequest.findFirst({where:{studentId,signature,createdAt:{gte:new Date(+now-refreshDays()*86400000)}},orderBy:{createdAt:'desc'}}):null;
    if(previous&&!(previous.status==='limited'&&previous.createdAt.toISOString().slice(0,7)!==now.toISOString().slice(0,7)))return {requested:false};
    const state=await stateIn(tx,studentId,now);
    if(cached) {
      const existing=await tx.opportunitySearchRequest.findFirst({where:{studentId,signature,status:'cached',createdAt:{gte:new Date(+now-86400000)}}});
      if(existing)return {requested:false,requestId:existing.id};
      const request=await tx.opportunitySearchRequest.create({data:{studentId,kind,signature,status:'cached',resultIds:JSON.stringify(cachedPicks.map(p=>p.id)),createdAt:now,finishedAt:now}});
      return {requested:false,requestId:request.id,usedSharedCatalog:true};
    }
    let manualSlot:string|null=null;
    if(kind==='manual') {
      const max=setting('MANUAL_REFRESHES_PER_MONTH',1,10);
      manualSlot=state.manualUsed<max?'base':state.extraEarned&&!state.extraUsed?'bonus':null;
      if(!manualSlot)throw new HttpError(429,'Next search available on '+new Date(+state.cycleStartedAt+refreshDays()*86400000).toISOString().slice(0,10)+'.');
    }
    const month=now.toISOString().slice(0,7),usage=await tx.discoveryUsage.findUnique({where:{month}}),overall=await tx.aIUsage.findUnique({where:{key:'month:'+month}});
    const limited=(usage?.runs||0)>=setting('DISCOVERY_MONTHLY_BUDGET',10,10000)||(overall?.count||0)>=limit(process.env.AI_MONTHLY_LIMIT,1000);
    if(limited) {
      if(kind==='manual')throw new HttpError(429,"Opportunity search isn't available right now. The shared monthly allowance has been reached.");
      await tx.opportunitySearchRequest.create({data:{studentId,kind,signature,status:'limited',createdAt:now,finishedAt:now,error:'The shared monthly search allowance has been reached.'}});
      return {requested:false};
    }
    const bindings:Binding[]=[];
    for(const group of groups) {
      const old=await tx.discoveryGroup.findUnique({where:{key:group.key}});
      if(old&&groupPending.includes(old.status)) {
        bindings.push({key:group.key,since:(old.requestedAt||old.lastDiscoveredAt||now).toISOString()});
        continue;
      }
      await tx.discoveryGroup.upsert({where:{key:group.key},create:{...group,status:'queued_manual',pendingBuckets:JSON.stringify(short.length?short:['free','paid']),requestedAt:now},
        update:{status:'queued_manual',pendingBuckets:JSON.stringify(short.length?short:['free','paid']),requestedAt:now,error:''}});
      bindings.push({key:group.key,since:now.toISOString()});
    }
    const request=await tx.opportunitySearchRequest.create({data:{studentId,kind,signature,groupBindings:JSON.stringify(bindings),manualSlot,cycleStartedAt:state.cycleStartedAt,createdAt:now}});
    await tx.auditEvent.create({data:{studentId,actor:'student',event:kind==='manual'?'Requested opportunity search':'Started opportunity discovery',record:request.id}});
    return {requested:true,requestId:request.id};
  });
}

async function boundRuns(bindings:Binding[]) {
  return Promise.all(bindings.map(binding=>prisma.discoveryRun.findFirst({where:{groupKey:binding.key,kind:'discovery',startedAt:{gte:new Date(binding.since)}},orderBy:{startedAt:'asc'}})));
}
export async function settleSearchRequests(studentId?:string) {
  const requests=await prisma.opportunitySearchRequest.findMany({where:{...(studentId?{studentId}:{}),status:{in:pending}},orderBy:{createdAt:'asc'},take:100});
  for(const request of requests) {
    const bindings=j<Binding[]>(request.groupBindings,[]),runs=await boundRuns(bindings);
    const groups=await prisma.discoveryGroup.findMany({where:{key:{in:bindings.map(b=>b.key)}}});
    if(runs.some(r=>r?.status==='running')||runs.some((r,i)=>!r&&groups.some(g=>g.key===bindings[i].key&&groupPending.includes(g.status))))continue;
    const complete=runs.filter((r):r is NonNullable<typeof r>=>!!r);
    const ids=[...new Set(complete.flatMap(r=>snapshot(r.usage).savedIds||[]))];
    const failures=complete.flatMap(r=>snapshot(r.usage).failures||[]);
    const failed=complete.length<bindings.length||complete.some(r=>r.status!=='complete')||!ids.length&&failures.some(f=>!['deadline_passed','missing_evidence'].includes(f.code));
    const limited=groups.some(g=>['limited','limited_manual'].includes(g.status));
    let status=ids.length?'complete':limited?'limited':failed?'failed':'empty';
    if(status==='complete'||status==='empty')try{await personalPicks(request.studentId,true);}catch{status='failed';}
    await transaction(async tx=>{
      const owner=await tx.student.findUnique({where:{id:request.studentId}});
      if(!owner)return;
      await tx.student.update({where:{id:owner.id},data:{updatedAt:new Date()}});
      const current=await tx.opportunitySearchRequest.findUnique({where:{id:request.id}});
      if(!current||!pending.includes(current.status))return;
      const successful=status==='complete'||status==='empty';
      if(successful&&current.manualSlot&&!current.countedAt) {
        const state=await stateIn(tx,request.studentId,new Date());
        if(current.cycleStartedAt&&+state.cycleStartedAt===+current.cycleStartedAt)
          await tx.pickRefreshState.update({where:{studentId:request.studentId},data:current.manualSlot==='bonus'?{extraUsed:true}:{manualUsed:{increment:1}}});
      }
      const error=failures.length?failureMessage(failures[0]):failed?'The search could not finish. Please try again.':'';
      await tx.opportunitySearchRequest.update({where:{id:request.id},data:{status,resultIds:JSON.stringify(ids),finishedAt:new Date(),countedAt:successful&&current.manualSlot?new Date():null,error}});
    });
  }
}

export async function searchState(studentId:string) {
  await settleSearchRequests(studentId);
  const request=await prisma.opportunitySearchRequest.findFirst({where:{studentId},orderBy:{createdAt:'desc'}});
  if(!request)return {finding:false,limited:false,error:null,resultIds:[] as string[],search:{phase:'idle',found:0,detail:null,startedAt:null,finishedAt:null}};
  const bindings=j<Binding[]>(request.groupBindings,[]),runs=await boundRuns(bindings);
  const running=runs.find(r=>r?.status==='running'),value=running?snapshot(running.usage):null;
  const allowed=['searching','reading_sources','checking_facts','indexing'];
  const phase=pending.includes(request.status)?running&&allowed.includes(value?.phase||'')?value!.phase!:'queued':request.status;
  const ids=j<string[]>(request.resultIds,[]);
  return {finding:pending.includes(request.status),limited:request.status==='limited',error:request.status==='failed'?request.error:null,resultIds:ids,
    search:{phase,found:ids.length,detail:request.error||null,startedAt:request.createdAt.toISOString(),finishedAt:request.finishedAt?.toISOString()||null}};
}
