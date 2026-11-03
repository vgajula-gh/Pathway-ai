import { Prisma } from '@prisma/client';
import { prisma, j } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { currentCycle, interestSignature, refreshAllowance } from '../domain/refresh.js';
import { setting } from './config.js';
import { personalPicks } from '../lib/picks.js';
export const refreshDays = () => setting('REFRESH_INTERVAL_DAYS', 30, 365) || 30;
export async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (
        attempt < 7 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002', 'P1008'].includes(e.code)
      ) {
        await new Promise(resolve=>setTimeout(resolve,40*(attempt+1)+Math.floor(Math.random()*25)));
        continue;
      }
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
  // Repair earlier empty-result charges once, without touching paid usage.
  const empty=await tx.opportunitySearchRequest.findMany({where:{studentId,status:'empty',cycleStartedAt:cycle.cycleStartedAt,countedAt:{not:null}}});
  if(empty.length){
    cycle.manualUsed=Math.max(0,cycle.manualUsed-empty.filter(r=>r.manualSlot==='base').length);
    if(empty.some(r=>r.manualSlot==='bonus')&&!await tx.opportunitySearchRequest.count({where:{studentId,status:'complete',manualSlot:'bonus',cycleStartedAt:cycle.cycleStartedAt,countedAt:{not:null}}}))cycle.extraUsed=false;
    await tx.opportunitySearchRequest.updateMany({where:{id:{in:empty.map(r=>r.id)}},data:{countedAt:null}});
    await tx.auditEvent.create({data:{studentId,actor:'system',event:'Restored search allowance for empty results'}});
  }
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
  return (await (await import('./catalog.js')).catalogCoverage(studentId)).shortBuckets;
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
      opportunitySearches: { some: { status: { in: ['cached','complete','empty'] } } },
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
