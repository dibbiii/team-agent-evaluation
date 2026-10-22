#!/usr/bin/env node
// Arricchisce il JSON scritto da evaluate.mjs (FIXTURE=hard) con i dati misurati da Warren. NON tocca results/budget-ledger.json.
// Uso: node scripts/live/warren-hard-record.mjs <resultFile> <rawDir> <ISSUE> <rawRelDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [resultFile, rawDir, issue, rawRel = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
const run = JSON.parse(readFileSync(join(rawDir, 'run-flat.json'), 'utf8'));
const ev = readFileSync(join(rawDir, 'events.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const init = ev.map((e) => e.payload).find((p) => p && p.subtype === 'init');
const res = ev.map((e) => e.payload).find((p) => p && typeof p.total_cost_usd === 'number');
const start = run.startedAt ? new Date(run.startedAt) : null;
const end = run.endedAt ? new Date(run.endedAt) : null;
Object.assign(r, {
  candidate: 'warren',
  candidate_version: 'warren 0.19.3 @ ce088e8 (runtime local, bwrap reale, forge fake) + claude-code (login Team)',
  model: init?.model ?? null,
  started_at_utc: start ? start.toISOString() : r.started_at_utc,
  finished_at_utc: end ? end.toISOString() : r.finished_at_utc,
  duration_seconds: start && end ? (end - start) / 1000 : r.duration_seconds,
  input_tokens: run.tokensInput ?? null,
  output_tokens: run.tokensOutput ?? null,
  cache_tokens: (run.tokensCacheRead ?? 0) + (run.tokensCacheWrite ?? 0) || null,
  estimated_cost_usd: typeof run.costUsd === 'number' ? run.costUsd : null,
  notes: `Lotto n=3 fixture difficile, Warren + Claude Code: ${issue}, run Warren ${run.id}, stato ${run.state}, failureReason ${run.failureReason}, costUsd ${run.costUsd} (stima a listino), turni ${res?.num_turns ?? '?'}, modello init ${init?.model}. Durata = finestra startedAt-endedAt di Warren (comprende preparazione workspace e push, diversa dalla durata della baseline). Grezzi: ${rawRel}`,
});
r.checks = { ...r.checks, fixture: 'hard', warren_run_id: run.id, warren_state: run.state, num_turns: res?.num_turns ?? null, raw_dir: rawRel };
if (run.state !== 'succeeded') { r.status = 'FAIL'; r.blockers.push(`run Warren in stato ${run.state}`); }
writeFileSync(resultFile, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ issue, run: run.id, state: run.state, status: r.status, cost_usd: run.costUsd, turns: res?.num_turns, model: init?.model, duration_s: r.duration_seconds }));
