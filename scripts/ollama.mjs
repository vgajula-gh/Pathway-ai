import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { useOllama, DEFAULT_OLLAMA_MODEL } from './ai-setup.mjs';

// Ollama binds to loopback only. Never forward 11434 from Codespaces.
const localEnv = { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' };
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: localEnv });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed. Retry npm run ollama:setup or set USE_OLLAMA=false to skip local AI.`);
}
async function ready() {
  try { return (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
}
export async function startOllama() {
  if (!useOllama(process.env.USE_OLLAMA)) { console.log('Local AI skipped (USE_OLLAMA=false).'); return; }
  if (await ready()) return;
  if (spawnSync('ollama', ['--version'], { stdio: 'ignore' }).status !== 0) throw new Error('Ollama is missing. Run npm run ollama:setup.');
  const logDir = join(homedir(), '.ollama'); mkdirSync(logDir, { recursive: true });
  const fd = openSync(join(logDir, 'pathway-server.log'), 'a');
  const child = spawn('ollama', ['serve'], { env: localEnv, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  let spawnError; child.on('error', error => { spawnError = error; }); child.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnError) throw spawnError;
    if (await ready()) { console.log('Ollama is running privately on port 11434.'); return; }
    await setTimeout(1000);
  }
  throw new Error('Ollama did not start. Check ~/.ollama/pathway-server.log and retry npm run ollama:start.');
}
export async function setupOllama() {
  if (!useOllama(process.env.USE_OLLAMA)) { console.log('Local AI skipped (USE_OLLAMA=false).'); return; }
  if (spawnSync('ollama', ['--version'], { stdio: 'ignore' }).status !== 0) {
    if (spawnSync('zstd', ['--version'], { stdio: 'ignore' }).status !== 0) {
      // The official installer extracts a .tar.zst archive on Debian Codespaces.
      const asRoot = process.getuid?.() === 0;
      const install = args => run(asRoot ? 'apt-get' : 'sudo', asRoot ? args : ['-n', 'apt-get', ...args]);
      try {
        install(['update']);
        install(['install', '-y', 'zstd']);
      } catch (error) {
        throw new Error('Ollama needs zstd. Run sudo apt-get update && sudo apt-get install -y zstd, then retry npm run ollama:setup.', { cause: error });
      }
    }
    // Official Linux installer, downloaded over HTTPS with normal TLS verification.
    run('sh', ['-c', 'installer=$(mktemp); trap \'rm -f "$installer"\' EXIT; curl --fail --show-error --silent --location https://ollama.com/install.sh -o "$installer" && sh "$installer"']);
  }
  await startOllama();
  run('ollama', ['pull', process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL]);
}
