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
export const refreshDays = () => setting('REFRESH_INTERVAL_DAYS', 30, 365) || 30;
async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
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
async function stateIn(tx: Prisma.TransactionClient, studentId: string, now: Date) {
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
    prisma.opportunity.findMany(),
    prisma.savedOpportunity.findMany({ where: { studentId } }),
    prisma.opportunityFeedback.findMany({ where: { studentId } }),
  ]);
  const excluded = new Set([...saved.map((s) => s.opportunityId), ...feedback.map((s) => s.opportunityId)]);
  const good = opps.map(toOpp).filter((o) => {
    const fit = scoreOpportunity(o, ctx, free);
    return (
      !excluded.has(o.id) &&
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
  if (!discoveryConfigured()) return;
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student?.aiConsent) return;
  const buckets = await shortBuckets(studentId);
  if (!buckets.length) return;
  for (const group of interestGroups({
    grade: student.grade,
    interests: j(student.interests, []),
    region: student.region,
  }))
    await transaction(async (tx) => {
      const old = await tx.discoveryGroup.findUnique({ where: { key: group.key } });
      if (old?.lastDiscoveredAt && +now - +old.lastDiscoveredAt < 30 * 86400000) return;
      const pendingBuckets = JSON.stringify([
        ...new Set([...j<string[]>(old?.pendingBuckets, []), ...buckets]),
      ]);
      await tx.discoveryGroup.upsert({
        where: { key: group.key },
        create: { ...group, pendingBuckets, requestedAt: now, status: 'queued' },
        update: {
          pendingBuckets,
          requestedAt: old?.requestedAt || now,
          status: old?.status === 'running' ? 'running' : 'queued',
        },
      });
    });
}
export async function discoveryStatus(studentId: string) {
  const s = await prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    groups = interestGroups({ grade: s.grade, interests: j(s.interests, []), region: s.region });
  const states = await prisma.discoveryGroup.findMany({ where: { key: { in: groups.map((g) => g.key) } } });
  return {
    error: states.find((g) => g.status === 'error')?.error || null,
    refresh: await refreshStatus(studentId),
    finding: states.some((g) => ['queued', 'running'].includes(g.status)),
    limited: states.some((g) => g.status === 'limited'),
    lastCheckedAt:
      states
        .map((g) => g.lastDiscoveredAt?.toISOString())
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}
export async function automaticRefreshBatch(now = new Date()) {
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { pickState: null },
        { pickState: { autoRefreshedAt: { lte: new Date(+now - refreshDays() * 86400000) } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });
  for (const s of students) {
    await personalPicks(s.id, true);
    await refreshStatus(s.id, now);
    await prisma.pickRefreshState.update({ where: { studentId: s.id }, data: { autoRefreshedAt: now } });
    await queueDiscovery(s.id, now);
  }
  return students.length;
}
