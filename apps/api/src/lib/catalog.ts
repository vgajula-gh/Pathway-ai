import {seedGrowthCatalog} from '../growth-map/seed.js';
import { prisma } from './db.js';
import { seedCostType } from '../domain/picks.js';
import { OPPORTUNITIES } from '../data/opportunities.js';
import { NEWS_SEED } from '../data/news.js';
import { env } from './env.js';
// Preserve the existing catalogue on new databases without overwriting edits.
// No demo students or personal data are created.
export async function seedCatalog() {
  await seedGrowthCatalog();
  for (const o of env.demoMode ? OPPORTUNITIES : []) {
    const data = { costType: seedCostType(o.cost), officialDomain: new URL(o.url).hostname, name: o.name, organizer: o.organizer, category: o.category, url: o.url, gradeMin: o.gradeMin, gradeMax: o.gradeMax, minAge: o.minAge ?? null, format: o.format, cost: o.cost, commitment: o.commitment, skills: JSON.stringify(o.skills), tags: JSON.stringify(o.tags), checks: JSON.stringify(o.checks), deadline: null, sourceCheckedAt: null, isSample: true };
    await prisma.opportunity.upsert({ where: { id: o.id }, update: {}, create: { id: o.id, ...data } });
  }
  for (const n of NEWS_SEED) await prisma.newsStory.upsert({ where: { id: n.id }, update: {}, create: n });
}
