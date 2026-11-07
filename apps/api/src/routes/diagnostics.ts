import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {prisma,j} from '../lib/db.js';
import {requireOwner} from '../lib/owner-auth.js';
import {HttpError} from '../lib/errors.js';
import {withJobLock} from '../lib/job-lock.js';
import {reserveRun} from '../discovery/jobs.js';
import {scoutConfiguration,ownerDiagnostics} from '../scout/diagnostics.js';
import {checkScoutFixture} from '../scout/fixture.js';
import {newScoutState,advanceScout,scoutUsage,restoreScoutBudget,type ScoutState} from '../scout/runner.js';
import {PROMPT_VERSION} from '../scout/prompts.js';
import {knowledgeDiagnostics} from '../knowledge/diagnostics.js';
import {prepareKnowledgeBatch,preparationAllowance} from '../knowledge/preparation.js';
export default async function routes(app:FastifyInstance) {
  app.get('/internal/knowledge/status',async(req,reply)=>{
    requireOwner(req);reply.header('Cache-Control','no-store');
    const q=z.object({opportunityId:z.string().min(1).max(200).optional()}).strict().parse(req.query);
    return knowledgeDiagnostics(q.opportunityId);
  });
  app.post('/internal/knowledge/prepare',async(req,reply)=>{
    requireOwner(req);reply.header('Cache-Control','no-store');
    const body=z.object({opportunityId:z.string().min(1).max(200),allowPaid:z.literal(true)}).strict().parse(req.body);
    if(!await prisma.opportunity.findUnique({where:{id:body.opportunityId}}))throw new HttpError(404,'Program not found.');
    const before=await knowledgeDiagnostics(body.opportunityId);
    if(!before.configurationReady)return reply.code(503).send(before);
    const allowance=await preparationAllowance();
    const current=(before as {program?:{sqlReady:boolean;vectorConfirmation:string}}).program;
    if(!(current?.sqlReady&&current.vectorConfirmation==='confirmed')&&!allowance.available)return reply.code(429).send({error:'The shared preparation or AI allowance has been reached.',allowance});
    const result=await withJobLock('opportunity-jobs',()=>prepareKnowledgeBatch(undefined,Date.now()+90000,{opportunityId:body.opportunityId,retry:true}));
    if(result.skipped)return reply.code(409).send({error:'Another opportunity job is active. Check status and try later.'});
    const after=await knowledgeDiagnostics(body.opportunityId);
    return {processed:result.result,...after};
  });
  app.get('/internal/diagnostics',async(req,reply)=>{
    requireOwner(req);reply.header('Cache-Control','no-store');
    const q=z.object({runId:z.string().min(1).max(200).optional()}).strict().parse(req.query);
    return ownerDiagnostics(q.runId);
  });
  app.post('/internal/diagnostics/test-scout',async(req,reply)=>{
    requireOwner(req);reply.header('Cache-Control','no-store');
    const body=z.object({mode:z.enum(['configuration','fixture','live','advance']).default('configuration'),runId:z.string().min(1).max(200).optional()}).strict().parse(req.body||{});
    if(body.mode==='configuration')return {mode:body.mode,providerRequests:0,configuration:scoutConfiguration()};
    if(body.mode==='fixture')return checkScoutFixture();
    if(scoutConfiguration().searchIssue)throw new HttpError(503,scoutConfiguration().searchIssue!.message);
    if(body.mode==='live') {
      const result=await withJobLock('opportunity-jobs',async()=>{
        const running=await prisma.discoveryRun.findMany({where:{promptVersion:PROMPT_VERSION,status:'running'}});
        const existing=running.find(r=>j<Partial<ScoutState>>(r.state,{}).diagnostic);
        if(existing)return {runId:existing.id,started:false,sourceMode:j<Partial<ScoutState>>(existing.state,{}).sourceMode||'fetch_and_extract'};
        const group={key:'scout-diagnostic|9-10|US',topic:'coding',gradeBand:'9-10',region:'US'};
        const run=await reserveRun(group.key,'discovery');if(!run)throw new HttpError(429,'The shared search or AI allowance has been reached.');
        await prisma.discoveryGroup.upsert({where:{key:group.key},create:group,update:{}});
        const state=newScoutState({today:new Date().toISOString().slice(0,10),gradeBand:'9-10',region:'US',interests:['coding'],focusInterests:['coding'],buckets:['free','paid']},[group.key],1);
        state.diagnostic=true;state.repairUsed=true;
        await prisma.discoveryRun.update({where:{id:run.id},data:{promptVersion:PROMPT_VERSION,state:JSON.stringify(state),usage:scoutUsage(restoreScoutBudget(run),state),groupLinks:{create:{groupKey:group.key}}}});
        return {runId:run.id,started:true,sourceMode:state.sourceMode};
      });
      return reply.code(202).send({mode:'live',...result,maxProviderRequests:!result.skipped&&result.result.sourceMode==='research_evidence'?1:2,note:'Queued one public test candidate. Advance the bounded job; research-evidence mode makes no extraction AI call. Normal shared caps apply. No student data is used.'});
    }
    if(!body.runId)throw new HttpError(422,'Provide the diagnostic runId.');
    const result=await withJobLock('opportunity-jobs',async()=>{
      const run=await prisma.discoveryRun.findUnique({where:{id:body.runId}});
      if(!run||!j<Partial<ScoutState>>(run.state,{}).diagnostic)throw new HttpError(404,'Diagnostic job not found.');
      return {runId:run.id,...await advanceScout(run)};
    });
    return reply.code(202).send({mode:'advance',...result});
  });
}
