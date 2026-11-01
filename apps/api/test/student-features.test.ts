import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
const remote = vi.hoisted(() => vi.fn());
const sent = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/push.js', async () => ({ ...await vi.importActual('../src/lib/push.js'), sendPush: sent }));
const vapid = webpush.generateVAPIDKeys();
vi.mock('../src/lib/calendar-fetch.js', async () => ({ ...await vi.importActual('../src/lib/calendar-fetch.js'), fetchCalendar: remote }));
const dir = mkdtempSync(join(tmpdir(), 'pathway-features-')), url = `file:${dir}/test.db`;
const db = new PrismaClient({ datasourceUrl: url + '?connection_limit=1' });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; }, j: (value: string, fallback: unknown) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } } }));
import { buildApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
const originalCodes = env.accessCodes;
let studentId = '';
const headers = () => ({ 'x-student-id': studentId });
export { db, headers };
beforeAll(async () => {
  writeFileSync(join(dir, 'test.db'), '');
  // Apply the entire versioned SQLite history, not db push.
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url } });
}, 30000);
beforeEach(async () => {
  remote.mockReset(); sent.mockReset(); sent.mockResolvedValue({ statusCode: 201 });
  vi.stubEnv('VAPID_PUBLIC_KEY', vapid.publicKey); vi.stubEnv('VAPID_PRIVATE_KEY', vapid.privateKey); vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.org');
  env.accessCodes = []; await db.student.deleteMany();
  const s = await db.student.create({ data: { name: 'Test', grade: 10, availability: { create: {} } } }); studentId = s.id;
  await db.opportunity.upsert({ where: { id: 'test' }, update: {}, create: { id: 'test', name: 'Test opportunity', organizer: 'Test', category: 'STEM', url: 'https://example.org', gradeMin: 9, gradeMax: 12, format: 'Virtual', cost: 'Free', commitment: 'Low', skills: '[]', tags: '[]', checks: '["Check eligibility"]' } });
});
afterAll(async () => { vi.unstubAllEnvs(); env.accessCodes = originalCodes; await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
it('saves, updates and isolates application metadata and never writes prep events before approval', async () => {
  const app = await buildApp(); app.log.level = 'silent';
  try {
    expect((await app.inject({ method: 'POST', url: '/api/opportunities/test/status', headers: headers(), payload: { status: 'saved' } })).statusCode).toBe(200);
    let list = (await app.inject({ url: '/api/applications', headers: headers() })).json();
    expect(list[0].checklist).toHaveLength(2); expect(list[0].status).toBe('interested'); expect(list[0].deadline).toBeNull();
    const deadline = new Date(); deadline.setDate(deadline.getDate() + 5); const date = deadline.toISOString().slice(0, 10);
    expect((await app.inject({ method: 'PATCH', url: '/api/applications/test', headers: headers(), payload: { deadline: date, status: 'preparing', notes: 'Private note', checklist: [{ title: 'Check', done: true }] } })).statusCode).toBe(200);
    list = (await app.inject({ url: '/api/applications', headers: headers() })).json();
    expect(list[0]).toMatchObject({ status: 'preparing', notes: 'Private note', completed: 1, deadlineSource: 'Added by you · not verified' });
    const proposal = await app.inject({ method: 'POST', url: '/api/applications/test/prep', headers: headers() });
    expect(proposal.statusCode).toBe(200); expect(proposal.json().status).toBe('AWAITING_APPROVAL'); expect(await db.event.count()).toBe(0);
    const other = await db.student.create({ data: { name: 'Other', grade: 10 } });
    expect((await app.inject({ method: 'PATCH', url: '/api/applications/test', headers: { 'x-student-id': other.id }, payload: { notes: 'No' } })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('syncs encrypted private calendars without duplicates, preserves failures, deletes source removals and blocks edits', async () => {
  const { syncCalendar } = await import('../src/lib/calendars.js');
  const start = new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const end = new Date(Date.now() + 90000000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  remote.mockResolvedValue(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nDTSTAMP:${start}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:Class\r\nEND:VEVENT\r\nEND:VCALENDAR`);
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const created = await app.inject({ method: 'POST', url: '/api/calendars', headers: headers(), payload: { label: 'Google Calendar', url: 'https://example.org/private-secret-token.ics' } });
    expect(created.statusCode).toBe(201); const link = created.json();
    expect(JSON.stringify(link)).not.toContain('private-secret-token'); expect(link.lastSync).toBeTruthy();
    const persisted = await db.calendarLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(persisted.encryptedUrl).not.toContain('https:');
    await syncCalendar(link.id); expect(await db.event.count()).toBe(1);
    const e = await db.event.findFirstOrThrow();
    expect(e.readOnly).toBe(true); expect(e.source).toBe('From Google Calendar');
    expect((await app.inject({ method: 'PATCH', url: `/api/events/${e.id}`, headers: headers(), payload: { done: true } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/events/${e.id}`, headers: headers() })).statusCode).toBe(409);
    remote.mockRejectedValue(new Error('secret provider URL')); await syncCalendar(link.id);
    expect(await db.event.count()).toBe(1); expect((await db.calendarLink.findUniqueOrThrow({ where: { id: link.id } })).error).not.toContain('secret provider URL');
    remote.mockResolvedValue('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'); await syncCalendar(link.id);
    expect(await db.event.count()).toBe(0);
    expect((await app.inject({ url: '/api/week', headers: headers() })).json()).toHaveLength(7);
    const exported = (await app.inject({ url: '/api/me/export', headers: headers() })).json(); expect(JSON.stringify(exported)).not.toContain(persisted.encryptedUrl);
  } finally { await app.close(); }
});

it('keeps nudges off by default, encrypts subscriptions and reserves at most one send per student-local day', async () => {
  const { deliverNudge } = await import('../src/lib/nudges.js');
  const app = await buildApp(); app.log.level = 'silent';
  try {
    expect((await app.inject({ url: '/api/notifications', headers: headers() })).json().enabled).toBe(false);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/private-endpoint';
    const payload = { endpoint, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
    expect((await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: headers(), payload })).statusCode).toBe(200);
    expect((await db.pushSubscription.findFirstOrThrow()).encrypted).not.toContain(endpoint);
    await db.goal.create({ data: { studentId, title: 'Learn robotics' } });
    const instant = new Date('2026-11-02T20:00:00Z');
    expect((await deliverNudge(studentId, false, instant)).status).toBe('paused-or-quiet'); expect(sent).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { enabled: true, time: '14:00' } })).statusCode).toBe(200);
    const results = await Promise.all(Array.from({ length: 3 }, () => deliverNudge(studentId, false, instant)));
    expect(results.filter(r => r.status === 'accepted')).toHaveLength(1); expect(sent).toHaveBeenCalledOnce(); expect(await db.nudgeDelivery.count()).toBe(1);
    expect(sent.mock.calls[0][1]).toMatchObject({ tab: 'grow', date: '2026-11-02', timezone: 'America/New_York' });
    expect((await deliverNudge(studentId, true, instant)).status).toBe('already-sent-today');
    expect((await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { time: '22:00' } })).statusCode).toBe(422);
    await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { pauseWeek: true } });
    expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId } })).pausedUntil).toBeTruthy();
    await app.inject({ method: 'POST', url: '/api/push/unsubscribe', headers: headers(), payload: { endpoint } });
    expect(await db.pushSubscription.count()).toBe(0); expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId } })).enabled).toBe(false);
  } finally { await app.close(); }
});
it('keeps failed/uncertain sends reserved and removes expired subscriptions without retrying', async () => {
  const { deliverNudge } = await import('../src/lib/nudges.js');
  const { encryptSubscription } = await import('../src/lib/push.js');
  await db.notificationSettings.create({ data: { studentId, enabled: true, time: '14:00' } });
  await db.goal.create({ data: { studentId, title: 'Learn' } });
  await db.pushSubscription.create({ data: { studentId, endpointHash: 'test-hash', encrypted: encryptSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'a', auth: 'b' } }) } });
  sent.mockRejectedValue({ statusCode: 410 });
  const now = new Date('2026-11-02T20:00:00Z');
  expect((await deliverNudge(studentId, false, now)).status).toBe('not-delivered');
  expect(await db.pushSubscription.count()).toBe(0); expect(await db.nudgeDelivery.count()).toBe(1); expect(sent).toHaveBeenCalledOnce();
  await deliverNudge(studentId, false, now); expect(sent).toHaveBeenCalledOnce();
});
