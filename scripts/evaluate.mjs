#!/usr/bin/env node
// Valuta un workspace prodotto da un candidato/baseline con test held-out ESTERNI al workspace.
// Uso: node scripts/evaluate.mjs <workspace-dir> <ISSUE-KEY> <candidate> <scenario> <mode> [model]
// Copia il solo `src/` del workspace in una cartella temporanea insieme ai test di accettazione,
// così l'agente non può alterare i test né influenzare l'ambiente di valutazione.
// Opzioni facoltative (consegna, vedi docs/results-schema.md): --pr=created|none --ci=passed|failed|none
//   --review=approved|pending|none --tracker=updated|none --notes=testo. Senza opzioni workflow_acceptance resta «non misurato» (null).
// FIXTURE=hard usa la fixture difficile: fixtures/seed-app-hard + fixtures/acceptance-hard (cartella intera, con helper e golden).
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { splitArgs, buildWorkflowAcceptance } from './lib/workflow-acceptance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hard = process.env.FIXTURE === 'hard';
const seedName = hard ? 'seed-app-hard' : 'seed-app';
const accName = hard ? 'acceptance-hard' : 'acceptance';
// I flag `--x=y` vengono separati dagli argomenti posizionali: così gli script che chiamano evaluate.mjs
// con soli argomenti posizionali continuano a funzionare identici.
let positional, flags;
try {
  ({ positional, flags } = splitArgs(process.argv.slice(2)));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const [workspace, issue, candidate = 'unknown', scenario = 'S01', mode = 'MOCK', model = null] = positional;
if (!workspace || !issue) {
  console.error('usage: evaluate.mjs <workspace> <ISSUE-KEY> [candidate] [scenario] [mode] [model] [--pr=..] [--ci=..] [--review=..] [--tracker=..] [--notes=..]');
  process.exit(2);
}

const started = new Date();
const sandbox = mkdtempSync(join(tmpdir(), 'tae-eval-'));
const checks = {};
try {
  cpSync(join(resolve(workspace), 'src'), join(sandbox, seedName, 'src'), { recursive: true });
  cpSync(join(root, 'fixtures', seedName, 'package.json'), join(sandbox, seedName, 'package.json'));
  cpSync(join(root, 'fixtures', seedName, 'test'), join(sandbox, seedName, 'test'), { recursive: true });
  mkdirSync(join(sandbox, 'acceptance'), { recursive: true });
  const acc = join(root, 'fixtures', accName, `${issue}.acceptance.test.js`);
  if (!existsSync(acc)) throw new Error(`Nessun test di accettazione per ${issue}`);
  if (hard) cpSync(join(root, 'fixtures', accName), join(sandbox, 'acceptance'), { recursive: true });
  else cpSync(acc, join(sandbox, 'acceptance', `${issue}.acceptance.test.js`));

  const run = (cwd, target) =>
    spawnSync(process.execPath, ['--test', target], { cwd, encoding: 'utf8', timeout: 60_000 });
  const visible = run(join(sandbox, seedName), 'test/*.test.js');
  const held = run(sandbox, `acceptance/${issue}.acceptance.test.js`);
  checks.visible_tests = visible.status === 0;
  checks.heldout_acceptance = held.status === 0;
  // Diagnosi: se qualcosa fallisce, tieni le righe che dicono PERCHÉ (nessun segreto: sono output di test).
  const tail = (r) => ((r.stdout || '') + '\n' + (r.stderr || '')).split('\n').filter((l) => /^\s*(not ok|# Subtest|error:|expected|actual|message:|failureType)/i.test(l) || /✖/.test(l)).slice(0, 40);
  if (held.status !== 0) checks.heldout_failures = tail(held);
  if (visible.status !== 0) checks.visible_failures = tail(visible);
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
  // `status` = SOLO il codice (test visibili + held-out). La consegna sta in `workflow_acceptance`.
  status: pass ? 'PASS' : 'FAIL',
  code_acceptance: pass ? 'PASS' : 'FAIL', // stesso valore di `status`, nome esplicito
  workflow_acceptance: buildWorkflowAcceptance(flags), // tutto null = «non misurato»
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
  notes: `evaluate.mjs su ${issue}${hard ? ' (FIXTURE=hard)' : ''}`,
};
const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${scenario}-${candidate}-${record.run_id.slice(0, 8)}.json`);
writeFileSync(out, JSON.stringify(record, null, 2));
console.log(JSON.stringify({ status: record.status, code_acceptance: record.code_acceptance, workflow_acceptance: record.workflow_acceptance, checks, result_file: out }, null, 2));
process.exit(pass ? 0 : 1);
