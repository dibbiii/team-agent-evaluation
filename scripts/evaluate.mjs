#!/usr/bin/env node
// Valuta un workspace prodotto da un candidato/baseline con test held-out ESTERNI al workspace.
// Uso: node scripts/evaluate.mjs <workspace-dir> <ISSUE-KEY> <candidate> <scenario> <mode> [model]
// Copia il solo `src/` del workspace in una cartella temporanea insieme ai test di accettazione,
// così l'agente non può alterare i test né influenzare l'ambiente di valutazione.
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [workspace, issue, candidate = 'unknown', scenario = 'S01', mode = 'MOCK', model = null] =
  process.argv.slice(2);
if (!workspace || !issue) {
  console.error('usage: evaluate.mjs <workspace> <ISSUE-KEY> [candidate] [scenario] [mode] [model]');
  process.exit(2);
}

const started = new Date();
const sandbox = mkdtempSync(join(tmpdir(), 'tae-eval-'));
const checks = {};
try {
  cpSync(join(resolve(workspace), 'src'), join(sandbox, 'seed-app', 'src'), { recursive: true });
  cpSync(join(root, 'fixtures', 'seed-app', 'package.json'), join(sandbox, 'seed-app', 'package.json'));
  cpSync(join(root, 'fixtures', 'seed-app', 'test'), join(sandbox, 'seed-app', 'test'), { recursive: true });
  mkdirSync(join(sandbox, 'acceptance'), { recursive: true });
  const acc = join(root, 'fixtures', 'acceptance', `${issue}.acceptance.test.js`);
  if (!existsSync(acc)) throw new Error(`Nessun test di accettazione per ${issue}`);
  cpSync(acc, join(sandbox, 'acceptance', `${issue}.acceptance.test.js`));

  const run = (cwd, target) =>
    spawnSync(process.execPath, ['--test', target], { cwd, encoding: 'utf8', timeout: 60_000 });
  const visible = run(join(sandbox, 'seed-app'), 'test/*.test.js');
  const held = run(sandbox, `acceptance/${issue}.acceptance.test.js`);
  checks.visible_tests = visible.status === 0;
  checks.heldout_acceptance = held.status === 0;
} catch (e) {
  checks.error = String(e.message);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

const finished = new Date();
const pass = checks.visible_tests === true && checks.heldout_acceptance === true;
const record = {
  run_id: randomUUID(),
  candidate,
  candidate_version: null,
  scenario_id: scenario,
  mode,
  model,
  baseline_commit: null,
  status: pass ? 'PASS' : 'FAIL',
  started_at_utc: started.toISOString(),
  finished_at_utc: finished.toISOString(),
  duration_seconds: (finished - started) / 1000,
  input_tokens: null,
  output_tokens: null,
  cache_tokens: null,
  estimated_cost_usd: null,
  retries: 0,
  human_interventions: 0,
  checks,
  artifact_paths: [],
  blockers: [],
  notes: `evaluate.mjs su ${issue}`,
};
const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${scenario}-${candidate}-${record.run_id.slice(0, 8)}.json`);
writeFileSync(out, JSON.stringify(record, null, 2));
console.log(JSON.stringify({ status: record.status, checks, result_file: out }, null, 2));
process.exit(pass ? 0 : 1);
