import { createHash, randomBytes, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';
import { HttpError } from './errors.js';

export const Credentials = z.object({
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9_]+$/, 'Use letters, numbers or underscores'),
  password: z.string().min(12, 'Use at least 12 characters').max(128)
});
const scrypt = (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) => new Promise<Buffer>((resolve, reject) => {
  deriveKey(password, salt, length, options, (err, key) => err ? reject(err) : resolve(key));
});
const cookieName = 'pathway_session';
const sessionSeconds = 30 * 24 * 60 * 60;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [kind, salt, encoded] = hash.split('$');
  if (kind !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(encoded || '')) return false;
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }) as Buffer;
  return timingSafeEqual(key, Buffer.from(encoded, 'hex'));
}
export function sessionToken(req: FastifyRequest) {
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function setCookie(reply: FastifyReply, token: string, seconds: number) {
  reply.header('set-cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  reply.header('cache-control', 'no-store');
}
export async function startSession(studentId: string, reply: FastifyReply) {
  const token = randomBytes(32).toString('hex');
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.authSession.create({ data: { tokenHash: tokenHash(token), studentId, expiresAt: new Date(Date.now() + sessionSeconds * 1000) } });
  setCookie(reply, token, sessionSeconds);
}
export async function endSession(req: FastifyRequest, reply: FastifyReply) {
  const token = sessionToken(req);
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  setCookie(reply, '', 0);
}
const cache = new WeakMap<FastifyRequest, ReturnType<typeof readSession>>();
async function readSession(req: FastifyRequest) {
  const token = sessionToken(req);
  if (!token) return null;
  const session = await prisma.authSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { student: { include: { availability: true } } } });
  if (!session || session.expiresAt <= new Date()) return null;
  const s = session.student;
  if ((env.accessCodes.length || process.env.NODE_ENV === 'production') && (!s.accessCode || !env.accessCodes.includes(s.accessCode))) return null;
  return s;
}
export function sessionStudent(req: FastifyRequest) {
  if (!cache.has(req)) cache.set(req, readSession(req));
  return cache.get(req)!;
}
export async function throttleLogin(username: string) {
  const now = Date.now(), windowMs = 15 * 60 * 1000;
  await prisma.loginAttempt.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  const key = tokenHash(`${Math.floor(now / windowMs)}:${username}`);
  const attempt = await prisma.loginAttempt.upsert({ where: { key }, create: { key, count: 1, expiresAt: new Date((Math.floor(now / windowMs) + 1) * windowMs) }, update: { count: { increment: 1 } } });
  if (attempt.count > 10) throw new HttpError(429, 'Too many sign-in attempts. Please try again in 15 minutes.');
}
