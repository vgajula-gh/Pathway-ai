import {prisma,j} from '../lib/db.js';
import {env} from '../lib/env.js';
import {discoveryModels,setting,safeModelId} from '../discovery/config.js';
import {searchConfigurationIssue,knowledgeConfigurationIssue} from '../knowledge/readiness.js';
import {monthlySearchAllowance} from '../discovery/monthly-allowance.js';
import {limit} from '../lib/ai-limits.js';
import {scoutSettings} from './settings.js';
import {scoutWeights} from '../domain/scout-scoring.js';
import {PROMPT_VERSION} from './prompts.js';
import type {ScoutState} from './runner.js';
import {scoutPricing,discoveryReservationUsd} from './costs.js';
import {discoverySpend} from '../discovery/spend.js';
import {preparationAllowance} from '../knowledge/preparation.js';
const present=(key:string)=>!!process.env[key]?.trim();
export function scoutConfiguration() {
  const knowledgeRequiresIndexCheck=!process.env.DATABASE_URL?.startsWith('file:')&&process.env.VECTOR_STORE==='pinecone';
  const searchIssue=searchConfigurationIssue(process.env,env.aiDisabled),knowledgeIssue=knowledgeConfigurationIssue(process.env,env.aiDisabled,{checkEmbedding:!knowledgeRequiresIndexCheck});
  return {promptVersion:PROMPT_VERSION,models:discoveryModels(),searchIssue,knowledgeIssue,knowledgeRequiresIndexCheck,
    settings:scoutSettings(),pricing:{...scoutPricing(),reservationUsd:discoveryReservationUsd(),costIsEstimate:true},weights:scoutWeights(),
    secretPresence:Object.fromEntries(['DATABASE_URL','JOBS_SECRET','OPENAI_API_KEY','ANTHROPIC_API_KEY','PINECONE_API_KEY','PINECONE_INDEX','VOYAGE_API_KEY'].map(k=>[k,present(k)])),
    database:process.env.DATABASE_URL?.startsWith('file:')?'sqlite':present('DATABASE_URL')?'postgresql':'unset',
    vectorStore:process.env.DATABASE_URL?.startsWith('file:')?'memory':process.env.VECTOR_STORE||'memory',namespace:'opportunities',
    limits:{discovery:setting('DISCOVERY_MONTHLY_BUDGET',10,10000),rechecks:setting('DISCOVERY_RECHECKS_PER_MONTH',10,10000),aiMonthly:limit(process.env.AI_MONTHLY_LIMIT,1000),aiDaily:limit(process.env.AI_DAILY_LIMIT,20)}};
}
export async function ownerDiagnostics(runId?:string) {
  const now=new Date(),month=now.toISOString().slice(0,7);
  const [runs,usage,aiUsage,allowance,counts,sourcePages,chunks,picks,spend,preparationLimit,preparationRuns,markers]=await Promise.all([
    prisma.discoveryRun.findMany({where:runId?{id:runId}:{promptVersion:PROMPT_VERSION},orderBy:{startedAt:'desc'},take:runId?1:5,include:{candidates:{orderBy:[{createdAt:'asc'},{id:'asc'}]},groupLinks:true}}),
    prisma.discoveryUsage.findUnique({where:{month}}),prisma.aIUsage.findUnique({where:{key:'month:'+month}}),monthlySearchAllowance(prisma,now),
    prisma.opportunity.groupBy({by:['verificationStatus'],where:{isSample:false,source:{not:'seed'}},_count:true}),prisma.sourcePage.count(),prisma.knowledgeChunk.count(),prisma.studentPick.count(),
    discoverySpend(prisma,now),
    preparationAllowance(now),
    prisma.discoveryRun.findMany({where:{kind:{in:['knowledge','recheck']}},orderBy:[{startedAt:'desc'},{id:'desc'}],take:10}),
    prisma.jobLease.groupBy({by:['owner'],where:{key:{startsWith:'knowledge-attempt:'}},_count:true}),
  ]);
  return {checkedAt:now.toISOString(),configuration:scoutConfiguration(),monthly:{allowance,discovery:usage,aiRequests:aiUsage?.count||0,spend},
    catalog:{statuses:Object.fromEntries(counts.map(c=>[c.verificationStatus,c._count])),sourcePages,chunks,picks},
    preparation:{allowance:preparationLimit,markers:Object.fromEntries(markers.map(m=>[m.owner,m._count])),
      runs:preparationRuns.map(r=>{const u=j<any>(r.usage,{});return {id:r.id,kind:r.kind,groupKey:r.groupKey,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,
        error:r.error,phase:u.phase||null,indexing:u.indexing||null,failures:u.failures||[]};})},
    runs:runs.map(run=>{
      const state=j<Partial<ScoutState>>(run.state,{}),usage=j<any>(run.usage,{});
      const calls=(state.calls||[]).map((c,i)=>({kind:c.kind,durationMs:c.durationMs,provider:c.usage.provider,model:safeModelId(c.usage.model),inputTokens:c.usage.inputTokens,outputTokens:c.usage.outputTokens,webSearches:c.kind==='research'?c.usage.webSearches??null:0,estimatedCost:usage.calls?.[i]?.estimatedCost??null}));
      const outcomes=Object.fromEntries(['verified','needs_verification','watchlist','excluded','error','found','fetched','extracted'].map(k=>[k,run.candidates.filter(c=>c.status===k).length]));
      return {id:run.id,kind:run.kind,status:run.status,stage:state.stage||usage.phase,promptVersion:run.promptVersion,startedAt:run.startedAt,finishedAt:run.finishedAt,
        durationMs:+(run.finishedAt||now)-+run.startedAt,groupKeys:run.groupLinks.map(g=>g.groupKey),diagnostic:state.diagnostic||false,sourceMode:state.sourceMode||'fetch_and_extract',
        context:state.context,query:state.query,models:usage.models,calls,outcomes,estimatedCost:usage.estimatedCost??null,costIsEstimate:true,
        researchOutput:state.researchOutput,failures:usage.failures||[],workflow:usage.workflow||[],
        candidates:run.candidates.map(c=>({id:c.id,name:c.name,url:c.url,status:c.status,reasons:j(c.reasons,[]),opportunityId:c.opportunityId,
          ...(runId?{pages:j(c.pages,[]),facts:j(c.facts,{})}:{pages:j<any[]>(c.pages,[]).map(p=>({sourceUrl:p.sourceUrl,pageTitle:p.pageTitle,checkedAt:p.checkedAt,contentHash:p.contentHash}))})})),
      };
    })};
}
