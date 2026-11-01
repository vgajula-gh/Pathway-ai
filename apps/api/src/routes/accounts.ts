import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { requireStudent, HttpError } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { Credentials, Login, Recovery, credentialHash, newCredentials, recoveryHash, endSession, sessionStudent, startSession, throttleLogin, studentAllowed } from '../lib/accounts.js';
import { serializeStudent } from './students.js';
import { audit } from '../lib/audit.js';

const unavailable = (e: unknown): never => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new HttpError(409, 'That phrase is already in use. Choose a different private phrase.');
  throw e;
};
export default async function routes(app: FastifyInstance) {
  app.get('/api/auth/session', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const s = await sessionStudent(req);
    return { student: s ? serializeStudent(s) : null };
  });
  app.post('/api/auth/login', async (req, reply) => {
    const b = Login.parse(req.body), signInHash = credentialHash(b.phrase);
    await throttleLogin(req.ip, signInHash);
    const s = await prisma.student.findUnique({ where: { signInHash }, include: { availability: true } });
    if (!s || !studentAllowed(s)) throw new HttpError(401, 'That private phrase did not open a profile. Check it and try again.');
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Signed in');
    return serializeStudent(s);
  });
  app.post('/api/auth/link', async (req, reply) => {
    const s = await requireStudent(req), b = Credentials.parse(req.body);
    if (s.signInHash) throw new HttpError(409, 'Your profile already has a private sign-in phrase.');
    await throttleLogin(req.ip, credentialHash(b.phrase));
    const { recoveryCode, ...hashes } = newCredentials(b.phrase);
    const changed = await prisma.student.updateMany({ where: { id: s.id, signInHash: null }, data: hashes }).catch(unavailable);
    if (!changed.count) throw new HttpError(409, 'Your profile already has a private sign-in phrase.');
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Added private sign-in phrase');
    return { ...serializeStudent({ ...s, ...hashes }), recoveryCode };
  });
  app.post('/api/auth/change-phrase', async (req, reply) => {
    const s = await requireStudent(req), b = Credentials.parse(req.body);
    if (!await sessionStudent(req)) throw new HttpError(401, 'Sign in before changing your phrase.');
    await throttleLogin(req.ip, credentialHash(b.phrase));
    const { recoveryCode, ...hashes } = newCredentials(b.phrase);
    if (hashes.signInHash === s.signInHash) throw new HttpError(422, 'Choose a new private phrase.');
    await prisma.$transaction(async tx => {
      await tx.student.update({ where: { id: s.id }, data: hashes });
      await tx.authSession.deleteMany({ where: { studentId: s.id } });
    }).catch(unavailable);
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Changed private sign-in phrase');
    return { ...serializeStudent({ ...s, ...hashes }), recoveryCode };
  });
  app.post('/api/auth/recover', async (req, reply) => {
    const b = Recovery.parse(req.body), hash = recoveryHash(b.recoveryCode);
    await throttleLogin(req.ip, hash);
    const s = await prisma.student.findUnique({ where: { recoveryHash: hash }, include: { availability: true } });
    if (!s || !studentAllowed(s)) throw new HttpError(401, 'That recovery code did not open a profile. Check it and try again.');
    const { recoveryCode, ...hashes } = newCredentials(b.credentials.phrase);
    if (hashes.signInHash === s.signInHash) throw new HttpError(422, 'Choose a new private phrase.');
    await prisma.$transaction(async tx => {
      const changed = await tx.student.updateMany({ where: { id: s.id, recoveryHash: hash }, data: hashes });
      if (!changed.count) throw new HttpError(401, 'That recovery code has already been used.');
      await tx.authSession.deleteMany({ where: { studentId: s.id } });
    }).catch(unavailable);
    await startSession(s.id, reply);
    await audit(s.id, 'student', 'Recovered profile and changed private phrase');
    return { ...serializeStudent({ ...s, ...hashes }), recoveryCode };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const s = await sessionStudent(req);
    await endSession(req, reply);
    if (s) await audit(s.id, 'student', 'Signed out');
    return reply.code(204).send();
  });
}
