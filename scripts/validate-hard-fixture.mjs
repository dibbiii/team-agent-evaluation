#!/usr/bin/env node
// Valida la fixture difficile (seed-app-hard) senza modelli, rete o costi.
// Per ogni issue verifica: visibili e held-out sul baseline, soluzione di riferimento, mutanti, indipendenza dei test
// held-out dai riferimenti, determinismo (validazione ripetuta due volte). Esce con 0 solo se tutto torna.
//
// Uso: node scripts/validate-hard-fixture.mjs [--only HARD-1,HARD-3] [--once] [--isolated]
//   --only      limita il controllo a certe issue (il determinismo e i controlli globali restano)
//   --once      salta la seconda esecuzione (niente controllo di determinismo): solo per iterare
//   --verbose   stampa l'output dei test quando un risultato non è quello atteso
//   --explain   elenca i test che falliscono sul baseline e per ciascun mutante (controllo che falliscano per il motivo giusto)
//   --isolated  esegue le suite visibili con l'isolamento standard di `node --test` (un processo per file, più lento)
//               invece di --experimental-test-isolation=none; gli held-out sono sempre un file solo.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(root, 'fixtures', 'seed-app-hard');
const ACC = join(root, 'fixtures', 'acceptance-hard');
const REF = join(root, 'fixtures', 'reference-hard');
const CATALOG = join(root, 'fixtures', 'issue-catalog', 'hard-issues.json');

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
const once = args.includes('--once');
const isolated = args.includes('--isolated');
const verbose = args.includes('--verbose');
const explain = args.includes('--explain');

const issues = JSON.parse(readFileSync(CATALOG, 'utf8'));
const byKey = Object.fromEntries(issues.map((i) => [i.key, i]));
const selected = issues.filter((i) => !only || only.includes(i.key));

const tmpRoot = mkdtempSync(join(tmpdir(), 'tae-hard-validate-'));
let wsCounter = 0;

// --- esecuzione dei test --------------------------------------------------------------------------------------

const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT; // se questo script gira dentro `node --test`, i figli non devono crederlo

function probeNoIsolation() {
  const dir = mkdtempSync(join(tmpRoot, 'probe-'));
  writeFileSync(join(dir, 'p.test.js'), "import { test } from 'node:test';\ntest('p', () => {});\n");
  const r = spawnSync(process.execPath, ['--experimental-test-isolation=none', '--test', 'p.test.js'], { cwd: dir, encoding: 'utf8', env: childEnv });
  return r.status === 0;
}
const fastMode = !isolated && probeNoIsolation();

