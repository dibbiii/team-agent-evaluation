#!/usr/bin/env node
// Completa il JSON scritto da evaluate.mjs con i dati misurati su una run Gas Town (claude interattivo in tmux). NON tocca il registro costi.
// Uso: node scripts/live/gastown-record-run.mjs <resultFile> <cartella-trascrizioni> <ISSUE> <startIso> <endIso> <note>
// Token dalle trascrizioni di Claude Code (messaggi assistant unici per id, con timestamp in [start,end]). Costo = STIMA a listino:
// sonnet-5-5 2 USD/MTok in, 10 out, 0,20 cache read (listino della skill claude-api); cache write ASSUNTO 2,50 (non verificato).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [resultFile, dir, issue, start, end, note = ''] = process.argv.slice(2);
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsonl') && files.push(p); } })(dir);
const seen = new Map();
for (const f of files) for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  let o; try { o = JSON.parse(l); } catch { continue; }
  if (o.type !== 'assistant' || !o.message?.usage || o.message.model === '<synthetic>') continue;
  if (o.timestamp < start || o.timestamp > end) continue;
  seen.set(o.message.id ?? o.uuid, { u: o.message.usage, ts: o.timestamp, model: o.message.model });
}
const t = { in: 0, out: 0, cr: 0, cw: 0 };
for (const { u } of seen.values()) { t.in += u.input_tokens ?? 0; t.out += u.output_tokens ?? 0; t.cr += u.cache_read_input_tokens ?? 0; t.cw += u.cache_creation_input_tokens ?? 0; }
const cost = t.in * 2e-6 + t.out * 10e-6 + t.cr * 0.2e-6 + t.cw * 2.5e-6;
const stamps = [...seen.values()].map((x) => x.ts).sort();
const models = [...new Set([...seen.values()].map((x) => x.model))];
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
Object.assign(r, {
  candidate: 'gastown-live',
  candidate_version: 'gt 1.2.1+649b832 (build pure-Go gms_pure_go), bd v1.0.5, Dolt 2.0.7, tmux 3.6, Claude Code 2.1.306 interattivo in tmux; tutto dentro bwrap; sling --no-boot (solo polecat)',
  model: models.join(','), started_at_utc: stamps[0], finished_at_utc: stamps.at(-1),
  duration_seconds: (Date.parse(stamps.at(-1)) - Date.parse(stamps[0])) / 1000,
  input_tokens: t.in, output_tokens: t.out, cache_tokens: t.cr + t.cw, estimated_cost_usd: Number(cost.toFixed(4)),
  retries: 0, human_interventions: 0,
  notes: `Run LIVE su ${issue} (messaggi del modello: ${seen.size}). Token dalle trascrizioni: in ${t.in}, out ${t.out}, cache read ${t.cr}, cache write ${t.cw}; costo STIMATO a listino ${cost.toFixed(4)} USD (cache write assunto 2,50: non verificato; chiamate Haiku accessorie non misurate). Durata = primo-ultimo messaggio del modello. ${note}`,
});
writeFileSync(resultFile, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ issue, status: r.status, cost_usd: r.estimated_cost_usd, models, duration_s: r.duration_seconds, tokens: [t.in, t.out, t.cr, t.cw], msgs: seen.size }));
