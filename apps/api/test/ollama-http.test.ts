import { afterEach, expect, it, vi } from 'vitest';
import { ollamaLLM } from '../src/agent/llm/ollama.js';
afterEach(() => vi.unstubAllGlobals());
it('sends an OpenAI-compatible local request without any Authorization header', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Hi from local AI' } }] }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  expect(await ollamaLLM('http://localhost:11434/v1', 'llama3.2:3b').text('System', 'Hi')).toBe('Hi from local AI');
  const [url, request] = fetch.mock.calls[0];
  expect(String(url)).toBe('http://localhost:11434/v1/chat/completions');
  expect(new Headers(request.headers).has('authorization')).toBe(false);
  expect(JSON.parse(request.body)).toMatchObject({ model: 'llama3.2:3b', max_tokens: 900 });
});