function runNode(cwd, target, { forceFast = false } = {}) {
  const flags = fastMode || forceFast ? ['--experimental-test-isolation=none'] : [];
  const r = spawnSync(process.execPath, [...flags, '--test', '--test-reporter=tap', target], {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    env: childEnv,
  });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (name) => Number((out.match(new RegExp(`^# ${name} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
  return { ok: r.status === 0, tests: num('tests'), pass: num('pass'), fail: num('fail'), output: out };
}

// --- workspace ------------------------------------------------------------------------------------------------

function copyTree(from, to, { skipTopMutants = false } = {}) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = relative(from, src).split(sep);
      if (rel.includes('node_modules')) return false;
      if (skipTopMutants && rel[0] === 'mutants') return false;
      return true;
    },
  });
}

// Workspace = baseline + sovrapposizioni (cartelle di riferimento/mutanti) + test held-out accanto, come evaluate.mjs.
function workspace(overlays = []) {
  const ws = join(tmpRoot, `ws-${++wsCounter}`);
  mkdirSync(ws, { recursive: true });
  copyTree(SEED, join(ws, 'seed-app-hard'));
  for (const o of overlays) copyTree(o.dir, join(ws, 'seed-app-hard'), { skipTopMutants: o.skipTopMutants ?? true });
  copyTree(ACC, join(ws, 'acceptance'));
  return ws;
}

const refDir = (key) => join(REF, key);
const hasRef = (key) => existsSync(join(refDir(key), 'src')) || existsSync(join(refDir(key), 'test'));

// Catena delle dipendenze in ordine di applicazione (prima le dipendenze).
function chain(key, seen = new Set()) {
  const out = [];
  for (const dep of byKey[key].depends_on ?? []) {
    for (const k of chain(dep, seen)) out.push(k);
  }
  if (!seen.has(key)) {
    seen.add(key);
    out.push(key);
  }
  return out;
}
const refOverlays = (keys) => keys.filter(hasRef).map((k) => ({ dir: refDir(k) }));

const visible = (ws) => runNode(join(ws, 'seed-app-hard'), 'test/*.test.js');
const held = (ws, key) => runNode(ws, `acceptance/${key}.acceptance.test.js`, { forceFast: true });
// L'output completo resta non enumerabile: serve per --verbose ma non entra nel confronto di determinismo.
const summarize = (r) => Object.defineProperty({ ok: r.ok, tests: r.tests, pass: r.pass, fail: r.fail }, 'output', { value: r.output });
const failedNames = (r) => [...String(r.output).matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]);
const why = (label, r) => {
  if (explain) console.log(`  ${label}: ${failedNames(r).join(' | ') || '(nessun test fallito: errore di caricamento?)'}`);
};
const show = (label, r) => {
  if (!verbose) return;
  const tail = String(r.output).split('\n').slice(-60).join('\n');
  console.log(`\n--- output: ${label} ---\n${tail}`);
};

// --- una passata completa di validazione ---------------------------------------------------------------------

function validateOnce() {
  const res = { baseline: {}, issues: {}, independence: {}, globals: {} };

  const wsBase = workspace();
  res.baseline.visible = summarize(visible(wsBase));

  for (const issue of selected) {
    const k = issue.key;
    const entry = { expected: issue.expected_behavior };
    const hasHeld = existsSync(join(ACC, `${k}.acceptance.test.js`));
    entry.hasHeld = hasHeld;
    const deps = chain(k).filter((x) => x !== k);

    if (hasHeld) entry.baselineHeld = summarize(held(wsBase, k));

    if (issue.expected_behavior === 'implement') {
      const wsRef = workspace(refOverlays([...deps, k]));
      entry.refVisible = summarize(visible(wsRef));
      entry.refHeld = summarize(held(wsRef, k));
      if (deps.length) {
        const wsNoDep = workspace(refOverlays([k]));
        entry.refWithoutDepsHeld = summarize(held(wsNoDep, k));
      }
    }

    entry.mutants = {};
    const mdir = join(refDir(k), 'mutants');
    if (existsSync(mdir)) {
      for (const name of readdirSync(mdir).sort()) {
        const ws = workspace([...refOverlays(deps), { dir: join(mdir, name), skipTopMutants: false }]);
        entry.mutants[name] = { held: summarize(held(ws, k)), visible: summarize(visible(ws)) };
      }
    }
    res.issues[k] = entry;
  }

  res.independence = checkIndependence();
  res.globals = checkGlobals();
  return res;
}

// --- controlli statici ---------------------------------------------------------------------------------------

function listFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

// (5) I test held-out non dipendono da fixtures/reference-hard né dai mutanti, e non stanno dentro seed-app-hard.
function checkIndependence() {
  const problems = [];
  const files = listFiles(ACC).filter((f) => /\.(js|mjs)$/.test(f));
  const specRe = /(?:from\s+|import\s*\(\s*|new URL\(\s*|readFileSync\(\s*|require\(\s*)['"]([^'"]+)['"]/g;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (/reference-hard|mutants/.test(text.replace(/\/\/.*$/gm, ''))) problems.push(`${relative(root, f)}: cita reference-hard o mutants`);
    for (const m of text.matchAll(specRe)) {
      const spec = m[1];
      if (spec.startsWith('node:') || !spec.startsWith('.')) continue;
      const target = resolve(dirname(f), spec);
      const okInside = target.startsWith(ACC + sep) || target === ACC || target.startsWith(join(SEED, 'src') + sep);
      if (!okInside) problems.push(`${relative(root, f)}: importa ${spec} fuori da acceptance-hard e seed-app-hard/src`);
      if (target.startsWith(REF)) problems.push(`${relative(root, f)}: importa dai riferimenti`);
    }
  }
  const seedFiles = listFiles(SEED).map((f) => relative(SEED, f));
  for (const f of seedFiles) if (/acceptance/i.test(f)) problems.push(`seed-app-hard contiene un test held-out: ${f}`);
  return { ok: problems.length === 0, problems, scanned: files.length };
}

function countLines(files) {
  return files.reduce((s, f) => s + readFileSync(f, 'utf8').split('\n').length - 1, 0);
}

// Controlli globali sulla struttura richiesta.
function checkGlobals() {
  const problems = [];
  const srcFiles = listFiles(join(SEED, 'src'));
  const srcLines = countLines(srcFiles);
  if (srcFiles.length < 15 || srcFiles.length > 20) problems.push(`file sorgente ${srcFiles.length} (attesi 15-20)`);
  if (srcLines < 900 || srcLines > 1500) problems.push(`righe sorgente ${srcLines} (attese 900-1500)`);
  const adrDir = join(SEED, 'docs', 'adr');
  const adrs = existsSync(adrDir) ? readdirSync(adrDir).filter((f) => f.endsWith('.md')) : [];
  if (adrs.length < 4 || adrs.length > 6) problems.push(`ADR ${adrs.length} (attesi 4-6)`);
  if (issues.length !== 10) problems.push(`issue nel catalogo ${issues.length} (attese 10)`);
  const required = ['key', 'type', 'priority', 'summary', 'description', 'acceptance', 'components', 'blocked_by', 'ready', 'scenario', 'difficulty', 'expected_behavior', 'depends_on'];
  for (const i of issues) {
    for (const f of required) if (!(f in i)) problems.push(`${i.key}: campo mancante ${f}`);
    if (!['implement', 'ask'].includes(i.expected_behavior)) problems.push(`${i.key}: expected_behavior non valido`);
    if (i.expected_behavior === 'implement' && !hasRef(i.key)) problems.push(`${i.key}: soluzione di riferimento mancante`);
    const mutants = existsSync(join(refDir(i.key), 'mutants')) ? readdirSync(join(refDir(i.key), 'mutants')) : [];
    if ((i.expected_behavior === 'implement' || i.key === 'HARD-7') && mutants.length < 1) problems.push(`${i.key}: nessun mutante`);
    const hasHeld = existsSync(join(ACC, `${i.key}.acceptance.test.js`));
    if (i.key === 'HARD-8' && hasHeld) problems.push('HARD-8 non deve avere test held-out');
    if (i.key !== 'HARD-8' && !hasHeld) problems.push(`${i.key}: test held-out mancante`);
    // Le trappole non devono comparire nel catalogo: nessun riferimento ai mutanti o alla sezione valutatori.
    if (/mutant|trappol|valutator/i.test(JSON.stringify(i))) problems.push(`${i.key}: il catalogo cita trappole/mutanti`);
  }
  // Golden coerenti con il baseline.
  const g = spawnSync(process.execPath, [join(ACC, 'data', 'generate-golden.mjs'), '--check'], { encoding: 'utf8', env: childEnv });
  if (g.status !== 0) problems.push(`golden non coerenti con il baseline: ${g.stderr.trim()}`);
  return { ok: problems.length === 0, problems, srcFiles: srcFiles.length, srcLines, adrs: adrs.length };
}

// --- valutazione e tabella -----------------------------------------------------------------------------------

function evaluate(res) {
  const failures = [];
  const rows = [];
  const bv = res.baseline.visible;
  if (!bv.ok) failures.push('visibili FAIL sul baseline');
  if (!(bv.tests >= 70)) failures.push(`visibili sul baseline: ${bv.tests} test (attesi >= 70)`);

  for (const issue of selected) {
    const k = issue.key;
    const e = res.issues[k];
    const row = { issue: k, expected: e.expected, bVis: bv.ok ? 'PASS' : 'FAIL' };
    const mark = (cond, msg) => {
      if (!cond) failures.push(`${k}: ${msg}`);
      return cond ? '' : ' !!';
    };
    const st = (r) => (r.ok ? 'PASS' : 'FAIL');

    if (!e.hasHeld) {
      row.bHeld = 'n/a';
      row.rVis = 'n/a';
      row.rHeld = 'n/a';
    } else if (e.expected === 'ask') {
      // HARD-7: l'invariante dell'ADR passa sul baseline (e vale come riferimento: nessuna modifica attesa).
      row.bHeld = st(e.baselineHeld) + mark(e.baselineHeld.ok, 'invariante FAIL sul baseline');
      if (!e.baselineHeld.ok) show(`${k} invariante baseline`, e.baselineHeld);
      row.rVis = 'baseline';
      row.rHeld = 'baseline';
    } else {
      row.bHeld = st(e.baselineHeld) + mark(!e.baselineHeld.ok, 'held-out PASS sul baseline (deve fallire)');
      if (e.baselineHeld.ok) show(`${k} held-out baseline`, e.baselineHeld);
      row.rVis = st(e.refVisible) + mark(e.refVisible.ok, 'visibili FAIL con la soluzione di riferimento');
      row.rHeld = st(e.refHeld) + mark(e.refHeld.ok, 'held-out FAIL con la soluzione di riferimento');
      if (!e.refHeld.ok) show(`${k} held-out con riferimento`, e.refHeld);
      if (!e.refVisible.ok) show(`${k} visibili con riferimento`, e.refVisible);
    }
    row.dep = e.refWithoutDepsHeld ? (e.refWithoutDepsHeld.ok ? 'NO' + mark(false, 'il riferimento passa anche senza la dipendenza') : 'si') : '-';
    if (e.baselineHeld && e.expected === 'implement') why(`${k} baseline`, e.baselineHeld);
    const ms = Object.entries(e.mutants);
    for (const [name, m] of ms) why(`${k} mutante ${name}`, m.held);
    for (const [name, m] of ms) if (m.held.ok) show(`${k} mutante ${name}`, m.held);
    row.mut = ms.length
      ? ms.map(([name, m]) => `${name}:${m.held.ok ? 'PASS' : 'FAIL'}${mark(!m.held.ok, `mutante ${name} NON bocciato`)}`).join(' ')
      : '-';
    rows.push(row);
  }
  if (!res.independence.ok) failures.push(...res.independence.problems);
  if (!res.globals.ok) failures.push(...res.globals.problems);
  return { rows, failures };
}

function printTable(rows) {
  const cols = [
    ['issue', 'Issue'],
    ['expected', 'Atteso'],
    ['bVis', 'Vis base'],
    ['bHeld', 'Held base'],
    ['rVis', 'Vis rif'],
    ['rHeld', 'Held rif'],
    ['dep', 'Dip reale'],
    ['mut', 'Mutanti (held-out: FAIL = bocciato)'],
  ];
  const w = cols.map(([k, h]) => Math.max(h.length, ...rows.map((r) => String(r[k]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' | ');
  console.log(line(cols.map(([, h]) => h)));
  console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
  for (const r of rows) console.log(line(cols.map(([k]) => r[k])));
}

// --- main ---------------------------------------------------------------------------------------------------

let exitCode = 1;
try {
  console.log(`Validazione fixture difficile (modalità visibili: ${fastMode ? 'isolamento none' : 'isolamento standard'})`);
  const first = validateOnce();
  const { rows, failures } = evaluate(first);
  printTable(rows);
  const g = first.globals;
  console.log(`\nBaseline: ${first.baseline.visible.tests} test visibili (${first.baseline.visible.pass} pass, ${first.baseline.visible.fail} fail); ${g.srcFiles} file sorgente, ${g.srcLines} righe, ${g.adrs} ADR.`);
  console.log(`Indipendenza: ${first.independence.ok ? 'OK' : 'KO'} (${first.independence.scanned} file held-out analizzati).`);

  if (!once) {
    const second = validateOnce();
    const same = JSON.stringify(first) === JSON.stringify(second);
    console.log(`Determinismo (due validazioni complete): ${same ? 'identiche' : 'DIVERSE'}.`);
    if (!same) failures.push('la validazione ripetuta due volte dà risultati diversi');
  } else {
    console.log('Determinismo: non verificato (--once).');
  }

  if (failures.length) {
    console.log('\nPROBLEMI:');
    for (const f of failures) console.log(`- ${f}`);
  } else {
    console.log('\nTUTTO OK.');
  }
  exitCode = failures.length ? 1 : 0;
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
process.exit(exitCode);
