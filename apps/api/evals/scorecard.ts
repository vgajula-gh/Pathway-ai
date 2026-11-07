import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const categories = ['discovery', 'sources', 'catalog', 'indexing', 'retrieval', 'answers', 'privacy', 'budget'] as const;
const value = z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()]);
export const CheckSchema = z.object({ id: z.string(), category: z.enum(categories), passed: z.boolean(), expected: value, actual: value });
export type Check = z.infer<typeof CheckSchema>;
export const CaseSchema = z.object({
  id: z.string(), label: z.string(), durationMs: z.number().nonnegative(), checks: z.array(CheckSchema),
  metrics: z.record(z.number().finite().nullable()),
  error: z.enum(['execution_failed', 'budget_exhausted']).optional(),
});
export type CaseResult = z.infer<typeof CaseSchema>;
export const AnswerDraftSchema = z.object({
  claims: z.array(z.object({ chunkId: z.string().min(1).max(200), quote: z.string().min(10).max(600) }).strict()).max(4),
  nextQuery: z.string().trim().min(1).max(1000).nullable(),
}).strict();
export const ReportSchema = z.object({
  schemaVersion: z.literal(1), mode: z.enum(['offline', 'live']), datasetVersion: z.string(), datasetDigest: z.string(),
  codeRevision: z.string(), codeDirty: z.boolean(), promptDigest: z.string(), label: z.string(), createdAt: z.string(), evaluationClock: z.string(),
  expectedCases: z.number().int().positive(), models: z.record(z.string()),
  gate: z.enum(['passed', 'failed', 'review_required']), cases: z.array(CaseSchema),
  calls: z.array(z.object({ kind: z.enum(['research', 'answer']), provider: z.string(), model: z.string(),
    outcome: z.enum(['completed', 'unknown']), durationMs: z.number().nonnegative(),
    inputTokens: z.number().nonnegative().nullable(), outputTokens: z.number().nonnegative().nullable(),
    webSearches: z.number().nonnegative().nullable(), reservedUsd: z.number().nonnegative(), estimatedUsd: z.number().nonnegative(),
    failureCode: z.string().optional(), httpStatus: z.number().int().optional(),
  })),
  budget: z.object({ maxCalls: z.number().int().nonnegative(), maxEstimatedUsd: z.number().nonnegative(), reservedUsd: z.number().nonnegative(),
    pricing: z.object({ input: z.number().nonnegative(), output: z.number().nonnegative(), web: z.number().nonnegative() }) }),
  review: z.array(z.object({ name: z.string(), url: z.string(), relevance: z.literal('not_reviewed'), officialSource: z.literal('not_reviewed') })),
  answers: z.array(z.object({ caseId: z.string(), question: z.string().max(1000), reply: z.string().max(6000), sourceUrls: z.array(z.string()) })),
});
export type Report = z.infer<typeof ReportSchema>;
export function check(id: string, category: Check['category'], passed: boolean, expected: Check['expected'], actual: Check['actual']): Check {
  return CheckSchema.parse({ id, category, passed, expected, actual });
}
export function gate(mode: Report['mode'], results: CaseResult[], expected: number): Report['gate'] {
  if (results.length !== expected || new Set(results.map(r => r.id)).size !== expected || results.some(r => r.error || !r.checks.length || r.checks.some(c => !c.passed))) return 'failed';
  return mode === 'live' ? 'review_required' : 'passed';
}
const escape = (s: string) => s.replace(/[|\n\r<>]/g, ' ').replace(/[`\[\]]/g, '');
export function summary(report: Report) {
  return categories.map(category => {
    const checks = report.cases.flatMap(r => r.checks).filter(c => c.category === category);
    return { category, passed: checks.filter(c => c.passed).length, total: checks.length };
  });
}
export function markdown(report: Report): string {
  const lines = ['# Pathway AI — Explore and program-answer evals', '',
    `Mode: **${report.mode}** · Gate: **${report.gate}** · Dataset: ${report.datasetVersion}`, '',
    `Label: ${escape(report.label)} · Code: ${escape(report.codeRevision)}${report.codeDirty ? ' (local changes)' : ''} · Cases: ${report.cases.length}/${report.expectedCases}`, '',
    `Run started: ${report.createdAt} · Scenario clock: ${report.evaluationClock}`, '',
    `Dataset SHA-256: ${report.datasetDigest}`, `Prompt SHA-256: ${report.promptDigest}`, '',
    'Offline results measure replayed workflow behavior, not the quality of a real model. Live results require human source/relevance review.', '',
    '| Area | Checks passed |', '|---|---|', ...summary(report).map(r => `| ${r.category} | ${r.passed}/${r.total || '0 (not measured)'} |`), '',
    '| Case | Result | Time (ms) |', '|---|---|---:|',
    ...report.cases.map(r => `| ${escape(r.id)} | ${r.error || (r.checks.every(c => c.passed) ? 'pass' : 'fail')} | ${Math.round(r.durationMs)} |`), '',
    '## Measured scenario metrics', '',
    '| Case | Metric | Value |', '|---|---|---:|',
    ...report.cases.flatMap(r => Object.entries(r.metrics).map(([key, number]) => `| ${escape(r.id)} | ${escape(key)} | ${number === null ? 'not measured' : Number(number.toFixed(4))} |`)), '',
    '## Failed checks', '',
    ...report.cases.flatMap(r => r.checks.filter(c => !c.passed).map(c => `- ${escape(r.id)} / ${escape(c.id)}: expected ${escape(String(c.expected))}; observed ${escape(String(c.actual))}`)), '',
    '## Calls and estimated budget', '',
    `Provider requests: ${report.calls.length}/${report.budget.maxCalls}. Conservative reservations: $${report.budget.reservedUsd.toFixed(4)} / $${report.budget.maxEstimatedUsd.toFixed(4)}.`,
    `Observed/unknown-outcome estimates: $${report.calls.reduce((n, c) => n + c.estimatedUsd, 0).toFixed(4)}. These are configurable estimates, not an invoice or vendor-enforced ceiling.`, '',
    `Price assumptions: $${report.budget.pricing.input}/million input tokens, $${report.budget.pricing.output}/million output tokens, $${report.budget.pricing.web}/web tool use.`, '',
    '| Kind | Provider | Model | Outcome / safe error | Latency (ms) | Input/output tokens | Est. USD |', '|---|---|---|---|---:|---|---:|',
    ...report.calls.map(c => `| ${c.kind} | ${escape(c.provider)} | ${escape(c.model)} | ${c.outcome}${c.failureCode ? ': ' + escape(c.failureCode) : ''}${c.httpStatus ? ' HTTP ' + c.httpStatus : ''} | ${Math.round(c.durationMs)} | ${c.inputTokens ?? '?'}/${c.outputTokens ?? '?'} | ${c.estimatedUsd.toFixed(4)} |`), '',
    '## Public research review queue', '',
    'No automated claim of real-world relevance or official ownership is made. Review these public links before accepting a live run.', '',
    '| Program | Public URL | Relevance | Official source |', '|---|---|---|---|',
    ...report.review.map(r => `| ${escape(r.name)} | ${escape(r.url)} | not reviewed | not reviewed |`), '',
    '## Live final-answer samples (synthetic questions and source text only)', '',
    ...report.answers.flatMap(a => [`### ${escape(a.caseId)}`, '', `Question: ${escape(a.question)}`, '',
      `Rendered answer: ${escape(a.reply)}`, '', `Sources: ${a.sourceUrls.map(escape).join(', ') || 'none'}`, '']),
    '## Interpretation', '',
    '- Discovery, source processing, SQL saves, indexing, retrieval and final answers are separate measurements.',
    '- Missing vectors do not erase useful catalog links. Offline embeddings are deterministic test vectors; this is not a Pinecone connectivity check.',
    '- No production profile/database, raw prompt/history, credentials or raw provider exceptions are included in this report.',
    '- Paid eval usage is isolated from production student/monthly counters. The CLI call cap and estimated budget apply to this run only.', ''];
  return lines.join('\n');
}
export function writeReport(directory: string, input: Report) {
  const report = ReportSchema.parse(input);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(directory, 'report.md'), markdown(report));
  writeFileSync(join(directory, 'review.csv'), reviewCSV(report));
  return report;
}
export function reviewCSV(report: Report): string {
  const cell = (value: string) => '"' + (/^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"';
  const rows = [['type', 'case_or_program', 'question_or_name', 'public_urls', 'relevant', 'official_source_or_grounded', 'notes'],
    ...report.review.map(r => ['program', '', r.name, r.url, '', '', '']),
    ...report.answers.map(a => ['answer', a.caseId, a.question, a.sourceUrls.join(' '), '', '', ''])];
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}
export function compareReports(before: Report, after: Report): string {
  if (before.mode !== after.mode || before.datasetDigest !== after.datasetDigest ||
      before.cases.map(c => c.id).sort().join() !== after.cases.map(c => c.id).sort().join())
    throw new Error('Reports need the same mode, dataset and case IDs.');
  const rows = summary(before), next = summary(after);
  const estimated = (r: Report) => r.calls.reduce((n, c) => n + c.estimatedUsd, 0).toFixed(4);
  const percentile = (r: Report) => {
    const times = r.calls.map(c => c.durationMs).sort((a, b) => a - b);
    return times.length ? `${Math.round(times[Math.ceil(times.length * 0.95) - 1])} ms` : 'not measured';
  };
  return ['# Pathway eval comparison', '', `Before: ${escape(before.label)} (${escape(before.codeRevision)})`,
    `After: ${escape(after.label)} (${escape(after.codeRevision)})`, '',
    `Prompt changed: ${before.promptDigest !== after.promptDigest}. Models: ${escape(JSON.stringify(before.models))} → ${escape(JSON.stringify(after.models))}.`, '',
    '| Area | Before | After |', '|---|---|---|', ...rows.map((r, i) => `| ${r.category} | ${r.passed}/${r.total} | ${next[i].passed}/${next[i].total} |`), '',
    `Gate: ${before.gate} → ${after.gate}. Provider calls: ${before.calls.length} → ${after.calls.length}.`,
    `Estimated USD: $${estimated(before)} → $${estimated(after)}. Provider-call p95: ${percentile(before)} → ${percentile(after)}.`,
    `Price assumptions changed: ${JSON.stringify(before.budget.pricing) !== JSON.stringify(after.budget.pricing)}. Check per-run model pricing before drawing cost conclusions.`,
    'Model/prompt changes are identified, not treated as errors. Live comparisons still require human review; timing is not a controlled benchmark.', ''].join('\n');
}
