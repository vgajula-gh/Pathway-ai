import { describe, expect, it } from 'vitest';
import { configureLocalAI, useOllama } from '../../../scripts/ai-setup.mjs';

describe('Codespaces local AI setup', () => {
  it('defaults to on and supports opting out', () => {
    expect(useOllama()).toBe(true); expect(useOllama('false')).toBe(false); expect(useOllama('OFF')).toBe(false);
  });
  it('configures a generated env without touching credentials or unrelated settings', () => {
    const source = 'LLM_PROVIDER=anthropic\nAI_DISABLED=true\nANTHROPIC_API_KEY=keep-me\nPORT=8787\n';
    const result = configureLocalAI(source);
    expect(result).toContain('LLM_PROVIDER=ollama'); expect(result).toContain('AI_DISABLED=false');
    expect(result).toContain('OLLAMA_BASE_URL=http://localhost:11434/v1'); expect(result).toContain('OLLAMA_MODEL=llama3.2:3b');
    expect(result).toContain('ANTHROPIC_API_KEY=keep-me'); expect(result).toContain('PORT=8787');
    expect(configureLocalAI(result)).toBe(result);
  });
  it('supports a chosen model and rejects newlines in it', () => {
    expect(configureLocalAI('', 'custom-model')).toContain('OLLAMA_MODEL=custom-model');
    expect(() => configureLocalAI('', 'bad\nAI_DISABLED=true')).toThrow();
  });
});

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

it('setup generates local defaults only for a new env and preserves an existing env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pathway-setup-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    for (const file of ['setup.mjs', 'ai-setup.mjs']) copyFileSync(resolve('../../scripts', file), join(dir, 'scripts', file));
    writeFileSync(join(dir, '.env.example'), 'LLM_PROVIDER=anthropic\nAI_DISABLED=true\n');
    // Stub only package installation/database setup; run the real env generation.
    writeFileSync(join(dir, 'npm-stub.mjs'), ''); writeFileSync(join(dir, 'scripts/setup-db.mjs'), '');
    const env = { ...process.env, USE_OLLAMA: 'true', npm_execpath: join(dir, 'npm-stub.mjs') };
    const run = () => spawnSync(process.execPath, [join(dir, 'scripts/setup.mjs')], { env, encoding: 'utf8' });
    expect(run().status).toBe(0);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('LLM_PROVIDER=ollama');
    const existing = 'LLM_PROVIDER=openai\nOPENAI_API_KEY=synthetic-test-value\n';
    writeFileSync(join(dir, '.env'), existing); expect(run().status).toBe(0);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(existing);
    rmSync(join(dir, '.env')); env.USE_OLLAMA = 'false'; expect(run().status).toBe(0);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(readFileSync(join(dir, '.env.example'), 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
