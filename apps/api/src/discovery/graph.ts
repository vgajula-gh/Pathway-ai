import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import type { Page } from './pages.js';
import type { Extracted } from './extraction.js';
import type { Group } from './pipeline.js';
import type { SearchProvider } from './search/index.js';
import { CAPS, RunBudget } from './config.js';
import { discoveryQuery } from './groups.js';
import type { verifyOpportunity } from '../domain/opportunity-verification.js';
import { noObserver, StepObserver, WorkflowStep } from '../workflows/privacy.js';
import { failureInfo, FailureStage, DiscoveryFailure } from './failures.js';
import {httpsSourceURL,fileSourceType} from './source-urls.js';

export type VerifiedOpportunity = ReturnType<typeof verifyOpportunity>;
export type DiscoveryNodes = {
  search: SearchProvider;
  fetch: (url: string, budget: RunBudget) => Promise<Page>;
  extract: (pages: Page[]) => Promise<Extracted>;
  verify: (facts: Extracted, pages: Page[]) => VerifiedOpportunity;
  save: (data: VerifiedOpportunity, pages: Page[], group: Group) => Promise<string>;
  ingest?: (id: string, budget: RunBudget) => Promise<void>;
};
const value = <T>(initial: () => T) => Annotation<T>({ reducer: (_old, update) => update, default: initial });
const State = Annotation.Root({
  group: Annotation<Group>(),
  buckets: Annotation<('free' | 'paid')[]>(),
  urls: value<string[]>(() => []),
  cursor: value(() => 0),
  currentUrl: value(() => ''),
  pages: value<Page[]>(() => []),
  facts: value<Extracted | null>(() => null),
  verified: value<VerifiedOpportunity | null>(() => null),
  savedId: value<string | null>(() => null),
  saved: value<string[]>(() => []),
  failed: value(() => false),
});
type Snapshot = typeof State.State;
type Update = typeof State.Update;

