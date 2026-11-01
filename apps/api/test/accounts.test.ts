import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
const dir = mkdtempSync(join(tmpdir(), 'pathway-phrases-'));
const databaseUrl = `file:${dir}/accounts.db?connection_limit=1`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; }, j: (s: string | null | undefined, fallback: unknown) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } } }));
import { buildApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { tokenHash, credentialHash } from '../src/lib/accounts.js';
const originalCodes = env.accessCodes;
const headers = { 'x-access-code': 'code-one' };
const credentials = { phrase: 'maple comet river bicycle', confirmPhrase: 'maple comet river bicycle' };
const replacement = { phrase: 'another private forest phrase', confirmPhrase: 'another private forest phrase' };
const profile = { name: 'Student', grade: 10, goal: 'Learn robotics', credentials };
const cookie = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0];
async function app() { const a = await buildApp(); a.log.level = 'silent'; return a; }
beforeAll(async () => {
  writeFileSync(join(dir, 'accounts.db'), '');
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { env: { ...process.env, DATABASE_URL: databaseUrl } });
}, 30000);
beforeEach(async () => { vi.unstubAllEnvs(); vi.stubEnv('SIGN_IN_SECRET', 'test-only-secret-value-at-least32-characters'); env.accessCodes = ['code-one', 'code-two']; await db.student.deleteMany(); await db.loginAttempt.deleteMany(); });
afterAll(async () => { env.accessCodes = originalCodes; vi.unstubAllEnvs(); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe('private phrase sign-in', () => {
  it('opens the same profile from a new device using only the phrase, and stores only keyed hashes', async () => {
    const a = await app();
    try {
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      expect(registered.statusCode).toBe(201); const id = registered.json().id;
      expect(registered.json()).toMatchObject({ hasSignIn: true }); expect(registered.json().recoveryCode).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{8}){5}$/);
      expect(registered.json()).not.toHaveProperty('signInHash'); expect(registered.json()).not.toHaveProperty('recoveryHash');
      const stored = await db.student.findUniqueOrThrow({ where: { id } });
      expect(stored.signInHash).toBe(credentialHash(credentials.phrase)); expect(stored.signInHash).not.toContain(credentials.phrase);
      expect(stored.recoveryHash).not.toContain(registered.json().recoveryCode);
      // No invitation header, student ID, username or password on the second device.
      const login = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { phrase: ' MAPLE   Comet river bicycle ' } });
      expect(login.statusCode).toBe(200); expect(login.json().id).toBe(id); expect(login.json()).not.toHaveProperty('recoveryCode');
      const sessionHeaders = { cookie: cookie(login) };
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json().student.id).toBe(id);
      expect((await a.inject({ url: '/api/goals', headers: sessionHeaders })).json()[0].title).toBe('Learn robotics');
      expect((await a.inject({ url: '/api/me', headers: { ...headers, 'x-student-id': id } })).statusCode).toBe(401);
      expect((await a.inject({ url: '/api/me', headers: { ...sessionHeaders, 'x-student-id': 'another-profile' } })).json().id).toBe(id);
      const patched = await a.inject({ method: 'PATCH', url: '/api/me', headers: sessionHeaders, payload: { name: 'Updated', settings: { voice: true } } });
      expect(patched.json()).toMatchObject({ name: 'Updated', settings: { voice: true } });
      expect(await db.student.count()).toBe(1);
    } finally { await a.close(); }
  });
  it('links a legacy browser profile without replacing its goals or ID', async () => {
    const a = await app();
    try {
      const { credentials: _, ...legacy } = profile;
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: legacy });
      const id = created.json().id, legacyHeaders = { ...headers, 'x-student-id': id };
      const linked = await a.inject({ method: 'POST', url: '/api/auth/link', headers: legacyHeaders, payload: credentials });
      expect(linked.statusCode).toBe(200); expect(linked.json()).toMatchObject({ id, hasSignIn: true }); expect(linked.json().recoveryCode).toBeTruthy();
      expect(await db.goal.count({ where: { studentId: id } })).toBe(1);
      expect((await a.inject({ url: '/api/me', headers: legacyHeaders })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/auth/link', headers: { cookie: cookie(linked) }, payload: credentials })).statusCode).toBe(409);
    } finally { await a.close(); }
  });
  it('requires an invitation for new profiles, unique phrases, matching confirmations and minimum length', async () => {
    const a = await app();
    try {
      expect((await a.inject({ method: 'POST', url: '/api/students', payload: profile })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile })).statusCode).toBe(201);
      expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile })).statusCode).toBe(409);
      for (const bad of [{ phrase: 'short', confirmPhrase: 'short' }, { phrase: credentials.phrase, confirmPhrase: replacement.phrase }]) {
        expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: { ...profile, credentials: bad } })).statusCode).toBe(422);
      }
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: { phrase: 'not the right phrase' } })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://other.example' }, payload: credentials })).statusCode).toBe(403);
    } finally { await a.close(); }
  });
  it('changes a private phrase while signed in and revokes all old sessions and the old recovery code', async () => {
    const a = await app();
    try {
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const oldCookie = { cookie: cookie(created) };
      const changed = await a.inject({ method: 'POST', url: '/api/auth/change-phrase', headers: oldCookie, payload: replacement });
      expect(changed.statusCode).toBe(200); expect(changed.json().id).toBe(created.json().id);
      expect(changed.json().recoveryCode).not.toBe(created.json().recoveryCode);
      expect((await a.inject({ url: '/api/auth/session', headers: oldCookie })).json().student).toBeNull();
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: credentials })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: replacement })).statusCode).toBe(200);
      expect((await a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: created.json().recoveryCode, credentials } })).statusCode).toBe(401);
    } finally { await a.close(); }
  });
  it('recovers the same profile once, issues a replacement code, and rejects replay', async () => {
    const a = await app();
    try {
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const payload = { recoveryCode: created.json().recoveryCode, credentials: replacement };
      const recovered = await a.inject({ method: 'POST', url: '/api/auth/recover', payload });
      expect(recovered.statusCode).toBe(200); expect(recovered.json().id).toBe(created.json().id);
      expect(recovered.json().recoveryCode).not.toBe(payload.recoveryCode);
      expect((await a.inject({ method: 'POST', url: '/api/auth/recover', payload })).statusCode).toBe(401);
      expect((await a.inject({ url: '/api/auth/session', headers: { cookie: cookie(created) } })).json().student).toBeNull();
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: credentials })).statusCode).toBe(401);
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: replacement })).json().id).toBe(created.json().id);
      expect(await db.student.count()).toBe(1); expect(await db.goal.count()).toBe(1);
    } finally { await a.close(); }
  });
  it('does not consume a recovery code when the new phrase is already taken', async () => {
    const a = await app();
    try {
      const first = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      await a.inject({ method: 'POST', url: '/api/students', headers, payload: { ...profile, credentials: replacement } });
      const code = first.json().recoveryCode;
      expect((await a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: code, credentials: replacement } })).statusCode).toBe(409);
      const unique = { phrase: 'one more unique forest phrase', confirmPhrase: 'one more unique forest phrase' };
      expect((await a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: code, credentials: unique } })).statusCode).toBe(200);
    } finally { await a.close(); }
  });
  it('allows only one of two concurrent recovery attempts', async () => {
    const a = await app();
    try {
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const responses = await Promise.all([replacement, { phrase: 'a different unique phrase', confirmPhrase: 'a different unique phrase' }].map(next => a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: created.json().recoveryCode, credentials: next } })));
      expect(responses.map(r => r.statusCode).sort()).toEqual([200, 401]);
    } finally { await a.close(); }
  });
  it('throttles guesses by IP even when every guessed phrase is different', async () => {
    const a = await app();
    try {
      const windowMs = 15 * 60 * 1000;
      const key = tokenHash(`${Math.floor(Date.now() / windowMs)}:ip:127.0.0.1`);
      await db.loginAttempt.create({ data: { key, count: 100, expiresAt: new Date(Date.now() + windowMs) } });
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: { phrase: 'different unknown phrase' } })).statusCode).toBe(429);
      expect((await a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: 'unknown-code', credentials } })).statusCode).toBe(429);
    } finally { await a.close(); }
  });
  it('expires sessions, revokes removed invitation codes and invalidates sign-out', async () => {
    const a = await app();
    try {
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const sessionHeaders = { cookie: cookie(created) };
      env.accessCodes = ['code-two'];
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json().student).toBeNull();
      expect((await a.inject({ method: 'POST', url: '/api/auth/login', payload: credentials })).statusCode).toBe(401);
      env.accessCodes = ['code-one', 'code-two'];
      await db.authSession.updateMany({ data: { expiresAt: new Date(0) } });
      expect((await a.inject({ url: '/api/auth/session', headers: sessionHeaders })).json().student).toBeNull();
      const login = await a.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
      const signedHeaders = { cookie: cookie(login) };
      expect((await a.inject({ method: 'POST', url: '/api/auth/logout', headers: signedHeaders })).statusCode).toBe(204);
      expect((await a.inject({ url: '/api/auth/session', headers: signedHeaders })).json().student).toBeNull();
    } finally { await a.close(); }
  });
  it('uses secure cookies and deletes the account and sessions without exporting credential hashes', async () => {
    vi.stubEnv('NODE_ENV', 'production'); const a = await app();
    try {
      const registered = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      expect(registered.statusCode).toBe(201); expect(String(registered.headers['set-cookie'])).toContain('; Secure');
      const signedHeaders = { cookie: cookie(registered) };
      const exported = await a.inject({ url: '/api/me/export', headers: signedHeaders });
      expect(exported.json().profile.hasSignIn).toBe(true);
      for (const secret of ['phrase', 'confirmPhrase', 'signInHash', 'recoveryHash', 'recoveryCode']) expect(exported.json().profile).not.toHaveProperty(secret);
      expect((await a.inject({ method: 'DELETE', url: '/api/me', headers: signedHeaders })).statusCode).toBe(204);
      expect(await db.authSession.count()).toBe(0);
      const { credentials: _, ...withoutPhrase } = profile;
      expect((await a.inject({ method: 'POST', url: '/api/students', headers, payload: withoutPhrase })).statusCode).toBe(422);
    } finally { await a.close(); }
  });
  it('accepts the known Codespaces development origin', async () => {
    vi.stubEnv('CODESPACE_NAME', 'test-space'); vi.stubEnv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'app.github.dev'); const a = await app();
    try { expect((await a.inject({ method: 'POST', url: '/api/access', headers: { origin: 'https://test-space-5173.app.github.dev' }, payload: { code: 'code-one' } })).statusCode).toBe(200); }
    finally { await a.close(); }
  });
  it('requires a production hashing secret and isolates hashes when that secret changes', async () => {
    const before = credentialHash(credentials.phrase);
    vi.stubEnv('SIGN_IN_SECRET', 'a different persistent random test secret'); expect(credentialHash(credentials.phrase)).not.toBe(before);
    vi.stubEnv('SIGN_IN_SECRET', ''); vi.stubEnv('NODE_ENV', 'production'); await expect(buildApp()).rejects.toThrow('SIGN_IN_SECRET');
  });
  it('revokes other-device push capabilities when a private phrase is recovered', async () => {
    const a = await app();
    try {
      const created = await a.inject({ method: 'POST', url: '/api/students', headers, payload: profile });
      const studentId = created.json().id;
      await db.pushSubscription.create({ data: { studentId, endpointHash: 'other-device', encrypted: 'capability' } });
      await db.notificationSettings.create({ data: { studentId, enabled: true } });
      const recovered = await a.inject({ method: 'POST', url: '/api/auth/recover', payload: { recoveryCode: created.json().recoveryCode, credentials: replacement } });
      expect(recovered.statusCode).toBe(200);
      expect(await db.pushSubscription.count({ where: { studentId } })).toBe(0);
      expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId } })).enabled).toBe(false);
    } finally { await a.close(); }
  });

});
