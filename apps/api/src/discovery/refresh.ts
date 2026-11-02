import { Prisma } from '@prisma/client';
import { prisma, j } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { currentCycle, interestSignature, refreshAllowance } from '../domain/refresh.js';
import { setting, discoveryConfigured } from './config.js';
import { interestGroups } from './groups.js';
import { loadContext } from '../lib/context.js';
import { toOpp, personalPicks } from '../lib/picks.js';
import { scoreOpportunity } from '../domain/scoring.js';
import { bucketFor } from '../domain/picks.js';
import { env } from '../lib/env.js';
import { activeOpportunity } from '../domain/opportunity-active.js';
import { wallNow, dkey } from '../domain/time.js';
export const refreshDays = () => setting('REFRESH_INTERVAL_DAYS', 30, 365) || 30;
export async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (
        attempt < 4 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002', 'P1008'].includes(e.code)
      )
        continue;
      throw e;
    }
}
export async function stateIn(tx: Prisma.TransactionClient, studentId: string, now: Date) {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const initial = await tx.pickRefreshState.upsert({
    where: { studentId },
    create: {
      studentId,
      cycleStartedAt: now,
      autoRefreshedAt: now,
      interestSignature: interestSignature(j(student.interests, [])),
    },
    update: {},
  });
  const cycle = currentCycle(initial, now, refreshDays());
  return tx.pickRefreshState.update({
    where: { studentId },
    data: {
      cycleStartedAt: cycle.cycleStartedAt,
      manualUsed: cycle.manualUsed,
      extraEarned: cycle.extraEarned,
      extraUsed: cycle.extraUsed,
    },
  });
}
export async function refreshStatus(studentId: string, now = new Date()) {
  return transaction(async (tx) => {
    const state = await stateIn(tx, studentId, now);
    return refreshAllowance(state, setting('MANUAL_REFRESHES_PER_MONTH', 1, 10), refreshDays());
  });
}
export async function useManualRefresh(studentId: string, now = new Date()) {
  return transaction(async (tx) => {
    const state = await stateIn(tx, studentId, now),
      max = setting('MANUAL_REFRESHES_PER_MONTH', 1, 10);
    if (!refreshAllowance(state, max, refreshDays()).available)
      throw new HttpError(
        429,
        `Your next opportunity refresh is available on ${refreshAllowance(state, max, refreshDays()).nextAvailableAt.slice(0, 10)}. Saving and replacing picks still works.`,
      );
    await tx.pickRefreshState.update({
      where: { studentId },
      data: state.manualUsed < max ? { manualUsed: { increment: 1 } } : { extraUsed: true },
    });
  });
}
export async function noteInterestChange(
  studentId: string,
  oldInterests: string[],
  interests: string[],
  now = new Date(),
) {
  if (interestSignature(oldInterests) === interestSignature(interests)) return;
  await transaction(async (tx) => {
    await tx.pickRefreshState.upsert({
      where: { studentId },
      create: {
        studentId,
        cycleStartedAt: now,
        autoRefreshedAt: now,
        interestSignature: interestSignature(oldInterests),
      },
      update: {},
    });
    await stateIn(tx, studentId, now);
    await tx.pickRefreshState.update({
      where: { studentId },
      data: { interestSignature: interestSignature(interests), extraEarned: true },
    });
  });
}
export async function shortBuckets(studentId: string) {
  const { ctx, events, rules } = await loadContext(studentId);
  const { dayCapacity } = await import('../domain/schedule.js');
  const { addDays, sod } = await import('../domain/time.js');
  let free = 0;
  for (let d = 0; d < 7; d++) free += dayCapacity(events, rules, addDays(sod(new Date()), d)).available;
  const [opps, saved, feedback] = await Promise.all([
    prisma.opportunity.findMany({ where: env.demoMode ? {} : { isSample: false, source: { not: 'seed' } } }),
    prisma.savedOpportunity.findMany({ where: { studentId } }),
    prisma.opportunityFeedback.findMany({ where: { studentId } }),
  ]);
  const excluded = new Set([...saved.map((s) => s.opportunityId), ...feedback.map((s) => s.opportunityId)]);
  const good = opps.map(toOpp).filter((o) => {
    const fit = scoreOpportunity(o, ctx, free);
    return (
      !excluded.has(o.id) && (env.demoMode&&o.isSample||activeOpportunity(o,dkey(wallNow(ctx.timezone||'UTC')),new Date())) &&
      !['expired', 'stale'].includes(o.verificationStatus) &&
      !fit.excluded &&
      fit.score >= 0.38 &&
      (fit.matched.length > 0 || ctx.interests.length === 0)
    );
  });
  return (['free', 'paid'] as const).filter(
    (bucket) =>
      good.filter((o) => bucketFor(o) === bucket).length <
      setting(bucket === 'free' ? 'FREE_PICKS' : 'PAID_PICKS', 3, 10),
  );
}
export async function queueDiscovery(studentId: string, now = new Date()) {
  const { enqueueSearch } = await import('./requests.js');
  return enqueueSearch(studentId,'initial',now);
}
export async function discoveryStatus(studentId: string) {
  const {searchState}=await import('./requests.js');
  const state=await searchState(studentId);
  return {...state,refresh:await refreshStatus(studentId),lastCheckedAt:state.search.finishedAt||state.search.startedAt};
}
export async function automaticRefreshBatch(now = new Date()) {
  const students = await prisma.student.findMany({
    where: {
      pickState: { autoRefreshedAt: { lte: new Date(+now - refreshDays() * 86400000) } },
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });
  for (const s of students) {
    await personalPicks(s.id, true);
    await refreshStatus(s.id, now);
    await prisma.pickRefreshState.update({ where: { studentId: s.id }, data: { autoRefreshedAt: now } });
    const {enqueueSearch}=await import('./requests.js');
    await enqueueSearch(s.id,'monthly',now);
  }
  return students.length;
}
