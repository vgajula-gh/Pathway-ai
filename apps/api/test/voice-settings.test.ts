import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
const state = vi.hoisted(() => ({ student: { id: 'student', settings: '{}', provenance: '{}' }, update: vi.fn(), audit: vi.fn() }));
vi.mock('../src/lib/db.js', () => ({ j: (s: string, fallback: unknown) => s ? JSON.parse(s) : fallback, prisma: { student: { update: state.update } } }));
vi.mock('../src/lib/auth.js', () => ({ requireStudent: async () => state.student }));
vi.mock('../src/lib/audit.js', () => ({ audit: state.audit }));
import routes, { serializeStudent } from '../src/routes/students.js';
afterEach(() => { state.student.settings = '{}'; vi.clearAllMocks(); });
describe('student Voice preference', () => {
  it('defaults to off for existing students and returns saved values', () => {
    expect(serializeStudent(state.student).settings.voice).toBe(false);
    expect(serializeStudent({ ...state.student, settings: '{"voice":true}' }).settings.voice).toBe(true);
  });
  it('merges the boolean preference without losing other settings and audits the change', async () => {
    const app = Fastify(); await app.register(routes);
    state.student.settings = '{"theme":"light","showNews":false}';
    state.update.mockImplementation(async ({ data }) => { state.student.settings = data.settings; });
    try {
      const response = await app.inject({ method: 'PATCH', url: '/api/me', payload: { settings: { voice: true } } });
      expect(response.statusCode).toBe(200);
      expect(response.json().settings).toMatchObject({ voice: true, theme: 'light', showNews: false });
      expect(state.audit).toHaveBeenCalledWith('student', 'student', 'Turned on Voice');
    } finally { await app.close(); }
  });
  it('rejects non-boolean preferences before writing', async () => {
    const app = Fastify(); await app.register(routes);
    try {
      const response = await app.inject({ method: 'PATCH', url: '/api/me', payload: { settings: { voice: 'yes' } } });
      expect(response.statusCode).toBeGreaterThanOrEqual(400); expect(state.update).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
