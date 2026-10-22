#!/usr/bin/env node
// Prompt della fixture difficile, IDENTICO a quello di scripts/run-baseline.mjs con FIXTURE=hard e senza HARD_ASK_NUDGE
// (la guida a chiedere NON c'e': si misura il comportamento naturale). Unica fonte per baseline e Warren di questo lotto.
// Uso come modulo: import { buildPrompt, loadIssue } from './warren-hard-prompt.mjs'
// Uso da riga di comando: node scripts/live/warren-hard-prompt.mjs <HARD-N> <file-di-uscita>   (LF, UTF-8 senza BOM)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadIssue(key) {
  const issues = JSON.parse(readFileSync(join(root, 'fixtures', 'issue-catalog', 'hard-issues.json'), 'utf8'));
  const issue = issues.find((i) => i.key === key);
  if (!issue) throw new Error(`Issue sconosciuta: ${key}`);
  return issue;
}

export function buildPrompt(issue) {
  return [
    `Sei uno sviluppatore. Lavora nella cartella corrente (una libreria backend di e-commerce in Node, senza dipendenze, importi in centesimi interi). Le decisioni di architettura approvate sono in docs/adr/.`,
    `Issue ${issue.key} (${issue.type}, priorità ${issue.priority}): ${issue.summary}`,
    ``,
    issue.description,
    ``,
    `Criteri di accettazione:`,
    ...issue.acceptance.map((a) => `- ${a}`),
    ``,
    `Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con "npm test". Non cambiare l'interfaccia pubblica oltre quanto richiesto.`,
    `Al termine rispondi con un riassunto di 3 righe.`,
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [key, out] = process.argv.slice(2);
  if (!key || !out) { console.error('uso: warren-hard-prompt.mjs HARD-N file-uscita'); process.exit(2); }
  const issue = loadIssue(key);
  if ((issue.depends_on ?? []).length) throw new Error(`${key} ha dipendenze: fuori dal sottoinsieme`);
  writeFileSync(out, buildPrompt(issue) + '\n', 'utf8'); // newline finale: $(cat) di bash lo toglie, come per il baseline
  console.log(`scritto ${out}`);
}
