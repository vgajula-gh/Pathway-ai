import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { accessCode } from '../lib/access.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { Credentials, endSession, hashPassword, sessionStudent, startSession, throttleLogin, verifyPassword } from '../lib/accounts.js';
import { serializeStudent } from './students.js';
import { audit } from '../lib/audit.js';

export default async function routes(app: FastifyInstance) {
  app.get('/api/auth/session', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const s = await sessionStudent(req);
    return { student: s ? serializeStudent(s) : null };
  });
  app.post('/api/auth/login', async (req, reply) => {
    const b = Credentials.parse(req.body);
    await throttleLogin(b.username);
    const s = await prisma.student.findUnique({ where: { username: b.username }, include: { availability: true } });
    // Use the same password work for unknown accounts to reduce username probing.
    const dummy = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);
    const valid = await verifyPassword(b.password, s?.passwordHash || dummy);
    const code = accessCode(req);
    if (!s || !valid || (code !== null && s.accessCode !== code)) throw new HttpError(401, 'Check your username, password and original access code.');
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Signed in');
    return serializeStudent(s);
  });
  app.post('/api/auth/link', async (req, reply) => {
    const s = await requireStudent(req), b = Credentials.parse(req.body);
    if (s.username) throw new HttpError(409, 'Your profile already has a sign-in.');
    const passwordHash = await hashPassword(b.password);
    try {
      // Conditional update prevents two requests from claiming the same profile.
      const changed = await prisma.student.updateMany({ where: { id: s.id, username: null }, data: { username: b.username, passwordHash } });
      if (!changed.count) throw new HttpError(409, 'Your profile already has a sign-in.');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new HttpError(409, 'That username is unavailable. Choose another.');
      throw e;
    }
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Added account sign-in');
    return serializeStudent(await prisma.student.findUniqueOrThrow({ where: { id: s.id }, include: { availability: true } }));
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const s = await sessionStudent(req);
    await endSession(req, reply);
    if (s) await audit(s.id, 'student', 'Signed out');
    return reply.code(204).send();
  });
}
