import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url)), api = join(root, 'apps/api');
const require = createRequire(join(api, 'package.json'));
const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
let temporary;
function fail(message) { console.error(message); process.exitCode = 2; }
function number(raw, name, min, max, integer = false) {
  const n = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || integer && !Number.isInteger(n)) throw new Error(`Invalid ${name}.`);
  return n;
}
function run(args, environment) {
  const result = spawnSync(process.execPath, args, { cwd: api, env: environment, stdio: 'inherit', timeout: 1200000 });
  if (result.error) return 2;
  return result.status ?? 2;
}
try {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean', default: false }, 'allow-paid': { type: 'boolean', default: false },
    'max-estimated-usd': { type: 'string' }, 'max-provider-calls': { type: 'string' },
    provider: { type: 'string' }, 'search-provider': { type: 'string' }, model: { type: 'string' }, 'search-model': { type: 'string' },
    out: { type: 'string' }, label: { type: 'string' }, help: { type: 'boolean' },
  }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log('Offline: npm run eval:explore -- [--label baseline] [--out new-directory]');
    console.log('Paid canary: npm run eval:explore:live -- --allow-paid --provider openai --model gpt-4.1-mini --search-model gpt-4.1-mini --max-estimated-usd 4 --max-provider-calls 10');
  } else {
    const live = values.live;
    if (!live && (values['allow-paid'] || values['max-estimated-usd'] || values['max-provider-calls'] || values.model || values['search-model'] || values.provider || values['search-provider']))
      throw new Error('Paid/model options require the explicit live command. Offline always replays fixtures.');
    const provider = values.provider || process.env.LLM_PROVIDER || 'openai';
    const searchProvider = values['search-provider'] || process.env.SEARCH_PROVIDER || provider;
    const model = values.model || process.env.AI_MODEL_EXTRACTION || (provider === 'openai' ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL);
    const searchModel = values['search-model'] || process.env.AI_MODEL_SCOUT || process.env.SEARCH_MODEL;
    let maxCalls = 0, maxUsd = 0;
    if (live) {
      if (!values['allow-paid']) throw new Error('Live evals require --allow-paid and explicit per-run budgets.');
      maxCalls = number(values['max-provider-calls'], 'max-provider-calls (1–20)', 1, 20, true);
      maxUsd = number(values['max-estimated-usd'], 'max-estimated-usd (0.01–25)', 0.01, 25);
      for (const p of [provider, searchProvider]) {
        if (!['openai', 'anthropic'].includes(p)) throw new Error('Live evals support OpenAI or Anthropic adapters.');
        if (!process.env[p === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY']) throw new Error('The selected live provider credential is unavailable in this shell.');
      }
      for (const m of [model, searchModel]) if (!m || !/^[a-zA-Z0-9_.:/-]{1,120}$/.test(m)) throw new Error('Set explicit valid answer and search model IDs.');
    }
    const output = resolve(root, values.out || `artifacts/evals/${new Date().toISOString().replace(/[:.]/g, '-')}-${live ? 'live' : 'offline'}`);
    if (existsSync(output) && readdirSync(output).length) throw new Error('Choose a new/empty report directory; existing reports are not overwritten.');
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'run.json'), JSON.stringify({ mode: live ? 'live' : 'offline', status: 'started', startedAt: new Date().toISOString() }), { flag: 'wx' });
    temporary = mkdtempSync(join(tmpdir(), 'pathway-eval-'));
    const nonce = randomBytes(24).toString('hex'), database = `file:${join(temporary, 'eval.db')}`;
    writeFileSync(join(temporary, '.eval-nonce'), nonce); writeFileSync(join(temporary, 'eval.db'), '');
    const hash = paths => createHash('sha256').update(paths.map(p => `${p}\n${readFileSync(join(root, p), 'utf8')}`).join('\n')).digest('hex');
    const fixtures = readdirSync(join(api, 'evals/fixtures')).sort().map(p => `apps/api/evals/fixtures/${p}`);
    const prompts = ['apps/api/src/agent/prompts/opportunity-scout.system.md', 'apps/api/src/agent/prompts/opportunity-scout.user.md', 'apps/api/src/knowledge/answer-chain.ts'];
    const revision = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
    // Start from a narrow child environment. Production DATABASE_URL, vector keys,
    // tracing/observability configuration and unrelated Secrets are never inherited.
    const child = {};
    for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'XDG_CACHE_HOME',
      'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'])
      if (process.env[key]) child[key] = process.env[key];
    Object.assign(child, { NODE_ENV: 'test', TZ: 'UTC', CI: 'true', DATABASE_URL: database,
      EVAL_TEMP_ROOT: temporary, EVAL_NONCE: nonce, EVAL_OUTPUT: output, EVAL_MODE: live ? 'live' : 'offline',
      EVAL_MAX_CALLS: String(maxCalls), EVAL_MAX_USD: String(maxUsd), EVAL_CODE_REVISION: revision.status === 0 ? revision.stdout.trim() : 'unknown',
      EVAL_CODE_DIRTY: String(dirty.status !== 0 || !!dirty.stdout.trim()), EVAL_STARTED_AT: new Date().toISOString(),
      EVAL_DATASET_DIGEST: hash(fixtures), EVAL_PROMPT_DIGEST: hash(prompts), EVAL_LABEL: (values.label || (live ? model : 'fixture-baseline')).replace(/[\r\n]/g, ' ').slice(0, 100),
      EVAL_INPUT_PRICE: String(number(live && process.env.SCOUT_INPUT_PRICE_PER_MILLION || '4', 'input price', 0, 100000)),
      EVAL_OUTPUT_PRICE: String(number(live && process.env.SCOUT_OUTPUT_PRICE_PER_MILLION || '16', 'output price', 0, 100000)),
      EVAL_WEB_PRICE: String(number(live && process.env.SCOUT_WEB_SEARCH_PRICE_USD || '0.025', 'web price', 0, 100000)),
      LLM_PROVIDER: live ? provider : 'openai', SEARCH_PROVIDER: live ? searchProvider : 'openai',
      AI_DISABLED: 'false', OPENAI_MODEL: live && provider === 'openai' ? model : 'fixture-replay',
      ANTHROPIC_MODEL: live && provider === 'anthropic' ? model : 'fixture-replay',
      AI_MODEL_EXTRACTION: live ? model : 'fixture-replay', SEARCH_MODEL: live ? searchModel : 'fixture-replay',
      AI_MODEL_SCOUT: live ? searchModel : 'fixture-replay', DISCOVERY_ENABLED: 'true', DEMO_MODE: 'false',
      SCOUT_SOURCE_MODE: 'research_evidence', SCOUT_MAX_CALLS_PER_SEARCH: '1', SCOUT_MAX_TOOL_CALLS: '2',
      SCOUT_MAX_OUTPUT_TOKENS: '6000', SCOUT_RESEARCH_TIMEOUT_SECONDS: '60', SCOUT_MAX_HTTP_ATTEMPTS: live ? '4' : '40',
      DISCOVERY_MONTHLY_BUDGET: '100', DISCOVERY_MONTHLY_SPEND_USD: '25', DISCOVERY_RECHECKS_PER_MONTH: '0', AI_DAILY_LIMIT: '100', AI_MONTHLY_LIMIT: '1000',
      LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false',
      OPENAI_API_KEY: live ? [provider, searchProvider].includes('openai') ? process.env.OPENAI_API_KEY || '' : '' : 'offline-not-a-key',
      ANTHROPIC_API_KEY: live && [provider, searchProvider].includes('anthropic') ? process.env.ANTHROPIC_API_KEY || '' : '',
    });
    console.log(`${live ? 'LIVE PAID' : 'OFFLINE'} eval: isolated SQLite + local test vectors; reports: ${output}`);
    if (live) console.log(`This run may use paid providers: at most ${maxCalls} requests and $${maxUsd} in conservative reservations. Prices are estimates, not a billing guarantee.`);
    let status = run(['../../node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.prisma'], child);
    if (!status) status = run(['../../node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], child);
    if (!status) status = run([vitestCli, 'run', '--config', 'evals/vitest.config.ts'], child);
    const reportPath = join(output, 'report.json');
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      console.log(`Eval gate: ${report.gate}. Read ${join(output, 'report.md')}`);
      if (report.gate === 'failed') status = status || 1;
    } else { console.error('No complete eval report was produced. Treat this run as failed.'); status = status || 1; }
    process.exitCode = status;
  }
} catch (error) {
  // Only local preflight/config errors are printed; providers execute inside the safe eval harness.
  fail(error?.code?.startsWith('ERR_PARSE_ARGS') ? 'Invalid eval options. Use --help; do not pass API keys as command arguments.' : error instanceof Error ? error.message : 'Eval preflight failed.');
} finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
