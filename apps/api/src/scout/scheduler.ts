import {prisma,j} from '../lib/db.js';
import {neededGroupBuckets,boundRuns,settleSearchRequests} from '../discovery/requests.js';
import {advanceScout,newScoutState,scoutUsage,restoreScoutBudget,type ScoutState} from './runner.js';
import {PROMPT_VERSION,type PublicSearchContext} from './prompts.js';
import {scoutSettings} from './settings.js';
import {researchRetry} from '../discovery/retries.js';

/** A live request authorizes public research. Group coalescing never copies private profiles. */
export async function advanceOrStartScout(groupKeys?:string[]) {
  const running=await prisma.discoveryRun.findFirst({where:{kind:'discovery',status:'running',promptVersion:PROMPT_VERSION,
    ...(groupKeys?{OR:[{groupKey:{in:groupKeys}},{groupLinks:{some:{groupKey:{in:groupKeys}}}}]}:{})},orderBy:{startedAt:'asc'}});
  if(running) {
    const state=j<ScoutState>(running.state,{} as ScoutState);
    const needed=await Promise.all((state.groupKeys||[]).map(k=>neededGroupBuckets(k,true)));
    if(!needed.some(b=>b.length)&&!state.diagnostic) {
      state.stopRequested=true;
      await prisma.discoveryRun.update({where:{id:running.id},data:{state:JSON.stringify(state)}});
      return (await advanceScout({...running,state:JSON.stringify(state)})).saved;
    }
    return (await advanceScout(running)).saved;
  }
  const queued=await prisma.discoveryGroup.findMany({where:{...(groupKeys?{key:{in:groupKeys}}:{}),OR:[{status:'queued_manual'},
    {status:{in:['queued','limited']},OR:[{lastDiscoveredAt:null},{lastDiscoveredAt:{lte:new Date(Date.now()-scoutSettings().cacheDays*86400000)}}]}]},orderBy:{requestedAt:'asc'},take:20});
  for(const primary of queued) {
    const firstBuckets=await neededGroupBuckets(primary.key);
    if(!firstBuckets.length){await prisma.discoveryGroup.update({where:{key:primary.key},data:{status:'idle',pendingBuckets:'[]',error:''}});continue;}
    const retry=await researchRetry(prisma,[primary.key]);
    if(!retry.available){await prisma.discoveryGroup.update({where:{key:primary.key},data:{status:'error',pendingBuckets:'[]',error:'Search can retry after '+retry.nextAvailableAt}});continue;}
    const requests=(await prisma.opportunitySearchRequest.findMany({where:{status:{in:['queued','running']}},orderBy:{createdAt:'asc'}}))
      .filter(r=>j<{key:string;cached?:boolean}[]>(r.groupBindings,[]).some(b=>b.key===primary.key&&!b.cached));
    let intent:typeof requests[number]|undefined,used:any[]=[],remaining=0;
    for(const request of requests) {
      const runs=(await boundRuns(j(request.groupBindings,[]))).filter((r):r is NonNullable<typeof r>=>!!r);
      const unique=[...new Map(runs.map(r=>[r.id,r])).values()];
      const count=unique.reduce((n,r)=>n+(j<any>(r.usage,{}).candidates?.queued||0),0);
      if(unique.length<scoutSettings().researchCalls&&count<scoutSettings().freeCandidates+scoutSettings().paidCandidates){intent=request;used=unique;remaining=Math.min(16,scoutSettings().freeCandidates+scoutSettings().paidCandidates)-count;break;}
    }
    if(!intent||remaining<=0) {
      await prisma.discoveryGroup.update({where:{key:primary.key},data:{status:'error',error:'This search reached its processing limit. Completed results were kept.',pendingBuckets:'[]'}});continue;
    }
    const intentKeys=j<{key:string;cached?:boolean}[]>(intent.groupBindings,[]).filter(b=>!b.cached).map(b=>b.key);
    const context=j<Partial<PublicSearchContext>>(primary.context,{}),groups=[primary],buckets=new Set(firstBuckets);
    for(const other of queued) {
      if(groups.length>=(scoutSettings().researchCalls<=2?3:2))break;
      if(other.key===primary.key||!intentKeys.includes(other.key)||other.gradeBand!==primary.gradeBand||other.region!==primary.region)continue;
      const otherContext=j<Partial<PublicSearchContext>>(other.context,{});
      if((context.city||'')!==(otherContext.city||'')||(context.format||'both')!==(otherContext.format||'both'))continue;
      const needs=await neededGroupBuckets(other.key);if(!needs.length)continue;
      if(!(await researchRetry(prisma,[other.key])).available)continue;
      groups.push(other);needs.forEach(b=>buckets.add(b));
    }
    const {reserveRun}=await import('../discovery/jobs.js');
    const run=await reserveRun(primary.key,'discovery');
    if(!run) {
      await prisma.discoveryGroup.updateMany({where:{key:{in:groups.map(g=>g.key)}},data:{status:'limited',error:'Live search has reached its monthly allowance. Existing results are still available.'}});
      return 0;
    }
    const input:PublicSearchContext={today:new Date().toISOString().slice(0,10),gradeBand:primary.gradeBand,region:primary.region,
      interests:context.interests||groups.map(g=>g.topic),focusInterests:groups.map(g=>g.topic),city:context.city,state:context.state,format:context.format,buckets:[...buckets],excludeUrls:used.flatMap(r=>j<Partial<ScoutState>>(r.state,{}).researchOutput?.candidates.map(c=>c.officialUrl)||[]).slice(0,32)};
    const pendingGroups=queued.filter(g=>intentKeys.includes(g.key)).length;
    const batchesLeft=Math.max(1,Math.min(scoutSettings().researchCalls-used.length,Math.ceil(pendingGroups/2)));
    const state=newScoutState(input,groups.map(g=>g.key),Math.ceil(remaining/batchesLeft));
    const consumed=used.reduce((n,r)=>{const hints=j<Partial<ScoutState>>(r.state,{}).queuedCostHints;return {free:n.free+(hints?.free||0),paid:n.paid+(hints?.paid||0)};},{free:0,paid:0});
    state.candidateAllowance={free:Math.max(0,scoutSettings().freeCandidates-consumed.free),paid:Math.max(0,scoutSettings().paidCandidates-consumed.paid)};
    state.repairUsed=used.some(r=>j<any>(r.state,{}).repairUsed===true);
    const budget=restoreScoutBudget(run);
    const started=await prisma.discoveryRun.update({where:{id:run.id},data:{state:JSON.stringify(state),promptVersion:PROMPT_VERSION,
      groupLinks:{create:groups.map(g=>({groupKey:g.key}))},usage:scoutUsage(budget,state)}});
    await prisma.discoveryGroup.updateMany({where:{key:{in:groups.map(g=>g.key)}},data:{status:'running',lastDiscoveredAt:new Date(),error:''}});
    return (await advanceScout(started)).saved;
  }
  await settleSearchRequests();return 0;
}
