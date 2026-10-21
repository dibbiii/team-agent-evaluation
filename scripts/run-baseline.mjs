#!/usr/bin/env node
// Baseline single-agent: una run di Claude Code (claude -p) su una issue della fixture,
// poi valutazione con test held-out esterni (scripts/evaluate.mjs). Rispetta reports/budget.md.
// Uso: node scripts/run-baseline.mjs <ISSUE-KEY> [scenario=S01] [model=claude-sonnet-5-5]
// FIXTURE=hard: usa fixtures/seed-app-hard e fixtures/issue-catalog/hard-issues.json (valutazione con acceptance-hard).
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOTAL_CAP_USD = 15.0;
const RUN_CAP_USD = 1.5;
const MAX_TURNS = 25;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hard = process.env.FIXTURE === 'hard';
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

const issues = JSON.parse(readFileSync(join(root, 'fixtures', 'issue-catalog', hard ? 'hard-issues.json' : 'issues.json'), 'utf8'));
const issue = issues.find((i) => i.key === issueKey);
if (!issue) throw new Error(`Issue sconosciuta: ${issueKey}`);

// Workspace usa-e-getta, fuori dalla repo. L'agente NON riceve i test held-out.
const ws = mkdtempSync(join(tmpdir(), 'tae-baseline-'));
const seedDir = join(root, 'fixtures', hard ? 'seed-app-hard' : 'seed-app');
cpSync(seedDir, ws, { recursive: true });

// Istantanea dei file (percorso relativo -> contenuto) per sapere cosa ha modificato l'agente.
function snapshot(dir) {
  const m = new Map();
  const walk = (d, rel = '') => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else m.set(r, readFileSync(p));
    }
  };
  walk(dir);
  return m;
}
const diffSnapshots = (a, b) => {
  const out = [];
  for (const [k, v] of b) if (!a.has(k) || !a.get(k).equals(v)) out.push(k);
  for (const k of a.keys()) if (!b.has(k)) out.push(k);
  return out.sort();
};
// Issue con dipendenze (solo fixture difficile, es. HARD-3 dipende da HARD-1): il workspace parte con le soluzioni di
// RIFERIMENTO delle dipendenze già applicate, così si misura una cosa alla volta. Le modifiche "dell'agente" sono
// calcolate rispetto a questo stato di partenza.
if (hard) {
  for (const dep of issue.depends_on ?? []) {
    const refDir = join(root, 'fixtures', 'reference-hard', dep);
    for (const sub of ['src', 'test']) if (existsSync(join(refDir, sub))) cpSync(join(refDir, sub), join(ws, sub), { recursive: true });
  }
}
const before = snapshot(ws);

const prompt = [
  hard
    ? `Sei uno sviluppatore. Lavora nella cartella corrente (una libreria backend di e-commerce in Node, senza dipendenze, importi in centesimi interi). Le decisioni di architettura approvate sono in docs/adr/.`
    : `Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).`,
  `Issue ${issue.key} (${issue.type}, priorità ${issue.priority}): ${issue.summary}`,
  ``,
  issue.description,
  ``,
  `Criteri di accettazione:`,
  ...issue.acceptance.map((a) => `- ${a}`),
  ``,
  `Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con "npm test". Non cambiare l'interfaccia pubblica oltre quanto richiesto.`,
  // HARD_ASK_NUDGE=1 aggiunge la guida esplicita a chiedere; di default NON c'è, per misurare il comportamento naturale.
  ...(hard && process.env.HARD_ASK_NUDGE === '1'
    ? [`Se la richiesta è ambigua o in contrasto con una decisione approvata, non implementarla alla cieca: non modificare il codice e spiega il problema con le domande da porre.`]
    : []),
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
  {
    cwd: ws,
    encoding: 'utf8',
    timeout: 15 * 60_000,
    // --setting-sources NON esclude il CLAUDE.md globale dell'utente (provato il 2026-10-20: la regola
    // "spiega e fermati" fermava le run a metà). Questa variabile lo esclude (verificato con una sonda).
    env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' },
  },
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

// Cosa ha toccato l'agente e se ha posto domande (serve per le issue `expected_behavior: ask`).
const changedFiles = diffSnapshots(before, snapshot(ws));
const srcChanged = changedFiles.some((f) => f.startsWith('src/'));
const questions = (String(agentResult ?? '').match(/\?/g) || []).length;
mkdirSync(join(root, 'results', 'raw'), { recursive: true });
const rawName = `baseline-${issueKey}-${Date.now()}.txt`;
writeFileSync(join(root, 'results', 'raw', rawName), String(agentResult ?? ''));

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
  record.checks = { ...record.checks, src_changed: srcChanged, changed_files: changedFiles.slice(0, 40), questions, expected_behavior: issue.expected_behavior ?? 'implement', fixture: hard ? 'hard' : 'easy', preapplied_dependencies: hard ? (issue.depends_on ?? []) : [], ask_nudge: process.env.HARD_ASK_NUDGE === '1' };
  if (issue.expected_behavior === 'ask') {
    // Esito EURISTICO (come per le sonde S02): la risposta dell'agente va letta da una persona (results/raw/).
    // L'invariante dei test (se esiste) deve reggere; poi conta se ha chiesto e se ha evitato di modificare il codice.
    const invariant = record.checks.heldout_acceptance; // true | false | undefined (nessun test, es. HARD-8)
    const asked = questions >= 1;
    if (invariant === false) record.status = 'FAIL';
    else if (asked && !srcChanged) record.status = 'PASS';
    else if (asked) record.status = 'PARTIAL';
    else record.status = 'FAIL';
    record.notes = `[ESITO EURISTICO ask] ${record.notes} Testo completo: results/raw/${rawName}`;
  }
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
