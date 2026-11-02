import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import { supportedClaims } from '../domain/knowledge.js';
import type { Passage } from './contracts.js';
import { StepObserver, noObserver } from '../workflows/privacy.js';

const value = <T>(initial: () => T) => Annotation<T>({ reducer: (_old, update) => update, default: initial });
const State = Annotation.Root({
  query: Annotation<string>(),
  queries: value<string[]>(() => []),
  passages: value<Passage[]>(() => []),
  draft: value<unknown>(() => null),
  nextQuery: value<string | null>(() => null),
  supported: value<ReturnType<typeof supportedClaims>>(() => []),
});
export type QuestionNodes = {
  retrieve: (query: string) => Promise<Passage[]>;
  draft: (passages: Passage[], query: string) => Promise<unknown>;
};
const normalize = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();
export function createQuestionGraph(nodes: QuestionNodes, observe: StepObserver = noObserver) {
  return new StateGraph(State)
    .addNode('retrieve_passages', async (s) => {
      let found: Passage[];
      try {
        found = await nodes.retrieve(s.query);
      } catch (error) {
        observe({ node: 'retrieve_passages', status: 'failed', reason: 'index_unavailable' });
        throw error;
      }
      const union = new Map(s.passages.map((p) => [p.id, p]));
      found.forEach((p) => union.set(p.id, p));
      observe({ node: 'retrieve_passages', status: 'completed' });
      return { passages: [...union.values()], queries: [...s.queries, s.query], nextQuery: null };
    })
    .addNode('draft_answer', async (s) => {
      let draft: unknown;
      try {
        draft = await nodes.draft(s.passages, s.query);
      } catch (error) {
        if (error instanceof SyntaxError || (error as Error)?.message === 'unreadable')
          draft = { claims: [] };
        else {
          observe({ node: 'draft_answer', status: 'failed' });
          throw error;
        }
      }
      const next = z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .safeParse(draft && typeof draft === 'object' ? (draft as { nextQuery?: unknown }).nextQuery : null);
      observe({ node: 'draft_answer', status: 'completed' });
      return { draft, nextQuery: next.success ? next.data : null };
    })
    .addNode('verify_claims', (s) => {
      let words = 0;
      const supported = supportedClaims(s.draft, s.passages).filter((c) => {
        const n = c.quote.split(/\s+/).length;
        if (words + n > 120) return false;
        words += n;
        return true;
      });
      observe({ node: 'verify_claims', status: 'completed' });
      return { supported };
    })
    .addNode('refine_query', (s) => {
      observe({ node: 'refine_query', status: 'completed' });
      return { query: s.nextQuery! };
    })
    .addEdge(START, 'retrieve_passages')
    .addConditionalEdges('retrieve_passages', (s) => (s.passages.length ? 'draft_answer' : END), [
      'draft_answer',
      END,
    ])
    .addEdge('draft_answer', 'verify_claims')
    .addConditionalEdges(
      'verify_claims',
      (s) =>
        s.nextQuery &&
        s.queries.length < 3 &&
        !s.queries.some((q) => normalize(q) === normalize(s.nextQuery!))
          ? 'refine_query'
          : END,
      ['refine_query', END],
    )
    .addEdge('refine_query', 'retrieve_passages')
    .compile({ name: 'pathway_program_questions' });
}
