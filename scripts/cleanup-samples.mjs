import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const value = process.env.DATABASE_URL;
if (!value) throw new Error('Set DATABASE_URL for the database you intend to inspect.');
const postgres = /^postgres(?:ql)?:\/\//.test(value);
if (!postgres && !value.startsWith('file:')) throw new Error('Use a PostgreSQL or SQLite DATABASE_URL.');
const target = postgres ? new URL(value) : null;
console.log('Database target:', target ? target.hostname + ':' + (target.port || '5432') + target.pathname : value.split('?')[0]);
const generation = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate', '--schema', postgres ? 'apps/api/prisma/postgresql/schema.prisma' : 'apps/api/prisma/schema.prisma'], { stdio: 'inherit', env: process.env });
if (generation.status !== 0) process.exit(generation.status || 1);
const { prisma } = await import('../apps/api/src/lib/db.ts');
try {
  const { cleanupSamples } = await import('../apps/api/src/lib/cleanup-samples.ts');
  const report = await cleanupSamples({ apply: process.argv.includes('--apply') });
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
  if (!process.argv.includes('--apply')) console.log('Preview only. After checking the database target, use npm run cleanup:samples -- --apply to remove eligible sample records.');
} catch { console.error('Sample cleanup could not finish. Check the database target and vector-store configuration.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
