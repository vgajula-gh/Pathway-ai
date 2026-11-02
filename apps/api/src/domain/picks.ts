import { Opp, scoreOpportunity } from './scoring.js';
import { StudentContext } from './types.js';
export type Bucket = 'free' | 'paid';
export type PickOpportunity = Opp & { costType: string; costVerifiedAt?: Date | null; feeFlag: boolean; deadline?:string|null };
export function seedCostType(cost: string): string {
  return /^free(?:\s|$|\()/i.test(cost) ? 'free' : /fees?|dues|\$\d/i.test(cost) ? 'paid' : 'unknown';
}
// A seed's label is not evidence. Only a checked official cost fact earns Free.
export function bucketFor(o: Pick<PickOpportunity, 'costType' | 'costVerifiedAt'>): Bucket {
  return o.costType === 'free' && o.costVerifiedAt ? 'free' : 'paid';
}
export const costLabel = (o: PickOpportunity & { costAmount?: string | null }) =>
  bucketFor(o) === 'free'
    ? 'Free'
    : o.costType === 'paid'
      ? o.costAmount || o.cost
      : 'Cost not confirmed — check the official site';
const typeKey = (c: string) =>
  /competition|research/i.test(c)
    ? 'competition'
    : /summer|program/i.test(c)
      ? 'program'
      : /volunteer|club|leadership/i.test(c)
        ? 'community'
        : /scholar|intern/i.test(c)
          ? 'scholarship'
          : c.toLowerCase();
export function selectPicks(
  opps: PickOpportunity[],
  student: StudentContext,
  freeMin: number,
  excluded: Set<string>,
  counts = { free: 3, paid: 3 },
  previous: string[] = [],
  reasons: string[] = [],
  stretches = 1,
  today = new Date().toISOString().slice(0,10),
) {
  const candidates = opps
    .filter((o) => !excluded.has(o.id) && !['expired', 'stale'].includes(o.verificationStatus || ''))
    .flatMap((o) => {
      const fit = scoreOpportunity(o, student, freeMin);
      if (fit.excluded) return [];
      const penalty =
        (reasons.includes('too much time') && /^high/i.test(o.commitment) ? 0.2 : 0) +
        (reasons.includes('cost') && bucketFor(o) === 'paid' ? 0.15 : 0);
      return [{ o, fit, score: fit.score - penalty + (previous.includes(o.id) ? 0.015 : 0) }];
    });
  const selected: { opportunityId: string; bucket: Bucket; rank: number; isStretch: boolean }[] = [];
  const used = new Set<string>(),
    types = new Set<string>(),
    efforts = new Set<string>();
  for (const bucket of ['free', 'paid'] as const)
    for (let rank = 0; rank < counts[bucket]; rank++) {
      const choice = candidates
        .filter((c) => bucketFor(c.o) === bucket && !used.has(c.o.id))
        .sort((a, b) => {
          const quality = (c: typeof a) =>
            c.score +
            (!types.has(typeKey(c.o.category)) ? 0.12 : 0) +
            (!efforts.has(c.o.commitment.split(':')[0]) ? 0.04 : 0);
          const urgency=(c:typeof a)=>{const days=c.o.deadline?Math.round((Date.parse(c.o.deadline)-Date.parse(today))/86400000):Infinity;return days<7?-0.06:Number.isFinite(days)?0.05/(1+days/30):0;};
          return (quality(b)+urgency(b)) - (quality(a)+urgency(a)) || (a.o.deadline||'9999').localeCompare(b.o.deadline||'9999') || a.o.id.localeCompare(b.o.id);
        })[0];
      if (!choice) break;
      selected.push({ opportunityId: choice.o.id, bucket, rank, isStretch: false });
      used.add(choice.o.id);
      types.add(typeKey(choice.o.category));
      efforts.add(choice.o.commitment.split(':')[0]);
    }
  const stretch = candidates
    .filter((c) => !c.o.feeFlag && !c.fit.matched.length && c.fit.eligibility.status === 'eligible')
    .sort((a, b) => b.score - a.score || a.o.id.localeCompare(b.o.id))
    .find((c) => selected.some((p) => p.bucket === bucketFor(c.o)));
  if (stretch && stretches > 0) {
    const existing = selected.find((p) => p.opportunityId === stretch.o.id);
    if (existing) existing.isStretch = true;
    else {
      const slot = [...selected].reverse().find((p) => p.bucket === bucketFor(stretch.o));
      if (slot) {
        slot.opportunityId = stretch.o.id;
        slot.isStretch = true;
      }
    }
  }
  return selected;
}
