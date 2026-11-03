import {Annotation,StateGraph,START,END} from '@langchain/langgraph';
import {prisma,j} from '../lib/db.js';
import {RunBudget,type Usage} from '../discovery/config.js';
import {fetchOfficialPage,type Page} from '../discovery/pages.js';
import {fileSourceType,httpsSourceURL} from '../discovery/source-urls.js';
import {storeCandidate,trustedDomains,type Group} from '../discovery/pipeline.js';
import {failureInfo,failureMessage,primaryFailure,operationalFailure,type FailureInfo} from '../discovery/failures.js';
import {getSearch} from '../discovery/search/index.js';
import {research} from './research.js';
import {extractScout} from './extract.js';
import {qualifyScout,type Qualification} from './qualify.js';
import {PROMPT_VERSION,publicSearchContext,scoutPrompt,type PublicSearchContext} from './prompts.js';
import {scoutSettings} from './settings.js';
import {ScoutFacts} from './schema.js';
import type {LLMUsage} from '../agent/llm/types.js';
import {privateWorkflow,workflowConfig,type WorkflowStep} from '../workflows/privacy.js';

type Stage='research'|'candidate'|'fetch'|'extract'|'qualify'|'finish';
export type ScoutState={stage:Stage;context:PublicSearchContext;groupKeys:string[];candidateId:string|null;inFlight:Stage|null;repairUsed:boolean;maxCandidates:number;query:string;
  calls:{kind:'research'|'extract'|'repair';usage:LLMUsage;durationMs:number}[];startedAt:string};
type Run=Awaited<ReturnType<typeof prisma.discoveryRun.findUniqueOrThrow>>;
export type ScoutDependencies={research:typeof research;fetch:typeof fetchOfficialPage;extract:typeof extractScout;qualify:typeof qualifyScout;save:typeof storeCandidate;provider:NonNullable<ReturnType<typeof getSearch>>};
export function newScoutState(context:PublicSearchContext,groupKeys:string[],maxCandidates=16):ScoutState {
  const safe=publicSearchContext(context);
  return {stage:'research',context:safe,groupKeys,candidateId:null,inFlight:null,repairUsed:false,maxCandidates:Math.max(0,Math.min(16,maxCandidates)),query:scoutPrompt(safe,Math.min(6,maxCandidates)),calls:[],startedAt:new Date().toISOString()};
}
function pagesOf(value:string):Page[] {return j<any[]>(value,[]).map(p=>({...p,checkedAt:new Date(p.checkedAt)}));}
class ScoutBudget extends RunBudget {
  override take(kind:'searches'|'pages'|'embeddings'|'vectorUpserts',count=1) {
    if(kind!=='pages')return super.take(kind,count);
    this.check();if(this.usage.pages+count>scoutSettings().httpAttempts)throw new Error('Run limit reached');
    this.usage.pages+=count;
  }
}
export function restoreScoutBudget(run:Run) {
  const budget=new ScoutBudget(),old=j<any>(run.usage,{});
  if(old&&typeof old==='object') {
    for(const key of Object.keys(budget.usage) as (keyof Usage)[])if(typeof old[key]==='number'&&Number.isFinite(old[key])&&old[key]>=0)budget.usage[key]=old[key];
    budget.workflow.push(...(old.workflow||[]));budget.failures.push(...(old.failures||[]));budget.savedIds=old.savedIds||[];budget.candidates=old.candidates||budget.candidates;
  }
  budget.deadlineAt=Date.now()+scoutSettings().timeoutMs;
  return budget;
}
export const scoutUsage=(budget:RunBudget,state:ScoutState)=>JSON.stringify({...budget.usage,models:budget.models,promptVersion:PROMPT_VERSION,candidates:budget.candidates,phase:budget.phase,savedIds:budget.savedIds,workflow:budget.workflow,failures:budget.failures,calls:state.calls,query:state.query,groupKeys:state.groupKeys,tokensAreEstimates:state.calls.some(c=>c.usage.inputTokens==null||c.usage.outputTokens==null)});

