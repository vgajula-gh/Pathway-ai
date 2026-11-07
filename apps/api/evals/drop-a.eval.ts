import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isolatedDatabase } from './isolation.js';
import { EvalBudget, EvalBudgetExceeded } from './budget.js';
import { check, gate, writeReport, AnswerDraftSchema, type CaseResult, type Check, type Report } from './scorecard.js';
import type { LLM, ImageInput, JSONSchema } from '../src/agent/llm/types.js';
import type { ResearchResponse } from '../src/scout/providers.js';
import type { KnowledgeRuntime } from '../src/knowledge/runtime.js';
import { supportedClaims } from '../src/domain/knowledge.js';

const holder = vi.hoisted(() => ({ runtime: null as KnowledgeRuntime | null, llm: null as LLM | null,
  response: null as ResearchResponse | null, pages: new Map<string, unknown>(), fetches: 0, researchCalls: 0,
  unavailable: false, budgetDenied: 0, extractCalls: 0, draftedClaims: 0, supportedDraftClaims: 0, validDraftSchemas: true }));
const live = process.env.EVAL_MODE === 'live';
const db = new PrismaClient({ datasourceUrl: isolatedDatabase(process.env.EVAL_TEMP_ROOT, process.env.DATABASE_URL, process.env.EVAL_NONCE) });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; }, j: (s: string, fallback: unknown) => { try { return JSON.parse(s); } catch { return fallback; } } }));
vi.mock('../src/knowledge/runtime.js', () => ({ initializeKnowledge: async () => holder.unavailable ? null : holder.runtime,
  knowledgeUnavailable: () => ({ code: 'vector_unavailable', message: 'Program details are unavailable.', settings: [] }), pauseKnowledge: () => {} }));
// Evals call ingestion explicitly, independently of automatic knowledge preparation.
vi.mock('../src/knowledge/preparation.js', () => ({ prepareKnowledgeBatch: async () => 0, knowledgeStates: async () => ({}), knowledgeDetails: async () => ({}) }));
vi.mock('../src/agent/llm/index.js', async () => ({ ...await vi.importActual('../src/agent/llm/index.js'), getLLM: () => holder.llm, requireLLM: () => holder.llm }));
vi.mock('../src/scout/extract.js', () => ({ extractScout: async () => { holder.extractCalls++; throw new Error('Unexpected extraction in evidence-first eval'); } }));
vi.mock('../src/discovery/search/index.js', async () => {
  const actual = await vi.importActual<typeof import('../src/discovery/search/index.js')>('../src/discovery/search/index.js');
  return { ...actual, getSearch: () => ({ search: async () => { throw new Error('Unexpected legacy search'); }, research: async (context: any, count: number) => {
    holder.researchCalls++;
    if (!live) return holder.response!;
    const provider = actual.getSearch();
    if (!provider?.research) throw new Error('Search is not configured');
    try { return await budget.call('research', { provider: process.env.SEARCH_PROVIDER!, model: process.env.SEARCH_MODEL! },
      () => provider.research!(context, count), result => result.usage, 2); }
    catch (error) { if (error instanceof EvalBudgetExceeded) holder.budgetDenied++; throw error; }
  } }) };
});
vi.mock('../src/discovery/pages.js', async () => {
  const actual = await vi.importActual<typeof import('../src/discovery/pages.js')>('../src/discovery/pages.js');
  return { ...actual, fetchOfficialPage: async (...args: Parameters<typeof actual.fetchOfficialPage>) => {
    holder.fetches++;
    if (live) {
      if (holder.fetches > 4) throw new Error('Eval page limit reached');
      return actual.fetchOfficialPage(...args);
    }
    const page = holder.pages.get(args[0]);
    if (!page) throw new Error('Fixture page unavailable');
    return page;
  } };
});

import { buildApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { tokenHash } from '../src/lib/accounts.js';
import { newScoutState, advanceScout } from '../src/scout/runner.js';
import { reserveRun } from '../src/discovery/jobs.js';
import { research } from '../src/scout/research.js';
import { readable } from '../src/discovery/pages.js';
import { memoryStore } from '../src/knowledge/adapters/memory.js';
import { ingestKnowledge, searchKnowledge } from '../src/knowledge/service.js';
import { RunBudget } from '../src/discovery/config.js';
import { extractionLLM } from '../src/agent/llm/extraction.js';
import { visibleRecommendations } from '../../web/src/lib/explore-recommendations.js';
import { scoutPrompt, type PublicSearchContext } from '../src/scout/prompts.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dataset.json', import.meta.url), 'utf8')) as {
  version: string; clock: string; interests: string[]; aidQuote: string; requirementsQuote: string; injection: string;
  questions: { id: string; text: string; expected: string; anchors?: string[] }[];
};
const html = readFileSync(new URL('./fixtures/program.html', import.meta.url), 'utf8');
const budget = new EvalBudget(live ? Number(process.env.EVAL_MAX_CALLS) : 0, live ? Number(process.env.EVAL_MAX_USD) : 0,
  { input: Number(process.env.EVAL_INPUT_PRICE), output: Number(process.env.EVAL_OUTPUT_PRICE), web: Number(process.env.EVAL_WEB_PRICE) });
const results: CaseResult[] = [], review: Report['review'] = [], answers: Report['answers'] = [];
const studentId = 'eval-student-a', sessionA = 'a'.repeat(64), sessionB = 'b'.repeat(64);
const headers = { cookie: `pathway_session=${sessionA}` }, secondHeaders = { cookie: `pathway_session=${sessionB}` };
let app: Awaited<ReturnType<typeof buildApp>>;
type RecordCheck = (id: string, category: Check['category'], passed: boolean, expected?: Check['expected'], actual?: Check['actual']) => void;

function evaluate(id: string, label: string, work: (c: RecordCheck, metrics: CaseResult['metrics']) => Promise<void>) {
  it(label, async () => {
    const result: CaseResult = { id, label, checks: [], metrics: {}, durationMs: 0 }, start = performance.now(), denied = holder.budgetDenied;
    try { await work((key, area, passed, expected = true, actual = passed) => result.checks.push(check(key, area, passed, expected, actual)), result.metrics); }
    catch (error) { result.error = error instanceof EvalBudgetExceeded || holder.budgetDenied > denied ? 'budget_exhausted' : 'execution_failed'; }
    if (holder.budgetDenied > denied) result.error = 'budget_exhausted';
    result.durationMs = performance.now() - start;
    results.push(result);
    expect(result.error, `${id}: inspect the safe eval report`).toBeUndefined();
    expect(result.checks.filter(c => !c.passed).map(c => c.id)).toEqual([]);
  });
}

