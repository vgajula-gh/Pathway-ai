import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const commands = vi.hoisted(() => ({ sync: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: commands.sync, spawn: commands.spawn }));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), openSync: () => 99, closeSync: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }));
import { setupOllama, startOllama } from '../../../scripts/ollama.mjs';
beforeEach(() => {
  commands.sync.mockReset().mockReturnValue({ status: 0 }); commands.spawn.mockReset().mockReturnValue({ on: vi.fn(), unref: vi.fn() });
  vi.stubEnv('USE_OLLAMA', 'true'); vi.stubEnv('OLLAMA_MODEL', 'llama3.2:3b');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Ollama lifecycle', () => {
  it('skips installation, service startup, and downloads when opted out', async () => {
    vi.stubEnv('USE_OLLAMA', 'false'); await setupOllama(); await startOllama();
    expect(commands.sync).not.toHaveBeenCalled(); expect(commands.spawn).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('reuses a running service and downloads the configured model', async () => {
    await setupOllama(); expect(commands.spawn).not.toHaveBeenCalled();
    expect(commands.sync).toHaveBeenCalledWith('ollama', ['pull', 'llama3.2:3b'], expect.objectContaining({ env: expect.objectContaining({ OLLAMA_HOST: '127.0.0.1:11434' }) }));
  });
  it('installs if missing and starts a detached loopback-only service', async () => {
    commands.sync.mockReturnValueOnce({ status: 1 }).mockReturnValue({ status: 0 });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response).mockResolvedValue({ ok: true } as Response);
    await setupOllama();
    expect(commands.sync).toHaveBeenCalledWith('sh', expect.arrayContaining(['-c', expect.stringContaining('https://ollama.com/install.sh')]), expect.anything());
    expect(commands.spawn).toHaveBeenCalledWith('ollama', ['serve'], expect.objectContaining({ detached: true, env: expect.objectContaining({ OLLAMA_HOST: '127.0.0.1:11434' }) }));
  });
  it('installs missing zstd before the official Ollama installer', async () => {
    commands.sync.mockImplementation((command, args) => ({ status: command === 'zstd' || (command === 'ollama' && args[0] === '--version') ? 1 : 0 }));
    await setupOllama();
    const calls = commands.sync.mock.calls;
    const dependency = calls.findIndex(([command, args]) => ['sudo', 'apt-get'].includes(command) && args.includes('zstd'));
    const installer = calls.findIndex(([command]) => command === 'sh');
    expect(dependency).toBeGreaterThan(-1); expect(dependency).toBeLessThan(installer);
  });
  it('explains how to install zstd if package installation fails', async () => {
    commands.sync.mockImplementation((command) => ({ status: ['ollama', 'zstd', 'sudo', 'apt-get'].includes(command) ? 1 : 0 }));
    await expect(setupOllama()).rejects.toThrow('sudo apt-get install -y zstd');
    expect(commands.sync.mock.calls.some(([command]) => command === 'sh')).toBe(false);
  });
  it('reports failed model downloads with an actionable retry', async () => {
    commands.sync.mockImplementation((command, args) => ({ status: args[0] === 'pull' ? 1 : 0 }));
    await expect(setupOllama()).rejects.toThrow('Retry npm run ollama:setup');
  });
});
