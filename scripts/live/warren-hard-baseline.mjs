#!/usr/bin/env node
// Baseline (Claude Code da solo, lato Windows) sulla fixture DIFFICILE, per il lotto n=3. Una o piu' run in serie.
// Come scripts/run-baseline.mjs (FIXTURE=hard, stesso prompt, stessi strumenti ristretti, stesso isolamento dal CLAUDE.md
// globale), ma: NON scrive results/budget-ledger.json; risultati in results/H-N3-baseline-claude-code-*.json; tetto di
// spesa del lotto; controllo RAM (AvailableMBytes via freemem) prima di ogni run; conserva src/test prodotti e il testo.
// Uso: node scripts/live/warren-hard-baseline.mjs [--cap-usd 2.0] [--min-mb 1500] HARD-4 HARD-5 ...
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, freemem } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, loadIssue } from './warren-hard-prompt.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : dflt; };
const CAP = opt('--cap-usd', 2.0);
const MIN_MB = opt('--min-mb', 1500);
const issues = argv.filter((a) => /^HARD-\d+$/.test(a));
if (!issues.length) { console.error('uso: warren-hard-baseline.mjs [--cap-usd N] HARD-4 HARD-5 ...'); process.exit(2); }
const MODEL = 'claude-sonnet-5-5';
const RUN_CAP_USD = 1.5;
const MAX_TURNS = 25;
const SCENARIO = 'H-N3';

mkdirSync(join(root, 'results', 'raw'), { recursive: true });
const snapshot = (dir) => {
  const m = new Map();
  const walk = (d, rel = '') => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r); else m.set(r, readFileSync(p));
    }
  };
  walk(dir); return m;
};
const diffSnapshots = (a, b) => {
  const out = [];
  for (const [k, v] of b) if (!a.has(k) || !a.get(k).equals(v)) out.push(k);
  for (const k of a.keys()) if (!b.has(k)) out.push(k);
  return out.sort();
};
const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: true }).stdout.trim();

let spent = 0; let consecutiveErrors = 0;
const rows = [];
for (const [n, key] of issues.entries()) {
  const memMb = Math.round(freemem() / 1048576);
  if (memMb < MIN_MB) { console.log(`STOP: memoria disponibile ${memMb} MB < ${MIN_MB} (run ${key} non avviata, da riportare)`); break; }
  if (spent >= CAP) { console.log(`STOP: spesa del lotto ${spent.toFixed(3)} USD >= tetto ${CAP}`); break; }
  if (consecutiveErrors >= 2) { console.log('STOP: 2 errori di esecuzione consecutivi'); break; }
  console.log(`=== run ${n + 1}/${issues.length} su ${key}  (memoria disponibile ${memMb} MB)`);

  const issue = loadIssue(key);
  if ((issue.depends_on ?? []).length) throw new Error(`${key} ha dipendenze`);
  const ws = mkdtempSync(join(tmpdir(), 'tae-hardn3-'));
  cpSync(join(root, 'fixtures', 'seed-app-hard'), ws, { recursive: true });
  const before = snapshot(ws);
  const prompt = buildPrompt(issue);

  const started = new Date();
  const claude = spawnSync('claude', [
    '-p', prompt, '--model', MODEL, '--max-budget-usd', String(RUN_CAP_USD), '--max-turns', String(MAX_TURNS),
    '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config',
    '--permission-mode', 'acceptEdits', '--tools', 'Read,Edit,Write,Glob,Grep,Bash',
    '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm test)', 'Bash(npm run test)',
  ], { cwd: ws, encoding: 'utf8', timeout: 15 * 60_000, env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } });

  let usage = null, costUsd = null, numTurns = null, agentResult = null, executionError = false, modelUsage = null;
  try {
    const out = JSON.parse(claude.stdout);
    usage = out.usage ?? null; costUsd = typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null;
    numTurns = out.num_turns ?? null; agentResult = out.result ?? null; executionError = out.is_error === true;
    modelUsage = out.modelUsage ? Object.keys(out.modelUsage) : null;
  } catch { executionError = true; }
  const changedFiles = diffSnapshots(before, snapshot(ws));
  const stamp = Date.now();
  const rawName = `h-n3-baseline-${key}-${stamp}`;
  const keep = join(root, 'results', 'raw', rawName);
  mkdirSync(keep, { recursive: true });
  writeFileSync(join(keep, 'agent-result.txt'), String(agentResult ?? ''));
  writeFileSync(join(keep, 'claude-stdout.json'), claude.stdout ?? '');
  for (const sub of ['src', 'test']) if (existsSync(join(ws, sub))) cpSync(join(ws, sub), join(keep, sub), { recursive: true });

  const ev = spawnSync(process.execPath, [join(root, 'scripts', 'evaluate.mjs'), ws, key, 'baseline-claude-code', SCENARIO, 'LIVE', MODEL],
    { encoding: 'utf8', env: { ...process.env, FIXTURE: 'hard' } });
  let evalOut = {}; try { evalOut = JSON.parse(ev.stdout); } catch { /* vuoto */ }
  const finished = new Date();
  let record = null;
  if (evalOut.result_file && existsSync(evalOut.result_file)) {
    record = JSON.parse(readFileSync(evalOut.result_file, 'utf8'));
    Object.assign(record, {
      candidate_version: `claude-code ${claudeVersion}`,
      started_at_utc: started.toISOString(), finished_at_utc: finished.toISOString(),
      duration_seconds: (finished - started) / 1000,
      input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null,
      cache_tokens: usage ? (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) : null,
      estimated_cost_usd: costUsd,
      notes: `Lotto n=3 fixture difficile, baseline Claude Code, ${numTurns ?? '?'} turni, issue ${key}. Costo = stima a listino (abbonamento). modelUsage: ${(modelUsage ?? []).join(',')}. Grezzi: results/raw/${rawName}/. Riassunto agente: ${String(agentResult ?? '').replace(/\s+/g, ' ').slice(0, 300)}`,
    });
    record.model_usage_keys = modelUsage;
    record.checks = { ...record.checks, src_changed: changedFiles.some((f) => f.startsWith('src/')), changed_files: changedFiles.slice(0, 40), expected_behavior: 'implement', fixture: 'hard', preapplied_dependencies: [], ask_nudge: false, raw_dir: `results/raw/${rawName}` };
    if (executionError) { record.status = 'FAIL'; record.blockers.push('errore di esecuzione di claude'); }
    writeFileSync(evalOut.result_file, JSON.stringify(record, null, 2));
  }
  rmSync(ws, { recursive: true, force: true });
  spent += costUsd ?? RUN_CAP_USD;
  consecutiveErrors = executionError ? consecutiveErrors + 1 : 0;
  const row = { issue: key, status: record?.status ?? 'FAIL', cost_usd: costUsd, turns: numTurns, secs: record?.duration_seconds, models: modelUsage, visible: record?.checks?.visible_tests, held: record?.checks?.heldout_acceptance, executionError, file: evalOut.result_file };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (record?.status !== 'PASS' && record?.checks?.heldout_failures) console.log('  righe dei test falliti: ' + JSON.stringify(record.checks.heldout_failures.slice(0, 12)));
}
console.log(`=== lotto concluso. Spesa stimata (listino): ${spent.toFixed(4)} USD. Run: ${rows.length}/${issues.length}`);