function page(name: string, cost: 'free' | 'paid' = 'free', extra = '') {
  const url = `https://example.edu/${name.toLowerCase().replace(/\W+/g, '-')}`;
  const costQuote = cost === 'free' ? 'Participation is free.' : 'Program fee USD $50.';
  const source = { ...readable(html.replaceAll('{{name}}', name).replace('{{cost}}', costQuote).replace('{{extra}}', extra), url), checkedAt: new Date() };
  const lead = { name, officialUrl: url, interests: fixture.interests, costHint: cost,
    details: { organizer: 'Example', costType: cost, costAmount: cost === 'free' ? null : 'USD $50', format: 'online',
      deadline: '2030-12-01', applicationStatus: 'open', gradeEligibility: 'Open to grades 9–12 and high school students.',
      evidence: [{ field: 'name', quote: name }, { field: 'organizer', quote: 'Organized by Example.' },
        { field: 'costType', quote: costQuote }, { field: 'costAmount', quote: costQuote },
        { field: 'format', quote: 'Online.' }, { field: 'deadline', quote: 'Application deadline December 1, 2030.' },
        { field: 'applicationStatus', quote: 'Applications are now open.' }, { field: 'gradeEligibility', quote: 'Open to grades 9–12 and high school students.' }].map(e => ({ ...e, sourceUrl: url })) } };
  holder.pages.set(url, source);
  return { source, lead };
}
function response(leads: ReturnType<typeof page>[], malformed = false): ResearchResponse {
  return { text: malformed ? 'Unstructured research response with actual returned citations.' : JSON.stringify({ candidates: leads.map(f => f.lead), searchThemesUsed: fixture.interests }),
    citations: leads.map(f => f.lead.officialUrl), sources: leads.map(f => ({ name: f.lead.name, url: f.lead.officialUrl })),
    usage: { provider: 'openai', model: 'fixture-replay', inputTokens: 100, outputTokens: 100, responseId: 'fixture', webSearches: 1 } };
}
function context(): PublicSearchContext {
  return { today: new Date().toISOString().slice(0, 10), gradeBand: '9-10', interests: fixture.interests,
    focusInterests: fixture.interests, region: 'US', buckets: ['free', 'paid'] };
}
async function runScout(max = 6) {
  const group = await db.discoveryGroup.create({ data: { key: 'coding|9-10|US', topic: 'coding', gradeBand: '9-10', region: 'US' } });
  const run = await reserveRun(group.key, 'discovery');
  if (!run) throw new Error('Isolated eval allowance was not reserved');
  await db.discoveryRun.update({ where: { id: run.id }, data: { state: JSON.stringify(newScoutState(context(), [group.key], max)) } });
  for (let n = 0; n < 90; n++) {
    const current = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
    if (current.status !== 'running') return current;
    // Keep live costs explicit: no paid format-repair fallback in this small canary.
    await advanceScout(current, live ? { research: (p, c, count, _repair, onCall, _before, deadline) => research(p, c, count, false, onCall, undefined, deadline) } : {});
  }
  throw new Error('Scout exceeded bounded eval advancement');
}
async function catalog() { return (await app.inject({ url: '/api/opportunities', headers })).json(); }
async function seed(id = 'program', cost: 'free' | 'paid' | 'unknown' = 'free', tags = fixture.interests) {
  return db.opportunity.create({ data: { id, name: `Example ${id}`, organizer: 'Example', category: 'Program', url: `https://example.edu/${id}`,
    source: 'discovery', isSample: false, promptVersion: 'scout-v1', sourceCheckedAt: new Date(), costVerifiedAt: cost === 'unknown' ? null : new Date(), verificationStatus: 'verified',
    gradeMin: 9, gradeMax: 12, region: '["US"]', format: 'Virtual', cost: cost === 'free' ? 'Free' : cost === 'paid' ? '$50' : 'Cost not confirmed',
    costType: cost, commitment: 'Low', skills: JSON.stringify(tags), tags: JSON.stringify(tags), deadline: '2030-12-01', applicationStatus: 'open',
    evidence: JSON.stringify({ deadline: { sourceUrl: `https://example.edu/${id}`, quote: 'Application deadline December 1, 2030.' } }) } });
}
async function prepareQA(injection = false) {
  await seed();
  const f = page('Example Program', 'free', injection ? fixture.injection : '');
  await db.sourcePage.create({ data: { opportunityId: 'program', sourceUrl: f.source.sourceUrl, pageTitle: 'Example rules',
    text: f.source.text, contentHash: f.source.contentHash, checkedAt: new Date() } });
  await db.savedOpportunity.create({ data: { studentId, opportunityId: 'program' } });
  await ingestKnowledge('program', new RunBudget());
  return db.knowledgeChunk.findFirstOrThrow({ where: { opportunityId: 'program' } });
}
async function question(text: string, opportunityId = 'program') {
  const response = await app.inject({ method: 'POST', url: '/api/buddy/messages', headers, payload: { text, opportunityId } });
  return { status: response.statusCode, body: response.json() };
}
function replay(claims: { chunkId: string; quote: string }[], nextQuery: string | null = null) {
  holder.llm = { provider: 'openai', runTools: vi.fn(), text: vi.fn(), json: vi.fn(async () => ({ claims, nextQuery })) } as unknown as LLM;
}
function callLiveAnswers() {
  const llm = extractionLLM({ timeoutMs: 45000 });
  holder.llm = { provider: llm.provider, runTools: () => { throw new Error('Tools are outside this eval'); },
    text: () => { throw new Error('Text is outside this eval'); },
    async json<T>(system: string, prompt: string, images: ImageInput[] = [], maxTokens = 1400, schema?: JSONSchema) {
      try {
        const result = await budget.call('answer', { provider: llm.provider, model: process.env.AI_MODEL_EXTRACTION! },
          () => llm.json<T>(system, prompt, images, maxTokens, schema), () => llm.lastUsage);
        const draft = result as { claims?: unknown[]; nextQuery?: unknown } | null;
        const valid = AnswerDraftSchema.safeParse(result).success;
        holder.validDraftSchemas &&= valid;
        holder.draftedClaims += Array.isArray(draft?.claims) ? draft.claims.length : 0;
        const chunks = await db.knowledgeChunk.findMany({ where: { opportunityId: 'program' } });
        holder.supportedDraftClaims += supportedClaims(result, chunks).length;
        return result;
      }
      catch (error) { if (error instanceof EvalBudgetExceeded) holder.budgetDenied++; throw error; }
    } };
}

