#!/usr/bin/env node
// Serie di run di Claude Code da solo (baseline) sulla fixture difficile, una dopo l'altra. Consuma uso del piano Claude.
// Uso: node scripts/run-hard-batch.mjs <HARD-N> [<HARD-N> ...]   [--nudge]   [--cap-usd 4]
// Regole di arresto: memoria disponibile < 1200 MB; 2 errori di esecuzione consecutivi; spesa della serie oltre il tetto.
// Per ogni run: scripts/run-baseline.mjs con FIXTURE=hard (isolamento dal CLAUDE.md globale, strumenti ristretti, tetto 1,5 USD).
import { spawnSync } from 'node:child_process';
import { freemem } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nudge = args.includes('--nudge');
const capIdx = args.indexOf('--cap-usd');
const cap = capIdx >= 0 ? Number(args[capIdx + 1]) : 4;
const issues = args.filter((a, i) => /^HARD-\d+$/.test(a) && args[i - 1] !== '--cap-usd');
if (!issues.length) {
  console.error('uso: run-hard-batch.mjs HARD-1 [HARD-2 ...] [--nudge] [--cap-usd 4]');
  process.exit(2);
}

const rows = [];
let spent = 0;
let consecutiveErrors = 0;
for (const [n, issue] of issues.entries()) {
  const memMb = Math.round(freemem() / 1048576);
  if (memMb < 1200) { console.log(`STOP: memoria disponibile ${memMb} MB < 1200`); break; }
  if (spent >= cap) { console.log(`STOP: spesa della serie ${spent.toFixed(3)} USD >= tetto ${cap}`); break; }
  if (consecutiveErrors >= 2) { console.log('STOP: 2 errori di esecuzione consecutivi'); break; }
  console.log(`=== run ${n + 1}/${issues.length} su ${issue}${nudge ? ' (con guida a chiedere)' : ''}  memoria disponibile ${memMb} MB`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'run-baseline.mjs'), issue, nudge ? 'H-CAL-NUDGE' : 'H-CAL'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FIXTURE: 'hard', ...(nudge ? { HARD_ASK_NUDGE: '1' } : {}) },
    timeout: 20 * 60_000,
  });
  const secs = Math.round((Date.now() - t0) / 1000);
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* output non JSON */ }
  if (!out) {
    consecutiveErrors++;
    console.log(`ERRORE di esecuzione (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 300)}`);
    rows.push({ issue, status: 'ERRORE', cost: null, secs });
    continue;
  }
  consecutiveErrors = 0;
  spent += out.cost_usd ?? 0;
  const c = out.checks ?? {};
  rows.push({ issue, status: out.status, cost: out.cost_usd, turns: out.turns, secs, visible: c.visible_tests, held: c.heldout_acceptance, src: c.src_changed, q: c.questions });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
console.log('\n=== riepilogo');
console.log('issue   | esito   | costo USD | turni | s    | visibili | held-out | src toccato | ?');
for (const x of rows) console.log(`${x.issue.padEnd(7)} | ${String(x.status).padEnd(7)} | ${x.cost == null ? '-' : x.cost.toFixed(4)}    | ${x.turns ?? '-'}     | ${String(x.secs).padEnd(4)} | ${x.visible ?? '-'}     | ${x.held ?? '-'}    | ${x.src ?? '-'}        | ${x.q ?? '-'}`);
console.log(`spesa della serie (stima a listino): ${spent.toFixed(4)} USD`);
