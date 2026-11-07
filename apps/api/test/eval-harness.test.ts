import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EvalBudget, EvalBudgetExceeded } from '../evals/budget.js';
import { isolatedDatabase } from '../evals/isolation.js';
import { check, gate, ReportSchema, AnswerDraftSchema, compareReports, markdown, reviewCSV, type Report } from '../evals/scorecard.js';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

it('requires a launcher-owned SQLite file and rejects production URLs/arbitrary local files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pathway-eval-')); dirs.push(dir);
  writeFileSync(join(dir, '.eval-nonce'), 'this-run');
  expect(isolatedDatabase(dir, `file:${dir}/eval.db`, 'this-run')).toContain('eval.db?connection_limit=1');
  for (const url of ['postgresql://production/private', 'file:/tmp/other.db', `file:${dir}/other.db`])
    expect(() => isolatedDatabase(dir, url, 'this-run')).toThrow();
  expect(() => isolatedDatabase(dir, `file:${dir}/eval.db`, 'different-run')).toThrow();
});
it('reserves before calling providers, does not replay paid failures and stops subsequent requests', async () => {
  const budget = new EvalBudget(1, 1), remote = vi.fn(async () => { throw new Error('secret-provider-error'); });
  await expect(budget.call('research', { provider: 'openai', model: 'test' }, remote, () => null, 2)).rejects.toThrow();
  const reserved = budget.reservedUsd;
  await expect(budget.call('research', { provider: 'openai', model: 'test' }, remote, () => null, 2)).rejects.toBeInstanceOf(EvalBudgetExceeded);
  expect(remote).toHaveBeenCalledOnce(); expect(reserved).toBeGreaterThan(0);
  expect(budget.calls[0].outcome).toBe('unknown'); expect(JSON.stringify(budget)).not.toContain('secret-provider-error');
});
it('rejects insufficient estimated funds before the first provider call and validates limits', async () => {
  const remote = vi.fn(), budget = new EvalBudget(4, 0.01);
  await expect(budget.call('answer', { provider: 'openai', model: 'test' }, remote, () => null)).rejects.toBeInstanceOf(EvalBudgetExceeded);
  expect(remote).not.toHaveBeenCalled(); expect(budget.calls).toEqual([]);
  for (const amount of [NaN, -1, Infinity]) expect(() => new EvalBudget(1, amount)).toThrow();
  expect(() => new EvalBudget(1.5, 1)).toThrow();
});
it('records observed usage but retains conservative reservations and halts after an over-estimate', async () => {
  const budget = new EvalBudget(4, 0.5);
  await budget.call('answer', { provider: 'openai', model: 'test' }, async () => 'result', () =>
    ({ provider: 'openai', model: 'actual-model', inputTokens: 200000, outputTokens: 100000, responseId: 'not-stored' }));
  expect(budget.calls[0]).toMatchObject({ model: 'actual-model', outcome: 'completed', inputTokens: 200000 });
  expect(budget.reservedUsd).toBeGreaterThan(0.5);
  await expect(budget.call('answer', { provider: 'openai', model: 'test' }, async () => '', () => null)).rejects.toBeInstanceOf(EvalBudgetExceeded);
});
function report(): Report {
  return ReportSchema.parse({ schemaVersion: 1, mode: 'offline', datasetVersion: 'v1', datasetDigest: 'same', codeRevision: 'a', promptDigest: 'p',
    codeDirty: false, label: 'baseline', createdAt: '2030-01-01', evaluationClock: '2030-01-01', expectedCases: 1, models: { search: 'fixture' }, gate: 'passed',
    cases: [{ id: 'case', label: 'Synthetic', durationMs: 1, checks: [check('fact', 'answers', true, true, true)], metrics: {} }],
    calls: [], budget: { maxCalls: 0, maxEstimatedUsd: 0, reservedUsd: 0, pricing: { input: 4, output: 16, web: 0.025 } }, review: [], answers: [] });
}
it('fails closed on incomplete, failed or empty cases and requires human review for live runs', () => {
  const r = report(); expect(gate('offline', r.cases, 1)).toBe('passed'); expect(gate('live', r.cases, 1)).toBe('review_required');
  expect(gate('offline', [], 1)).toBe('failed'); expect(gate('offline', [{ ...r.cases[0], checks: [] }], 1)).toBe('failed');
  expect(gate('offline', [{ ...r.cases[0], checks: [check('bad', 'privacy', false, true, false)] }], 1)).toBe('failed');
  expect(gate('offline', [r.cases[0], r.cases[0]], 2)).toBe('failed');
});
it('compares the same labeled cases and rejects mismatched datasets/modes; report tables escape untrusted text', () => {
  const before = report(), after = report(); after.models.search = 'different'; after.promptDigest = 'new';
  expect(compareReports(before, after)).toContain('Prompt changed: true');
  after.datasetDigest = 'other'; expect(() => compareReports(before, after)).toThrow();
  after.datasetDigest = 'same'; after.mode = 'live'; expect(() => compareReports(before, after)).toThrow();
  before.label = '<script>bad</script>|\n'; expect(markdown(before)).not.toContain('<script>');
});
it('exports a human-review worksheet without spreadsheet formulas from untrusted public titles', () => {
  const r = report(); r.review.push({ name: '=HYPERLINK("bad")', url: 'https://example.edu/program', relevance: 'not_reviewed', officialSource: 'not_reviewed' });
  expect(reviewCSV(r)).toContain('"\'=HYPERLINK'); expect(reviewCSV(r)).toContain('official_source_or_grounded');
  r.review[0].name = '\t=HYPERLINK("bad")'; expect(reviewCSV(r)).toContain('"\'\t=HYPERLINK');
});
it('measures malformed excerpt schemas even when the runtime can safely abstain', () => {
  expect(AnswerDraftSchema.safeParse({ claims: [], nextQuery: null }).success).toBe(true);
  for (const claims of [['not-an-excerpt'], [{ chunkId: 'a', quote: 42 }], [{ quote: 'A real source excerpt.' }]])
    expect(AnswerDraftSchema.safeParse({ claims, nextQuery: null }).success).toBe(false);
});
it('paid preflight and unknown flags fail without creating a run or starting a provider', () => {
  const script = '../../scripts/eval-explore.mjs';
  for (const args of [['--live'], ['--database-url', 'postgresql://not-used'], ['--model', 'gpt-test']]) {
    const run = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect(run.status).toBe(2); expect(run.stdout).not.toContain('eval: isolated SQLite');
  }
  const accidental = spawnSync(process.execPath, [script, 'key-do-not-echo'], { encoding: 'utf8' });
  expect(accidental.status).toBe(2); expect(accidental.stderr).not.toContain('key-do-not-echo');
});