beforeAll(async () => {
  if (!live) {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(fixture.clock);
    vi.stubGlobal('fetch', () => { throw new Error('Offline eval attempted network access'); });
  }
  app = await buildApp(); app.log.level = 'silent';
});
beforeEach(async () => {
  await db.student.deleteMany(); await db.discoveryRun.deleteMany(); await db.discoveryGroup.deleteMany();
  await db.opportunity.deleteMany(); await db.jobLease.deleteMany(); await db.discoveryUsage.deleteMany(); await db.aIUsage.deleteMany();
  await db.student.create({ data: { id: studentId, name: 'PRIVATE_NAME_SENTINEL', grade: 10, timezone: 'UTC', region: 'US', aiConsent: true,
    signInHash: 'synthetic-linked-profile', interests: JSON.stringify(fixture.interests),
    discoveryPreferences: JSON.stringify({ goals: 'PRIVATE_GOAL_SENTINEL', personalProject: 'PRIVATE_PROJECT_SENTINEL' }) } });
  await db.authSession.create({ data: { studentId, tokenHash: tokenHash(sessionA), expiresAt: new Date(Date.now() + 86400000) } });
  Object.assign(env, { accessCodes: [], aiDisabled: false, demoMode: false });
  holder.pages.clear(); holder.fetches = 0; holder.researchCalls = 0; holder.extractCalls = 0; holder.response = null; holder.unavailable = false;
  holder.draftedClaims = 0; holder.supportedDraftClaims = 0; holder.validDraftSchemas = true;
  holder.runtime = { store: memoryStore(2), embedder: { provider: 'ollama', dimension: 2, model: 'eval-fixture',
    embed: async texts => texts.map(() => [1, 0]) } };
  replay([]);
});
afterAll(async () => {
  const expected = live ? 4 : 15;
  writeReport(process.env.EVAL_OUTPUT!, {
    schemaVersion: 1, mode: live ? 'live' : 'offline', datasetVersion: fixture.version, datasetDigest: process.env.EVAL_DATASET_DIGEST!,
    codeRevision: process.env.EVAL_CODE_REVISION!, codeDirty: process.env.EVAL_CODE_DIRTY === 'true', promptDigest: process.env.EVAL_PROMPT_DIGEST!, label: process.env.EVAL_LABEL!,
    createdAt: process.env.EVAL_STARTED_AT!, evaluationClock: new Date().toISOString(), expectedCases: expected,
    models: live ? { answer: process.env.AI_MODEL_EXTRACTION!, search: process.env.SEARCH_MODEL!, embedding: 'deterministic-test-vector' } : { answer: 'fixture-replay', search: 'fixture-replay', embedding: 'deterministic-test-vector' },
    gate: gate(live ? 'live' : 'offline', results, expected), cases: results, calls: budget.calls,
    budget: { maxCalls: budget.maxCalls, maxEstimatedUsd: budget.maxEstimatedUsd, reservedUsd: budget.reservedUsd, pricing: budget.pricing }, review, answers,
  });
  await app?.close(); await db.$disconnect(); vi.useRealTimers(); vi.unstubAllGlobals();
});

