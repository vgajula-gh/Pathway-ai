import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ create: vi.fn(), options: [] as any[] }));
vi.mock('openai', () => {
  class APIError extends Error { constructor(public status: number) { super('JSON mode unsupported'); } }
  class Client {
    static APIError = APIError;
    chat = { completions: { create: sdk.create } };
    constructor(options: any) { sdk.options.push(options); }
  }
  return { default: Client };
});
import OpenAI from 'openai';
import { ollamaLLM } from '../src/agent/llm/ollama.js';
import { openaiLLM } from '../src/agent/llm/openai.js';
const response = (content: string | null, tool_calls?: unknown[]) => ({ choices: [{ message: { content, tool_calls } }] });
const call = (arguments_: string) => ({ id: 'call-1', type: 'function', function: { name: 'propose_actions', arguments: arguments_ } });
beforeEach(() => { sdk.create.mockReset(); sdk.options.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('Ollama provider', () => {
  it('uses local URL with no auth header, a longer timeout, and compatible token limits', async () => {
    const llm = ollamaLLM('http://localhost:11434/v1', 'llama3.2:3b');
    sdk.create.mockResolvedValue(response('Hello'));
    expect(llm.provider).toBe('ollama'); expect(await llm.text('System', 'Hi')).toBe('Hello');
    expect(sdk.options[0]).toMatchObject({ baseURL: 'http://localhost:11434/v1', defaultHeaders: { Authorization: null }, timeout: 900000, maxRetries: 0 });
    expect(sdk.create.mock.calls[0][0]).toMatchObject({ max_tokens: 900 });
    expect(sdk.create.mock.calls[0][0]).not.toHaveProperty('max_completion_tokens');
  });
  it.each(['{bad', 'null', '[]', '"text"', ''])('rejects invalid arguments %s without executing a tool', async args => {
    const llm = ollamaLLM('http://localhost:11434/v1', 'model'), exec = vi.fn();
    sdk.create.mockResolvedValueOnce(response(null, [call(args)])).mockResolvedValueOnce(response('Please try again'));
    await llm.runTools({ system: '', history: [], tools: [], maxRounds: 2, exec });
    expect(exec).not.toHaveBeenCalled();
    expect(sdk.create.mock.calls[1][0].messages.at(-1).content).toContain('Invalid tool-call JSON');
  });
  it('executes valid arguments through the existing tool boundary', async () => {
    const exec = vi.fn().mockResolvedValue({ content: 'Waiting for approval' });
    sdk.create.mockResolvedValueOnce(response(null, [call('{"actions":[]}')])).mockResolvedValueOnce(response('Review your proposal'));
    await ollamaLLM('http://localhost:11434/v1', 'model').runTools({ system: '', history: [], tools: [], maxRounds: 2, exec });
    expect(exec).toHaveBeenCalledWith('propose_actions', { actions: [] });
  });
  it('retries unsupported JSON mode as plain text and parses fences/prose', async () => {
    sdk.create.mockRejectedValueOnce(new (OpenAI.APIError as any)(400)).mockResolvedValueOnce(response('Here it is: ```json\n{"events":[]}\n```'));
    expect(await ollamaLLM('http://localhost:11434/v1', 'model').json('', '')).toEqual({ events: [] });
    expect(sdk.create.mock.calls[0][0]).toHaveProperty('response_format');
    expect(sdk.create.mock.calls[1][0]).not.toHaveProperty('response_format');
  });
  it('retries unreadable JSON output once, but never retries an outage', async () => {
    sdk.create.mockResolvedValueOnce(response('not JSON')).mockResolvedValueOnce(response('{"ok":true}'));
    expect(await ollamaLLM('http://localhost:11434/v1', 'model').json('', '')).toEqual({ ok: true });
    sdk.create.mockReset(); sdk.create.mockRejectedValueOnce(new Error('Connection failed'));
    await expect(ollamaLLM('http://localhost:11434/v1', 'model').json('', '')).rejects.toThrow('Connection failed');
    expect(sdk.create).toHaveBeenCalledOnce();
  });
  it('keeps hosted OpenAI configuration and error behavior', async () => {
    sdk.create.mockRejectedValueOnce(new (OpenAI.APIError as any)(400));
    await expect(openaiLLM('hosted-key', 'model').json('', '')).rejects.toThrow();
    expect(sdk.options[0]).toMatchObject({ apiKey: 'hosted-key' }); expect(sdk.options[0]).not.toHaveProperty('defaultHeaders');
    expect(sdk.create.mock.calls[0][0]).toHaveProperty('max_completion_tokens'); expect(sdk.create).toHaveBeenCalledOnce();
  });
  it('enables Ollama without keys but honors the server disable switch', async () => {
    vi.stubEnv('LLM_PROVIDER', 'ollama'); vi.stubEnv('AI_DISABLED', 'false');
    vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { env } = await import('../src/lib/env.js');
    expect(env.aiDisabled).toBe(false); expect(env.ollamaBaseURL).toBe('http://localhost:11434/v1'); expect(env.ollamaModel).toBe('llama3.2:3b');
    const { getLLM } = await import('../src/agent/llm/index.js'); expect(getLLM()?.provider).toBe('ollama');
    vi.resetModules(); vi.stubEnv('AI_DISABLED', 'true');
    expect((await import('../src/agent/llm/index.js')).getLLM()).toBeNull();
  });
});
