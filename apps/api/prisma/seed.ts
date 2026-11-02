import { PrismaClient } from '@prisma/client';
import {seedCostType} from '../src/domain/picks.js';
import { OPPORTUNITIES } from '../src/data/opportunities.js';
import { NEWS_SEED } from '../src/data/news.js';
const prisma = new PrismaClient();
for (const o of OPPORTUNITIES) {
  const data = {costType:seedCostType(o.cost),officialDomain:new URL(o.url).hostname, name: o.name, organizer: o.organizer, category: o.category, url: o.url, gradeMin: o.gradeMin, gradeMax: o.gradeMax, minAge: o.minAge ?? null, format: o.format, cost: o.cost, commitment: o.commitment, skills: JSON.stringify(o.skills), tags: JSON.stringify(o.tags), checks: JSON.stringify(o.checks), deadline: null, sourceCheckedAt: null, isSample: true };
  await prisma.opportunity.upsert({ where: { id: o.id }, update: {}, create: { id: o.id, ...data } });
}
console.log(`Seeded ${OPPORTUNITIES.length} sample opportunities (unverified).`);
for (const n of NEWS_SEED) await prisma.newsStory.upsert({ where: { id: n.id }, update: n, create: n });
console.log(`Seeded ${NEWS_SEED.length} sourced news stories.`);
await prisma.$disconnect();
