import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Prisma resolves relative SQLite paths against the schema directory.
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('Development setup requires a SQLite DATABASE_URL (file:...).');
const db = resolve('apps/api/prisma', url.slice(5).split('?')[0]);
if (!existsSync(db)) {
  mkdirSync(dirname(db), { recursive: true });
  closeSync(openSync(db, 'wx'));
}

for (const script of ['db:setup', 'db:demo']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
