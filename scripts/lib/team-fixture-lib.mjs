// Funzioni comuni a validate-team-fixture.mjs e score-team-run.mjs: percorsi, costruzione dei workspace, esecuzione dei test.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SEED = join(ROOT, 'fixtures', 'seed-app-team');
export const ACC = join(ROOT, 'fixtures', 'acceptance-team');
export const REF = join(ROOT, 'fixtures', 'reference-team');
export const ORACLE = join(ROOT, 'fixtures', 'oracle-team');
export const CATALOG = join(ROOT, 'fixtures', 'issue-catalog', 'team-tasks.json');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const stages = () => readJson(join(REF, 'stages.json'));

export function listFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

export function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const parts = relative(from, src).split(sep);
      return !parts.includes('node_modules') && !parts.includes('.git');
    },
  });
}

export function makeTmp(prefix = 'tae-team-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Applica le sovrapposizioni di riferimento (nomi di stages.json) sulla cartella `dest`.
export function applyOverlays(dest, names) {
  const { overlays } = stages();
  for (const name of names) {
    if (!overlays[name]) throw new Error(`sovrapposizione sconosciuta: ${name}`);
    copyTree(join(REF, overlays[name]), dest);
  }
}

// Applica modifiche testuali {file, find, replace}; ogni `find` deve comparire esattamente una volta.
export function applyEdits(dest, edits) {
  for (const { file, find, replace } of edits) {
    const target = join(dest, file);
    const text = readFileSync(target, 'utf8');
    const count = text.split(find).length - 1;
    if (count !== 1) throw new Error(`modifica non applicabile a ${file}: "${find.slice(0, 50)}" compare ${count} volte`);
    writeFileSync(target, text.replace(find, () => replace));
  }
}

// Workspace di valutazione: <ws>/seed-app-team (albero da valutare) + <ws>/acceptance (test held-out), come per l'agente di S01.
export function workspaceFrom(treeDir, root) {
  const ws = mkdtempSync(join(root, 'ws-'));
  copyTree(treeDir, join(ws, 'seed-app-team'));
  copyTree(ACC, join(ws, 'acceptance'));
  return ws;
}

// Albero di riferimento = seed + sovrapposizioni (+ modifiche). Restituisce la cartella dell'albero.
export function referenceTree(root, names, edits = []) {
  const dir = mkdtempSync(join(root, 'tree-'));
  copyTree(SEED, dir);
  applyOverlays(dir, names);
  if (edits.length) applyEdits(dir, edits);
  return dir;
}

let fast;
export function fastFlags(env) {
  if (fast === undefined) {
    const probe = spawnSync(process.execPath, ['--experimental-test-isolation=none', '-e', '0'], { encoding: 'utf8', env });
    fast = probe.status === 0 ? ['--experimental-test-isolation=none'] : [];
  }
  return fast;
}

export const childEnv = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

// Esegue `node --test` e legge il TAP. `files` sono percorsi relativi a `cwd`.
export function runTests(cwd, files) {
  const env = childEnv();
  const r = spawnSync(process.execPath, [...fastFlags(env), '--test', '--test-reporter=tap', ...files], {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    env,
  });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (name) => Number((out.match(new RegExp(`^# ${name} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
  const cases = [...out.matchAll(/^(not ok|ok) \d+ - (.*)$/gm)].map((m) => ({ name: m[2].replace(/\s+#.*$/, ''), ok: m[1] === 'ok' }));
  return { ok: r.status === 0, tests: num('tests'), pass: num('pass'), fail: num('fail'), cases, output: out };
}

export const heldFiles = () => readdirSync(ACC).filter((f) => f.endsWith('.acceptance.test.js')).sort();
// Test visibili: SEMPRE quelli originali del seed (l'agente potrebbe aver modificato i suoi), contro il src dell'albero.
export function runVisibleOriginal(treeDir, root) {
  const dir = mkdtempSync(join(root, 'vis-'));
  copyTree(SEED, dir);
  rmSync(join(dir, 'src'), { recursive: true, force: true }); // il src dell'agente sostituisce quello del seed per intero
  copyTree(join(treeDir, 'src'), join(dir, 'src'));
  return runTests(dir, listFiles(join(dir, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => relative(dir, f).split(sep).join('/')));
}

// Ogni test held-out porta nel nome un tag di sotto-compito: [T2] [T3] [T4] [T5] [T6] [CR...] [FEATURE].
export const OWNERS = [
  [/^\[T2\]/, 'TEAM-2'],
  [/^\[T3\]/, 'TEAM-3'],
  [/^\[T4\]/, 'TEAM-4'],
  [/^\[T5\]/, 'TEAM-5'],
  [/^\[T6\]/, 'TEAM-6'],
  [/^\[CR/, 'TEAM-8'],
  [/^\[FEATURE\]/, 'FEATURE'],
];
export const ownerOf = (name) => OWNERS.find(([re]) => re.test(name))?.[1] ?? 'UNKNOWN';

// Esegue TUTTI i test held-out in un solo processo e raggruppa i risultati per sotto-compito.
export function runHeldAll(ws) {
  const run = runTests(ws, heldFiles().map((f) => `acceptance/${f}`));
  const per = {};
  for (const c of run.cases) {
    const k = ownerOf(c.name);
    per[k] ??= { tests: 0, pass: 0, failed: [] };
    per[k].tests++;
    if (c.ok) per[k].pass++;
    else per[k].failed.push(c.name);
  }
  return { run, per };
}
