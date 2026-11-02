import { it, expect, vi, afterEach } from 'vitest';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { createDiscoveryGraph, DiscoveryNodes } from '../src/discovery/graph.js';
import { createQuestionGraph } from '../src/knowledge/question-graph.js';
import { RunBudget } from '../src/discovery/config.js';
import { privateWorkflow, workflowConfig, WorkflowStep } from '../src/workflows/privacy.js';
import { chunkText, splitOfficialPages } from '../src/knowledge/documents.js';
import { programAnswerChain } from '../src/knowledge/answer-chain.js';
import type { LLM } from '../src/agent/llm/types.js';
import type { Passage } from '../src/knowledge/contracts.js';
const page = {
  sourceUrl: 'https://example.edu/program',
  pageTitle: 'Rules',
  text: 'Applications require a teacher recommendation.',
  contentHash: 'hash',
  checkedAt: new Date(),
  links: [],
};
const passage: Passage = { id: 'chunk', opportunityId: 'program', ...page };
const run = <T>(fn: () => Promise<T>) => privateWorkflow(fn);
const group = { key: 'robotics|9-10|NC', topic: 'robotics', gradeBand: '9-10', region: 'NC' };
afterEach(() => vi.unstubAllEnvs());
it('uses graph branches to refine retrieval, verify exact claims and stop at three searches/models', async () => {
  const retrieve = vi.fn(async () => [passage]);
  let calls = 0;
  const draft = vi.fn(async () => ({
    claims: [
      { chunkId: 'chunk', quote: page.text },
      { chunkId: 'wrong', quote: page.text },
    ],
    nextQuery: `different query ${++calls}`,
  }));
  const steps: WorkflowStep[] = [];
  const graph = createQuestionGraph({ retrieve, draft }, (step) => steps.push(step));
  const result = await run(() =>
    graph.invoke({ query: 'requirements' }, workflowConfig('test-question', 20)),
  );
  expect(retrieve).toHaveBeenCalledTimes(3);
  expect(draft).toHaveBeenCalledTimes(3);
  expect(result.supported).toHaveLength(1);
  expect(result.queries).toHaveLength(3);
  expect(steps.filter((s) => s.node === 'verify_claims')).toHaveLength(3);
});
it('stops repeated model searches and takes the no-answer branch without a model call for empty retrieval', async () => {
  const retrieve = vi.fn(async () => [passage]),
    draft = vi.fn(async () => ({ claims: [], nextQuery: '  REQUIREMENTS  ' }));
  const graph = createQuestionGraph({ retrieve, draft });
  expect(
    (await run(() => graph.invoke({ query: 'requirements' }, workflowConfig('repeat')))).supported,
  ).toEqual([]);
  expect(retrieve).toHaveBeenCalledTimes(1);
  const empty = createQuestionGraph({ retrieve: async () => [], draft });
  expect((await run(() => empty.invoke({ query: 'missing' }, workflowConfig('empty')))).supported).toEqual(
    [],
  );
  expect(draft).toHaveBeenCalledTimes(1);
});
it('does not retry paid model failures or accept unsupported claims', async () => {
  const draft = vi.fn().mockRejectedValue(new Error('provider unavailable')),
    graph = createQuestionGraph({ retrieve: async () => [passage], draft });
  await expect(run(() => graph.invoke({ query: 'requirements' }, workflowConfig('outage')))).rejects.toThrow(
    'provider unavailable',
  );
  expect(draft).toHaveBeenCalledTimes(1);
  draft.mockResolvedValue({ claims: [{ chunkId: 'chunk', quote: 'A scholarship is guaranteed.' }] });
  expect(
    (await run(() => graph.invoke({ query: 'scholarship' }, workflowConfig('claims')))).supported,
  ).toEqual([]);
});
it('keeps concurrent graph state separate instead of carrying passages across questions', async () => {
  const graph = createQuestionGraph({
    retrieve: async (query) => [{ ...passage, id: query }],
    draft: async (list) => ({ claims: [{ chunkId: list[0].id, quote: page.text }] }),
  });
  const [a, b] = await Promise.all(
    ['first', 'second'].map((query) => run(() => graph.invoke({ query }, workflowConfig('concurrency')))),
  );
  expect(a.passages.map((p) => p.id)).toEqual(['first']);
  expect(b.passages.map((p) => p.id)).toEqual(['second']);
});
function nodes(): DiscoveryNodes {
  return {
    search: { search: vi.fn(async () => ({ urls: [page.sourceUrl], tokens: 0 })) },
    fetch: vi.fn(async () => page),
    extract: vi.fn(async () => ({}) as Awaited<ReturnType<DiscoveryNodes['extract']>>),
    verify: vi.fn(() => ({verificationStatus:'verified'}) as ReturnType<DiscoveryNodes['verify']>),
    save: vi.fn(async () => 'program'),
    ingest: vi.fn(async () => {}),
  };
}
it('verifies before storing and ingesting, and skips a failed candidate without retrying it', async () => {
  const steps: WorkflowStep[] = [],
    deps = nodes();
  const graph = createDiscoveryGraph(deps, new RunBudget(), (step) => steps.push(step));
  expect(
    (await run(() => graph.invoke({ group, buckets: ['free'] }, workflowConfig('discovery')))).saved,
  ).toEqual(['program']);
  expect(steps.map((s) => s.node)).toEqual([
    'search_candidates',
    'fetch_official_pages',
    'extract_facts',
    'verify_facts',
    'store_catalog',
    'ingest_knowledge',
  ]);
  vi.mocked(deps.verify).mockImplementation(() => {
    throw new Error('unconfirmed');
  });
  vi.mocked(deps.save).mockClear();
  const denied = createDiscoveryGraph(deps, new RunBudget(), (step) => steps.push(step));
  expect(
    (await run(() => denied.invoke({ group, buckets: ['free'] }, workflowConfig('denied')))).saved,
  ).toEqual([]);
  expect(deps.save).not.toHaveBeenCalled();
  expect(steps).toContainEqual({ node: 'verify_facts', status: 'failed', reason: 'unconfirmed_facts' });
});
it('honors per-run search, candidate and extraction caps and cannot bypass an exhausted budget', async () => {
  const deps = nodes(),
    budget = new RunBudget();
  vi.mocked(deps.search.search).mockResolvedValue({
    urls: Array.from({ length: 20 }, (_, i) => `https://example.edu/${i}`),
    tokens: 0,
  });
  const result = await run(() =>
    createDiscoveryGraph(deps, budget).invoke({ group, buckets: ['free', 'paid'] }, workflowConfig('capped')),
  );
  expect(result.saved).toHaveLength(5);
  expect(deps.extract).toHaveBeenCalledTimes(5);
  expect(deps.search.search).toHaveBeenCalledTimes(2);
  const exhausted = new RunBudget();
  exhausted.usage.searches = 2;
  vi.mocked(deps.fetch).mockClear();
  await expect(
    run(() =>
      createDiscoveryGraph(deps, exhausted).invoke({ group, buckets: ['free'] }, workflowConfig('exhausted')),
    ),
  ).rejects.toThrow('limit');
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('continues to another candidate after a source failure and never logs input text in workflow events', async () => {
  const deps = nodes(),
    steps: WorkflowStep[] = [];
  vi.mocked(deps.search.search).mockResolvedValue({
    urls: ['https://example.edu/bad', page.sourceUrl],
    tokens: 0,
  });
  vi.mocked(deps.fetch).mockRejectedValueOnce(new Error('private error text'));
  const result = await run(() =>
    createDiscoveryGraph(deps, new RunBudget(), (step) => steps.push(step)).invoke(
      { group, buckets: ['free'] },
      workflowConfig('skip'),
    ),
  );
  expect(result.saved).toEqual(['program']);
  expect(JSON.stringify(steps)).not.toContain('private error text');
  expect(steps).toContainEqual({ node: 'skip_candidate', status: 'skipped' });
});
it('filters document links before the candidate cap so readable results from the second bucket remain usable',async()=>{
  const deps=nodes(),budget=new RunBudget();
  vi.mocked(deps.search.search).mockResolvedValueOnce({urls:Array.from({length:10},(_,i)=>`https://example.edu/rules-${i}.PDF`),tokens:0})
    .mockResolvedValueOnce({urls:[page.sourceUrl],tokens:0});
  const result=await createDiscoveryGraph(deps,budget).invoke({group,buckets:['free','paid']});
  expect(result.saved).toEqual(['program']);expect(deps.fetch).toHaveBeenCalledOnce();expect(deps.fetch).toHaveBeenCalledWith(page.sourceUrl,budget);
  expect(budget.candidates).toEqual({found:11,filtered:10,queued:1});expect(budget.failures).toHaveLength(10);expect(budget.failures[0]).toMatchObject({code:'unsupported_content',mediaType:'application/pdf'});
});
it('alternates eligible free and paid source lists within the existing run caps',async()=>{
  const deps=nodes(),budget=new RunBudget();
  vi.mocked(deps.search.search).mockResolvedValueOnce({urls:Array.from({length:10},(_,i)=>`https://example.edu/free-${i}`),tokens:0})
    .mockResolvedValueOnce({urls:Array.from({length:10},(_,i)=>`https://example.edu/paid-${i}`),tokens:0});
  await createDiscoveryGraph(deps,budget).invoke({group,buckets:['free','paid']},workflowConfig('balanced-sources'));
  expect(vi.mocked(deps.fetch).mock.calls.map(([url])=>url)).toEqual(['https://example.edu/free-0','https://example.edu/paid-0','https://example.edu/free-1','https://example.edu/paid-1','https://example.edu/free-2']);
  expect(budget.usage.searches).toBe(2);expect(budget.extractionCalls).toBe(5);expect(budget.candidates.queued).toBe(10);
});
it('never sends filtered document candidates to a fetch or AI extraction call',async()=>{
  const deps=nodes(),budget=new RunBudget();
  vi.mocked(deps.search.search).mockResolvedValue({urls:['https://example.edu/rules.pdf','https://example.edu/fees.docx','http://example.edu/program'],tokens:0});
  const result=await createDiscoveryGraph(deps,budget).invoke({group,buckets:['free']});
  expect(result.saved).toEqual([]);expect(deps.fetch).not.toHaveBeenCalled();expect(deps.extract).not.toHaveBeenCalled();expect(budget.candidates).toEqual({found:3,filtered:3,queued:0});
});
it('splits LangChain Documents with stable word boundaries and preserves source metadata', async () => {
  const text = Array.from({ length: 1001 }, (_, i) => `word${i}`).join(' '),
    docs = await splitOfficialPages([{ ...page, text }]);
  expect(docs).toHaveLength(3);
  expect(docs[1].pageContent.split(' ').slice(0, 50)).toEqual(text.split(' ').slice(450, 500));
  expect(docs[0].metadata).toMatchObject({
    sourceUrl: page.sourceUrl,
    pageTitle: 'Rules',
    contentHash: 'hash',
  });
  expect(await chunkText('one\t two\nthree', 1, 0)).toEqual(['one', 'two', 'three']);
  await expect(chunkText('text', 50, 50)).rejects.toThrow('overlap');
});
it('keeps hosted LangSmith tracing disabled even if tracing flags are set', async () => {
  vi.stubEnv('LANGSMITH_TRACING', 'true');
  vi.stubEnv('LANGCHAIN_TRACING_V2', 'true');
  const handlers = await run(async () => CallbackManager.configure([])?.handlers.map((h) => h.name));
  expect(handlers).not.toContain('langchain_tracer');
});
it('uses the LangChain prompt/adapter bridge with bounded output, untrusted evidence and the existing LLM interface', async () => {
  const json = vi.fn().mockResolvedValue({ claims: [] }),
    llm = { provider: 'openai', json } as unknown as LLM;
  const result = await programAnswerChain(
    llm,
    { id: 'program', name: 'Program' },
    [],
    'How do I apply?',
  )([passage], 'requirements');
  expect(result).toEqual({ claims: [] });
  expect(json).toHaveBeenCalledWith(
    expect.stringContaining('UNTRUSTED DATA'),
    expect.stringContaining(page.text),
    [],
    1400,
  );
});
