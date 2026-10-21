import { PrismaClient } from '@prisma/client';
import { OPPORTUNITIES } from '../src/data/opportunities.js';
const prisma = new PrismaClient();
for (const o of OPPORTUNITIES) {
  const data = { name: o.name, organizer: o.organizer, category: o.category, url: o.url, gradeMin: o.gradeMin, gradeMax: o.gradeMax, minAge: o.minAge ?? null, format: o.format, cost: o.cost, commitment: o.commitment, skills: JSON.stringify(o.skills), tags: JSON.stringify(o.tags), checks: JSON.stringify(o.checks), deadline: null, sourceCheckedAt: null, isSample: true };
  await prisma.opportunity.upsert({ where: { id: o.id }, update: data, create: { id: o.id, ...data } });
}
console.log(`Seeded ${OPPORTUNITIES.length} sample opportunities (unverified).`);
// News is populated only by the ingestion job; historical fixtures are never seeded as live news.
await prisma.$disconnect();

