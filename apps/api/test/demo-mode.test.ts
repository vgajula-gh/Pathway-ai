import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const dir = mkdtempSync(join(tmpdir(), 'pathway-demo-')), url = 'file:' + dir + '/test.db';
const db = new PrismaClient({ datasourceUrl: url + '?connection_limit=1' });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; }, j: (v:string, fallback:unknown) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } } }));
import { env } from '../src/lib/env.js';
import { seedCatalog } from '../src/lib/catalog.js';
import { cleanupSamples } from '../src/lib/cleanup-samples.js';
import { memoryStore } from '../src/knowledge/adapters/memory.js';
import { buildApp } from '../src/app.js';
const original = { demo: env.demoMode, codes: env.accessCodes };
beforeAll(async () => {
  writeFileSync(join(dir, 'test.db'), '');
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url } });
}, 30000);
beforeEach(async () => {
  vi.stubEnv('DISCOVERY_ENABLED', 'false'); env.demoMode = false; env.accessCodes = [];
  await db.student.deleteMany(); await db.opportunity.deleteMany(); await db.newsStory.deleteMany();
});
afterAll(async () => { env.demoMode = original.demo; env.accessCodes = original.codes; vi.unstubAllEnvs(); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

it('seeds sourced news without sample opportunities by default; demo samples are opt-in and idempotent', async () => {
  await seedCatalog(); expect(await db.opportunity.count()).toBe(0); expect(await db.newsStory.count()).toBeGreaterThan(0);
  const news = await db.newsStory.count();
  env.demoMode = true; await seedCatalog(); const count = await db.opportunity.count(); expect(count).toBeGreaterThan(0);
  await seedCatalog(); expect(await db.opportunity.count()).toBe(count); expect(await db.newsStory.count()).toBe(news);
  expect(await db.opportunity.count({ where: { isSample: false } })).toBe(0);
});

it('ignores sample-week intake outside demo mode and labels intentional demo events', async () => {
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const first = await app.inject({ method: 'POST', url: '/api/students', payload: { name: 'Student', grade: 10, sampleWeek: true, aiConsent: false } });
    expect(first.statusCode).toBe(201); expect(await db.event.count()).toBe(0);
    expect((await app.inject({ url: '/api/config' })).json().demoMode).toBe(false);
    env.demoMode = true;
    const second = await app.inject({ method: 'POST', url: '/api/students', payload: { name: 'Demo', grade: 10, sampleWeek: true, aiConsent: false } });
    expect(second.statusCode).toBe(201); expect(await db.event.count({ where: { studentId: second.json().id, source: 'sample' } })).toBeGreaterThan(0);
  } finally { await app.close(); }
});

it('hides old sample calendars while retaining real events and stored student records', async () => {
  const s = await db.student.create({ data: { name: 'Student', grade: 10 } });
  for (const source of ['sample', 'manual']) await db.event.create({ data: { studentId: s.id, title: source, type: 'class', start: '2030-01-01T09:00', end: '2030-01-01T10:00', source } });
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const request = { url: '/api/events?from=2030-01-01&to=2030-01-01', headers: { 'x-student-id': s.id } };
    expect((await app.inject(request)).json().map((e:any) => e.source)).toEqual(['manual']);
    env.demoMode = true; expect((await app.inject(request)).json()).toHaveLength(2);
    expect(await db.event.count()).toBe(2);
  } finally { await app.close(); }
});

const opportunity = (id:string, extra = {}) => db.opportunity.create({ data: { id, name:id, organizer:'Example', category:'Program', url:'https://example.edu', format:'Virtual', cost:'Unknown', commitment:'Low', skills:'[]', tags:'[]', ...extra } });
async function chunk(opportunityId:string) {
  await db.sourcePage.create({ data: { opportunityId, sourceUrl:'https://example.edu', pageTitle:'Rules', text:'Public sample passage', contentHash:'hash' } });
  return db.knowledgeChunk.create({ data: { id:'chunk-' + opportunityId, opportunityId, sourceUrl:'https://example.edu', pageTitle:'Rules', text:'Public sample passage', contentHash:'hash', checkedAt:new Date(), embeddingModel:'test:2' } });
}
it('previews cleanup, preserves all authored references, and removes unused sample pages/chunks/vectors idempotently', async () => {
  const s = await db.student.create({ data: { name:'Student', grade:10 } });
  for (const id of ['unused','saved','goal','feedback','proposal']) await opportunity(id);
  await opportunity('real', { source:'discovery', isSample:false });
  await db.savedOpportunity.create({ data: { studentId:s.id, opportunityId:'saved', status:'interested', notes:'Private note', checklist:'[{"title":"Done","done":true}]' } });
  await db.goal.create({ data: { studentId:s.id, opportunityId:'goal', title:'My real goal' } });
  await db.opportunityFeedback.create({ data: { studentId:s.id, opportunityId:'feedback', reason:'cost' } });
  await db.agentAction.create({ data: { studentId:s.id, origin:'student', summary:'Review first', status:'AWAITING_APPROVAL', idemKey:'test', expiresAt:new Date(Date.now()+86400000), actions:'[{"type":"save_opportunity","opportunityId":"proposal"}]' } });
  await db.event.create({ data: { studentId:s.id, title:'Real class', type:'class', start:'2030-01-01T09:00', end:'2030-01-01T10:00' } });
  await db.studentPick.create({ data: { studentId:s.id, opportunityId:'unused', bucket:'paid', rank:0, refreshCycle:'test' } });
  const c = await chunk('unused'), store = memoryStore(2);
  await store.upsert([{ id:c.id, values:[1,0], metadata:{ chunkId:c.id, opportunityId:c.opportunityId, sourceUrl:c.sourceUrl, pageTitle:c.pageTitle, checkedAt:c.checkedAt.toISOString() } }]);
  const saved = await db.savedOpportunity.findFirstOrThrow();
  expect(await cleanupSamples()).toMatchObject({ eligible:1, protected:4, removed:0, dryRun:true });
  expect((await store.list()).ids).toHaveLength(1);
  expect(await cleanupSamples({ apply:true, store })).toMatchObject({ removed:1, protected:4, failed:0 });
  expect(await db.opportunity.findUnique({ where:{id:'unused'} })).toBeNull();
  expect(await db.knowledgeChunk.count()).toBe(0); expect(await db.sourcePage.count()).toBe(0); expect((await store.list()).ids).toEqual([]);
  expect(await db.student.count()).toBe(1); expect(await db.event.count()).toBe(1); expect(await db.goal.count()).toBe(1); expect(await db.opportunityFeedback.count()).toBe(1); expect(await db.agentAction.count()).toBe(1);
  expect(await db.savedOpportunity.findFirstOrThrow()).toEqual(saved); expect(await db.opportunity.findUnique({where:{id:'real'}})).not.toBeNull();
  expect(await cleanupSamples({ apply:true, store })).toMatchObject({ removed:0, failed:0 });
});

it('retains sample database rows if vector cleanup cannot finish', async () => {
  await opportunity('unused'); await chunk('unused');
  const store = { delete: vi.fn().mockRejectedValue(new Error('private provider response')) };
  expect(await cleanupSamples({ apply:true, store })).toMatchObject({ failed:1, removed:0 });
  expect(await db.opportunity.count()).toBe(1); expect(await db.knowledgeChunk.count()).toBe(1);
});
