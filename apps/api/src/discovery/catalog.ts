import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { loadContext } from '../lib/context.js';
import { toOpp } from '../lib/picks.js';
import { env } from '../lib/env.js';
import { addDays, dkey, sod, wallNow } from '../domain/time.js';
import { dayCapacity } from '../domain/schedule.js';
import { activeOpportunity } from '../domain/opportunity-active.js';
import { planCatalogSearch } from '../domain/catalog-coverage.js';
import { setting } from './config.js';

type CatalogDb = Pick<Prisma.TransactionClient, 'student'|'event'|'goal'|'opportunity'|'savedOpportunity'|'opportunityFeedback'>;
export async function catalogCoverage(studentId: string, now = new Date(), db: CatalogDb = prisma) {
  const { ctx, events, rules } = await loadContext(studentId, db);
  const today = dkey(wallNow(ctx.timezone || 'UTC', now));
  let free = 0;
  for (let d = 0; d < 7; d++) free += dayCapacity(events, rules, addDays(sod(wallNow(ctx.timezone || 'UTC', now)), d)).available;
  const [opportunities, saved, feedback] = await Promise.all([
    db.opportunity.findMany({ where: env.demoMode ? {} : { isSample: false, source: { not: 'seed' } } }),
    db.savedOpportunity.findMany({ where: { studentId } }),
    db.opportunityFeedback.findMany({ where: { studentId } }),
  ]);
  const active = opportunities.map(toOpp).filter(o => env.demoMode && o.isSample || activeOpportunity(o, today, now));
  return planCatalogSearch(active, ctx, free, new Set([...saved, ...feedback].map(s => s.opportunityId)), {
    free: setting('FREE_PICKS', 3, 3), paid: setting('PAID_PICKS', 3, 3),
  });
}
export const publicCatalogCoverage = (coverage: Awaited<ReturnType<typeof catalogCoverage>>) => ({
  complete: coverage.complete, free: coverage.free, paid: coverage.paid, missingInterests: coverage.missingInterests,
});
