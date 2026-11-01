import { Prisma } from '@prisma/client';
import { prisma, j } from './db.js';
import { loadContext } from './context.js';
import { addDays, sod } from '../domain/time.js';
import { dayCapacity } from '../domain/schedule.js';
import { bucketFor, costLabel, selectPicks } from '../domain/picks.js';
import { scoreOpportunity } from '../domain/scoring.js';
export const toOpp = (o: Awaited<ReturnType<typeof prisma.opportunity.findMany>>[number]) => ({ ...o, region: j<string[]>(o.region, []), skills: j<string[]>(o.skills, []), tags: j<string[]>(o.tags, []), checks: j<string[]>(o.checks, []) });
export async function personalPicks(studentId: string, rebuild = false) {
  const { events, rules, ctx } = await loadContext(studentId);
  let freeMin = 0; for (let d=0; d<7; d++) freeMin += dayCapacity(events, rules, addDays(sod(new Date()), d)).available;
  const opps = (await prisma.opportunity.findMany()).map(toOpp);
  // Serialize replacement with the student row. Retry conflicting refreshes on PostgreSQL.
  for (let attempt=0;;attempt++) try {
    const picks = await prisma.$transaction(async tx => {
      await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
      const [saved, feedback, previous] = await Promise.all([tx.savedOpportunity.findMany({ where: { studentId } }), tx.opportunityFeedback.findMany({ where: { studentId } }), tx.studentPick.findMany({ where: { studentId }, orderBy: { rank: 'asc' } })]);
      const excluded = new Set([...saved.map(x=>x.opportunityId), ...feedback.map(x=>x.opportunityId)]);
      const counts = { free: Math.min(10, Math.max(0, Number(process.env.FREE_PICKS || 3))), paid: Math.min(10, Math.max(0, Number(process.env.PAID_PICKS || 3))) };
      const valid = previous.filter(p => { const o=opps.find(o=>o.id===p.opportunityId); return o && p.bucket===bucketFor(o) && !excluded.has(o.id) && !['expired','stale'].includes(o.verificationStatus) && !scoreOpportunity(o,ctx,freeMin).excluded; });
      // Refills preserve existing selections; a requested refresh may improve the whole set.
      const chosen = selectPicks(opps,ctx,freeMin,excluded,counts,valid.map(p=>p.opportunityId),feedback.map(f=>f.reason),Number(process.env.STRETCH_PICKS || 1));
      if (!rebuild) for (const bucket of ['free','paid'] as const) {
        const keep=valid.filter(p=>p.bucket===bucket).slice(0,counts[bucket]);
        const fill=chosen.filter(p=>p.bucket===bucket && !keep.some(k=>k.opportunityId===p.opportunityId));
        chosen.splice(0,chosen.length,...chosen.filter(p=>p.bucket!==bucket),...[...keep,...fill].slice(0,counts[bucket]).map((p,rank)=>({...p,bucket,rank})));
      }
      // Never allow multiple stretch badges after preserving/refilling picks.
      let stretchSeen=false; for (const p of chosen) { if(p.isStretch) { p.isStretch=!stretchSeen; stretchSeen=true; } }
      await tx.studentPick.deleteMany({ where: { studentId } });
      const cycle=new Date().toISOString().slice(0,7);
      if(chosen.length) await tx.studentPick.createMany({ data: chosen.map(p=>({ studentId,opportunityId:p.opportunityId,bucket:p.bucket,rank:p.rank,isStretch:p.isStretch,refreshCycle:cycle })) });
      return chosen;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return picks.map(p=>{ const o=opps.find(o=>o.id===p.opportunityId)!; return {...o,...p,verified:o.verificationStatus==='verified' && !!o.sourceCheckedAt, costLabel:costLabel(o),status:null,fit:scoreOpportunity(o,ctx,freeMin)}; });
  } catch(e) { if(attempt<4 && e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002','P1008'].includes(e.code)) continue; throw e; }
}
