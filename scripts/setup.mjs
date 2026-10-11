import { copyFileSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { configureLocalAI, useOllama } from './ai-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');

try {
  copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL);
  if (process.env.USE_OLLAMA !== undefined && useOllama(process.env.USE_OLLAMA)) {
    writeFileSync('.env', configureLocalAI(readFileSync('.env', 'utf8'), process.env.OLLAMA_MODEL));
    console.log('Configured local AI in the new .env (no API key needed).');
  }
  console.log('Created .env from .env.example.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping existing .env.');
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// npm supplies its CLI path on every supported platform, including Windows.
if (!process.env.npm_execpath) throw new Error('Run this script with npm run setup.');
run([process.env.npm_execpath, 'install']);
run(['--env-file=.env', 'scripts/setup-db.mjs']);
console.log('Setup complete. Run npm run dev, then open port 5173.');
