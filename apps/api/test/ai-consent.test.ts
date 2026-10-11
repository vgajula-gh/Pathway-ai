import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ consent: false, runBuddy: vi.fn().mockResolvedValue({ reply: 'Hi' }) }));
vi.mock('../src/lib/auth.js', () => ({
  requireStudent: async () => ({ id: 'demo', aiConsent: state.consent }),
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } }
}));
vi.mock('../src/agent/buddy.js', () => ({ runBuddy: state.runBuddy, serializeMessage: vi.fn() }));
import routes from '../src/routes/ai.js';
afterEach(() => { state.consent = false; vi.clearAllMocks(); });
describe('student AI toggle', () => {
  it('blocks new Buddy requests while off and permits them after turning on', async () => {
    const app = Fastify(); await app.register(routes);
    try {
      const off = await app.inject({ method: 'POST', url: '/api/buddy/messages', payload: { text: 'Hi' } });
      expect(off.statusCode).toBe(403); expect(state.runBuddy).not.toHaveBeenCalled();
      state.consent = true;
      const on = await app.inject({ method: 'POST', url: '/api/buddy/messages', payload: { text: 'Hi' } });
      expect(on.statusCode).toBe(200); expect(state.runBuddy).toHaveBeenCalledOnce();
      state.consent = false;
      expect((await app.inject({ method: 'POST', url: '/api/buddy/messages', payload: { text: 'Hi' } })).statusCode).toBe(403);
      expect(state.runBuddy).toHaveBeenCalledOnce();
    } finally { await app.close(); }
  });
});
