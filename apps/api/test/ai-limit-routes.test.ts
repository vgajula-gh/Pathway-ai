import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ reserve: vi.fn(), model: { text: vi.fn(), json: vi.fn() }, buddy: vi.fn() }));
vi.mock('../src/lib/auth.js', () => ({
  requireStudent: async () => ({ id: 'student', aiConsent: true }),
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } }
}));
vi.mock('../src/lib/ai-limits.js', () => ({ reserveAI: state.reserve }));
vi.mock('../src/agent/buddy.js', () => ({ runBuddy: state.buddy, serializeMessage: vi.fn() }));
vi.mock('../src/agent/llm/index.js', () => ({ getLLM: () => state.model, requireLLM: () => state.model, askJSON: state.model.json }));
vi.mock('../src/lib/context.js', () => ({ loadContext: async () => ({ events: [], rules: {}, milestones: [], goals: [] }) }));
import ai from '../src/routes/ai.js';
import today from '../src/routes/today.js';
import { HttpError } from '../src/lib/auth.js';
afterEach(() => vi.clearAllMocks());
it('blocks all four AI features at the cap while deterministic resources remain available', async () => {
  state.reserve.mockRejectedValue(new HttpError(429, 'You’ve reached your AI limit for today. Come back tomorrow.'));
  const app = Fastify(); await app.register(multipart); await app.register(ai); await app.register(today);
  try {
    for (const [url, payload] of [
      ['/api/buddy/messages', { text: 'Hello' }], ['/api/extract', { text: 'Schedule' }],
      ['/api/coach', { question: 'Help' }], ['/api/today/insight', {}]
    ] as const) {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(429); expect(res.json().message).toContain('tomorrow');
    }
    expect(state.buddy).not.toHaveBeenCalled(); expect(state.model.text).not.toHaveBeenCalled(); expect(state.model.json).not.toHaveBeenCalled();
    expect((await app.inject('/api/resources')).statusCode).toBe(200);
  } finally { await app.close(); }
});
