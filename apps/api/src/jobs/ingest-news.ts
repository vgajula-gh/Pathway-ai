import { prisma } from '../lib/db.js';
import { configuredSources } from '../news/sources.js';
import { ingestNews } from '../news/ingest.js';
try {
  if (process.argv.slice(2).some(x => x !== '--dry-run')) throw new Error('Usage: news:ingest [--dry-run]');
  const result = await ingestNews(prisma, configuredSources(process.env.NEWS_SOURCE_IDS), { dryRun: process.argv.includes('--dry-run') });
  console.log(JSON.stringify(result));
  if (result.status !== 'ok') process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'News job failed'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
