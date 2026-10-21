#!/usr/bin/env node
// Completa il JSON di risultato scritto da evaluate.mjs con i dati misurati su una run OpenClaw (claude-cli). NON tocca il registro costi.
// Uso: node scripts/live/openclaw-record-run.mjs <resultFile> <oc-turn-*.json> <trascrizione-claude.jsonl> <ISSUE> [extra]
// Costo = STIMA a listino da token della trascrizione di Claude Code: sonnet-5-5 2 USD/MTok in, 10 out, 0,20 cache read
// (listino della skill claude-api); cache write ASSUNTO 1,25x l'input = 2,50 USD/MTok (non verificato nel listino).
import { readFileSync, writeFileSync } from 'node:fs';
const [resultFile, turnFile, sessFile, issue, extra = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
const turn = JSON.parse(readFileSync(turnFile, 'utf8'));
const lines = readFileSync(sessFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const seen = new Map();
const CUT = process.env.CUTOFF ?? '9999';
for (const o of lines) if (o.type === 'assistant' && o.message?.usage && o.timestamp < CUT) seen.set(o.message.id ?? o.uuid, { u: o.message.usage, ts: o.timestamp, model: o.message.model });
const t = { in: 0, out: 0, cr: 0, cw: 0 };
for (const { u } of seen.values()) { t.in += u.input_tokens ?? 0; t.out += u.output_tokens ?? 0; t.cr += u.cache_read_input_tokens ?? 0; t.cw += u.cache_creation_input_tokens ?? 0; }
const cost = t.in * 2e-6 + t.out * 10e-6 + t.cr * 0.2e-6 + t.cw * 2.5e-6;
const stamps = [...seen.values()].map((x) => x.ts).sort();
const m = turn.result.meta;
Object.assign(r, {
  candidate: 'openclaw-live',
  candidate_version: 'openclaw 2026.10.5 (build 1b58cb9, release npm) con backend claude-cli (Claude Code 2.1.306) e l\'intero Gateway dentro bwrap',
  model: m.executionTrace?.winnerModel ?? [...seen.values()][0]?.model ?? null,
  started_at_utc: stamps[0] ?? r.started_at_utc,
  finished_at_utc: stamps.at(-1) ?? r.finished_at_utc,
  duration_seconds: m.durationMs / 1000,
  input_tokens: t.in, output_tokens: t.out, cache_tokens: t.cr + t.cw,
  estimated_cost_usd: Number(cost.toFixed(4)),
  retries: 0, human_interventions: 0,
  notes: `Run LIVE su ${issue}: OpenClaw (agent --agent main, sessione dedicata), trace ${m.executionTrace?.winnerProvider}/${m.executionTrace?.winnerModel} runner=${m.executionTrace?.runner}, ` +
    `stato ${turn.status}, durata run OpenClaw ${m.durationMs} ms, ${m.toolSummary?.calls} chiamate a strumenti (${(m.toolSummary?.tools ?? []).join(', ')}). ` +
    `Token dalla trascrizione di Claude Code: in ${t.in}, out ${t.out}, cache read ${t.cr}, cache write ${t.cw}; costo STIMATO a listino ${cost.toFixed(4)} USD (sonnet-5-5 2/10 USD per MTok, cache read 0,20, cache write assunto 2,50: non verificato). ` +
    `Non incluse: chiamate Haiku di riepilogo di sessione (session-activity-summary, non misurate, senza trascrizione) e, solo per c1, il turno heartbeat automatico (sessione a parte, ~0,128 USD). ` +
    `Il campo usage di OpenClaw riporta solo l'ultima chiamata e nessun costo (missingCostEntries). ${extra}`,
});
writeFileSync(resultFile, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ issue, status: r.status, cost_usd: r.estimated_cost_usd, model: r.model, duration_s: r.duration_seconds, tokens: [t.in, t.out, t.cr, t.cw] }));
