import {reserveMonthlyAI} from '../lib/ai-limits.js';
import {HttpError} from '../lib/errors.js';
import { recheckDue } from '../domain/refresh.js';
import { identity } from './groups.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma, j } from '../lib/db.js';
import { RunBudget, setting, discoveryConfigured } from './config.js';
import { discover, trustedDomains } from './pipeline.js';
import { automaticRefreshBatch } from './refresh.js';
import { initializeKnowledge } from '../knowledge/runtime.js';
import { ingestKnowledge, reconcileVectors } from '../knowledge/service.js';
import { fetchOfficialPage, Page } from './pages.js';
import { extract } from './extraction.js';
import { verifyOpportunity } from '../domain/opportunity-verification.js';
export async function withJobLock<T>(key: string, fn: () => Promise<T>, now = new Date()) {
  const owner = randomUUID();
  await prisma.jobLease.upsert({ where: { key }, create: { key, expiresAt: new Date(0) }, update: {} });
  const claim = await prisma.jobLease.updateMany({
    where: { key, expiresAt: { lte: now } },
    data: { owner, expiresAt: new Date(+now + 300000) },
  });
  if (!claim.count) return { skipped: true as const };
  const heartbeat = setInterval(() => {
    void prisma.jobLease
      .updateMany({ where: { key, owner }, data: { expiresAt: new Date(Date.now() + 300000) } })
      .catch(() => {});
  }, 30000);
  heartbeat.unref();
  try {
    return { skipped: false as const, result: await fn() };
  } finally {
    clearInterval(heartbeat);
    await prisma.jobLease.updateMany({ where: { key, owner }, data: { expiresAt: new Date(0), owner: '' } });
  }
}
export async function reserveRun(groupKey: string, kind: 'discovery' | 'recheck', now = new Date()) {
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
          return tx.discoveryRun.create({ data: { groupKey, kind, startedAt: now } });
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
async function finishRun(
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
        usage: JSON.stringify({ ...budget.usage, tokensAreEstimates: true, workflow: budget.workflow }),
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
      budget.extractionCalls++;
      budget.usage.tokens += Math.ceil(pages.reduce((n, p) => n + p.text.length, 0) / 3) + 6500;
      const data = verifyOpportunity(await dependencies.extract(pages), pages, trustedDomains());
      if (
        identity(o.officialDomain || new URL(o.url).hostname, o.name) !==
        identity(data.officialDomain, data.name)
      )
        throw new Error('The fetched page describes a different program');
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
          ...(o.verificationStatus === 'verified' ? { verifiedAt: now, sourceCheckedAt: now } : {}),
          ...(o.costVerifiedAt ? { costVerifiedAt: now } : {}),
        },
      });
      await prisma.sourcePage.updateMany({ where: { opportunityId: id }, data: { checkedAt: now } });
    }
    await dependencies.ingest(id, budget);
  } catch (error) {
    await prisma.opportunity.update({
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
export async function runJobs() {
  return withJobLock('opportunity-jobs', async () => {
    await prisma.discoveryGroup.updateMany({
      where: { status: 'running' },
      data: {
        status: 'error',
        error: 'A background check was interrupted. Catalog picks are still available.',
      },
    });
    await prisma.discoveryRun.updateMany({
      where: { status: 'running' },
      data: {
        status: 'interrupted',
        error: 'Previous worker stopped before recording final usage',
        finishedAt: new Date(),
      },
    });
    const expired = await expireCatalog(),
      refreshed = await automaticRefreshBatch();
    if (!discoveryConfigured() || !(await initializeKnowledge()))
      return { expired, refreshed, discovered: 0 };
    const groups = await prisma.discoveryGroup.findMany({
      where: {
        status: { in: ['queued', 'limited'] },
        OR: [{ lastDiscoveredAt: null }, { lastDiscoveredAt: { lte: new Date(Date.now() - 30 * 86400000) } }],
      },
      orderBy: { requestedAt: 'asc' },
      take: 1,
    });
    let discovered = 0;
    for (const group of groups) {
      const run = await reserveRun(group.key, 'discovery');
      if (!run) {
        await prisma.discoveryGroup.update({
          where: { key: group.key },
          data: {
            status: 'limited',
            error: 'Discovery allowance reached; catalog picks are still available.',
          },
        });
        continue;
      }
      const budget = new RunBudget();
      await prisma.discoveryGroup.update({
        where: { key: group.key },
        data: { status: 'running', lastDiscoveredAt: new Date() },
      });
      try {
        const ids = await discover(group, j<('free' | 'paid')[]>(group.pendingBuckets, []), budget, {
          search: (await import('./search/index.js')).getSearch()!,
          fetch: fetchOfficialPage,
          extract,
          ingest: ingestKnowledge,
        });
        discovered += ids.length;
        await prisma.discoveryGroup.update({
          where: { key: group.key },
          data: { status: 'idle', pendingBuckets: '[]', error: '' },
        });
        await finishRun(run, budget, 'complete');
      } catch {
        await prisma.discoveryGroup.update({
          where: { key: group.key },
          data: {
            status: 'error',
            error: 'Could not find more programs. Existing catalog picks are still available.',
          },
        });
        await finishRun(run, budget, 'failed', 'Discovery provider or source unavailable');
      }
    }
    // One bounded re-check per invocation. Requests that cannot be funded are left due.
    const now = new Date();
    const due = (
      await prisma.opportunity.findMany({
        where: { verificationStatus: { not: 'expired' } },
        orderBy: { lastRecheckedAt: 'asc' },
      })
    ).find((o) => recheckDue(o, now));
    if (due) {
      const run = await reserveRun(due.id, 'recheck');
      if (run) {
        const budget = new RunBudget();
        try {
          await recheckOpportunity(due.id, budget);
          await finishRun(run, budget, 'complete');
        } catch {
          await finishRun(run, budget, 'failed', 'Official pages could not be confirmed');
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
    return { expired, refreshed, discovered };
  });
}
