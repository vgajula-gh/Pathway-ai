import { setting } from '../discovery/config.js';
import { Prisma } from '@prisma/client';
import { prisma, j } from './db.js';
import { loadContext } from './context.js';
import { addDays, sod } from '../domain/time.js';
import { dayCapacity } from '../domain/schedule.js';
import { bucketFor, costLabel, selectPicks,outsideInterest } from '../domain/picks.js';
import { scoreOpportunity } from '../domain/scoring.js';
import { env } from './env.js';
import { countdown } from '../domain/applications.js';
import { activeOpportunity } from '../domain/opportunity-active.js';
import { wallNow, dkey } from '../domain/time.js';
import {publicScoutFacts} from '../domain/scout-scoring.js';
export const toOpp = (o: Awaited<ReturnType<typeof prisma.opportunity.findMany>>[number]) => ({
  ...o,
  cost:
    o.costType === 'unknown' || (o.costType === 'free' && !o.costVerifiedAt)
      ? 'Cost not confirmed — check the official site'
      : o.cost,
  region: j<string[]>(o.region, []),
  skills: j<string[]>(o.skills, []),
  tags: j<string[]>(o.tags, []),
  checks: j<string[]>(o.checks, []),
  publicFacts:publicScoutFacts(o),
  qualificationNotes:j<{field:string;reason:string}[]>(o.qualificationNotes,[]),
  sources:Object.entries(j<Record<string,{sourceUrl:string;quote:string}>>(o.evidence,{})).filter(([,e])=>e&&typeof e.sourceUrl==='string'&&e.sourceUrl.startsWith('https://')&&typeof e.quote==='string').map(([field,e])=>({field,url:e.sourceUrl,quote:e.quote.slice(0,1000)})),
});
export async function personalPicks(studentId: string, rebuild = false) {
  const { events, rules, ctx } = await loadContext(studentId);
  if(!ctx.interests.length) { await prisma.studentPick.deleteMany({where:{studentId}}); return []; }
  let freeMin = 0;
  for (let d = 0; d < 7; d++) freeMin += dayCapacity(events, rules, addDays(sod(new Date()), d)).available;
  const now=new Date(),today=dkey(wallNow(ctx.timezone||'UTC',now));
  const opps = (await prisma.opportunity.findMany({ where: env.demoMode ? {} : { isSample: false, source: { not: 'seed' } } })).map(toOpp).filter(o=>env.demoMode&&o.isSample||activeOpportunity(o,today,now));
  // Serialize replacement with the student row. Retry conflicting refreshes on PostgreSQL.
  for (let attempt = 0; ; attempt++)
    try {
      const picks = await prisma.$transaction(
        async (tx) => {
          await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
          const [saved, feedback, previous] = await Promise.all([
            tx.savedOpportunity.findMany({ where: { studentId } }),
            tx.opportunityFeedback.findMany({ where: { studentId } }),
            tx.studentPick.findMany({ where: { studentId }, orderBy: { rank: 'asc' } }),
          ]);
          const excluded = new Set([
            ...saved.map((x) => x.opportunityId),
            ...feedback.map((x) => x.opportunityId),
          ]);
          const counts = { free: setting('FREE_PICKS', 3, 3), paid: setting('PAID_PICKS', 3, 3) };
          const valid = previous.filter((p) => {
            const o = opps.find((o) => o.id === p.opportunityId);
            return (
              o &&
              p.bucket === bucketFor(o) &&
              !excluded.has(o.id) &&
              !['expired', 'stale'].includes(o.verificationStatus) &&
              !scoreOpportunity(o, ctx, freeMin).excluded
            );
          });
          // Refills preserve existing selections; a requested refresh may improve the whole set.
          const chosen = selectPicks(
            opps,
            ctx,
            freeMin,
            excluded,
            counts,
            valid.map((p) => p.opportunityId),
            feedback.flatMap(f=>f.reason==='not my interest'?opps.find(o=>o.id===f.opportunityId)?.tags.map(t=>'interest:'+t.toLowerCase())||[]:[f.reason]),
            setting('STRETCH_PICKS', 1, 1),
          );
          if (!rebuild)
            for (const bucket of ['free', 'paid'] as const) {
              const keep = valid.filter((p) => p.bucket === bucket).slice(0, counts[bucket]);
              const fill = chosen.filter(
                (p) => p.bucket === bucket && !keep.some((k) => k.opportunityId === p.opportunityId),
              );
              chosen.splice(
                0,
                chosen.length,
                ...chosen.filter((p) => p.bucket !== bucket),
                ...[...keep, ...fill].slice(0, counts[bucket]).map((p, rank) => ({ ...p, bucket, rank })),
              );
            }
          // Preserving a different bucket must not reintroduce a second outside-interest pick.
          const outside=chosen.filter(p=>{const o=opps.find(o=>o.id===p.opportunityId)!,fit=scoreOpportunity(o,ctx,freeMin);return !fit.excluded&&outsideInterest(o,fit);});
          const keepOutside=outside.find(p=>valid.some(v=>v.opportunityId===p.opportunityId))||outside[0];
          chosen.splice(0,chosen.length,...chosen.filter(p=>!outside.some(x=>x.opportunityId===p.opportunityId)||p===keepOutside));
          const missing={free:counts.free-chosen.filter(p=>p.bucket==='free').length,paid:counts.paid-chosen.filter(p=>p.bucket==='paid').length};
          const refill=selectPicks(opps,ctx,freeMin,new Set([...excluded,...chosen.map(p=>p.opportunityId)]),missing,[],[],0,today);
          for(const p of refill)chosen.push({...p,rank:chosen.filter(x=>x.bucket===p.bucket).length});
          // Never allow multiple stretch badges after preserving/refilling picks.
          const stretch =
            setting('STRETCH_PICKS', 1, 1) > 0
              ? selectPicks(
                  opps.filter((o) => chosen.some((p) => p.opportunityId === o.id)),
                  ctx,
                  freeMin,
                  excluded,
                  counts,
                  [],
                  [],
                  1,
                ).find((p) => p.isStretch)
              : undefined;
          for (const p of chosen) p.isStretch = p.opportunityId === stretch?.opportunityId;
          await tx.studentPick.deleteMany({ where: { studentId } });
          const cycle = new Date().toISOString().slice(0, 7);
          if (chosen.length)
            await tx.studentPick.createMany({
              data: chosen.map((p) => ({
                studentId,
                opportunityId: p.opportunityId,
                bucket: p.bucket,
                rank: p.rank,
                isStretch: p.isStretch,
                pickedAt:
                  previous.find((old) => old.opportunityId === p.opportunityId)?.pickedAt || new Date(),
                refreshCycle: cycle,
                scoreBreakdown:JSON.stringify((()=>{const fit=scoreOpportunity(opps.find(o=>o.id===p.opportunityId)!,ctx,freeMin);return !fit.excluded&&'breakdown' in fit?fit.breakdown:{};})()),
              })),
            });
          return chosen;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return picks.map((p) => {
        const o = opps.find((o) => o.id === p.opportunityId)!;
        return {
          ...o,
          ...p,
          verified: o.verificationStatus === 'verified' && !!o.sourceCheckedAt,
          costLabel: costLabel(o),
          countdown: countdown(o.deadline,today),
          status: null,
          fit: scoreOpportunity(o, ctx, freeMin),
        };
      });
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
