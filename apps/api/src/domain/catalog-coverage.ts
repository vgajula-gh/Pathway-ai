import { interestGroups, normalizeTopic } from '../discovery/groups.js';
import { bucketFor, type Bucket, type PickOpportunity } from './picks.js';
import { scoreOpportunity } from './scoring.js';
import type { StudentContext } from './types.js';

/** Inputs have already passed source freshness and active checks. No model decides coverage. */
export function planCatalogSearch(
  opportunities: PickOpportunity[], student: StudentContext, freeMinutes: number,
  excluded: Set<string>, targets = { free: 3, paid: 3 },
) {
  // Check every selected interest; retain the five-group spending bound per request.
  const groups = interestGroups(student, 20);
  const candidates = opportunities.filter(o => !excluded.has(o.id)).flatMap(o => {
    const fit = scoreOpportunity(o, student, freeMinutes);
    return !fit.excluded && fit.score >= 0.38 && fit.matched.length
      ? [{ id: o.id, bucket: bucketFor(o), interests: fit.matched.map(normalizeTopic) }] : [];
  });
  const enabled = (['free', 'paid'] as const).filter(b => targets[b] > 0);
  const counts = { free: candidates.filter(c => c.bucket === 'free').length, paid: candidates.filter(c => c.bucket === 'paid').length };
  const shortBuckets = enabled.filter(b => counts[b] < targets[b]);
  const missing = enabled.length ? groups.filter(g => !candidates.some(c => c.interests.includes(g.topic))) : [];
  const planned = new Map<string, { group: typeof groups[number]; buckets: Bucket[] }>();
  const add = (group: typeof groups[number], buckets: Bucket[]) => {
    const old = planned.get(group.key);
    planned.set(group.key, { group, buckets: [...new Set([...(old?.buckets || []), ...buckets])] });
  };
  // First cover absent interests. Keep already-covered interests out of this web search.
  if (missing.length) for (const group of missing) add(group, shortBuckets.length ? shortBuckets : enabled);
  else for (const bucket of shortBuckets) {
    const coverage = groups.map(group => ({ group, count: candidates.filter(c => c.bucket === bucket && c.interests.includes(group.topic)).length }));
    const least = Math.min(...coverage.map(c => c.count));
    const needed = targets[bucket] - counts[bucket];
    for (const { group } of coverage.filter(c => c.count === least).slice(0, needed)) add(group, [bucket]);
  }
  return {
    complete: groups.length > 0 && !shortBuckets.length && !missing.length,
    free: counts.free, paid: counts.paid,
    missingInterests: missing.map(g => g.topic), shortBuckets,
    groups: [...planned.values()].slice(0, 5),
  };
}
