import { prisma,j } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import {monthlySearchAllowance,monthlyLimitMessage} from './monthly-allowance.js';
import { personalPicks } from '../lib/picks.js';
import { interestGroups } from './groups.js';
import { discoveryConfigured,setting } from './config.js';
import {catalogCoverage,publicCatalogCoverage} from './catalog.js';
import { transaction,stateIn,refreshDays } from './refresh.js';
import { failureMessage,FailureInfo,operationalFailure,primaryFailure } from './failures.js';
import {searchDiagnostics} from './diagnostics.js';
import {discoveryPreferences} from '../domain/discovery-preferences.js';
import {dkey,wallNow} from '../domain/time.js';

type Binding={key:string;since:string;cached?:boolean};
const pending=['queued','running'];
const groupPending=['queued','queued_manual','running'];
const snapshot=(value:string)=>j<{phase?:string;savedIds?:string[];failures?:FailureInfo[]}>(value,{});
type EnqueueResult = { requested: boolean; requestId?: string; usedSharedCatalog?: boolean; catalog?: ReturnType<typeof publicCatalogCoverage> };
export async function enqueueSearch(studentId:string,kind:'initial'|'manual'|'monthly',now=new Date(),options:{explicit?:boolean}={}) {
  const explicit=options.explicit||kind==='manual';
  await settleSearchRequests(studentId);
  const result=await transaction<EnqueueResult>(async tx=>{
    const student=await tx.student.update({where:{id:studentId},data:{updatedAt:now}});
    const groups=interestGroups({grade:student.grade,interests:j(student.interests,[]),region:student.region},20);
    if(!groups.length) {
      if(explicit)throw new HttpError(422,'Add an interest before searching for opportunities.');
      await tx.opportunitySearchRequest.updateMany({where:{studentId,status:{in:pending}},data:{status:'cancelled',finishedAt:now}});
      return {requested:false};
    }
    const coverage=await catalogCoverage(studentId,now,tx),catalog=publicCatalogCoverage(coverage);
    const signature=groups.map(g=>g.key).join('||');
    const active=await tx.opportunitySearchRequest.findFirst({where:{studentId,status:{in:pending}},orderBy:{createdAt:'desc'}});
    if(active&&active.signature===signature&&!coverage.complete)return {requested:false,requestId:active.id,catalog};
    if(active)await tx.opportunitySearchRequest.update({where:{id:active.id},data:{status:'cancelled',finishedAt:now}});
    // Library reads are free even when AI is off, the shared cap is reached, or a manual slot is spent.
    if(coverage.complete) {
      const latest=await tx.opportunitySearchRequest.findFirst({where:{studentId},orderBy:{createdAt:'desc'}});
      const old=latest?.status==='cached'&&latest.signature===signature&&+latest.createdAt>=+now-86400000?latest:null;
      const request=old||await tx.opportunitySearchRequest.create({data:{studentId,kind,signature,status:'cached',createdAt:now,finishedAt:now}});
      return {requested:false,requestId:request.id,usedSharedCatalog:true,catalog};
    }
    if(!student.aiConsent) {
      if(explicit)throw new HttpError(403,'Turn on AI help in You → Privacy to search the web.');
      return {requested:false,catalog};
    }
    if(!discoveryConfigured()) {
      if(explicit)throw new HttpError(503,"Opportunity web search isn't available right now. Existing programs are still available.");
      return {requested:false,catalog};
    }
    const monthly=await monthlySearchAllowance(tx,now);
    const previous=await tx.opportunitySearchRequest.findFirst({where:{studentId,signature,createdAt:{gte:new Date(+now-refreshDays()*86400000)}},orderBy:{createdAt:'desc'}});
    const resuming=previous?.status==='limited'&&!monthly.limited;
    if(!explicit) {
      if(kind==='initial') {
        const recent=await tx.opportunitySearchRequest.findFirst({where:{studentId,createdAt:{gte:new Date(+now-refreshDays()*86400000)}},orderBy:{createdAt:'desc'}});
        if(recent&&recent.signature!==signature&&!(recent.status==='limited'&&recent.kind!=='manual'&&!monthly.limited))return {requested:false,catalog};
      }
      if(previous&&!resuming)return {requested:false,catalog};
    }
    // Decide under the student lock; concurrent clicks cannot both claim an initial search.
    const completed=explicit&&kind==='initial'?await tx.opportunitySearchRequest.findFirst({where:{studentId,status:{in:['cached','complete','empty']}},select:{id:true}}):null;
    const requestKind=(resuming&&previous.kind==='manual')||completed?'manual':kind;
    const state=await stateIn(tx,studentId,now);
    let manualSlot:string|null=null;
    if(requestKind==='manual') {
      const max=setting('MANUAL_REFRESHES_PER_MONTH',1,10);
      manualSlot=state.manualUsed<max?'base':state.extraEarned&&!state.extraUsed?'bonus':null;
      if(!manualSlot){
        if(!explicit)return {requested:false,catalog};
        throw new HttpError(429,'Next web search available on '+new Date(+state.cycleStartedAt+refreshDays()*86400000).toISOString().slice(0,10)+'. Shared library results still work.');
      }
    }
    if(monthly.limited) {
      if(requestKind==='manual')throw new HttpError(429,monthlyLimitMessage(monthly));
      await tx.opportunitySearchRequest.create({data:{studentId,kind,signature,status:'limited',createdAt:now,finishedAt:now,error:monthlyLimitMessage(monthly)}});
      return {requested:false,catalog};
    }
    const bindings:Binding[]=[];
    const prefs=discoveryPreferences(student.discoveryPreferences);
    const context={today:dkey(wallNow(student.timezone,now)),gradeBand:student.grade<=10?'9-10':'11-12',interests:groups.map(g=>g.topic),region:student.region||'US',city:prefs.city,state:prefs.state,format:student.format==='virtual'?'online':prefs.format};
    for(const {group,buckets} of coverage.groups) {
      const old=await tx.discoveryGroup.findUnique({where:{key:group.key}});
      if(old&&groupPending.includes(old.status)) {
        // Before a shared run starts, combine only the still-missing buckets requested by its consumers.
        if(old.status!=='running')await tx.discoveryGroup.update({where:{key:group.key},data:{pendingBuckets:JSON.stringify([...new Set([...j<string[]>(old.pendingBuckets,[]),...buckets])])}});
        bindings.push({key:group.key,since:(old.requestedAt||old.lastDiscoveredAt||now).toISOString()});
        continue;
      }
      await tx.discoveryGroup.upsert({where:{key:group.key},create:{...group,context:JSON.stringify(context),status:'queued_manual',pendingBuckets:JSON.stringify(buckets),requestedAt:now},
        update:{context:JSON.stringify(context),status:'queued_manual',pendingBuckets:JSON.stringify(buckets),requestedAt:now,error:''}});
      bindings.push({key:group.key,since:now.toISOString()});
    }
    const request=await tx.opportunitySearchRequest.create({data:{studentId,kind:requestKind,signature,groupBindings:JSON.stringify(bindings),manualSlot,cycleStartedAt:state.cycleStartedAt,createdAt:now}});
    await tx.auditEvent.create({data:{studentId,actor:'student',event:requestKind==='manual'?'Requested opportunity search':'Started opportunity discovery',record:request.id}});
    return {requested:true,requestId:request.id,catalog};
  });
  if(result.requested||result.usedSharedCatalog) {
    const picks=await personalPicks(studentId,!!result.usedSharedCatalog);
    if(result.usedSharedCatalog&&result.requestId)await prisma.opportunitySearchRequest.updateMany({where:{id:result.requestId,studentId,status:'cached'},data:{resultIds:JSON.stringify(picks.map(p=>p.id)),finishedAt:now}});
  }
  return result;
}

