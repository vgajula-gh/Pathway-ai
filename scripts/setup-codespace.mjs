import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setupOllama } from './ollama.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
process.env.USE_OLLAMA ??= 'true';
await setupOllama();
const result = spawnSync('npm', ['run', 'setup'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
