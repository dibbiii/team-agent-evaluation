#!/usr/bin/env node
// Baseline single-agent: una run di Claude Code (claude -p) su una issue della fixture,
// poi valutazione con test held-out esterni (scripts/evaluate.mjs). Rispetta reports/budget.md.
// Uso: node scripts/run-baseline.mjs <ISSUE-KEY> [scenario=S01] [model=claude-sonnet-5-5]
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOTAL_CAP_USD = 15.0;
const RUN_CAP_USD = 1.5;
const MAX_TURNS = 25;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [issueKey, scenario = 'S01', model = 'claude-sonnet-5-5'] = process.argv.slice(2);
if (!issueKey) {
  console.error('usage: run-baseline.mjs <ISSUE-KEY> [scenario] [model]');
  process.exit(2);
}

const ledgerPath = join(root, 'results', 'budget-ledger.json');
mkdirSync(join(root, 'results'), { recursive: true });
const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { spent_usd: 0, runs: [] };
if (ledger.spent_usd + RUN_CAP_USD > TOTAL_CAP_USD) {
  console.error(`BUDGET: ${ledger.spent_usd.toFixed(4)} USD spesi, un'altra run (tetto ${RUN_CAP_USD}) supererebbe ${TOTAL_CAP_USD}. Run non avviata.`);
  process.exit(3);
}
const lastThree = ledger.runs.slice(-3);
if (lastThree.length === 3 && lastThree.every((r) => r.execution_error)) {
  console.error('STOP: 3 run consecutive in errore di esecuzione.');
  process.exit(4);
}

const issues = JSON.parse(readFileSync(join(root, 'fixtures', 'issue-catalog', 'issues.json'), 'utf8'));
const issue = issues.find((i) => i.key === issueKey);
if (!issue) throw new Error(`Issue sconosciuta: ${issueKey}`);

// Workspace usa-e-getta, fuori dalla repo. L'agente NON riceve i test held-out.
const ws = mkdtempSync(join(tmpdir(), 'tae-baseline-'));
cpSync(join(root, 'fixtures', 'seed-app'), ws, { recursive: true });

const prompt = [
  `Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).`,
  `Issue ${issue.key} (${issue.type}, priorità ${issue.priority}): ${issue.summary}`,
  ``,
  issue.description,
  ``,
  `Criteri di accettazione:`,
  ...issue.acceptance.map((a) => `- ${a}`),
  ``,
  `Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con "npm test". Non cambiare l'interfaccia pubblica oltre quanto richiesto.`,
  `Al termine rispondi con un riassunto di 3 righe.`,
].join('\n');

const started = new Date();
const claude = spawnSync(
  'claude',
  [
    '-p', prompt,
    '--model', model,
    '--max-budget-usd', String(RUN_CAP_USD),
    '--max-turns', String(MAX_TURNS),
    '--output-format', 'json',
    '--no-session-persistence',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--permission-mode', 'acceptEdits',
    '--tools', 'Read,Edit,Write,Glob,Grep,Bash',
    '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm test)', 'Bash(npm run test)',
  ],
  { cwd: ws, encoding: 'utf8', timeout: 15 * 60_000, shell: process.platform === 'win32' ? false : false },
);

let usage = null;
let costUsd = null;
let numTurns = null;
let agentResult = null;
let executionError = false;
try {
  const out = JSON.parse(claude.stdout);
  usage = out.usage ?? null;
  costUsd = typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null;
  numTurns = out.num_turns ?? null;
  agentResult = out.result ?? null;
  executionError = out.is_error === true;
} catch {
  executionError = true;
}

const evalRun = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'evaluate.mjs'), ws, issueKey, 'baseline-claude-code', scenario, 'LIVE', model],
  { encoding: 'utf8' },
);
let evalOut = {};
try { evalOut = JSON.parse(evalRun.stdout); } catch { /* resta vuoto */ }

const finished = new Date();
const resultFile = evalOut.result_file;
let record = null;
if (resultFile && existsSync(resultFile)) {
  record = JSON.parse(readFileSync(resultFile, 'utf8'));
  const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  Object.assign(record, {
    candidate_version: `claude-code ${spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim()}`,
    baseline_commit: gitHead || null,
    started_at_utc: started.toISOString(),
    finished_at_utc: finished.toISOString(),
    duration_seconds: (finished - started) / 1000,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cache_tokens: usage ? (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) : null,
    estimated_cost_usd: costUsd,
    notes: `baseline Claude Code, ${numTurns ?? '?'} turni, issue ${issueKey}. Costo = stima a prezzo di listino (abbonamento). Riassunto agente: ${String(agentResult ?? '').replace(/\s+/g, ' ').slice(0, 300)}`,
  });
  if (executionError) {
    record.status = 'FAIL';
    record.blockers.push('errore di esecuzione di claude');
  }
  writeFileSync(resultFile, JSON.stringify(record, null, 2));
}

ledger.spent_usd = +(ledger.spent_usd + (costUsd ?? RUN_CAP_USD)).toFixed(6);
ledger.runs.push({
  issue: issueKey,
  scenario,
  cost_usd: costUsd,
  execution_error: executionError,
  status: record?.status ?? 'FAIL',
  result_file: resultFile ?? null,
  at: finished.toISOString(),
});
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

rmSync(ws, { recursive: true, force: true });
console.log(JSON.stringify({ issue: issueKey, status: record?.status ?? 'FAIL', cost_usd: costUsd, turns: numTurns, checks: record?.checks, spent_total_usd: ledger.spent_usd, result_file: resultFile }, null, 2));
process.exit(record?.status === 'PASS' ? 0 : 1);
