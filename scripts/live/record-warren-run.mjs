#!/usr/bin/env node
// Completa il JSON di risultato scritto da evaluate.mjs con i dati misurati da Warren e aggiorna il registro costi.
// Uso: node scripts/live/record-warren-run.mjs <resultFile> <rawDir> <ISSUE> [note-aggiuntive]
// rawDir contiene run-flat.json ed events.ndjson copiati dalla distribuzione. Nessun segreto viene letto o scritto.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [resultFile, rawDir, issue, extra = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
const run = JSON.parse(readFileSync(join(rawDir, 'run-flat.json'), 'utf8'));
const events = readFileSync(join(rawDir, 'events.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const init = events.map((e) => e.payload).find((p) => p && p.subtype === 'init');
const initModel = init?.model ?? null;
const start = run.startedAt ? new Date(run.startedAt) : null;
const end = run.endedAt ? new Date(run.endedAt) : null;

Object.assign(r, {
  candidate: 'warren',
  candidate_version: 'warren 0.19.3 @ ce088e8 (runtime local, bwrap reale, forge fake) + claude-code 2.1.306',
  model: initModel,
  baseline_commit: null,
  started_at_utc: start ? start.toISOString() : r.started_at_utc,
  finished_at_utc: end ? end.toISOString() : r.finished_at_utc,
  duration_seconds: start && end ? (end - start) / 1000 : r.duration_seconds,
  input_tokens: null,
  output_tokens: null,
  cache_tokens: null,
  estimated_cost_usd: typeof run.costUsd === 'number' ? run.costUsd : null,
  retries: 0,
  human_interventions: 0,
  notes:
    `Run LIVE su ${issue}: run Warren ${run.id}, stato ${run.state}, costUsd ${run.costUsd} (costBasis=${run.costBasis}: con l'abbonamento è una stima a listino), ` +
    `modello dall'evento init: ${initModel}. Token non riportati da Warren (null). ${extra}`,
});
if (run.state !== 'succeeded') {
  r.status = 'FAIL';
  r.blockers.push(`run Warren in stato ${run.state}`);
}
writeFileSync(resultFile, JSON.stringify(r, null, 2));

const lp = join(dirname(resultFile), 'budget-ledger.json');
const l = JSON.parse(readFileSync(lp, 'utf8'));
const cost = typeof run.costUsd === 'number' ? run.costUsd : 0;
l.spent_usd = +(l.spent_usd + cost).toFixed(6);
l.runs.push({ issue, scenario: 'S01-warren-live', cost_usd: cost, execution_error: run.state !== 'succeeded', status: r.status, result_file: resultFile.replace(/\\/g, '/').replace(/^.*\/results\//, 'results/'), at: new Date().toISOString() });
writeFileSync(lp, JSON.stringify(l, null, 2));
console.log(JSON.stringify({ issue, run: run.id, state: run.state, status: r.status, cost_usd: cost, model: initModel, duration_s: r.duration_seconds, spent_total_usd: l.spent_usd }));
