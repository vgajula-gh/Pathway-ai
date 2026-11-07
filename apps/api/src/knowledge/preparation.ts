import {createHash} from 'node:crypto';
import {prisma} from '../lib/db.js';
import {RunBudget,setting} from '../discovery/config.js';
import {limit} from '../lib/ai-limits.js';
import {initializeKnowledge,KnowledgeRuntime} from './runtime.js';
import {embeddingIdentity,vectorStoreIdentity} from './contracts.js';
import {studentOpportunityIds} from './scope.js';
import {ingestKnowledge} from './service.js';
import {DiscoveryFailure,failureInfo,failureMessage} from '../discovery/failures.js';
import {knowledgeFailure,knowledgeStep} from './failures.js';
import {isProgramSource} from '../domain/program-source.js';
import {fileSourceType} from '../discovery/source-urls.js';
import {HttpError} from '../lib/errors.js';

const leaseMs=5*60000;
export async function preparationAllowance(now=new Date()) {
  const month=now.toISOString().slice(0,7);
  const [usage,ai]=await Promise.all([prisma.discoveryUsage.findUnique({where:{month}}),prisma.aIUsage.findUnique({where:{key:'month:'+month}})]);
  const cap=setting('DISCOVERY_RECHECKS_PER_MONTH',10,10000),aiCap=limit(process.env.AI_MONTHLY_LIMIT,1000);
  const reasons=[...((usage?.rechecks||0)>=cap?['preparation_monthly_limit']:[]),...((ai?.count||0)>=aiCap?['ai_monthly_limit']:[])];
  return {available:!reasons.length,reasons,used:usage?.rechecks||0,limit:cap,aiUsed:ai?.count||0,aiLimit:aiCap,
    resetsAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString()};
}
export async function knowledgeSnapshot(id:string,rt:KnowledgeRuntime) {
  const [rawPages,chunks,program]=await knowledgeStep('database','chunk_read',()=>Promise.all([
    prisma.sourcePage.findMany({where:{opportunityId:id},orderBy:{sourceUrl:'asc'}}),
    prisma.knowledgeChunk.findMany({where:{opportunityId:id}}),
    prisma.opportunity.findUnique({where:{id},select:{id:true,url:true}}),
  ]));
  const pages=rawPages.filter(p=>isProgramSource(p.sourceUrl)&&!fileSourceType(p.sourceUrl)&&!!p.text.trim());
  const model=embeddingIdentity(rt.embedder),store=vectorStoreIdentity(rt.store);
  const ready=pages.length>0&&pages.every(p=>chunks.some(c=>c.sourceUrl===p.sourceUrl&&c.contentHash===p.contentHash&&c.embeddingModel===model&&c.vectorStoreKey===store));
  const hash=createHash('sha256').update(JSON.stringify([id,model,store,pages.map(p=>[p.sourceUrl,p.contentHash]),new Date().toISOString().slice(0,7)])).digest('hex');
  return {pages,chunks,program,ready,key:'knowledge-attempt:'+hash};
}
export type PreparationDetail={state:'ready'|'preparing'|'unavailable';reason:string;message:string;retryable:boolean;resetsAt?:string};
const detail=(state:PreparationDetail['state'],reason:string,message:string,retryable=false,resetsAt?:string):PreparationDetail=>({state,reason,message,retryable,...(resetsAt?{resetsAt}:{})});
export async function knowledgeDetails(ids:string[],runtime?:KnowledgeRuntime|null):Promise<Record<string,PreparationDetail>> {
  const rt=runtime===undefined?await initializeKnowledge():runtime;
  if(!rt)return Object.fromEntries(ids.map(id=>[id,detail('unavailable','setup_unavailable','Program questions are taking a break. Your program links still work.')]));
  let allowance:Awaited<ReturnType<typeof preparationAllowance>>;
  try{allowance=await preparationAllowance();}
  catch{return Object.fromEntries(ids.map(id=>[id,detail('unavailable','storage_unavailable','Program details could not be checked. Your program links still work.')]));}
  return Object.fromEntries(await Promise.all(ids.map(async (id):Promise<[string,PreparationDetail]>=>{
    try{
      const state=await knowledgeSnapshot(id,rt);if(state.ready)return [id,detail('ready','ready','Program details are ready.')];
      if(!state.pages.length&&(!state.program||!isProgramSource(state.program.url)||!!fileSourceType(state.program.url)))
        return [id,detail('unavailable','source_unavailable','A readable program website is needed for questions. Your saved record is still available.')];
      const attempt=await prisma.jobLease.findUnique({where:{key:state.key}});
      if(attempt?.owner==='failed'||attempt?.owner==='complete'||attempt?.owner==='running'&&(+attempt.expiresAt<=Date.now()||attempt.expiresAt.getUTCFullYear()>=2100))
        return [id,detail('unavailable','retry_required','These details could not finish preparing. The owner can retry; your program links still work.',true)];
      if(attempt?.owner==='running')return [id,detail('preparing','running','Preparing program details…')];
      if(!allowance.available)return [id,detail('unavailable',allowance.reasons[0],'Program questions have reached the shared preparation allowance. Your program links still work.',false,allowance.resetsAt)];
      return [id,detail('preparing',attempt?.owner==='running'?'running':'not_prepared','Preparing program details…')];
    }catch{return [id,detail('unavailable','storage_unavailable','Program knowledge storage needs attention. Your program links still work.')];}
  })));
}
export async function knowledgeStates(ids:string[],runtime?:KnowledgeRuntime|null) {
  return Object.fromEntries(Object.entries(await knowledgeDetails(ids,runtime)).map(([id,d])=>[id,d.state]));
}

