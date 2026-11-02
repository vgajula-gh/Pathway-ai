/** Offline fixtures only: no database, provider account or paid calls. */
import { createDiscoveryGraph } from '../discovery/graph.js';
import { createQuestionGraph } from '../knowledge/question-graph.js';
import { programAnswerChain } from '../knowledge/answer-chain.js';
import { splitOfficialPages } from '../knowledge/documents.js';
import { Extraction } from '../discovery/extraction.js';
import { verifyOpportunity } from '../domain/opportunity-verification.js';
import { RunBudget } from '../discovery/config.js';
import { privateWorkflow, workflowConfig } from './privacy.js';
import type { Passage } from '../knowledge/contracts.js';
import type { LLM } from '../agent/llm/types.js';

const page = {
  sourceUrl: 'https://demo.example.edu/robotics',
  pageTitle: 'Offline demo fixture',
  text: 'Demo Robotics is organized by Demo University. Open to grades 9–12. Participation is free. Virtual. Apply by January 10, 2030. Applications require a teacher recommendation.',
  contentHash: 'offline-fixture',
  checkedAt: new Date('2026-01-01'),
  links: [],
};
const facts = Extraction.parse({
  ...Object.fromEntries(Object.keys(Extraction.shape).map((k) => [k, null])),
  name: 'Demo Robotics',
  organizer: 'Demo University',
  gradeMin: 9,
  gradeMax: 12,
  costType: 'free',
  format: 'Virtual',
  deadline: '2030-01-10',
  evidence: Object.fromEntries(
    ['name', 'organizer', 'gradeMin', 'gradeMax', 'costType', 'format', 'deadline'].map((k) => [
      k,
      { sourceUrl: page.sourceUrl, quote: k === 'costType' ? 'Participation is free.' : page.text },
    ]),
  ),
});
const budget = new RunBudget(),
  passages: Passage[] = [];
const discovery = createDiscoveryGraph(
  {
    search: {
      async search() {
        return { urls: [page.sourceUrl], tokens: 0 };
      },
    },
    async fetch() {
      budget.take('pages');
      return page;
    },
    async extract() {
      return facts;
    },
    verify: (raw, pages) => verifyOpportunity(raw, pages, new Set(['demo.example.edu'])),
    async save() {
      return 'demo-program';
    },
    async ingest() {
      for (const [i, doc] of (await splitOfficialPages([page])).entries())
        passages.push({
          id: `demo-chunk-${i}`,
          opportunityId: 'demo-program',
          text: doc.pageContent,
          sourceUrl: page.sourceUrl,
          pageTitle: page.pageTitle,
          checkedAt: page.checkedAt,
        });
    },
  },
  budget,
  (step) => budget.workflow.push(step),
);
let drafts = 0;
const mock: LLM = {
  provider: 'openai',
  async runTools() {
    throw new Error('No live model is used by this offline demo');
  },
  async text() {
    return '';
  },
  async json<T>() {
    return (
      ++drafts === 1
        ? { claims: [], nextQuery: 'teacher recommendation requirements' }
        : {
            claims: [{ chunkId: 'demo-chunk-0', quote: 'Applications require a teacher recommendation.' }],
            nextQuery: null,
          }
    ) as T;
  },
};
const draft = programAnswerChain(
  mock,
  { id: 'demo-program', name: 'Demo Robotics' },
  [],
  'What is required?',
);
const steps: import('./privacy.js').WorkflowStep[] = [];
const questions = createQuestionGraph(
  {
    async retrieve() {
      return passages;
    },
    draft,
  },
  (step) => steps.push(step),
);
if (process.argv.includes('--mermaid')) {
  console.log('Discovery graph:\n' + (await discovery.getGraphAsync()).drawMermaid());
  console.log('Program-question graph:\n' + (await questions.getGraphAsync()).drawMermaid());
} else {
  console.log('OFFLINE DEMO — synthetic fixtures; no real program, database writes or paid calls.');
  const found = await privateWorkflow(() =>
    discovery.invoke(
      {
        group: { key: 'robotics|9-10|NC', topic: 'robotics', gradeBand: '9-10', region: 'NC' },
        buckets: ['free'],
      },
      workflowConfig('demo-discovery'),
    ),
  );
  const answer = await privateWorkflow(() =>
    questions.invoke({ query: 'What is required?' }, workflowConfig('demo-question', 20)),
  );
  console.log(
    JSON.stringify(
      {
        engine: 'LangGraph',
        documents: 'LangChain',
        discovered: found.saved,
        discoverySteps: budget.workflow,
        questionSteps: steps,
        retrievals: answer.queries.length,
        answer: answer.supported.map((c) => ({
          quote: c.quote,
          sourceUrl: c.passage.sourceUrl,
          checkedAt: c.passage.checkedAt.toISOString(),
        })),
        studentWrites: 0,
      },
      null,
      2,
    ),
  );
}
