#!/usr/bin/env node
// Arricchisce il JSON scritto da evaluate.mjs con i dati misurati da Warren. NON tocca results/budget-ledger.json.
// Uso: node scripts/live/warren-s0-record.mjs <resultFile> <runDir> <etichetta> [note]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [resultFile, runDir, label, extra = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
const run = JSON.parse(readFileSync(join(runDir, 'run-flat.json'), 'utf8'));
const ev = readFileSync(join(runDir, 'events.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const init = ev.map((e) => e.payload).find((p) => p && p.subtype === 'init');
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
  notes: `${label}: run Warren ${run.id}, stato ${run.state}, failureReason ${run.failureReason}, costUsd ${run.costUsd} (stima a listino), tetto ${run.renderedAgentJson?.frontmatter?.maxCostUsd}, modello init ${init?.model}. ${extra}`,
});
if (run.state !== 'succeeded') r.blockers.push(`run Warren in stato ${run.state}`);
writeFileSync(resultFile, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ run: run.id, state: run.state, status: r.status, cost_usd: run.costUsd, model: init?.model }));
