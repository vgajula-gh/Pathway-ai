import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
const dir = mkdtempSync(join(tmpdir(), 'pathway-accounts-'));
const databaseUrl = `file:${dir}/accounts.db?connection_limit=1`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
vi.mock('../src/lib/db.js', () => ({
  get prisma() { return db; },
  j: (s: string | null | undefined, fallback: unknown) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
}));
import { buildApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { tokenHash } from '../src/lib/accounts.js';
const originalCodes = env.accessCodes;
const headers = { 'x-access-code': 'code-one' };
const credentials = { username: 'student_one', password: 'a long private passphrase' };
const profile = { name: 'Student', grade: 10, goal: 'Learn robotics', credentials };
const cookie = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0];
async function app() { const a = await buildApp(); a.log.level = 'silent'; return a; }
beforeAll(async () => {
  writeFileSync(join(dir, 'accounts.db'), '');
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { env: { ...process.env, DATABASE_URL: databaseUrl } });
}, 30000);
beforeEach(async () => { vi.unstubAllEnvs(); env.accessCodes = ['code-one', 'code-two']; await db.student.deleteMany(); await db.loginAttempt.deleteMany(); });
afterAll(async () => { env.accessCodes = originalCodes; vi.unstubAllEnvs(); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe('returning student sign-in', () => {
  it('opens the same profile and goals from a new device without onboarding again', async () => {
    const a = await app();
    try {
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      expect(registered.statusCode).toBe(201);
      const id = registered.json().id;
      expect(registered.json()).toMatchObject({ username: credentials.username });
      expect(registered.json()).not.toHaveProperty('passwordHash');
      expect(String(registered.headers['set-cookie'])).toContain('HttpOnly; SameSite=Lax; Max-Age=2592000');
      const stored = await db.student.findUniqueOrThrow({ where: { id } });
      expect(stored.passwordHash).toMatch(/^scrypt\$/); expect(stored.passwordHash).not.toContain(credentials.password);
      expect((await a.inject('/api/auth/session')).json()).toEqual({ student: null });
      const login = await a.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { ...credentials, username: 'STUDENT_ONE' } });
      expect(login.statusCode).toBe(200); expect(login.json().id).toBe(id);
      const sessionHeaders = { cookie: cookie(login) };
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json().student.id).toBe(id);
      expect((await a.inject({ url: '/api/me', headers: sessionHeaders })).json().id).toBe(id);
      const goals = await a.inject({ url: '/api/goals', headers: sessionHeaders });
      expect(goals.statusCode).toBe(200); expect(goals.json()[0].title).toBe('Learn robotics');
      const patched = await a.inject({ method: 'PATCH', url: '/api/me', headers: sessionHeaders, payload: { name: 'Updated student', settings: { voice: true } } });
      expect(patched.statusCode).toBe(200); expect(patched.json()).toMatchObject({ name: 'Updated student', settings: { voice: true } });
      expect(await db.student.count()).toBe(1);
      // An ID and invitation code cannot bypass account authentication.
      expect((await a.inject({ url: '/api/me', headers: { ...headers, 'x-student-id': id } })).statusCode).toBe(401);
      expect((await a.inject({ url: '/api/me', headers: { ...sessionHeaders, 'x-student-id': 'another-profile' } })).json().id).toBe(id);
    } finally { await a.close(); }
  });
  it('links a legacy browser profile without replacing its data', async () => {
    const a = await app();
    try {
      const { credentials: _, ...legacy } = profile;
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: legacy });
      const id = registered.json().id, legacyHeaders = { ...headers, 'x-student-id': id };
      expect((await a.inject({ url: '/api/me', headers: legacyHeaders })).statusCode).toBe(200);
      const link = await a.inject({ method: 'POST', url: '/api/auth/link', headers: legacyHeaders, payload: credentials });
      expect(link.statusCode).toBe(200); expect(link.json()).toMatchObject({ id, username: credentials.username });
      expect(await db.goal.count({ where: { studentId: id } })).toBe(1);
      expect((await a.inject({ url: '/api/me', headers: legacyHeaders })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/auth/link', headers: { cookie: cookie(link) }, payload: credentials })).statusCode).toBe(409);
    } finally { await a.close(); }
  });
  it('rejects incorrect credentials, wrong tester codes, duplicate names and untrusted origins', async () => {
    const a = await app();
    try {
      await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      for (const attempt of [
        { headers, payload: { ...credentials, password: 'incorrect long password' } },
        { headers, payload: { ...credentials, username: 'unknown' } },
        { headers: { 'x-access-code': 'code-two' }, payload: credentials }
      ]) {
        const login = await a.inject({ method: 'POST', url: '/api/auth/login', ...attempt });
        expect(login.statusCode).toBe(401); expect(login.json().error).toBe('Check your username, password and original access code.');
      }
      expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile })).statusCode).toBe(409);
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', headers: { ...headers, origin: 'https://other.example' }, payload: credentials })).statusCode).toBe(403);
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { ...credentials, password: 'short' } })).statusCode).toBe(422);
    } finally { await a.close(); }
  });
  it('accepts the known Codespaces development origin without allowing other origins', async () => {
    vi.stubEnv('CODESPACE_NAME', 'test-space'); vi.stubEnv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'app.github.dev');
    const a = await app();
    try {
      const res = await a.inject({ method: 'POST', url: '/api/access', headers: { origin: 'https://test-space-5173.app.github.dev' }, payload: { code: 'code-one' } });
      expect(res.statusCode).toBe(200);
    } finally { await a.close(); }
  });
  it('persists sign-in throttling across requests', async () => {
    const a = await app();
    try {
      const windowMs = 15 * 60 * 1000;
      const key = tokenHash(`${Math.floor(Date.now() / windowMs)}:${credentials.username}`);
      await db.loginAttempt.create({ data: { key, count: 10, expiresAt: new Date(Date.now() + windowMs) } });
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', headers, payload: credentials })).statusCode).toBe(429);
    } finally { await a.close(); }
  });
  it('expires sessions, revokes removed access codes and invalidates sign-out', async () => {
    const a = await app();
    try {
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const sessionHeaders = { cookie: cookie(registered) };
      env.accessCodes = ['code-two'];
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json()).toEqual({ student: null });
      expect((await a.inject({ url: '/api/me', headers: sessionHeaders })).statusCode).toBe(401);
      env.accessCodes = ['code-one', 'code-two'];
      await db.authSession.updateMany({ data: { expiresAt: new Date(0) } });
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json()).toEqual({ student: null });
      const login = await a.inject({ method: 'POST', url: '/api/auth/login', headers, payload: credentials });
      const signedInHeaders = { cookie: cookie(login) };
      const logout = await a.inject({ method: 'POST', url: '/api/auth/logout', headers: signedInHeaders });
      expect(logout.statusCode).toBe(204); expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
      expect((await a.inject({ url: '/api/auth/session', headers: signedInHeaders })).json()).toEqual({ student: null });
    } finally { await a.close(); }
  });
  it('uses secure cookies and deletes the account and sessions with the profile', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const a = await app();
    try {
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      expect(registered.statusCode).toBe(201); expect(String(registered.headers['set-cookie'])).toContain('; Secure');
      const sessionHeaders = { cookie: cookie(registered) };
      const exported = await a.inject({ url: '/api/me/export', headers: sessionHeaders });
      expect(exported.json().profile.username).toBe(credentials.username);
      expect(exported.json().profile).not.toHaveProperty('passwordHash');
      const deleted = await a.inject({ method: 'DELETE', url: '/api/me', headers: sessionHeaders });
      expect(deleted.statusCode).toBe(204); expect(await db.authSession.count()).toBe(0);
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json()).toEqual({ student: null });
      const { credentials: _, ...withoutAccount } = profile;
      expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: withoutAccount })).statusCode).toBe(422);
    } finally { await a.close(); }
  });
});