/** Caller holds the shared job lease. One graph node executes per HTTP/cron invocation. */
export async function advanceScout(run:Run,overrides:Partial<ScoutDependencies>={}) {
  if(run.status!=='running')return {done:true,saved:0};
  const state=j<ScoutState|null>(run.state,null);
  if(!state||!state.stage||!state.context)return {done:true,saved:0};
  const budget=restoreScoutBudget(run),provider=overrides.provider||getSearch();
  const deps={research,fetch:fetchOfficialPage,extract:extractScout,qualify:qualifyScout,save:storeCandidate,...overrides};
  let candidate=state.candidateId?await prisma.researchCandidate.findUnique({where:{id:state.candidateId}}):null;
  const persist=()=>prisma.discoveryRun.update({where:{id:run.id},data:{state:JSON.stringify(state),usage:scoutUsage(budget,state),promptVersion:PROMPT_VERSION}});
  const step=(node:string,status:'completed'|'failed',reason?:WorkflowStep['reason'])=>{budget.workflow.push({node,status,...(reason?{reason}:{})});};
  const claim=async(stage:Stage)=>{state.inFlight=stage;await persist();};
  const addCall=async(usage:LLMUsage,kind:'research'|'extract'|'repair',durationMs=0)=>{
    const last=state.calls.at(-1);
    if(last?.kind===kind&&last.usage.inputTokens==null&&last.usage.outputTokens==null&&last.usage.responseId==null)state.calls[state.calls.length-1]={kind,usage,durationMs};
    else state.calls.push({kind,usage,durationMs});
    budget.usage.tokens+=(usage.inputTokens||0)+(usage.outputTokens||0);await persist();
  };
  const callStarted=async(kind:'research'|'extract'|'repair')=>{
    const model=kind==='research'?budget.models.search:budget.models.extraction;
    if(model.provider==='openai'||model.provider==='anthropic'||model.provider==='ollama')await addCall({provider:model.provider,model:model.model||'',inputTokens:null,outputTokens:null,responseId:null},kind);
  };
  // A crash after a paid call may leave no response. Never repeat that paid stage silently.
  if(state.inFlight) {
    if(state.inFlight==='research') {
      const stored=await prisma.researchCandidate.count({where:{runId:run.id}});
      if(stored)state.stage='candidate';else {budget.failures.push({stage:'search',code:'interrupted'});state.stage='finish';}
    } else if(state.inFlight==='extract'&&candidate?.status==='extracted')state.stage='qualify';
    else if(state.inFlight==='extract') {
      if(candidate)await prisma.researchCandidate.update({where:{id:candidate.id},data:{status:'error',reasons:JSON.stringify([{field:'extract',reason:'interrupted'}])}});
      budget.failures.push({stage:'extract',code:'interrupted'});state.stage='candidate';
    }
    state.inFlight=null;
  }
  const execute=async(stage:Stage)=>{
    if(stage==='research') {
      budget.phase='searching';
      if(!provider?.research)throw new Error('Search provider is not configured');
      budget.take('searches');await claim('research');await callStarted('research');const started=Date.now();
      const response=await deps.research({research:provider.research},state.context,Math.min(6,state.maxCandidates),!state.repairUsed,async(u,k)=>{if(k==='repair')state.repairUsed=true;await addCall(u,k,Date.now()-started);},async()=>{state.repairUsed=true;await callStarted('repair');await persist();});
      state.repairUsed||=response.repaired;
      const seen=new Set<string>();
      for(const lead of response.output.candidates) {
        if(seen.has(lead.officialUrl))continue;seen.add(lead.officialUrl);budget.candidates.found++;
        const url=httpsSourceURL(lead.officialUrl),mediaType=url?fileSourceType(url):null;
        const filtered=!url||!!mediaType;
        if(filtered) {budget.candidates.filtered++;budget.failures.push({stage:'fetch',code:url?'unsupported_content':'invalid_url',...(url?{sourceHost:url.hostname}:{}),...(mediaType?{mediaType}:{})});}
        const full=budget.candidates.queued>=state.maxCandidates;
        await prisma.researchCandidate.upsert({where:{runId_url:{runId:run.id,url:lead.officialUrl}},create:{runId:run.id,url:lead.officialUrl,name:lead.name,status:filtered||full?'excluded':'found',reasons:JSON.stringify(filtered?[{field:'source',reason:'unsupported_content'}]:full?[{field:'budget',reason:'candidate_limit'}]:[])},update:{}});
        if(!filtered&&!full)budget.candidates.queued++;
      }
      step('search_candidates','completed');state.stage='candidate';state.inFlight=null;
    } else if(stage==='candidate') {
      candidate=await prisma.researchCandidate.findFirst({where:{runId:run.id,status:{in:['found','fetched','extracted']}},orderBy:{createdAt:'asc'}});
      state.candidateId=candidate?.id||null;
      state.stage=!candidate?'finish':candidate.status==='extracted'?'qualify':candidate.status==='fetched'?'extract':'fetch';
    } else if(stage==='fetch'&&candidate) {
      budget.phase='reading_sources';
      const cached=await prisma.researchCandidate.findFirst({where:{url:candidate.url,id:{not:candidate.id},status:{in:['verified','needs_verification','watchlist']},updatedAt:{gte:new Date(Date.now()-scoutSettings().cacheDays*86400000)}},orderBy:{updatedAt:'desc'},include:{run:true}});
      const currentModels=budget.models.extraction,oldModels=cached?j<any>(cached.run.usage,{}).models?.extraction:null;
      const fresh=cached&&cached.run.promptVersion===PROMPT_VERSION&&oldModels?.model===currentModels.model&&oldModels?.provider===currentModels.provider&&pagesOf(cached.pages).every(p=>Number.isFinite(+p.checkedAt)&&Date.now()-+p.checkedAt<=scoutSettings().cacheDays*86400000);
      if(fresh&&cached&&ScoutFacts.safeParse(j(cached.facts,{})).success&&pagesOf(cached.pages).length) {
        candidate=await prisma.researchCandidate.update({where:{id:candidate.id},data:{pages:cached.pages,facts:cached.facts,status:'extracted'}});state.stage='qualify';
      } else {
        const main=await deps.fetch(candidate.url,budget),pages=[main];
        for(const url of main.links.filter(v=>{const u=httpsSourceURL(v);return u&&u.origin===new URL(main.sourceUrl).origin&&!fileSourceType(u);}).slice(0,2)) {
          try{pages.push(await deps.fetch(url,budget));}catch(error){budget.failures.push(failureInfo(error,'fetch'));}
        }
        candidate=await prisma.researchCandidate.update({where:{id:candidate.id},data:{pages:JSON.stringify(pages),status:'fetched'}});state.stage='extract';
      }
      step('fetch_official_pages','completed');
    } else if(stage==='extract'&&candidate) {
      budget.phase='checking_facts';await claim('extract');await callStarted('extract');
      const started=Date.now(),result=await deps.extract(pagesOf(candidate.pages));
      if(result.usage)await addCall(result.usage,'extract',Date.now()-started);
      else budget.usage.tokens+=Math.ceil(candidate.pages.length/3)+4096;
      candidate=await prisma.researchCandidate.update({where:{id:candidate.id},data:{facts:JSON.stringify(result.facts),status:'extracted'}});
      step('extract_facts','completed');state.inFlight=null;state.stage='qualify';
    } else if(stage==='qualify'&&candidate) {
      budget.phase='checking_facts';
      const pages=pagesOf(candidate.pages),facts=ScoutFacts.parse(j(candidate.facts,{}));
      const result:Qualification=deps.qualify(facts,pages,trustedDomains());
      let opportunityId:string|null=null;
      if(result.data&&result.disposition!=='excluded') {
        const g=await prisma.discoveryGroup.findUniqueOrThrow({where:{key:state.groupKeys[0]}});
        opportunityId=await deps.save({...result.data,promptVersion:PROMPT_VERSION},pages,g as Group);
        for(const key of state.groupKeys.slice(1)) {
          const o=await prisma.opportunity.findUniqueOrThrow({where:{id:opportunityId}});
          await prisma.opportunity.update({where:{id:opportunityId},data:{discoveredFor:JSON.stringify([...new Set([...j<string[]>(o.discoveredFor,[]),key])])}});
        }
        if(result.disposition!=='watchlist'&&!budget.savedIds.includes(opportunityId))budget.savedIds.push(opportunityId);
        step('verify_facts','completed');step('store_catalog','completed');
      } else {
        budget.failures.push({stage:'verify',code:result.reasons.some(r=>r.reason==='past_deadline')?'deadline_passed':'missing_evidence'});
        step('verify_facts','failed','unconfirmed_facts');
      }
      await prisma.researchCandidate.update({where:{id:candidate.id},data:{status:result.disposition,reasons:JSON.stringify(result.reasons),opportunityId}});
      state.candidateId=null;state.stage='candidate';
    } else if(stage==='finish') {
      const failure=!budget.savedIds.length&&budget.failures.some(operationalFailure)?primaryFailure(budget.failures):undefined;
      const status=failure?'failed':'complete',error=failure?failureMessage(failure):'';
      budget.phase=budget.savedIds.length?budget.failures.length?'partial':'complete':failure?'failed':'empty';
      const usage=j<any>(scoutUsage(budget,state),{});usage.estimatedCost=budget.usage.searches*0.03+budget.usage.tokens/1e6*4;
      // status condition prevents a second final usage debit on a later poll.
      await prisma.$transaction(async tx=>{
        const updated=await tx.discoveryRun.updateMany({where:{id:run.id,status:'running'},data:{status,error,finishedAt:new Date(),usage:JSON.stringify(usage),state:JSON.stringify(state)}});
        if(updated.count) {
          const {runs:_,...totals}=budget.usage;totals.estimatedCost=usage.estimatedCost;
          await tx.discoveryUsage.update({where:{month:run.startedAt.toISOString().slice(0,7)},data:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,{increment:value}]))});
          await tx.discoveryGroup.updateMany({where:{key:{in:state.groupKeys}},data:{status:failure?'error':'idle',pendingBuckets:'[]',error}});
        }
      });
    }
  };
  let networkDone=false,finished=false;
  const node=Annotation.Root({done:Annotation<boolean>({reducer:(_a,b)=>b,default:()=>false})});
  const route=()=>finished?END:networkDone&&['research','fetch','extract'].includes(state.stage)?END:state.stage;
  const stages:Stage[]=['research','candidate','fetch','extract','qualify','finish'];
  const executeNode=(stage:Stage)=>async()=>{
    if(['research','fetch','extract'].includes(stage))networkDone=true;
    try{await execute(stage);if(stage==='finish')finished=true;}catch(error) {
      if(stage==='finish')throw error;
      const failureStage=stage==='research'?'search':stage==='extract'?'extract':stage==='fetch'?'fetch':stage==='qualify'?'verify':'store';
      const failure=failureInfo(error,failureStage);budget.failures.push(failure);
      step(stage==='research'?'search_candidates':stage==='fetch'?'fetch_official_pages':stage==='extract'?'extract_facts':stage==='qualify'?'verify_facts':'store_catalog','failed',stage==='fetch'?'source_unavailable':'unconfirmed_facts');
      if(candidate)await prisma.researchCandidate.update({where:{id:candidate.id},data:{status:'error',reasons:JSON.stringify([{field:failure.stage,reason:failure.code}])}});
      state.inFlight=null;state.candidateId=null;state.stage=stage==='research'?'finish':'candidate';
    }
    return {done:finished};
  };
  // Process cheap SQL transitions together, but stop before a second network/model stage.
  const graph=new StateGraph(node)
    .addNode('research',executeNode('research')).addNode('candidate',executeNode('candidate'))
    .addNode('fetch',executeNode('fetch')).addNode('extract',executeNode('extract'))
    .addNode('qualify',executeNode('qualify')).addNode('finish',executeNode('finish'))
    .addConditionalEdges(START,route,[...stages,END])
    .addConditionalEdges('research',route,[...stages,END]).addConditionalEdges('candidate',route,[...stages,END])
    .addConditionalEdges('fetch',route,[...stages,END]).addConditionalEdges('extract',route,[...stages,END])
    .addConditionalEdges('qualify',route,[...stages,END]).addConditionalEdges('finish',route,[...stages,END])
    .compile({name:'pathway_resumable_scout'});
  const result=await privateWorkflow(()=>graph.invoke({},workflowConfig('opportunity-scout-step')));
  if(!result.done)await persist();
  return {done:result.done,saved:budget.savedIds.length};
}
