import {afterAll, afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import type {FastifyRequest} from 'fastify';

const dir = mkdtempSync(join(tmpdir(), 'pilot-reset-'));
const pgSchema = process.env.PILOT_RESET_PG_TEST_SCHEMA;
if (pgSchema && (!/^pilot_reset_test_[a-z0-9]+$/.test(pgSchema) || process.env.NODE_ENV === 'production' ||
  !/^[a-f0-9]{32}$/.test(process.env.PILOT_RESET_EXPECTED_DEV_FINGERPRINT || '')))
  throw new Error('PostgreSQL testing requires an isolated test schema and an independently confirmed development fingerprint.');
const pgUrl = pgSchema ? new URL(process.env.DATABASE_URL!) : null;
pgUrl?.searchParams.set('schema', pgSchema!);
const url = pgUrl?.toString() || `file:${dir}/test.db`;
const db = new PrismaClient({datasourceUrl: pgSchema ? url : url + '?connection_limit=1'});
const admin = pgSchema ? new PrismaClient() : null;
let createdSchema = false;
vi.mock('../src/lib/db.js', () => ({
  get prisma() { return db; },
  j: (value: string, fallback: unknown) => { try { return JSON.parse(value); } catch { return fallback; } },
}));
// Test-only target substitution: production guards themselves are also tested
// against the real implementation below. No runtime bypass is shipped.
vi.mock('../src/maintenance/target.js', async () => {
  const original = await vi.importActual<typeof import('../src/maintenance/target.js')>('../src/maintenance/target.js');
  return {...original, maintenanceEnabled: () => true, assertProductionTarget: (req: FastifyRequest) => {
    if (req.headers.host !== original.productionHost) throw new Error('wrong production host');
  }};
});
import {buildApp} from '../src/app.js';
import {env} from '../src/lib/env.js';
import {backgroundActivity, beginActivity, markerKey, minimumDrainMs, receiptKey} from '../src/maintenance/admission.js';
import {enterMaintenance, executeReset, leaveMaintenance, snapshot, status, backupWaiverAcknowledgment, type ResetInput} from '../src/maintenance/pilot-reset.js';
import {withJobLock} from '../src/lib/job-lock.js';
const originalCodes = env.accessCodes, originalDisabled = env.aiDisabled;
const owner = {host: 'pathway-ai.replit.app', authorization: 'Bearer test-owner-key-with-more-than-32-characters'};
const target = {confirmProductionHost: owner.host};
const root = '/internal/maintenance/pilot-reset';
const month = () => new Date().toISOString().slice(0, 7);

beforeAll(async () => {
  if (admin) {
    const rows = await admin.$queryRawUnsafe<{fingerprint: string}[]>(`SELECT md5(COALESCE((SELECT string_agg(id, ',' ORDER BY id) FROM "Student"), '') || '|' || COALESCE((SELECT string_agg(id, ',' ORDER BY id) FROM "DiscoveryRun"), '')) AS fingerprint`);
    if (rows[0]?.fingerprint !== process.env.PILOT_RESET_EXPECTED_DEV_FINGERPRINT) throw new Error('Not the independently confirmed development database. No test schema created.');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${pgSchema}"`);
    createdSchema = true;
  } else writeFileSync(join(dir, 'test.db'), '');
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', pgSchema ? 'prisma/postgresql/schema.prisma' : 'prisma/schema.prisma'], {env: {...process.env, DATABASE_URL: url}});
}, 30_000);
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv('JOBS_SECRET', 'test-owner-key-with-more-than-32-characters');
  vi.stubEnv('SIGN_IN_SECRET', 'test-sign-in-key-with-more-than-32-characters');
  vi.stubEnv('AI_DISABLED', 'true');
  vi.stubEnv('DISCOVERY_ENABLED', 'false');
  env.accessCodes = ['fixture-invitation']; env.aiDisabled = true;
  await db.student.deleteMany(); await db.opportunity.deleteMany(); await db.discoveryRun.deleteMany();
  await db.discoveryGroup.deleteMany(); await db.jobLease.deleteMany(); await db.aIUsage.deleteMany();
  await db.discoveryUsage.deleteMany(); await db.loginAttempt.deleteMany();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External calls are forbidden in reset tests'));
  await seed();
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  vi.unstubAllEnvs(); env.accessCodes = originalCodes; env.aiDisabled = originalDisabled;
  await db.$disconnect(); rmSync(dir, {recursive: true, force: true});
  if (admin) {
    // DROP only the unique, allowlisted namespace created by this test.
    if (createdSchema) await admin.$executeRawUnsafe(`DROP SCHEMA "${pgSchema}" CASCADE`);
    await admin.$disconnect();
  }
});

