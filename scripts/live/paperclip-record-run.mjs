#!/usr/bin/env node
// Completa il JSON di risultato scritto da evaluate.mjs con i dati misurati da Paperclip. NON aggiorna il registro costi
// (results/budget-ledger.json lo aggiorna l'utente). Modello: scripts/live/record-warren-run.mjs.
// Uso: node scripts/live/paperclip-record-run.mjs <resultFile> <pc-run-*.json> <ISSUE> [note-aggiuntive]
// Il file pc-run-*.json e' quello scritto da paperclip-run.mjs (copiato da ~ della distribuzione in results/raw/).
import { readFileSync, writeFileSync } from 'node:fs';

const [resultFile, runFile, issue, extra = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultFile, 'utf8'));
const o = JSON.parse(readFileSync(runFile, 'utf8'));
const runs = o.runDetails.map((x) => x.detail);
const ok = runs.filter((d) => d.status === 'succeeded').sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
const main = ok[0] ?? runs[0];
const initOf = (rd) => {
  try {
    const content = JSON.parse(rd.log).content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const l of content) {
      if (l.stream !== 'stdout') continue;
      for (const sub of l.chunk.split('\n').filter(Boolean)) {
        try { const j = JSON.parse(sub); if (j.type === 'system' && j.subtype === 'init') return j; } catch { /* riga non JSON */ }
      }
    }
  } catch { /* nessun log */ }
  return null;
};
const mainRd = o.runDetails.find((x) => x.detail.id === main.id);
const init = initOf(mainRd);
const u = main.usageJson ?? {};
const totalCost = runs.reduce((s, d) => s + (d.usageJson?.costUsd ?? 0), 0);
const start = new Date(main.startedAt);
const end = new Date((ok.length ? ok : [main]).map((d) => d.finishedAt).sort().at(-1));
const sum = (k) => (ok.length ? ok : [main]).reduce((t, d) => t + (d.usageJson?.[k] ?? 0), 0);
const statuses = runs.map((d) => d.status).join(', ');

Object.assign(r, {
  candidate: 'paperclip',
  candidate_version:
    'paperclipai 2026.1012.0 (release npm, commit bba6a45; studio del codice a 05f7079) adapter claude_local engine=cli con wrapper bwrap + Claude Code 2.1.306',
  model: init?.model ?? u.model ?? null,
  baseline_commit: null,
  started_at_utc: start.toISOString(),
  finished_at_utc: end.toISOString(),
  duration_seconds: (end - start) / 1000,
  input_tokens: sum('inputTokens'),
  output_tokens: sum('outputTokens'),
  cache_tokens: sum('cachedInputTokens'),
  estimated_cost_usd: totalCost,
  retries: 0,
  human_interventions: 0,
  notes:
    `Run LIVE su ${issue}: run Paperclip ${main.id} (company ${o.ids.company}), stato ${main.status}; run totali sull'issue: ${runs.length} (${statuses}); ` +
    `costo riportato da Paperclip ${u.costUsd} USD (costStatus=${u.costStatus}, billingType=${u.billingType}: stima a listino con abbonamento; Paperclip registra 0 centesimi spesi), ` +
    `modello dall'evento init: ${init?.model ?? 'n/d'}, permissionMode ${init?.permissionMode ?? 'n/d'}. ` +
    `Durata = dall'inizio della prima run riuscita alla fine dell'ultima run riuscita (token e durata sommati sulle run riuscite; costo su tutte) (include avvio del wrapper bwrap e della CLI). Run riuscite: ${ok.length}. Issue Paperclip a fine run: ${o.issueFinal.body.status}. ${extra}`,
});
if (main.status !== 'succeeded') {
  r.status = 'FAIL';
  r.blockers = [...(r.blockers ?? []), `run Paperclip in stato ${main.status}`];
}
writeFileSync(resultFile, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ issue, run: main.id, state: main.status, status: r.status, cost_usd: totalCost, model: r.model, duration_s: r.duration_seconds, tokens: [r.input_tokens, r.output_tokens, r.cache_tokens] }));
