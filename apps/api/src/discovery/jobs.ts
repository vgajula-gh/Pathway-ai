import {advanceOrStartScout} from '../scout/scheduler.js';
import {PROMPT_VERSION} from '../scout/prompts.js';
import {extractScout} from '../scout/extract.js';
import {qualifyScout} from '../scout/qualify.js';
import {reserveMonthlyAI} from '../lib/ai-limits.js';
import {HttpError} from '../lib/errors.js';
import { recheckDue } from '../domain/refresh.js';
import { identity, interestGroups } from './groups.js';
import { Prisma } from '@prisma/client';
import { prisma, j } from '../lib/db.js';
import { RunBudget, setting, discoveryConfigured } from './config.js';
import { trustedDomains } from './pipeline.js';
import { automaticRefreshBatch } from './refresh.js';
import { initializeKnowledge } from '../knowledge/runtime.js';
import { ingestKnowledge, reconcileVectors } from '../knowledge/service.js';
import { fetchOfficialPage, Page } from './pages.js';
import { extract } from './extraction.js';
import { verifyOpportunity } from '../domain/opportunity-verification.js';
import { failureInfo, failureMessage, FailureStage, DiscoveryFailure, operationalFailure,primaryFailure } from './failures.js';
import { settleSearchRequests,neededGroupBuckets } from './requests.js';
export {withJobLock} from '../lib/job-lock.js';
import {withJobLock} from '../lib/job-lock.js';
import {reserveDiscoverySpend} from './spend.js';
import {confirmedResearchFacts} from '../domain/research-evidence.js';
import {ResearchOutput} from '../scout/schema.js';
import {scoutSettings} from '../scout/settings.js';
export async function reserveRun(groupKey: string, kind: 'discovery' | 'recheck' | 'knowledge', now = new Date()) {
  const month = now.toISOString().slice(0, 7),
    field = kind === 'discovery' ? 'runs' : 'rechecks',
    cap = setting(
      kind === 'discovery' ? 'DISCOVERY_MONTHLY_BUDGET' : 'DISCOVERY_RECHECKS_PER_MONTH',
      10,
      10000,
    );
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.discoveryUsage.upsert({ where: { month }, create: { month }, update: {} });
          const held = await tx.discoveryUsage.updateMany({
            where: { month, [field]: { lt: cap } },
            data: { [field]: { increment: 1 } },
          });
          if (!held.count) return null;
          await reserveMonthlyAI(tx,now);
          const reservation=kind==='discovery'?await reserveDiscoverySpend(tx,now):undefined;
          return tx.discoveryRun.create({ data: { groupKey, kind, startedAt: now,...(reservation?{usage:JSON.stringify({spendReservation:reservation})}:{}) } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if(e instanceof HttpError && e.status===429)return null;
      if (
        attempt < 4 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002', 'P1008'].includes(e.code)
      )
        continue;
      throw e;
    }
}
export async function finishRun(
  run: { id: string; startedAt: Date },
  budget: RunBudget,
  status: string,
  error = '',
) {
  budget.usage.estimatedCost =
    budget.usage.searches * 0.03 +
    (budget.usage.tokens / 1e6) * 4 +
    budget.usage.embeddings * 0.001 +
    budget.usage.vectorUpserts * 0.00001;
  const { runs: _, ...usage } = budget.usage;
  await prisma.$transaction([
    prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        status,
        error,
        usage: JSON.stringify({ ...budget.usage, tokensAreEstimates: true, models:budget.models,candidates:budget.candidates, phase: budget.phase, savedIds: budget.savedIds, workflow: budget.workflow, failures: budget.failures }),
        finishedAt: new Date(),
      },
    }),
    prisma.discoveryUsage.update({
      where: { month: run.startedAt.toISOString().slice(0, 7) },
      data: Object.fromEntries(Object.entries(usage).map(([key, value]) => [key, { increment: value }])),
    }),
  ]);
}
export async function expireCatalog(now = new Date()) {
  const expired = await prisma.opportunity.findMany({
    where: { deadline: { lt: new Date(+now-12*3600000).toISOString().slice(0, 10) }, verificationStatus: { not: 'expired' } },
    select: { id: true },
  });
  if (!expired.length) return 0;
  const ids = expired.map((o) => o.id);
  await prisma.$transaction([
    prisma.opportunity.updateMany({
      where: { id: { in: ids } },
      data: { verificationStatus: 'expired', sourceCheckedAt: null, verifiedAt: null },
    }),
    prisma.studentPick.deleteMany({ where: { opportunityId: { in: ids } } }),
  ]);
  return ids.length;
}
export async function recheckOpportunity(
  id: string,
  budget: RunBudget,
  dependencies = { fetch: fetchOfficialPage, extract, ingest: ingestKnowledge },
) {
  const o = await prisma.opportunity.findUniqueOrThrow({ where: { id } }),
    previous = await prisma.sourcePage.findMany({ where: { opportunityId: id } });
  const urls = previous.length ? previous.map((p) => p.sourceUrl).slice(0, 4) : [o.url];
  const pages: Page[] = [];
  let stage: FailureStage = 'fetch';
  try {
    for (const url of urls) pages.push(await dependencies.fetch(url, budget));
    const changed = pages.some(
      (p) => !previous.some((old) => old.sourceUrl === p.sourceUrl && old.contentHash === p.contentHash),
    );
    if (changed || o.verificationStatus === 'stale') {
      // Invalidate old verification before extraction; a provider outage cannot leave changed facts verified.
      await prisma.opportunity.update({
        where: { id },
        data: { verificationStatus: 'stale', sourceCheckedAt: null, verifiedAt: null, costVerifiedAt: null },
      });
      budget.check();
      stage = 'extract';
      let data;
      if(o.promptVersion===PROMPT_VERSION) {
        let facts;
        if(scoutSettings().sourceMode==='research_evidence'){
          const candidate=await prisma.researchCandidate.findFirst({where:{opportunityId:id},orderBy:{createdAt:'desc'},include:{run:true}});
          const parsed=ResearchOutput.safeParse(j<any>(candidate?.run.state||'{}',{}).researchOutput);
          const lead=parsed.success?parsed.data.candidates.find(c=>c.officialUrl===candidate?.url):undefined;
          facts=confirmedResearchFacts(lead||{name:o.name,officialUrl:o.url,interests:[],costHint:'unknown'},pages);
        }else{
          budget.extractionCalls++;const result=await extractScout(pages);facts=result.facts;
          if(result.usage)budget.usage.tokens+=(result.usage.inputTokens||0)+(result.usage.outputTokens||0);
        }
        stage='verify';const qualified=qualifyScout(facts,pages,trustedDomains(),new Date(),{name:o.name,url:o.url});
        if(!qualified.data)throw new DiscoveryFailure({stage:'verify',code:qualified.reasons.some(r=>r.reason==='past_deadline')?'deadline_passed':'missing_evidence'});
        data=qualified.data;
      } else {
        budget.extractionCalls++;budget.usage.tokens+=Math.ceil(pages.reduce((n,p)=>n+p.text.length,0)/3)+6500;
        const facts=await dependencies.extract(pages);stage='verify';data=verifyOpportunity(facts,pages,trustedDomains());
      }
      if(!data.deadline&&o.deadline)data={...data,deadline:o.deadline,evidence:JSON.stringify({...j<any>(data.evidence,{}),...(j<any>(o.evidence,{}).deadline?{deadline:j<any>(o.evidence,{}).deadline}:{})})};
      if (
        identity(o.officialDomain || new URL(o.url).hostname, o.name) !==
        identity(data.officialDomain, data.name)
      )
        throw new Error('The fetched page describes a different program');
      stage = 'store';
      await prisma.$transaction(async (tx) => {
        await tx.opportunity.update({ where: { id }, data: { ...data, lastRecheckedAt: new Date() } });
        for (const p of pages)
          await tx.sourcePage.upsert({
            where: { opportunityId_sourceUrl: { opportunityId: id, sourceUrl: p.sourceUrl } },
            create: {
              opportunityId: id,
              sourceUrl: p.sourceUrl,
              pageTitle: p.pageTitle,
              text: p.text,
              contentHash: p.contentHash,
              checkedAt: p.checkedAt,
            },
            update: {
              text: p.text,
              contentHash: p.contentHash,
              checkedAt: p.checkedAt,
              pageTitle: p.pageTitle,
            },
          });
      });
    } else {
      const now = new Date();
      await prisma.opportunity.update({
        where: { id },
        data: {
          lastRecheckedAt: now,
          ...(o.promptVersion===PROMPT_VERSION?{sourceReadAt:now}:{}),
          ...(o.verificationStatus === 'verified' ? { verifiedAt: now, sourceCheckedAt: now } : {}),
          ...(o.applicationStatusCheckedAt?{applicationStatusCheckedAt:now}:{}),
          ...(o.costVerifiedAt ? { costVerifiedAt: now } : {}),
        },
      });
      await prisma.sourcePage.updateMany({ where: { opportunityId: id }, data: { checkedAt: now } });
    }
    stage = 'index';
    await dependencies.ingest(id, budget);
  } catch (error) {
    budget.failures.push(failureInfo(error, stage));
    if(stage!=='index')await prisma.opportunity.update({
      where: { id },
      data: {
        lastRecheckedAt: new Date(),
        verificationStatus: 'stale',
        sourceCheckedAt: null,
        verifiedAt: null,
        costVerifiedAt: null,
      },
    });
    throw error;
  }
}
async function recoverInterrupted() {
    const scout=await prisma.discoveryRun.findMany({where:{status:'running',promptVersion:PROMPT_VERSION},include:{groupLinks:true}});
    const liveKeys=[...new Set(scout.flatMap(r=>[r.groupKey,...r.groupLinks.map(g=>g.groupKey)]))];
    await prisma.jobLease.updateMany({where:{key:{startsWith:'knowledge-attempt:'},owner:'running'},data:{owner:'failed'}});
    await prisma.discoveryGroup.updateMany({
      where: { status: 'running',key:{notIn:liveKeys} },
      data: {
        status: 'error',
        error: 'A background check was interrupted. Catalog picks are still available.',
      },
    });
    await prisma.discoveryRun.updateMany({
      where: { status: 'running',promptVersion:{not:PROMPT_VERSION} },
      data: {
        status: 'interrupted',
        error: 'Previous worker stopped before recording final usage',
        finishedAt: new Date(),
      },
    });
}

