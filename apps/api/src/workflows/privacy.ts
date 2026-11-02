import { traceable } from 'langsmith/traceable';
import type { RunnableConfig } from '@langchain/core/runnables';

/** Framework execution is local. Never export student prompts to LangSmith. */
export function privateWorkflow<T>(run: () => Promise<T>): Promise<T> {
  return traceable(run, { name: 'pathway-private-workflow', tracingEnabled: false })();
}
export const workflowConfig = (name: string, recursionLimit = 100): RunnableConfig => ({
  runName: name,
  callbacks: [],
  recursionLimit,
  maxConcurrency: 1,
});
export type WorkflowStep = {
  node: string;
  status: 'completed' | 'skipped' | 'failed';
  reason?:
    | 'run_limit'
    | 'source_unavailable'
    | 'unconfirmed_facts'
    | 'storage_unavailable'
    | 'index_unavailable'
    | 'provider_unavailable';
};
export type StepObserver = (step: WorkflowStep) => void;
export const noObserver: StepObserver = () => {};