async function seed() {
  const studentId = 'old-fixture-profile';
  await db.student.create({data: {id: studentId, name: 'Private fixture', grade: 10, accessCode: 'fixture-invitation', discoveryPreferences: '{"goals":"private"}', availability: {create: {}}}});
  await db.opportunity.create({data: {id: 'public-program', name: 'Public program', organizer: 'Example', category: 'Program', url: 'https://example.edu', format: 'Virtual', cost: 'Free', commitment: 'Low', skills: '[]', tags: '[]', isSample: false}});
  const now = new Date();
  await db.sourcePage.create({data: {id: 'public-page', opportunityId: 'public-program', sourceUrl: 'https://example.edu', pageTitle: 'Public', text: 'Public source text', contentHash: 'public-hash'}});
  await db.knowledgeChunk.create({data: {id: 'public-chunk', opportunityId: 'public-program', text: 'Public chunk', sourceUrl: 'https://example.edu', pageTitle: 'Public', checkedAt: now, contentHash: 'public-hash', embeddingModel: 'fixture', vectorStoreKey: 'pinecone-existing-vector'}});
  await db.discoveryRun.create({data: {id: 'completed-run', groupKey: 'public-group', kind: 'discovery', status: 'complete', finishedAt: now, usage: '{"tokens":500,"estimatedCost":0.3}', state: '{"public":true}'}});
  await db.researchCandidate.create({data: {id: 'candidate', runId: 'completed-run', url: 'https://example.edu', createdAt: now}});
  await db.discoveryRunGroup.create({data: {runId: 'completed-run', groupKey: 'public-group'}});
  await db.discoveryGroup.create({data: {key: 'public-group', topic: 'coding', gradeBand: '9-10', region: 'US', status: 'queued', pendingBuckets: '["free"]'}});
  await db.authSession.create({data: {studentId, tokenHash: 'fixture-session-hash', expiresAt: new Date(+now + 60_000)}});
  const calendar = await db.calendarLink.create({data: {studentId, label: 'Private calendar', maskedUrl: 'private', encryptedUrl: 'fixture-ciphertext'}});
  await db.event.create({data: {studentId, calendarId: calendar.id, title: 'Private event', type: 'class', start: '2030-01-01T10:00', end: '2030-01-01T11:00'}});
  await db.goal.create({data: {studentId, title: 'Private goal', milestones: {create: {title: 'Private progress'}}}});
  await db.savedOpportunity.create({data: {studentId, opportunityId: 'public-program', notes: 'Private application'}});
  await db.studentPick.create({data: {studentId, opportunityId: 'public-program', bucket: 'free', rank: 1, refreshCycle: 'fixture'}});
  await db.opportunityFeedback.create({data: {studentId, opportunityId: 'public-program', reason: 'Private feedback'}});
  await db.pickRefreshState.create({data: {studentId, interestSignature: 'fixture'}});
  const conversation = await db.conversation.create({data: {studentId, title: 'Private conversation'}});
  await db.chatMessage.create({data: {studentId, conversationId: conversation.id, role: 'user', content: 'Private chat'}});
  await db.portfolioEntry.create({data: {studentId, type: 'project', title: 'Private project', date: '2030-01-01'}});
  await db.agentAction.create({data: {studentId, origin: 'student', summary: 'Private action', actions: '[]', status: 'VERIFIED', idemKey: 'fixture', expiresAt: now}});
  await db.auditEvent.create({data: {studentId, actor: 'student', event: 'Private event'}});
  await db.dailyBrief.create({data: {studentId, date: '2030-01-01', data: '{}'}});
  await db.notificationSettings.create({data: {studentId}});
  await db.pushSubscription.create({data: {studentId, endpointHash: 'fixture-push-hash', encrypted: 'fixture-ciphertext'}});
  await db.nudgeDelivery.create({data: {studentId, date: '2030-01-01'}});
  await db.opportunitySearchRequest.create({data: {studentId, kind: 'manual', signature: 'fixture', status: 'queued'}});
  await db.loginAttempt.create({data: {key: 'fixture-login-hash', count: 1, expiresAt: now}});
  await db.discoveryUsage.createMany({data: [
    {month: month(), runs: 30, rechecks: 10, searches: 50, pages: 359, tokens: 1217645, estimatedCost: 6.37058, embeddings: 4, vectorUpserts: 4},
    {month: '2001-01', runs: 9, rechecks: 3, estimatedCost: 2},
  ]});
  await db.aIUsage.createMany({data: [
    {key: `month:${month()}`, count: 54}, {key: 'month:2001-01', count: 12},
    {key: `day:2001-01-01:${studentId}`, count: 3}, {key: 'day:2001-01-01:unrelated', count: 2},
  ]});
}
async function ready(): Promise<ResetInput & {backup: NonNullable<ResetInput['backup']>}> {
  const operation = await enterMaintenance();
  await db.jobLease.update({where: {key: markerKey}, data: {expiresAt: new Date(Date.now() - minimumDrainMs - 10_000)}});
  const view = await snapshot(db);
  return {
    operationId: operation.operationId, snapshotHash: view.snapshotHash, month: view.month, rolloutComplete: true,
    backup: {reference: 'fixture-restorable-backup', takenAt: new Date(Date.now() - 1000).toISOString(), restoreVerified: true, productionHost: owner.host},
  };
}