async function discoverNext(groupKeys?:string[],_foreground=false,deadlineAt=Infinity) {
  if(Date.now()>=deadlineAt)return 0;
  return advanceOrStartScout(groupKeys);
}

/** Request-bound work lets a visible Explore screen make progress on Autoscale. */
export async function runStudentDiscovery(studentId: string) {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  if (!student.aiConsent) return { skipped: true as const };
  const request=await prisma.opportunitySearchRequest.findFirst({where:{studentId,status:{in:['queued','running']}},orderBy:{createdAt:'desc'}});
  const keys=request?j<{key:string;cached?:boolean}[]>(request.groupBindings,[]).filter(g=>!g.cached).map(g=>g.key):[];
  return withJobLock('opportunity-jobs', async () => {
    await recoverInterrupted();
    const discovered=keys.length&&discoveryConfigured()?await discoverNext(keys,true):0;
    const prepared=keys.length&&discoveryConfigured()?0:await (await import('../knowledge/preparation.js')).prepareKnowledgeBatch(studentId);
    await settleSearchRequests(studentId);
    return {discovered,prepared};
  });
}

export async function runJobs() {
  return withJobLock('opportunity-jobs', async () => {
    await recoverInterrupted();
    const deadlineAt=Date.now()+180000;
    const expired = await expireCatalog(),
      refreshed = await automaticRefreshBatch();
    const discovered = discoveryConfigured()?await discoverNext(undefined,false,deadlineAt):0;
    const prepared=await (await import('../knowledge/preparation.js')).prepareKnowledgeBatch(undefined,deadlineAt);
    await settleSearchRequests();
    // One bounded re-check per invocation. Requests that cannot be funded are left due.
    const now = new Date();
    const due = (
      await prisma.opportunity.findMany({
        where: { verificationStatus: { not: 'expired' }, isSample: false },
        orderBy: { lastRecheckedAt: 'asc' },
      })
    ).find((o) => recheckDue(o, now));
    if (due&&discoveryConfigured()&&Date.now()<deadlineAt) {
      const run = await reserveRun(due.id, 'recheck');
      if (run) {
        const budget = new RunBudget();
        budget.deadlineAt=Math.min(budget.deadlineAt,deadlineAt);
        try {
          await recheckOpportunity(due.id, budget);
          await finishRun(run, budget, 'complete');
        } catch (error) {
          if (!budget.failures.length) budget.failures.push(failureInfo(error, 'fetch'));
          await finishRun(run, budget, 'failed', failureMessage(budget.failures[0]));
        }
      }
    }
    // Reconcile monthly; the persistent marker makes repeated cron calls harmless.
    const month = now.toISOString().slice(0, 7),
      marker = `vectors-reconciled:${month}`;
    if (!(await prisma.jobLease.findUnique({ where: { key: marker } }))) {
      await reconcileVectors();
      await prisma.jobLease.create({ data: { key: marker, expiresAt: now } });
    }
    return { expired, refreshed, discovered, prepared };
  });
}
