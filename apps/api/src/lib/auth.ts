// DEV-ONLY identity: the web app stores the student id from onboarding and sends it as
// `x-student-id`. Replace with real authentication (and verified parental consent where
// required) before any real student uses the product. See docs/09-PRIVACY-SAFETY.md.
import { FastifyRequest } from 'fastify';
import { prisma } from './db.js';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function requireStudent(req: FastifyRequest) {
  const id = String(req.headers['x-student-id'] || '');
  if (!id) throw new HttpError(401, 'Not signed in');
  const student = await prisma.student.findUnique({ where: { id }, include: { availability: true } });
  if (!student) throw new HttpError(401, 'Unknown student');
  return student;
}
