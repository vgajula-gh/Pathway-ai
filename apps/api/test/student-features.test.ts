import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
const remote = vi.hoisted(() => vi.fn());
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
  remote.mockReset();
  env.accessCodes = []; await db.student.deleteMany();
  const s = await db.student.create({ data: { name: 'Test', grade: 10, availability: { create: {} } } }); studentId = s.id;
  await db.opportunity.upsert({ where: { id: 'test' }, update: {}, create: { id: 'test', name: 'Test opportunity', organizer: 'Test', category: 'STEM', url: 'https://example.org', gradeMin: 9, gradeMax: 12, format: 'Virtual', cost: 'Free', commitment: 'Low', skills: '[]', tags: '[]', checks: '["Check eligibility"]' } });
});
afterAll(async () => { env.accessCodes = originalCodes; await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
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