/** One public program under the caller's opportunity-jobs lease. Unfunded limited
 * attempts may recover. Failed or unknown paid work requires an owner retry. */
export async function prepareKnowledgeBatch(studentId?:string,deadlineAt=Infinity,options:{opportunityId?:string;retry?:boolean}={}) {
  if(Date.now()>=deadlineAt)return 0;
  const rt=await initializeKnowledge();if(!rt)return 0;
  let ids:string[];
  if(options.opportunityId)ids=[options.opportunityId];
  else if(studentId)ids=await studentOpportunityIds(studentId);
  else {
    const [picks,saved]=await Promise.all([prisma.studentPick.findMany({select:{opportunityId:true}}),prisma.savedOpportunity.findMany({where:{status:{not:'dismissed'}},select:{opportunityId:true}})]);
    ids=[...new Set([...picks,...saved].map(p=>p.opportunityId))];
  }
  const counts=await prisma.sourcePage.groupBy({by:['opportunityId'],where:{opportunityId:{in:ids}},_count:true});
  ids.sort((a,b)=>(counts.find(c=>c.opportunityId===b)?._count||0)-(counts.find(c=>c.opportunityId===a)?._count||0));
  for(const id of ids) {
    let state:Awaited<ReturnType<typeof knowledgeSnapshot>>;
    try{state=await knowledgeSnapshot(id,rt);}catch{return 0;}
    let force=false;
    if(state.ready){
      if(!options.retry||!rt.store.fetchIds)continue;
      const ids=state.chunks.filter(c=>state.pages.some(p=>p.sourceUrl===c.sourceUrl&&p.contentHash===c.contentHash)&&c.embeddingModel===embeddingIdentity(rt.embedder)&&c.vectorStoreKey===vectorStoreIdentity(rt.store)).map(c=>c.id);
      let found=0;
      for(let i=0;i<ids.length;i+=100)found+=(await knowledgeStep('vector','vector_fetch',()=>rt.store.fetchIds!(ids.slice(i,i+100)))).length;
      if(found===ids.length)continue;
      force=true;
    }
    const old=await prisma.jobLease.findUnique({where:{key:state.key}}),now=new Date();
    if(old?.owner==='running'&&+old.expiresAt>+now&&old.expiresAt.getUTCFullYear()<2100)continue;
    if(old&&old.owner!=='limited'&&!options.retry)continue;
    if(options.retry){
      const today=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
      if(await prisma.discoveryRun.count({where:{kind:'knowledge',groupKey:'knowledge:'+id,startedAt:{gte:today}}})>=2)
        throw new HttpError(429,'This program has reached its preparation retry limit for today.');
    }
    const o=await prisma.opportunity.findUnique({where:{id}});
    if(!o||!state.pages.length&&(!isProgramSource(o.url)||!!fileSourceType(o.url))){
      if(options.opportunityId)throw new HttpError(422,'A readable program website is needed before details can be prepared.');
      continue;
    }
    const allowance=await preparationAllowance(now);
    if(!allowance.available){
      await prisma.jobLease.upsert({where:{key:state.key},create:{key:state.key,owner:'limited',expiresAt:new Date(+now+60000)},update:{owner:'limited',expiresAt:new Date(+now+60000)}});
      return 0;
    }
    if(!old){
      try{await prisma.jobLease.create({data:{key:state.key,owner:'running',expiresAt:new Date(+now+leaseMs)}});}
      catch(e){if((e as {code?:string}).code==='P2002')continue;throw e;}
    }else{
      const claimed=await prisma.jobLease.updateMany({where:{key:state.key,owner:old.owner,expiresAt:old.expiresAt},data:{owner:'running',expiresAt:new Date(+now+leaseMs)}});
      if(!claimed.count)continue;
    }
    const {reserveRun,recheckOpportunity,finishRun}=await import('../discovery/jobs.js');
    let run:Awaited<ReturnType<typeof reserveRun>>;
    try{run=await reserveRun('knowledge:'+id,'knowledge');}
    catch(e){await prisma.jobLease.update({where:{key:state.key},data:{owner:'failed',expiresAt:new Date()}});throw knowledgeFailure(e,'database','chunk_commit');}
    if(!run){await prisma.jobLease.update({where:{key:state.key},data:{owner:'limited',expiresAt:new Date()}});return 0;}
    const budget=new RunBudget();budget.deadlineAt=Math.min(budget.deadlineAt,deadlineAt);let status='complete',error='';
    budget.onStep=async()=>{await knowledgeStep('database','chunk_commit',()=>prisma.discoveryRun.updateMany({where:{id:run!.id,status:'running'},data:{
      state:JSON.stringify({opportunityId:id,attemptKey:state.key,stage:budget.phase}),
      usage:JSON.stringify({...budget.usage,indexing:budget.indexing,models:budget.models,phase:budget.phase,failures:budget.failures}),
    }}));};
    try {
      // Keep original source check dates: indexing does not re-verify facts.
      if(state.pages.length)await ingestKnowledge(id,budget,rt,{force});
      else await recheckOpportunity(id,budget,{fetch:(await import('../discovery/pages.js')).fetchOfficialPage,extract:(await import('../discovery/extraction.js')).extract,ingest:(id,b)=>ingestKnowledge(id,b,rt)});
      if(!(await knowledgeSnapshot(id,rt)).ready)throw new DiscoveryFailure({stage:'index',code:'program_source_unavailable',component:'source',operation:'source_read'});
    }catch(e){status='failed';const failure=failureInfo(e,'index');if(!budget.failures.some(f=>f.code===failure.code&&f.operation===failure.operation))budget.failures.push(failure);error=failureMessage(failure);}
    await finishRun(run,budget,status,error);
    const final=await knowledgeSnapshot(id,rt).catch(()=>state);
    await prisma.jobLease.upsert({where:{key:final.key},create:{key:final.key,owner:status,expiresAt:new Date()},update:{owner:status,expiresAt:new Date()}});
    await prisma.jobLease.update({where:{key:state.key},data:{owner:status,expiresAt:new Date()}});
    return 1;
  }
  return 0;
}
