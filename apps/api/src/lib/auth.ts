// Account sessions take precedence. Browser-ID fallback is restricted to legacy
// profiles that have not yet been linked to a username/password.
import { sessionStudent } from './accounts.js';
import { HttpError } from './errors.js';
import { FastifyRequest } from 'fastify';
import { accessCode } from './access.js';
import { prisma } from './db.js';

export { HttpError } from './errors.js';

export async function requireStudent(req: FastifyRequest) {
  const signedIn = await sessionStudent(req);
  const id = signedIn?.id || String(req.headers['x-student-id'] || '');
  if (!id) throw new HttpError(401, 'Not signed in');
  const student = await prisma.student.findUnique({ where: { id }, include: { availability: true } });
  if (!student) throw new HttpError(401, 'Unknown student');
  // Re-read profile fields so a PATCH response reflects the just-saved settings,
  // even though session identity is cached for this request.
  if (signedIn) return student;
  if (student.username) throw new HttpError(401, 'Sign in to open your profile.');
  const code = accessCode(req);
  if (code !== null && student.accessCode !== code) throw new HttpError(401, 'Use the access code you used during setup.');
  return student;
}