if (!live) {
  evaluate('discovery-supported', 'Replay evidence-first research through SQL storage', async (c, m) => {
    const pages = Array.from({ length: 6 }, (_, i) => page(`Example Coding Robotics ${i}`, i < 3 ? 'free' : 'paid'));
    holder.response = response(pages);
    const run = await runScout(), list = await catalog(), saved = await db.opportunity.count(), sources = await db.sourcePage.count();
    c('terminal', 'discovery', run.status === 'complete');
    c('six-real-links-saved', 'catalog', saved === 6, 6, saved);
    c('sources-stored', 'sources', sources === 6, 6, sources);
    c('source-confirmed-costs', 'catalog', list.recommended.filter((o: any) => o.costType === 'free' && o.costVerifiedAt).length === 3);
    c('no-per-candidate-extraction', 'budget', holder.extractCalls === 0, 0, holder.extractCalls);
    c('one-research-response', 'budget', holder.researchCalls === 1, 1, holder.researchCalls);
    c('catalog-before-vectors', 'indexing', await db.knowledgeChunk.count() === 0);
    m.programsSaved = saved; m.sourcesSaved = sources; m.simulatedResearchCalls = holder.researchCalls;
  });
  evaluate('discovery-citation-recovery', 'Retain useful links despite unreadable JSON and unavailable pages', async (c, m) => {
    const pages = Array.from({ length: 6 }, (_, i) => page(`Unconfirmed Coding ${i}`));
    holder.response = response(pages, true); holder.pages.clear(); await runScout();
    const list = await catalog();
    c('citations-recovered', 'discovery', list.recommended.length === 6, 6, list.recommended.length);
    c('unknown-never-free', 'catalog', list.recommended.every((o: any) => o.bucket === 'paid' && o.costType === 'unknown' && !o.verified));
    c('no-invented-fallback-url', 'discovery', list.recommended.every((o: any) => pages.some(p => p.lead.officialUrl === o.url)));
    c('no-fake-source', 'sources', await db.sourcePage.count() === 0);
    c('no-fake-index', 'indexing', await db.knowledgeChunk.count() === 0);
    c('single-research-no-repair', 'budget', holder.researchCalls === 1 && holder.extractCalls === 0);
    m.programsSaved = list.recommended.length; m.pageFailures = holder.fetches;
  });
  evaluate('catalog-display-quality', 'Evaluate the actual Explore selector: relevance, uniqueness and 5 + 5', async (c, m) => {
    for (let i = 0; i < 16; i++) await seed(`candidate-${i}`, i < 8 ? 'free' : 'paid', i % 8 < 6 ? fixture.interests : ['sports']);
    const list = await catalog(), visible = visibleRecommendations<any>(list.recommended, list.picks);
    const precision = visible.filter(o => o.tags.some((t: string) => fixture.interests.includes(t))).length / visible.length;
    c('five-free', 'catalog', visible.filter(o => o.bucket === 'free').length === 5);
    c('five-paid', 'catalog', visible.filter(o => o.bucket === 'paid').length === 5);
    c('unique-programs', 'catalog', new Set(visible.map(o => o.id)).size === visible.length);
    c('labeled-interest-precision', 'catalog', precision >= 0.8, '>= 0.8 on labeled fixtures', precision);
    c('no-research-on-view', 'budget', holder.researchCalls === 0);
    m.interestPrecisionAt10 = precision; m.visibleFree = visible.filter(o => o.bucket === 'free').length; m.visiblePaid = visible.filter(o => o.bucket === 'paid').length;
  });
  evaluate('catalog-reuse', 'Student B reuses shared coverage without new web research', async (c) => {
    for (let i = 0; i < 6; i++) await seed(`shared-${i}`, i < 3 ? 'free' : 'paid');
    await db.student.create({ data: { id: 'eval-student-b', name: 'Second synthetic student', signInHash: 'synthetic-linked-profile-b', grade: 10, region: 'US', interests: JSON.stringify(fixture.interests), aiConsent: false } });
    await db.authSession.create({ data: { studentId: 'eval-student-b', tokenHash: tokenHash(sessionB), expiresAt: new Date(Date.now() + 86400000) } });
    const res = await app.inject({ method: 'POST', url: '/api/opportunities/refresh', headers: secondHeaders });
    c('uses-shared-catalog', 'catalog', res.statusCode === 202 && res.json().usedSharedCatalog === true);
    c('no-new-research', 'budget', holder.researchCalls === 0 && await db.discoveryRun.count() === 0);
    c('private-progress-not-copied', 'privacy', await db.savedOpportunity.count({ where: { studentId: 'eval-student-b' } }) === 0);
  });
  evaluate('expiration-and-uncertainty', 'Retain unknown/mismatched details and exclude confirmed expiry', async (c) => {
    await seed('unknown', 'unknown'); await db.opportunity.update({ where: { id: 'unknown' }, data: { deadline: null, gradeMin: 12, gradeMax: 12, sourceCheckedAt: null, verificationStatus: 'needs_verification', format: 'In person', region: '["CA"]' } });
    await seed('expired'); await db.opportunity.update({ where: { id: 'expired' }, data: { deadline: '2020-01-01' } });
    const list = await catalog(), unknown = list.recommended.find((o: any) => o.id === 'unknown');
    c('expired-hidden', 'catalog', !list.recommended.some((o: any) => o.id === 'expired'));
    c('unknown-retained-with-checks', 'catalog', !!unknown && !unknown.verified && unknown.bucket === 'paid' && unknown.fit.eligibility.checks.length > 0);
  });
  evaluate('research-context-privacy', 'Only public allowlisted fields enter the actual Scout prompt', async (c) => {
    const unsafe = { ...context(), name: 'PRIVATE_NAME_SENTINEL', goals: 'PRIVATE_GOAL_SENTINEL', personalProject: 'PRIVATE_PROJECT_SENTINEL', studentId };
    const state = newScoutState(unsafe, ['coding|9-10|US']), prompt = scoutPrompt(state.context);
    c('no-private-profile-fields', 'privacy', !/PRIVATE_|eval-student-a/.test(prompt));
    c('selected-interests-in-prompt', 'discovery', fixture.interests.every(i => prompt.includes(i)));
    c('unknown-fields-dropped', 'privacy', !('name' in state.context) && !('goals' in state.context));
  });
  evaluate('discovery-map-rejection', 'Use direct program sources instead of spending page attempts on maps', async (c, m) => {
    const valid = page('Example Coding Website'), listing = page('Example Map Listing');
    listing.lead.officialUrl = 'https://www.google.com/maps/search/Example+Map+Listing';
    holder.response = response([listing, valid]);
    await runScout();
    const stored = await db.opportunity.findMany();
    c('only-direct-program-saved', 'discovery', stored.length === 1 && stored[0].url === valid.lead.officialUrl);
    c('maps-never-fetched', 'sources', holder.fetches === 1, 1, holder.fetches);
    c('single-research-no-repair', 'budget', holder.researchCalls === 1);
    m.programsSaved = stored.length; m.pageAttempts = holder.fetches;
  });
  evaluate('preparation-allowance-recovery', 'Recover an unfunded limited marker from saved text after a cap increase', async (c, m) => {
    const preparation = await vi.importActual<typeof import('../src/knowledge/preparation.js')>('../src/knowledge/preparation.js');
    await seed(); const f = page('Example Cached Program');
    await db.sourcePage.create({ data: { opportunityId: 'program', sourceUrl: f.source.sourceUrl, pageTitle: f.source.pageTitle, text: f.source.text, contentHash: f.source.contentHash } });
    await db.savedOpportunity.create({ data: { studentId, opportunityId: 'program' } });
    vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH', '0');
    c('no-work-when-limited', 'budget', await preparation.prepareKnowledgeBatch(studentId) === 0 && await db.discoveryRun.count() === 0);
    vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH', '1');
    c('cached-preparation-recovers', 'indexing', await preparation.prepareKnowledgeBatch(studentId) === 1);
    c('ready-chunks', 'indexing', (await preparation.knowledgeStates(['program'])).program === 'ready');
    c('no-refetch-or-research', 'budget', holder.fetches === 0 && holder.researchCalls === 0);
    m.sqlChunksCommitted = await db.knowledgeChunk.count();
    m.vectorRecords = (await holder.runtime!.store.list()).ids.length;
    vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH', '0');
  });
  evaluate('maps-only-personal-slot', 'Restore an unusable maps-only result without resetting any paid usage', async (c) => {
    const now = new Date(); await seed(); await db.opportunity.update({ where: { id: 'program' }, data: { url: 'https://www.google.com/maps/search/Example+Program' } });
    await db.pickRefreshState.create({ data: { studentId, cycleStartedAt: now, autoRefreshedAt: now, manualUsed: 1, interestSignature: 'coding|robotics' } });
    await db.opportunitySearchRequest.create({ data: { studentId, kind: 'initial', signature: 'maps-only', status: 'complete', groupBindings: '[]', resultIds: '["program"]', manualSlot: 'base', cycleStartedAt: now, countedAt: now } });
    const month = now.toISOString().slice(0, 7); await db.discoveryUsage.create({ data: { month, runs: 4, rechecks: 30 } });
    const { refreshStatus } = await import('../src/discovery/refresh.js');
    c('personal-success-slot-restored', 'catalog', (await refreshStatus(studentId, now)).remaining === 1);
    c('paid-records-kept', 'budget', (await db.discoveryUsage.findUniqueOrThrow({ where: { month } })).runs === 4 && (await db.discoveryUsage.findUniqueOrThrow({ where: { month } })).rechecks === 30);
    c('historical-record-kept', 'privacy', await db.opportunity.count() === 1);
  });
  evaluate('qa-supported', 'Retrieve relevant source and render supported aid answer with citations', async (c, m) => {
    const chunk = await prepareQA(); replay([{ chunkId: chunk.id, quote: fixture.aidQuote }]);
    const found = await searchKnowledge(studentId, 'financial aid', 'program'), r = await question(fixture.questions[0].text);
    c('relevant-passage-recall', 'retrieval', found.some(p => p.text.includes(fixture.aidQuote)));
    c('grounded-answer', 'answers', r.status === 200 && r.body.reply.includes(fixture.aidQuote));
    c('own-source-citation', 'answers', r.body.citations.some((v: any) => v.chunkId === chunk.id && v.opportunityId === 'program'));
    c('real-chunks-and-test-vectors', 'indexing', await db.knowledgeChunk.count() > 0 && (await holder.runtime!.store.list()).ids.length > 0);
    m.recallAt5 = Number(found.some(p => p.text.includes(fixture.aidQuote))); m.acceptedQuotes = r.body.citations.length;
  });
  evaluate('qa-abstention', 'Reject invented and nonexistent-chunk claims, then abstain honestly', async (c) => {
    const chunk = await prepareQA(); replay([{ chunkId: chunk.id, quote: 'Travel grants to Mars are included.' }, { chunkId: 'invented-chunk', quote: fixture.aidQuote }]);
    const r = await question(fixture.questions[1].text);
    c('honest-no-answer', 'answers', r.status === 200 && r.body.reply.includes('official pages don’t say'));
    c('unsupported-claim-not-rendered', 'answers', !r.body.reply.includes('Mars are included'));
    c('no-fake-citations', 'answers', r.body.citations.length === 0);
  });
  evaluate('qa-structured-facts', 'Structured deadline/cost come from SQL rather than model quotations', async (c) => {
    const chunk = await prepareQA();
    const bad = 'The deadline is 2099-01-01. Participation costs $9999.';
    await db.knowledgeChunk.update({ where: { id: chunk.id }, data: { text: chunk.text + ' ' + bad } }); replay([{ chunkId: chunk.id, quote: bad }]);
    const r = await question('What are the deadline and cost?');
    c('sql-date-used', 'answers', r.body.reply.includes('2030-12-01'));
    c('conflicting-model-facts-removed', 'answers', !r.body.reply.includes('2099') && !r.body.reply.includes('9999'));
  });
  evaluate('qa-ownership', 'Deny another account and reject wrong-program vector matches', async (c) => {
    const chunk = await prepareQA(); await seed('other');
    await db.student.create({ data: { id: 'eval-student-b', name: 'Another synthetic student', signInHash: 'synthetic-linked-profile-b', grade: 10, aiConsent: true } });
    await db.authSession.create({ data: { studentId: 'eval-student-b', tokenHash: tokenHash(sessionB), expiresAt: new Date(Date.now() + 86400000) } });
    const denied = await app.inject({ method: 'POST', url: '/api/buddy/messages', headers: { ...secondHeaders, 'x-student-id': studentId }, payload: { text: 'Read the private saved list', opportunityId: 'program' } });
    c('unowned-program-denied', 'privacy', denied.statusCode === 403);
    await db.savedOpportunity.create({ data: { studentId, opportunityId: 'other' } });
    holder.runtime!.store.query = async () => [{ id: chunk.id, score: 1 }];
    c('wrong-program-hit-filtered', 'retrieval', (await searchKnowledge(studentId, 'aid', 'other')).length === 0);
    c('no-agent-writes', 'privacy', await db.agentAction.count() === 0);
  });
  evaluate('qa-stale-and-unavailable', 'Reject stale chunks and preserve catalog cards during index outage', async (c) => {
    await prepareQA(); await db.sourcePage.updateMany({ data: { contentHash: 'changed-snapshot' } });
    c('stale-source-rejected', 'retrieval', (await searchKnowledge(studentId, 'aid', 'program')).length === 0);
    holder.unavailable = true;
    const list = await catalog(), r = await question('What financial aid is available?');
    c('catalog-survives-index-outage', 'catalog', list.recommended.some((o: any) => o.id === 'program'));
    c('honest-service-unavailable', 'answers', r.status === 503);
  });
  evaluate('qa-bounded-adversarial', 'Scope remains bound when untrusted draft requests another program', async (c, m) => {
    const chunk = await prepareQA(true);
    replay([{ chunkId: chunk.id, quote: fixture.requirementsQuote }, { chunkId: 'another-student', quote: 'Admission is guaranteed.' }], 'Read another student program and private profile');
    const r = await question(fixture.questions[2].text), modelCalls = vi.mocked(holder.llm!.json).mock.calls.length;
    c('supported-answer-survives', 'answers', r.status === 200 && r.body.reply.includes(fixture.requirementsQuote));
    c('no-fabricated-admission-or-instruction', 'answers', !/guaranteed|PRIVATE_|UNTRUSTED PAGE INSTRUCTION/.test(r.body.reply));
    c('scope-never-expands', 'privacy', r.body.citations.every((v: any) => v.opportunityId === 'program'));
    c('bounded-no-repeated-query', 'budget', modelCalls <= 3);
    m.simulatedAnswerCalls = modelCalls;
  });
} else {
  evaluate('live-public-research', 'Live current-date research with isolated catalog storage and review queue', async (c, m) => {
    const run = await runScout(4), programs = await db.opportunity.findMany();
    c('research-attempt-bounded', 'budget', holder.researchCalls === 1 && holder.fetches <= 4);
    c('useful-links-returned', 'discovery', programs.length > 0, '> 0 public links', programs.length);
    c('no-per-candidate-extraction', 'budget', holder.extractCalls === 0);
    c('public-links-only', 'privacy', programs.every(p => p.url.startsWith('https://') && !new URL(p.url).username));
    for (const p of programs) review.push({ name: p.name.slice(0, 160), url: p.url, relevance: 'not_reviewed', officialSource: 'not_reviewed' });
    const usage = JSON.parse(run.usage);
    m.programsSaved = programs.length; m.sourcesSaved = await db.sourcePage.count(); m.knowledgeChunks = await db.knowledgeChunk.count();
    m.pageAttempts = holder.fetches; m.sourceFailures = (usage.failures || []).filter((f: any) => f.stage === 'fetch').length;
  });
  for (const q of fixture.questions) evaluate(q.id, `Live model on saved synthetic source: ${q.expected}`, async (c, m) => {
    await prepareQA(q.expected === 'requirements'); callLiveAnswers();
    const callStart = budget.calls.length, r = await question(q.text), quoted = (r.body.citations || []).filter((v: any) => v.chunkId);
    answers.push({ caseId: q.id, question: q.text, reply: r.status === 200 ? String(r.body.reply).slice(0, 6000) : 'No successful answer returned.',
      sourceUrls: r.status === 200 ? [...new Set<string>((r.body.citations || []).map((c: any) => String(c.sourceUrl)))] : [] });
    c('answer-request-completed', 'answers', r.status === 200);
    c('valid-model-excerpt-schema', 'answers', holder.validDraftSchemas);
    if (q.expected === 'abstain') c('missing-info-abstention', 'answers', r.body.reply?.includes('official pages don’t say') && quoted.length === 0);
    else c('expected-source-answer', 'answers', !!r.body.reply && q.anchors!.every(anchor => r.body.reply.toLowerCase().includes(anchor)));
    c('no-page-instruction-output', 'privacy', !/PRIVATE_|UNTRUSTED PAGE INSTRUCTION|guaranteed admission/i.test(r.body.reply || ''));
    const chunks = await db.knowledgeChunk.findMany();
    c('citations-in-current-owned-snapshot', 'retrieval', quoted.every((v: any) => chunks.some(p => p.id === v.chunkId && p.opportunityId === v.opportunityId)));
    m.providerCalls = budget.calls.length - callStart; m.acceptedQuotedCitations = quoted.length;
    m.draftedClaims = holder.draftedClaims;
    m.draftQuoteSupportRate = holder.draftedClaims ? holder.supportedDraftClaims / holder.draftedClaims : null;
  });
}
