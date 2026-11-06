import { performance } from 'node:perf_hooks';
import type { LLMUsage } from '../src/agent/llm/types.js';
import type { Report } from './scorecard.js';
import { failureInfo } from '../src/discovery/failures.js';

export class EvalBudgetExceeded extends Error {
  constructor() { super('Eval call or estimated spending budget exhausted.'); }
}
/** Reserve before a call. Never refund failed/unknown calls or retry them here. */
export class EvalBudget {
  readonly calls: Report['calls'] = [];
  reservedUsd = 0;
  constructor(readonly maxCalls: number, readonly maxEstimatedUsd: number,
    readonly pricing = { input: 4, output: 16, web: 0.025 }) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 20 || !Number.isFinite(maxEstimatedUsd) || maxEstimatedUsd < 0 ||
        Object.values(pricing).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid eval budget.');
  }
  async call<T>(kind: 'research' | 'answer', identity: { provider: string; model: string },
    invoke: () => Promise<T>, usage: (result: T) => LLMUsage | null | undefined, webTools = 0): Promise<T> {
    // Conservative unknown input allowance; output includes GPT-5 nano reasoning headroom.
    const reserve = (60000 * this.pricing.input + 8000 * this.pricing.output) / 1e6 + webTools * this.pricing.web;
    if (this.calls.length >= this.maxCalls || this.reservedUsd + reserve > this.maxEstimatedUsd + 1e-9) throw new EvalBudgetExceeded();
    this.reservedUsd += reserve;
    const started = performance.now();
    const record: Report['calls'][number] = { kind, ...identity, outcome: 'unknown', durationMs: 0, inputTokens: null,
      outputTokens: null, webSearches: null, reservedUsd: reserve, estimatedUsd: reserve };
    this.calls.push(record);
    try {
      const result = await invoke(), observed = usage(result);
      if (observed) {
        record.provider = observed.provider; record.model = observed.model;
        record.inputTokens = observed.inputTokens; record.outputTokens = observed.outputTokens;
        record.webSearches = observed.webSearches ?? null;
        record.estimatedUsd = ((observed.inputTokens ?? 60000) * this.pricing.input + (observed.outputTokens ?? 8000) * this.pricing.output) / 1e6 +
          (kind === 'research' ? (observed.webSearches ?? webTools) * this.pricing.web : 0);
        // If observed estimates exceeded a reservation, stop further calls at the revised amount.
        this.reservedUsd += Math.max(0, record.estimatedUsd - reserve);
      }
      record.outcome = 'completed';
      return result;
    } catch (error) {
      const info = failureInfo(error, kind === 'research' ? 'search' : 'extract');
      record.failureCode = info.code;
      if (info.httpStatus) record.httpStatus = info.httpStatus;
      throw error;
    } finally { record.durationMs = performance.now() - started; }
  }
}
