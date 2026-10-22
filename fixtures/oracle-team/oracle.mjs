// Oracolo umano simulato: risponde alle domande dell'Analyst (o dell'agente solo) con answers.json. Nessun modello, nessuna rete.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const loadAnswers = () => JSON.parse(readFileSync(join(here, 'answers.json'), 'utf8'));

// Restituisce { id, answer, expected }. `id` è l'id della voce che ha risposto, o 'default'.
export function askOracle(question, answers = loadAnswers()) {
  const text = String(question ?? '');
  for (const entry of answers.entries) {
    if (new RegExp(entry.match, 'i').test(text)) return { id: entry.id, answer: entry.answer, expected: entry.expected === true };
  }
  return { id: answers.default.id, answer: answers.default.answer, expected: false };
}

// Classifica un elenco di domande: utili (voce `expected` non ancora coperta), ripetute, inutili (info già nel repo o risposta di default).
export function classifyQuestions(questions, answers = loadAnswers()) {
  const expectedIds = answers.entries.filter((e) => e.expected === true).map((e) => e.id);
  const covered = new Set();
  const detail = [];
  for (const q of questions) {
    const text = typeof q === 'string' ? q : q?.text;
    const r = askOracle(text, answers);
    let kind;
    if (r.expected && !covered.has(r.id)) {
      kind = 'useful';
      covered.add(r.id);
    } else if (r.expected) kind = 'repeated';
    else kind = 'useless';
    detail.push({ text, oracle_id: r.id, kind });
  }
  return {
    useful: detail.filter((d) => d.kind === 'useful').length,
    useless: detail.filter((d) => d.kind !== 'useful').length,
    expected_total: expectedIds.length,
    expected_covered: covered.size,
    missed: expectedIds.filter((id) => !covered.has(id)),
    detail,
  };
}

// Rilascia il change-request nel workspace dell'agente (da chiamare quando TEAM-4 risulta completato).
export function releaseChangeRequest(workspace) {
  const src = join(here, 'change-request-1.md');
  const dest = join(resolve(workspace), 'docs', 'requirements');
  if (!existsSync(src)) throw new Error('change-request-1.md mancante');
  mkdirSync(dest, { recursive: true });
  cpSync(src, join(dest, 'change-request-1.md'));
  return join(dest, 'change-request-1.md');
}
