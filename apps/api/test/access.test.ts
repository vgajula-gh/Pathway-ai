import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { accessRoutes } from '../src/lib/access.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/db.js';
import students from '../src/routes/students.js';
import { requireStudent } from '../src/lib/auth.js';

const originalCodes = env.accessCodes;
afterEach(() => { env.accessCodes = originalCodes; vi.restoreAllMocks(); });
describe('tester access', () => {
  it('blocks APIs before a valid code, permits config and rejects unknown codes', async () => {
    env.accessCodes = ['tester-one', 'tester-two'];
    const app = Fastify(); await accessRoutes(app);
    app.get('/api/private', async () => ({ ok: true }));
    try {
      expect((await app.inject('/api/config')).json().accessRequired).toBe(true);
      expect((await app.inject('/api/private')).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/access', payload: { code: 'wrong' } })).statusCode).toBe(401);
      for (const code of env.accessCodes) expect((await app.inject({ url: '/api/private', headers: { 'x-access-code': code } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  it('records the code at onboarding and binds subsequent student access to it', async () => {
    env.accessCodes = ['tester-one', 'tester-two'];
    const create = vi.spyOn(prisma.student, 'create').mockResolvedValue({ id: 'student', interests: '[]' } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.student, 'findUnique').mockResolvedValue({ id: 'student', accessCode: 'tester-one' } as any);
    const app = Fastify(); await accessRoutes(app); await app.register(students);
    try {
      const response = await app.inject({ method: 'POST', url: '/api/students', headers: { 'x-access-code': 'tester-one' }, payload: { name: 'Tester', grade: 10 } });
      expect(response.statusCode).toBe(201);
      expect(create.mock.calls[0][0]?.data.accessCode).toBe('tester-one');
      expect(response.json()).not.toHaveProperty('accessCode');
      await expect(requireStudent({ headers: { 'x-student-id': 'student', 'x-access-code': 'tester-two' } } as any)).rejects.toMatchObject({ status: 401 });
      await expect(requireStudent({ headers: { 'x-student-id': 'student', 'x-access-code': 'tester-one' } } as any)).resolves.toMatchObject({ id: 'student' });
    } finally { await app.close(); }
  });
});