export async function boundRuns(bindings:Binding[]) {
  return Promise.all(bindings.map(binding=>binding.cached?null:prisma.discoveryRun.findFirst({where:{OR:[{groupKey:binding.key},{groupLinks:{some:{groupKey:binding.key}}}],kind:'discovery',startedAt:{gte:new Date(binding.since)}},orderBy:{startedAt:'asc'}})));
}

/** Another student's run may have filled this gap since it was queued. Check before spending. */
export async function neededGroupBuckets(key:string,keepRunning=false) {
  const requests=await prisma.opportunitySearchRequest.findMany({where:{status:{in:pending}}});
  const buckets=new Set<'free'|'paid'>();
  for(const request of requests) {
    const bindings=j<Binding[]>(request.groupBindings,[]);
    const binding=bindings.find(b=>b.key===key&&!b.cached);
    if(!binding)continue;
    const student=await prisma.student.findUnique({where:{id:request.studentId}});
    const signature=student?interestGroups({grade:student.grade,interests:j(student.interests,[]),region:student.region},20).map(g=>g.key).join('||'):null;
    if(!student?.aiConsent||signature!==request.signature) {
      await prisma.opportunitySearchRequest.updateMany({where:{id:request.id,status:{in:pending}},data:{status:'cancelled',finishedAt:new Date()}});
      continue;
    }
    if(keepRunning){buckets.add('free');continue;}
    const coverage=await catalogCoverage(request.studentId);
    const needed=coverage.groups.find(g=>g.group.key===key);
    if(needed)needed.buckets.forEach(b=>buckets.add(b));
    else {
      binding.cached=true;
      await prisma.opportunitySearchRequest.updateMany({where:{id:request.id,status:{in:pending}},data:{groupBindings:JSON.stringify(bindings)}});
    }
  }
  return [...buckets];
}
export async function settleSearchRequests(studentId?:string) {
  const requests=await prisma.opportunitySearchRequest.findMany({where:{...(studentId?{studentId}:{}),status:{in:pending}},orderBy:{createdAt:'asc'},take:100});
  for(const request of requests) {
    const bindings=j<Binding[]>(request.groupBindings,[]).filter(b=>!b.cached),runs=await boundRuns(bindings);
    const groups=await prisma.discoveryGroup.findMany({where:{key:{in:bindings.map(b=>b.key)}}});
    if(runs.some(r=>r?.status==='running')||runs.some((r,i)=>!r&&groups.some(g=>g.key===bindings[i].key&&groupPending.includes(g.status))))continue;
    const complete=[...new Map(runs.filter((r):r is NonNullable<typeof r>=>!!r).map(r=>[r.id,r])).values()];
    let ids=[...new Set(complete.flatMap(r=>snapshot(r.usage).savedIds||[]))];
    const failures=complete.flatMap(r=>snapshot(r.usage).failures||[]);
    const failed=runs.some(r=>!r)||complete.some(r=>r.status!=='complete')||!ids.length&&failures.some(operationalFailure);
    const limited=groups.some(g=>['limited','limited_manual'].includes(g.status));
    let status=!bindings.length?'cached':ids.length?'complete':limited?'limited':failed?'failed':'empty';
    if(['cached','complete','empty'].includes(status))try{ids=(await personalPicks(request.studentId,true)).map(p=>p.id);}catch{status='failed';}
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
      const failure=primaryFailure(failures);
      const error=failure?failureMessage(failure):failed?'The search could not finish. Please try again.':'';
      await tx.opportunitySearchRequest.update({where:{id:request.id},data:{status,resultIds:JSON.stringify(ids),finishedAt:new Date(),countedAt:successful&&current.manualSlot?new Date():null,error}});
    });
  }
}