export function createDiscoveryGraph(
  nodes: DiscoveryNodes,
  budget: RunBudget,
  observe: StepObserver = noObserver,
) {
  const record = async (step: WorkflowStep) => {
    budget.workflow.push(step);
    budget.phase = step.node === 'search_candidates' || step.node === 'skip_candidate' ? 'reading_sources'
      : ['fetch_official_pages', 'extract_facts'].includes(step.node) ? 'checking_facts' : 'indexing';
    observe(step);
    await budget.onStep?.();
  };
  const guarded =
    (node: string, run: (s: Snapshot) => Promise<Update> | Update) =>
    async (s: Snapshot): Promise<Update> => {
      try {
        const update = await run(s);
        await record({ node, status: 'completed' });
        return update;
      } catch (error) {
        const reason: NonNullable<import('../workflows/privacy.js').WorkflowStep['reason']> = /limit/i.test(
          (error as Error)?.message || '',
        )
          ? 'run_limit'
          : node === 'fetch_official_pages'
            ? 'source_unavailable'
            : node === 'store_catalog'
              ? 'storage_unavailable'
              : node === 'ingest_knowledge'
                ? 'index_unavailable'
                : 'unconfirmed_facts';
        const stage: FailureStage = node === 'fetch_official_pages' ? 'fetch' : node === 'extract_facts' ? 'extract'
          : node === 'verify_facts' ? 'verify' : node === 'store_catalog' ? 'store' : 'index';
        budget.failures.push(failureInfo(error, stage));
        await record({ node, status: 'failed', reason });
        return { failed: true };
      }
    };
  const next = (s: Snapshot) =>
    s.cursor < s.urls.length &&
    budget.extractionCalls < CAPS.extractionCalls &&
    budget.usage.pages < CAPS.pages &&
    Date.now() <= budget.deadlineAt
      ? 'select_candidate'
      : END;
  return new StateGraph(State)
    .addNode('search_candidates', async (s) => {
      const seen=new Set<string>(),lists:string[][]=[];
      try {
        for (const bucket of [...new Set(s.buckets)].slice(0, 2)) {
          budget.take('searches');
          const result = await nodes.search.search(
            discoveryQuery(s.group, bucket, new Date().getUTCFullYear()),
          );
          budget.usage.tokens += result.tokens;
          const list:string[]=[];
          for(const value of result.urls.slice(0,CAPS.candidates)) {
            if(seen.has(value))continue;
            seen.add(value);budget.candidates.found++;
            const url=httpsSourceURL(value),mediaType=url?fileSourceType(url):null;
            if(!url||mediaType) {
              budget.candidates.filtered++;
              budget.failures.push({stage:'fetch',code:url?'unsupported_content':'invalid_url',...(url?{sourceHost:url.hostname}:{}),...(mediaType?{mediaType}:{})});
            } else list.push(url.href);
          }
          lists.push(list);
        }
        // Alternate buckets so the first search cannot crowd out all of the second's pages.
        const urls:string[]=[],selected=new Set<string>();
        for(let i=0;i<CAPS.candidates&&urls.length<CAPS.candidates;i++)for(const list of lists) {
          const url=list[i];
          if(url&&!selected.has(url)&&urls.length<CAPS.candidates){selected.add(url);urls.push(url);}
        }
        budget.candidates.queued=urls.length;
        await record({ node: 'search_candidates', status: 'completed' });
        return { urls };
      } catch (error) {
        budget.failures.push(failureInfo(error, 'search'));
        await record({ node: 'search_candidates', status: 'failed' });
        throw error;
      }
    })
    .addNode('select_candidate', (s) => ({
      currentUrl: s.urls[s.cursor],
      cursor: s.cursor + 1,
      pages: [],
      facts: null,
      verified: null,
      savedId: null,
      failed: false,
    }))
    .addNode(
      'fetch_official_pages',
      guarded('fetch_official_pages', async (s) => {
        const main = await nodes.fetch(s.currentUrl, budget),
          pages = [main];
        for (const url of main.links.filter(value=>{const url=httpsSourceURL(value);return url&&url.origin===new URL(main.sourceUrl).origin&&!fileSourceType(url);}).slice(0,3))
          try {
            pages.push(await nodes.fetch(url, budget));
          } catch {
            /* Unknown supporting facts remain unknown. */
          }
        return { pages };
      }),
    )
    .addNode(
      'extract_facts',
      guarded('extract_facts', async (s) => {
        budget.check();
        budget.extractionCalls++;
        budget.usage.tokens += Math.ceil(s.pages.reduce((n, p) => n + p.text.length, 0) / 3) + 6500;
        return { facts: await nodes.extract(s.pages) };
      }),
    )
    .addNode(
      'verify_facts',
      guarded('verify_facts', (s) => {
        const verified=nodes.verify(s.facts!,s.pages);
        if(verified.verificationStatus!=='verified')throw new DiscoveryFailure({stage:'verify',code:'missing_evidence'});
        return {verified};
      }),
    )
    .addNode(
      'store_catalog',
      guarded('store_catalog', async (s) => {
        const savedId=await nodes.save(s.verified!,s.pages,s.group);
        if(!budget.savedIds.includes(savedId))budget.savedIds.push(savedId);
        return {savedId};
      }),
    )
    .addNode(
      'ingest_knowledge',
      guarded('ingest_knowledge', async (s) => {
        if (nodes.ingest) await nodes.ingest(s.savedId!, budget);
        return {};
      }),
    )
    .addNode('record_saved', (s) => ({ saved: [...s.saved, s.savedId!] }))
    .addNode('skip_candidate', async () => {
      await record({ node: 'skip_candidate', status: 'skipped' });
      return {};
    })
    .addEdge(START, 'search_candidates')
    .addConditionalEdges('search_candidates', next, ['select_candidate', END])
    .addEdge('select_candidate', 'fetch_official_pages')
    .addConditionalEdges('fetch_official_pages', (s) => (s.failed ? 'skip_candidate' : 'extract_facts'), [
      'skip_candidate',
      'extract_facts',
    ])
    .addConditionalEdges('extract_facts', (s) => (s.failed ? 'skip_candidate' : 'verify_facts'), [
      'skip_candidate',
      'verify_facts',
    ])
    .addConditionalEdges('verify_facts', (s) => (s.failed ? 'skip_candidate' : 'store_catalog'), [
      'skip_candidate',
      'store_catalog',
    ])
    .addConditionalEdges('store_catalog', (s) => (s.failed ? 'skip_candidate' : 'ingest_knowledge'), [
      'skip_candidate',
      'ingest_knowledge',
    ])
    // Source-backed catalog results remain useful when optional vector ingestion fails.
    .addEdge('ingest_knowledge', 'record_saved')
    .addConditionalEdges('record_saved', next, ['select_candidate', END])
    .addConditionalEdges('skip_candidate', next, ['select_candidate', END])
    .compile({ name: 'pathway_opportunity_discovery' });
}
