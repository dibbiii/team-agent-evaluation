#!/usr/bin/env node
// CI locale che simula la CI esterna per la fixture di squadra. NON sta nella cartella dell'agente.
// Uso: node scripts/team-ci.mjs <workspace> --task TEAM-3|FEATURE [--baseline <seed>] [--log <ci-log.jsonl>] [--json]
// Esce con 0 se la CI passa, 1 se fallisce (stampa esito e messaggi). Con --log aggiunge una riga a un file JSONL
// (task, numero del tentativo, esito, controlli falliti): è il conteggio oggettivo dei tentativi di CI.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCi } from './lib/team-ci-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const workspace = args.find((a) => !a.startsWith('--') && a !== opt('task') && a !== opt('baseline') && a !== opt('log'));
if (!workspace) {
  console.error('uso: team-ci.mjs <workspace> --task TEAM-n|FEATURE [--baseline <seed>] [--log <file.jsonl>] [--json]');
  process.exit(2);
}
const task = opt('task');
const baseline = opt('baseline') ?? resolve(root, 'fixtures', 'seed-app-team');
const result = runCi({ workspace, baseline, task });

const logFile = opt('log');
let attempt = null;
if (logFile) {
  const previous = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  attempt = previous.filter((e) => e.task === task).length + 1;
  appendFileSync(logFile, `${JSON.stringify({ task, attempt, passed: result.passed, failed_checks: result.failedChecks })}\n`);
}

if (args.includes('--json')) console.log(JSON.stringify({ ...result, attempt }, null, 2));
else console.log(`${result.message}${attempt ? `\n(tentativo ${attempt} per ${task})` : ''}`);
process.exit(result.passed ? 0 : 1);