export async function searchState(studentId:string) {
  await settleSearchRequests(studentId);
  const [request,monthlyAllowance]=await Promise.all([
    prisma.opportunitySearchRequest.findFirst({where:{studentId},orderBy:{createdAt:'desc'}}),
    monthlySearchAllowance(prisma),
  ]);
  if(!request)return {finding:false,limited:monthlyAllowance.limited,monthlyAllowance,diagnostics:searchDiagnostics([]).diagnostics,error:null,resultIds:[] as string[],search:{phase:monthlyAllowance.limited?'limited':'idle',found:0,detail:monthlyAllowance.limited?monthlyLimitMessage(monthlyAllowance):null,startedAt:null,finishedAt:null}};
  const bindings=j<Binding[]>(request.groupBindings,[]),runs=await boundRuns(bindings);
  const running=runs.find(r=>r?.status==='running'),value=running?snapshot(running.usage):null;
  const {diagnostics,failures}=searchDiagnostics(runs.filter((r):r is NonNullable<typeof r>=>!!r));
  const allowed=['searching','reading_sources','checking_facts','indexing'];
  const finding=pending.includes(request.status),limited=!finding&&monthlyAllowance.limited;
  const partial=request.status==='complete'&&runs.some(r=>r&&snapshot(r.usage).phase==='partial');
  const phase=finding?running&&allowed.includes(value?.phase||'')?value!.phase!:'queued':limited?'limited':request.status==='limited'?'idle':partial?'partial':request.status;
  const ids=j<string[]>(request.resultIds,[]);
  const primary=primaryFailure(failures),error=request.status==='failed'?(primary?failureMessage(primary):request.error):null;
  const detail=limited?monthlyLimitMessage(monthlyAllowance):request.status==='limited'?'Search allowance is available again.':partial?'Search results are available. Some program details could not be confirmed.':error||request.error||null;
  return {finding,limited,monthlyAllowance,diagnostics,error,resultIds:ids,
    search:{phase,found:ids.length,detail,startedAt:request.createdAt.toISOString(),finishedAt:request.finishedAt?.toISOString()||null}};
}