it('real production guard rejects development, SQLite and wrong host targets', async () => {
  const actual = await vi.importActual<typeof import('../src/maintenance/target.js')>('../src/maintenance/target.js');
  const req = {headers: {host: owner.host}} as FastifyRequest;
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('DATABASE_URL', 'file:./fixture.db');
  expect(() => actual.assertProductionTarget(req)).toThrow('restricted');
  vi.stubEnv('NODE_ENV', 'production');
  expect(() => actual.assertProductionTarget(req)).toThrow('restricted');
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture.invalid/database');
  expect(() => actual.assertProductionTarget({headers: {host: 'preview.replit.dev'}} as FastifyRequest)).toThrow('restricted');
  expect(() => actual.assertProductionTarget(req)).not.toThrow();
});
it('requires owner authentication and explicit backup/deletion confirmations', async () => {
  const app = await buildApp(); app.log.level = 'silent';
  try {
    expect((await app.inject({url: root, headers: {host: owner.host}})).statusCode).toBe(401);
    expect((await app.inject({method: 'POST', url: root + '/start', headers: owner, payload: {confirmProductionHost: 'preview.replit.dev'}})).statusCode).toBe(422);
    expect((await app.inject({method: 'POST', url: root + '/execute', headers: owner, payload: target})).statusCode).toBe(422);
    expect(await db.student.count()).toBe(1);
  } finally { await app.close(); }
});
it('blocks public APIs, registration and all shared background admission during maintenance', async () => {
  await enterMaintenance();
  const app = await buildApp(); app.log.level = 'silent';
  const job = vi.fn(async () => 'work');
  try {
    expect((await app.inject({url: '/api/auth/session'})).statusCode).toBe(503);
    expect((await app.inject({method: 'POST', url: '/api/students', payload: {}})).statusCode).toBe(503);
    expect((await app.inject({url: '/api/health'})).statusCode).toBe(200);
    expect((await app.inject({url: root, headers: owner})).statusCode).toBe(200);
    expect(await withJobLock('opportunity-jobs', job)).toEqual({skipped: true});
    await backgroundActivity(job); expect(job).not.toHaveBeenCalled();
    expect(await db.student.count()).toBe(1);
  } finally { await app.close(); }
});
it('refuses to execute before the drain window, with stale backup, or changed snapshot', async () => {
  let input = await ready();
  await db.jobLease.update({where: {key: markerKey}, data: {expiresAt: new Date()}});
  await expect(executeReset(input)).rejects.toThrow('drain window');
  input = await ready();
  await expect(executeReset({...input, backup: {...input.backup, takenAt: '2001-01-01T00:00:00.000Z'}})).rejects.toThrow('backup');
  await db.student.create({data: {name: 'Concurrent fixture', grade: 9}});
  await expect(executeReset(input)).rejects.toThrow('snapshot');
  expect(await db.student.count()).toBe(2);
});
it('waits for an in-flight activity and treats expired activity records as blockers', async () => {
  const release = await beginActivity('request');
  let input = await ready();
  await expect(executeReset(input)).rejects.toThrow('drained');
  await release();
  await db.jobLease.create({data: {key: 'pilot-reset:activity:crashed-fixture', owner: 'job', expiresAt: new Date(0)}});
  input = await ready();
  await expect(executeReset(input)).rejects.toThrow('drained');
  expect((await status()).blockers.expiredActivities).toBe(1);
  expect(await db.student.count()).toBe(1);
});
it('serializes simultaneous admission and rejects all new admissions after maintenance starts', async () => {
  const releases = await Promise.all([beginActivity('request'), beginActivity('job'), beginActivity('request')]);
  await enterMaintenance();
  await expect(beginActivity('request')).rejects.toThrow('maintenance');
  expect((await status()).blockers.activities).toBe(3);
  await Promise.all(releases.map(release => release()));
  expect((await status()).blockers.activities).toBe(0);
});
it('waits for live legacy knowledge locks and calendar leases', async () => {
  let input = await ready();
  await db.jobLease.create({data: {key: 'knowledge:public-program', owner: 'fixture', expiresAt: new Date(Date.now() + 60_000)}});
  await expect(executeReset(input)).rejects.toThrow('drained');
  await db.jobLease.delete({where: {key: 'knowledge:public-program'}});
  await db.calendarLink.updateMany({data: {leaseUntil: new Date(Date.now() + 60_000)}});
  input = await ready();
  await expect(executeReset(input)).rejects.toThrow('drained');
});
it('deletes all personal data atomically, resets only current allowances, preserves the complete shared library and ledger', async () => {
  const libraryBefore = await Promise.all([db.opportunity.findMany(), db.sourcePage.findMany(), db.knowledgeChunk.findMany(), db.researchCandidate.findMany(), db.discoveryRun.findMany()]);
  const history = await db.discoveryUsage.findUniqueOrThrow({where: {month: '2001-01'}});
  const input = await ready(), report = await executeReset(input);
  expect(report.remainingStudents).toBe(0);
  for (const count of Object.values(report.removed)) expect(count).toBe(1);
  expect(await Promise.all([db.student.count(), db.authSession.count(), db.calendarLink.count(), db.event.count(), db.goal.count(), db.milestone.count(), db.savedOpportunity.count(), db.chatMessage.count(), db.conversation.count(), db.studentPick.count(), db.opportunityFeedback.count(), db.pickRefreshState.count(), db.portfolioEntry.count(), db.notificationSettings.count(), db.pushSubscription.count(), db.nudgeDelivery.count(), db.dailyBrief.count(), db.agentAction.count(), db.auditEvent.count(), db.availability.count(), db.loginAttempt.count(), db.opportunitySearchRequest.count()])).toEqual(Array(22).fill(0));
  const libraryAfter = await Promise.all([db.opportunity.findMany(), db.sourcePage.findMany(), db.knowledgeChunk.findMany(), db.researchCandidate.findMany(), db.discoveryRun.findMany()]);
  expect(libraryAfter).toEqual(libraryBefore);
  expect(await db.discoveryUsage.findUnique({where: {month: month()}})).toMatchObject({runs: 0, rechecks: 0, searches: 50, pages: 359, tokens: 1217645, estimatedCost: 6.37058, embeddings: 4, vectorUpserts: 4});
  expect(await db.discoveryUsage.findUnique({where: {month: '2001-01'}})).toEqual(history);
  expect(await db.aIUsage.findUnique({where: {key: `month:${month()}`}})).toMatchObject({count: 0});
  expect(await db.aIUsage.findUnique({where: {key: 'month:2001-01'}})).toMatchObject({count: 12});
  expect(await db.aIUsage.count({where: {key: {startsWith: 'day:'}}})).toBe(1);
  expect(report.before.monthlyAI).toBe(54);
  expect(report.before.discoveryUsage).toMatchObject({runs: 30, rechecks: 10});
  expect(await db.jobLease.findUnique({where: {key: receiptKey(input.operationId)}})).not.toBeNull();
  expect(await db.jobLease.findUnique({where: {key: markerKey}})).not.toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it('interrupts only unfinished work and retains candidates, state and recorded usage', async () => {
  await db.discoveryRun.create({data: {id: 'pending-run', groupKey: 'public-group', kind: 'discovery', state: '{"resume":"public"}', usage: '{"tokens":900}'}});
  const input = await ready(), report = await executeReset(input);
  expect(report.interruptedRuns).toBe(1);
  expect(await db.discoveryRun.findUnique({where: {id: 'pending-run'}})).toMatchObject({status: 'interrupted', state: '{"resume":"public"}', usage: '{"tokens":900}'});
  expect(await db.discoveryRun.findUnique({where: {id: 'completed-run'}})).toMatchObject({status: 'complete', usage: '{"tokens":500,"estimatedCost":0.3}'});
  expect(await db.discoveryGroup.findUnique({where: {key: 'public-group'}})).toMatchObject({status: 'idle', pendingBuckets: '[]'});
});
it('is idempotent, requires successful normal registration/session/Today/Explore checks, and cleans up the disposable student', async () => {
  const input = await ready(), report = await executeReset(input);
  expect(await executeReset(input)).toEqual(report);
  await expect(leaveMaintenance(input.operationId)).rejects.toThrow('verification');
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const response = await app.inject({method: 'POST', url: root + '/verify', headers: owner, payload: {...target, operationId: input.operationId}});
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({passed: true, remainingStudents: 0, libraryUnchanged: true, allowancesReset: true, signedInVisualUIVerified: false});
    expect(response.json().checks.map((c: {status: number}) => c.status)).toEqual([201, 200, 200, 200, 200]);
    expect(await db.student.count()).toBe(0); expect(await db.authSession.count()).toBe(0);
    expect(await db.loginAttempt.count()).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await leaveMaintenance(input.operationId)).toMatchObject({maintenanceActive: false});
  } finally { await app.close(); }
});
it('keeps maintenance enabled and removes the test profile if a screen API fails', async () => {
  const input = await ready(); await executeReset(input);
  const app = await buildApp(); app.log.level = 'silent';
  app.addHook('preHandler', async req => { if (req.url === '/api/today') throw new Error('fixture failure'); });
  try {
    const response = await app.inject({method: 'POST', url: root + '/verify', headers: owner, payload: {...target, operationId: input.operationId}});
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({passed: false, remainingStudents: 0, cleanupSucceeded: true});
    await expect(leaveMaintenance(input.operationId)).rejects.toThrow('verification');
    expect(await db.student.count()).toBe(0);
  } finally { await app.close(); }
});
it('can cancel an unexecuted maintenance window without deleting records, but cannot undo an executed reset', async () => {
  let input = await ready();
  expect(await leaveMaintenance(input.operationId, true)).toMatchObject({cancelled: true});
  expect(await db.student.count()).toBe(1);
  input = await ready(); await executeReset(input);
  await expect(leaveMaintenance(input.operationId, true)).rejects.toThrow('cannot be cancelled');
});
it('requires exactly one recovery choice and refuses an implicit or invalid backup waiver', async () => {
  const input = await ready();
  const waiver = {acknowledgment: backupWaiverAcknowledgment, productionHost: owner.host};
  await expect(executeReset({...input, backup: undefined})).rejects.toThrow('either verified backup');
  await expect(executeReset({...input, backupWaiver: waiver})).rejects.toThrow('never both');
  await expect(executeReset({...input, backup: undefined, backupWaiver: {...waiver, acknowledgment: 'yes'}})).rejects.toThrow('permanent');
  expect(await db.student.count()).toBe(1);
});
it('records an explicit no-backup waiver without claiming a backup and preserves the same library and allowance safeguards', async () => {
  const input = await ready();
  const app = await buildApp(); app.log.level = 'silent';
  const payload = {
    ...input, backup: undefined, ...target, confirmation: 'DELETE ALL PRODUCTION STUDENT DATA',
    backupWaiver: {acknowledgment: backupWaiverAcknowledgment, productionHost: owner.host},
  };
  try {
    const invalid = await app.inject({method: 'POST', url: root + '/execute', headers: owner, payload: {...payload, backupWaiver: {productionHost: owner.host}}});
    expect(invalid.statusCode).toBe(422);
    expect(await db.student.count()).toBe(1);
    const response = await app.inject({method: 'POST', url: root + '/execute', headers: owner, payload});
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      backup: null, backupWaiver: {acknowledgment: backupWaiverAcknowledgment, productionHost: owner.host},
      remainingStudents: 0, allowanceCounters: {runs: 0, rechecks: 0, monthlyAI: 0},
    });
    expect(response.json().backupWaiver.acknowledgedAt).toBeTruthy();
    expect(response.json().backupVerification).toContain('No backup');
    expect(await db.opportunity.count()).toBe(1);
    expect(await db.sourcePage.count()).toBe(1);
    expect(await db.knowledgeChunk.count()).toBe(1);
    expect(await db.researchCandidate.count()).toBe(1);
    expect(await db.discoveryUsage.findUnique({where: {month: month()}})).toMatchObject({estimatedCost: 6.37058, tokens: 1217645});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
