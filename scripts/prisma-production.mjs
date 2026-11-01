import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const schema = 'apps/api/prisma/postgresql/schema.prisma';
export function prisma(args) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Keep the portable data model in one source; migration SQL is versioned separately.
const source = readFileSync(new URL('../apps/api/prisma/schema.prisma', import.meta.url), 'utf8');
writeFileSync(new URL('../' + schema, import.meta.url), source.replace('provider = "sqlite"', 'provider = "postgresql"'));
if (process.argv[1] === fileURLToPath(import.meta.url)) prisma(['generate', '--schema', schema]);
