import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const remote = vi.hoisted(() => ({ describeIndex: vi.fn(), chunks: vi.fn(async () => []) }));
vi.mock('../src/knowledge/adapters/pinecone-client.js', () => ({
  pineconeClient: () => ({ index: () => ({}), describeIndex: remote.describeIndex }),
}));
vi.mock('../src/lib/db.js', () => ({ prisma: { knowledgeChunk: { findMany: remote.chunks } }, j: JSON.parse }));
import { env } from '../src/lib/env.js';
import { initializeKnowledge, knowledgeUnavailable, pauseKnowledge } from '../src/knowledge/runtime.js';
import { configurationIssue } from '../src/knowledge/readiness.js';
import { discoveryAvailability } from '../src/discovery/availability.js';

const originalDisabled = env.aiDisabled;
const configured = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://unused/test', DISCOVERY_ENABLED: 'true',
  AI_DISABLED: 'false', LLM_PROVIDER: 'openai', OPENAI_MODEL:'gpt-5-nano', SEARCH_PROVIDER: 'openai', OPENAI_API_KEY: 'private-test-key',
  EMBEDDING_PROVIDER: 'openai', EMBEDDING_MODEL: 'text-embedding-3-small', EMBEDDING_DIMENSION: '1536',
  VECTOR_STORE: 'pinecone', PINECONE_API_KEY: 'private-vector-key', PINECONE_INDEX: 'programs',
};
beforeEach(() => {
  vi.useFakeTimers();
  Object.entries(configured).forEach(([name, value]) => vi.stubEnv(name, value));
  env.aiDisabled = false;
  pauseKnowledge();
  vi.advanceTimersByTime(60001);
  remote.describeIndex.mockReset().mockResolvedValue({ dimension: 1536, metric: 'cosine' });
  remote.chunks.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'));
});
afterEach(() => { env.aiDisabled = originalDisabled; vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

it.each([
  [{ DISCOVERY_ENABLED: 'false' }, 'discovery_disabled', 'DISCOVERY_ENABLED'],
  [{ SEARCH_PROVIDER: 'OpenAI' }, 'search_not_configured', 'SEARCH_PROVIDER'],
  [{ SEARCH_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' }, 'search_not_configured', 'ANTHROPIC_API_KEY'],
  [{ EMBEDDING_PROVIDER: 'none' }, 'embedding_not_configured', 'EMBEDDING_PROVIDER'],
  [{ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: '' }, 'embedding_not_configured', 'VOYAGE_API_KEY'],
  [{ PINECONE_INDEX: '' }, 'vector_not_configured', 'PINECONE_INDEX'],
] as const)('identifies a setup blocker without returning configuration values: %j', (changes, code, setting) => {
  const issue = configurationIssue({ ...configured, ...changes }, false);
  expect(issue).toMatchObject({ code, settings: [setting] });
  expect(JSON.stringify(issue)).not.toContain('private-test-key');
  expect(JSON.stringify(issue)).not.toContain('private-vector-key');
});

it('does not probe services until the required index setting is present', async () => {
  vi.stubEnv('PINECONE_INDEX', '');
  expect(await initializeKnowledge()).toBeNull();
  expect(knowledgeUnavailable()).toMatchObject({ code: 'vector_not_configured', settings: ['PINECONE_INDEX'] });
  expect(remote.describeIndex).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ['PineconeAuthorizationError', 'pinecone_authorization_failed'],
  ['PineconeNotFoundError', 'pinecone_index_not_found'],
] as const)('reports %s using fixed messages and never logs a raw provider error', async (name, code) => {
  const error = new Error('private-vector-key in a provider response'); error.name = name;
  remote.describeIndex.mockRejectedValue(error);
  expect(await initializeKnowledge()).toBeNull();
  expect(knowledgeUnavailable().code).toBe(code);
  expect(JSON.stringify(knowledgeUnavailable())).not.toContain(error.message);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private-vector-key');
});

it.each([
  [{ dimension: 1024, metric: 'cosine' }, 'index_dimension_mismatch'],
  [{ dimension: 1536, metric: 'dotproduct' }, 'index_metric_mismatch'],
] as const)('retains the specific index setup failure: %j', async (description, code) => {
  remote.describeIndex.mockResolvedValue(description);
  expect(await initializeKnowledge()).toBeNull();
  expect(knowledgeUnavailable().code).toBe(code);
  expect(fetch).not.toHaveBeenCalled();
});

it('reuses a failed readiness result for a minute, then recovers without a paid AI request', async () => {
  remote.describeIndex.mockRejectedValueOnce(new Error('private transport failure'));
  expect(await discoveryAvailability(true)).toEqual({enabled:true,unavailable:null});
  expect(await initializeKnowledge()).toBeNull();
  expect(remote.describeIndex).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60001);
  expect(await discoveryAvailability(true)).toEqual({ enabled: true, unavailable: null });
  expect(await initializeKnowledge()).not.toBeNull();
  expect(remote.describeIndex).toHaveBeenCalledTimes(2);
  expect(fetch).not.toHaveBeenCalled();
});

it('gives the student an AI consent instruction without contacting services', async () => {
  expect(await discoveryAvailability(false)).toMatchObject({ enabled: false, unavailable: { code: 'ai_consent_required', settings: [] } });
  expect(remote.describeIndex).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps SQLite on the local memory store even when Pinecone is selected but unconfigured', async () => {
  vi.stubEnv('DATABASE_URL', 'file:./dev.db'); vi.stubEnv('PINECONE_API_KEY', ''); vi.stubEnv('PINECONE_INDEX', '');
  expect((await initializeKnowledge())?.store.kind).toBe('memory');
  expect(remote.describeIndex).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('explains a missing extraction model before a paid search and accepts an explicit override',()=>{
  expect(configurationIssue({...configured,SCOUT_SOURCE_MODE:'fetch_and_extract',OPENAI_MODEL:'',AI_MODEL_EXTRACTION:''},false)).toMatchObject({code:'extraction_not_configured',settings:['AI_MODEL_EXTRACTION','OPENAI_MODEL']});
  expect(configurationIssue({...configured,SCOUT_SOURCE_MODE:'fetch_and_extract',OPENAI_MODEL:'',AI_MODEL_EXTRACTION:'gpt-4.1-mini'},false)).toBeNull();
});

it('does not require a separate extraction model in research-evidence mode',()=>{
 expect(configurationIssue({...configured,SCOUT_SOURCE_MODE:'research_evidence',OPENAI_MODEL:'',AI_MODEL_EXTRACTION:''},false)).toBeNull();
});
