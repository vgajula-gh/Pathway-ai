import { prisma } from '../src/lib/db.js';
import { seedCatalog } from '../src/lib/catalog.js';
import { env } from '../src/lib/env.js';
try {
  await seedCatalog();
  console.log(env.demoMode ? 'Sourced news and labeled sample opportunities are ready.' : 'Sourced news is ready. Sample opportunities are disabled.');
} finally { await prisma.$disconnect(); }
