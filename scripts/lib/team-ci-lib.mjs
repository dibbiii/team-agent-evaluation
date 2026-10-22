// Logica della CI locale che simula la CI esterna della fixture di squadra (fixtures/seed-app-team).
// Funzione pura rispetto alla cartella: stesso albero + stesso ticket = stesso esito e stessi messaggi.
// Le regole sono descritte in fixtures/seed-app-team/ci/rules.json; il runner sta qui, FUORI dalla cartella dell'agente.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';

export const IMPLEMENT_KEYS = ['TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6', 'TEAM-8'];

function listFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

const rel = (base, file) => relative(base, file).split(sep).join('/');
const read = (file) => readFileSync(file, 'utf8');

// Regola money-helpers: i comandi vietati fuori da src/money.js (ADR-001).
const FORBIDDEN = /\bMath\.(round|ceil|floor|trunc)\s*\(|\.toFixed\s*\(|\bparseFloat\s*\(/;

function checkNoConsole(ws) {
  const problems = [];
  for (const f of listFiles(join(ws, 'src')).filter((x) => x.endsWith('.js'))) {
    read(f).split('\n').forEach((line, i) => {
      if (/\bconsole\./.test(line)) problems.push(`${rel(ws, f)}:${i + 1}: console.* non ammesso in src/`);
    });
  }
  return problems;
}

function checkMoneyHelpers(ws) {
  const problems = [];
  for (const f of listFiles(join(ws, 'src')).filter((x) => x.endsWith('.js'))) {
    if (rel(ws, f) === 'src/money.js') continue;
    read(f).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (FORBIDDEN.test(code)) problems.push(`${rel(ws, f)}:${i + 1}: arrotondamento o conversione diretta di importi (ADR-001): usare gli helper di src/money.js`);
    });
  }
  return problems;
}

function checkSortedExports(ws) {
  const file = join(ws, 'src', 'index.js');
  if (!existsSync(file)) return ['src/index.js mancante'];
  const mods = [...read(file).matchAll(/^\s*export\b.*?from\s+'(\.\/[^']+)'/gm)].map((m) => m[1]);
  for (let i = 1; i < mods.length; i++) {
    if (mods[i - 1] > mods[i]) return [`src/index.js: '${mods[i]}' deve venire prima di '${mods[i - 1]}' (export in ordine alfabetico per modulo)`];
  }
  return [];
}

function filesDiffer(a, b) {
  return !existsSync(a) || !existsSync(b) || read(a) !== read(b);
}

function checkTestsWithCode(ws, baseline) {
  if (!baseline) return [];
  const srcChanged = listFiles(join(ws, 'src')).some((f) => {
    const r = rel(ws, f);
    return r !== 'src/index.js' && filesDiffer(f, join(baseline, r));
  });
  if (!srcChanged) return [];
  const testsChanged = listFiles(join(ws, 'test')).some((f) => filesDiffer(f, join(baseline, rel(ws, f))));
  return testsChanged ? [] : ['modificato codice in src/ senza nessun test nuovo o modificato in test/'];
}

function checkChangelog(ws, task) {
  const file = join(ws, 'CHANGELOG.md');
  if (!existsSync(file)) return ['CHANGELOG.md mancante'];
  const text = read(file);
  const keys = task === 'FEATURE' ? IMPLEMENT_KEYS : task ? [task] : [];
  return keys.filter((k) => !new RegExp(`^- ${k}\\b`, 'm').test(text)).map((k) => `CHANGELOG.md: manca la riga "- ${k}: ..."`);
}

// Un solo processo (--experimental-test-isolation=none) è molto più veloce; se la versione di Node non lo supporta si usa l'isolamento standard.
let fastFlags;
function testFlags(node, env) {
  if (fastFlags === undefined) {
    const probe = spawnSync(node, ['--experimental-test-isolation=none', '-e', '0'], { encoding: 'utf8', env });
    fastFlags = probe.status === 0 ? ['--experimental-test-isolation=none'] : [];
  }
  return fastFlags;
}

function checkTests(ws, node) {
  if (!existsSync(join(ws, 'test'))) return ['cartella test/ mancante'];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // se questo codice gira dentro `node --test`, i figli non devono crederlo
  // Elenchiamo noi i file: l'espansione dei glob da parte di Node dipende dalla versione.
  const files = listFiles(join(ws, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => rel(ws, f));
  if (!files.length) return ['nessun file test/*.test.js'];
  const r2 = spawnSync(node, [...testFlags(node, env), '--test', '--test-reporter=tap', ...files], { cwd: ws, encoding: 'utf8', timeout: 180_000, env });
  const out = `${r2.stdout}\n${r2.stderr}`;
  if (r2.status === 0) return [];
  const names = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  return names.length ? names.map((n) => `test fallito: ${n}`) : ['la suite dei test è fallita (errore di caricamento?)'];
}

const CHECKS = [
  ['tests-pass', (ws, ctx) => checkTests(ws, ctx.node)],
  ['no-console', (ws) => checkNoConsole(ws)],
  ['money-helpers', (ws) => checkMoneyHelpers(ws)],
  ['sorted-exports', (ws) => checkSortedExports(ws)],
  ['tests-with-code', (ws, ctx) => checkTestsWithCode(ws, ctx.baseline)],
  ['changelog', (ws, ctx) => checkChangelog(ws, ctx.task)],
];

// Esegue la CI su `workspace`. `baseline` = cartella del seed originale (per «cosa è cambiato»); `task` = chiave TEAM-n o FEATURE.
export function runCi({ workspace, baseline = null, task = null, node = process.execPath }) {
  const ws = resolve(workspace);
  const ctx = { baseline: baseline ? resolve(baseline) : null, task, node };
  const checks = CHECKS.map(([id, fn]) => {
    const messages = fn(ws, ctx);
    return { id, ok: messages.length === 0, messages };
  });
  const failed = checks.filter((c) => !c.ok);
  return {
    task,
    passed: failed.length === 0,
    checks,
    failedChecks: failed.map((c) => c.id),
    message: failed.length === 0 ? 'CI PASSED' : `CI FAILED (${failed.map((c) => c.id).join(', ')})\n${failed.flatMap((c) => c.messages.map((m) => `  [${c.id}] ${m}`)).join('\n')}`,
  };
}
