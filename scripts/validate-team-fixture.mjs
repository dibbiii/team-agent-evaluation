#!/usr/bin/env node
// Valida la fixture di squadra (seed-app-team) senza modelli, rete o costi. Stessi controlli della fixture difficile, più quelli di coordinamento:
//   1. i test visibili passano sul seed; i test held-out falliscono sul seed;
//   2. ogni sotto-compito: l'albero con le sole sue dipendenze passa visibili, held-out del sotto-compito e CI; senza dipendenze fallisce;
//   3. feature completa (CR-1 incluso): tutti gli held-out, i visibili e la CI passano;
//   4. mutanti: ognuno è bocciato da almeno un test held-out atteso (o, per i mutanti «ci», dalla CI locale); si segnala chi non lo è;
//   5. conflitto Git inevitabile fra i rami paralleli (git merge-file);
//   6. nessun test held-out nel seed, nessuna dipendenza dei test dai riferimenti, catalogo coerente (grafo a diamante, file condiviso, CR rilasciato a parte);
//   7. oracolo coerente con i test; dimensione del seed; determinismo su 3 esecuzioni complete; tempo totale.
// Esce con 0 solo se tutto torna.
//
// Uso: node scripts/validate-team-fixture.mjs [--runs 3] [--once] [--only TEAM-2,TEAM-8] [--verbose] [--explain] [--json <file>] [--materialize <dir>]
//   --runs N      numero di esecuzioni complete per il determinismo (default 3); --once = 1 (solo per iterare)
//   --only        limita sotto-compiti e mutanti ai sotto-compiti indicati (i controlli globali restano)
//   --explain     elenca i test che falliscono per baseline e mutanti
//   --materialize scrive in <dir> l'albero della feature completa (soluzione di riferimento) e termina
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { runCi } from './lib/team-ci-lib.mjs';
import { ACC, CATALOG, ROOT, SEED, applyOverlays, copyTree, heldFiles, listFiles, makeTmp, readJson, referenceTree, runHeldAll, runTests, runVisibleOriginal, stages, workspaceFrom } from './lib/team-fixture-lib.mjs';
import { MUTANTS } from '../fixtures/reference-team/mutants.mjs';
import { loadAnswers, askOracle } from '../fixtures/oracle-team/oracle.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const once = args.includes('--once');
const runsWanted = once ? 1 : Number(opt('runs') ?? 3);
const only = opt('only') ? opt('only').split(',') : null;
const verbose = args.includes('--verbose');
const explain = args.includes('--explain');
const jsonOut = opt('json');
const materialize = opt('materialize');

const catalog = readJson(CATALOG);
const byKey = Object.fromEntries(catalog.map((t) => [t.key, t]));
const selected = (key) => !only || only.includes(key);
const heldKey = (file) => file.replace('.acceptance.test.js', '');
const accPath = (file) => `acceptance/${file}`;
const failedNames = (r) => r.cases.filter((c) => !c.ok).map((c) => c.name);
const summarize = (r) => ({ ok: r.ok, tests: r.tests, pass: r.pass, fail: r.fail, failed: failedNames(r) });

const tmpRoot = makeTmp('tae-team-validate-');
const started = Date.now();

// --- una passata completa -------------------------------------------------------------------------------------

function validateOnce() {
  const res = { seed: {}, subtasks: {}, feature: {}, mutants: {}, conflicts: [], statics: {} };
  const files = heldFiles();

  // Seed: visibili verdi, held-out rossi.
  const seedWs = workspaceFrom(SEED, tmpRoot);
  res.seed.visible = summarize(runTests(join(seedWs, 'seed-app-team'), listFiles(join(seedWs, 'seed-app-team', 'test')).filter((f) => f.endsWith('.test.js')).map((f) => relative(join(seedWs, 'seed-app-team'), f).split(sep).join('/'))));
  res.seed.held = {};
  const seedHeld = runHeldAll(seedWs);
  for (const f of files) {
    const k = heldKey(f);
    const p = seedHeld.per[k] ?? { tests: 0, pass: 0, failed: [] };
    res.seed.held[k] = { ok: p.pass === p.tests && p.tests > 0, tests: p.tests, pass: p.pass, fail: p.tests - p.pass, failed: p.failed };
  }

  // Sotto-compiti con la sola catena delle dipendenze.
  const { chains } = stages();
  for (const key of ['TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6', 'TEAM-8']) {
    if (!selected(key)) continue;
    const tree = referenceTree(tmpRoot, chains[key]);
    const ws = workspaceFrom(tree, tmpRoot);
    const entry = {};
    entry.visible = summarize(runVisibleOriginal(tree, tmpRoot));
    entry.ownTests = summarize(runTests(tree, listFiles(join(tree, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => relative(tree, f).split(sep).join('/'))));
    entry.held = summarize(runTests(ws, [accPath(`${key}.acceptance.test.js`)]));
    const ci = runCi({ workspace: tree, baseline: SEED, task: key });
    entry.ci = { passed: ci.passed, failed: ci.failedChecks };
    // senza dipendenze: solo la sovrapposizione del sotto-compito sul seed
    if (key !== 'TEAM-2') {
      const bare = referenceTree(tmpRoot, [key]);
      entry.heldWithoutDeps = summarize(runTests(workspaceFrom(bare, tmpRoot), [accPath(`${key}.acceptance.test.js`)]));
    }
    res.subtasks[key] = entry;
  }

  // Feature completa.
  const full = referenceTree(tmpRoot, chains.FEATURE);
  const fullWs = workspaceFrom(full, tmpRoot);
  res.feature.visible = summarize(runVisibleOriginal(full, tmpRoot));
  res.feature.held = summarize(runTests(fullWs, files.map(accPath)));
  const ciFull = runCi({ workspace: full, baseline: SEED, task: 'FEATURE' });
  res.feature.ci = { passed: ciFull.passed, failed: ciFull.failedChecks };
  // il merge intermedio (prima del CR) passa gli held-out dei sotto-compiti pre-CR
  const merged = referenceTree(tmpRoot, chains.MERGE);
  res.feature.mergeHeld = summarize(runTests(workspaceFrom(merged, tmpRoot), ['TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6'].map((k) => accPath(`${k}.acceptance.test.js`))));

  // Mutanti.
  for (const m of MUTANTS) {
    if (!selected(m.subtask)) continue;
    const tree = referenceTree(tmpRoot, chains.FEATURE, m.edits);
    const e = { subtask: m.subtask, type: m.type, channel: m.channel };
    const ws = workspaceFrom(tree, tmpRoot);
    const { per } = runHeldAll(ws);
    e.caughtBy = Object.entries(per).filter(([, r]) => r.failed.length).map(([k]) => k);
    e.failedTests = Object.values(per).flatMap((r) => r.failed);
    e.visible = summarize(runVisibleOriginal(tree, tmpRoot));
    // La CI (che rilancia i test) serve solo per i mutanti «ci»; per gli altri basta sapere che i test li bocciano.
    if (m.channel === 'ci') {
      const ci = runCi({ workspace: tree, baseline: SEED, task: 'FEATURE' });
      e.ci = { passed: ci.passed, failed: ci.failedChecks };
    } else e.ci = { passed: null, failed: [] };
    res.mutants[m.name] = e;
  }

  res.conflicts = checkConflicts();
  res.statics = checkStatics();
  return res;
}

// --- conflitto Git inevitabile ---------------------------------------------------------------------------------

function checkConflicts() {
  const out = [];
  const gitOk = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
  for (const c of stages().parallel_conflicts) {
    if (!gitOk) {
      out.push({ ...c, skipped: 'git non disponibile' });
      continue;
    }
    const dir = makeTmp('tae-conflict-');
    const base = referenceTree(dir, stages().chains[c.base]);
    const ours = referenceTree(dir, [...stages().chains[c.base], c.ours]);
    const theirs = referenceTree(dir, [...stages().chains[c.base], c.theirs]);
    const r = spawnSync('git', ['merge-file', '-p', join(ours, c.file), join(base, c.file), join(theirs, c.file)], { encoding: 'utf8' });
    // exit status = numero di conflitti (>0), 0 = merge pulito, negativo/255 = errore
    out.push({ ...c, conflicts: r.status, markers: (r.stdout.match(/^<{7}/gm) ?? []).length });
  }
  return out;
}

// --- controlli statici -------------------------------------------------------------------------------------------

function ancestors(key, seen = new Set()) {
  for (const d of byKey[key]?.depends_on ?? []) {
    if (!seen.has(d)) {
      seen.add(d);
      ancestors(d, seen);
    }
  }
  return seen;
}

function checkStatics() {
  const problems = [];
  const info = {};

  // Indipendenza dei test held-out e pulizia del seed.
  const specRe = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const f of listFiles(ACC).filter((x) => /\.(js|mjs)$/.test(x))) {
    const text = readFileSync(f, 'utf8');
    if (/reference-team|mutants|oracle-team|answers\.json/.test(text.replace(/\/\/.*$/gm, ''))) problems.push(`${relative(ACC, f)}: cita riferimenti, mutanti od oracolo`);
    for (const m of text.matchAll(specRe)) {
      const spec = m[1];
      if (spec.startsWith('node:') || !spec.startsWith('.')) continue;
      const target = resolve(dirname(f), spec);
      const ok = target.startsWith(ACC + sep) || target === join(SEED, 'src', 'index.js');
      if (!ok) problems.push(`${relative(ACC, f)}: importa ${spec} fuori da acceptance-team e seed-app-team/src`);
    }
  }
  const seedFiles = listFiles(SEED).map((f) => relative(SEED, f).split(sep).join('/'));
  for (const f of seedFiles) {
    if (/acceptance|answers|oracle|mutant|change-request|reference/i.test(f)) problems.push(`il seed contiene un file che non deve esserci: ${f}`);
  }
  for (const f of seedFiles.filter((x) => x.endsWith('.md') || x.endsWith('.json'))) {
    const text = readFileSync(join(SEED, f), 'utf8');
    if (/held-out|oracolo|answers\.json|mutant/i.test(text)) problems.push(`${f}: nel seed compaiono riferimenti ai test del valutatore`);
  }
  if (!seedFiles.includes('docs/requirements/feature.md')) problems.push('manca docs/requirements/feature.md nel seed');
  if (seedFiles.some((f) => f.startsWith('src/policy.js') || f.startsWith('src/ledger.js'))) problems.push('il seed contiene già policy.js o ledger.js');

  // Dimensioni.
  const src = listFiles(join(SEED, 'src'));
  const lines = src.reduce((s, f) => s + readFileSync(f, 'utf8').split('\n').length - 1, 0);
  const adrs = existsSync(join(SEED, 'docs', 'adr')) ? readdirSync(join(SEED, 'docs', 'adr')).filter((f) => f.endsWith('.md')).length : 0;
  info.src = { files: src.length, lines };
  info.adrs = adrs;
  if (src.length < 8 || src.length > 20) problems.push(`file sorgente ${src.length} (attesi 8-20)`);
  if (lines < 300 || lines > 900) problems.push(`righe sorgente ${lines} (attese 300-900)`);
  if (adrs < 4 || adrs > 6) problems.push(`ADR ${adrs} (attesi 4-6)`);

  // Catalogo.
  const required = ['key', 'type', 'priority', 'summary', 'description', 'acceptance', 'components', 'blocked_by', 'ready', 'scenario', 'difficulty', 'expected_behavior', 'role', 'depends_on', 'jira'];
  for (const t of catalog) {
    for (const f of required) if (!(f in t)) problems.push(`${t.key}: campo mancante ${f}`);
    if (!['implement', 'ask', 'review'].includes(t.expected_behavior)) problems.push(`${t.key}: expected_behavior non valido`);
    if (/mutant|trappol|held-out|valutator|oracolo|answers\.json/i.test(JSON.stringify(t))) problems.push(`${t.key}: il catalogo cita trappole, mutanti, held-out o oracolo`);
    for (const d of t.depends_on) if (!byKey[d]) problems.push(`${t.key}: dipendenza sconosciuta ${d}`);
    if (new Set([...t.blocked_by]).size !== t.blocked_by.length) problems.push(`${t.key}: blocked_by con duplicati`);
  }
  const n = catalog.length;
  info.subtasks = n;
  if (n < 5 || n > 9) problems.push(`sotto-compiti ${n} (attesi 5-9 con il CR)`);
  const types = new Set(catalog.map((t) => t.expected_behavior));
  for (const ty of ['implement', 'ask', 'review']) if (!types.has(ty)) problems.push(`nessun sotto-compito di tipo ${ty}`);
  // aciclico
  for (const t of catalog) if (ancestors(t.key).has(t.key)) problems.push(`${t.key}: dipendenza circolare`);
  // diamante: D con due predecessori diretti B e C che hanno un antenato comune A
  const diamond = catalog.find((d) =>
    d.depends_on.some((b) => d.depends_on.some((c) => b < c && [...ancestors(b)].some((a) => ancestors(c).has(a)))),
  );
  if (!diamond) problems.push('nessun grafo a diamante (A->B, A->C, B e C->D)');
  info.diamond = diamond?.key ?? null;
  // file condiviso fra sotto-compiti paralleli (nessuno antenato dell'altro)
  const parallelShared = [];
  const impl = catalog.filter((t) => t.expected_behavior === 'implement');
  for (let i = 0; i < impl.length; i++) {
    for (let j = i + 1; j < impl.length; j++) {
      const a = impl[i];
      const b = impl[j];
      if (ancestors(a.key).has(b.key) || ancestors(b.key).has(a.key)) continue;
      const shared = a.components.filter((c) => b.components.includes(c));
      if (shared.length) parallelShared.push(`${a.key}/${b.key}: ${shared.join(', ')}`);
    }
  }
  info.parallelSharedFiles = parallelShared;
  if (!parallelShared.length) problems.push('nessuna coppia di sotto-compiti paralleli che tocchi lo stesso file');
  const filesTouched = new Map();
  for (const t of impl) for (const c of t.components) filesTouched.set(c, (filesTouched.get(c) ?? 0) + 1);
  info.sharedFiles = [...filesTouched].filter(([, k]) => k >= 2).map(([c]) => c);
  // CR rilasciato a parte
  const cr = catalog.find((t) => t.release);
  if (!cr) problems.push('nessun change-request con `release`');
  else {
    if (!existsSync(join(ROOT, cr.release.file))) problems.push(`file del change-request mancante: ${cr.release.file}`);
    if (!byKey[cr.release.after_completed]) problems.push('change-request: after_completed sconosciuto');
  }
  // ready: solo i compiti senza dipendenze sono pronti
  for (const t of catalog) if (t.ready !== (t.blocked_by.length === 0)) problems.push(`${t.key}: ready incoerente con blocked_by`);

  // Oracolo: ogni voce attesa ha un tag che compare nei nomi dei test held-out, e le domande di prova ricevono la voce giusta.
  const answers = loadAnswers();
  const heldText = listFiles(ACC).filter((f) => f.endsWith('.test.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const e of answers.entries.filter((x) => x.expected)) {
    if (!heldText.includes(e.held_out_tag)) problems.push(`oracolo ${e.id}: il tag ${e.held_out_tag} non compare nei test held-out`);
  }
  const probes = [
    ['Cosa succede se il cliente annulla dopo la data di inizio del noleggio?', 'Q1-after-start'],
    ['Come si arrotonda la penale quando non è un numero intero di centesimi?', 'Q2-rounding'],
    ['Il credito generato scade davvero dopo 90 giorni? Sembra in conflitto con ADR-004.', 'Q3-credit-expiry'],
    ['Che formato hanno le date e in che fuso orario?', 'info-date-format'],
    ['Come ci chiamiamo?', 'default'],
  ];
  for (const [q, id] of probes) {
    const got = askOracle(q, answers).id;
    if (got !== id) problems.push(`oracolo: «${q}» -> ${got} (atteso ${id})`);
  }
  // Numero di test held-out e di test visibili.
  info.heldTests = (heldText.match(/^test\(/gm) ?? []).length;
  if (info.heldTests < 40) problems.push(`test held-out ${info.heldTests} (attesi >= 40)`);
  info.visibleTests = listFiles(join(SEED, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => readFileSync(f, 'utf8')).join('\n').match(/^test\(/gm)?.length ?? 0;
  if (info.visibleTests < 25) problems.push(`test visibili ${info.visibleTests} (attesi >= 25)`);
  info.problems = problems;
  return info;
}



// --- valutazione -------------------------------------------------------------------------------------------------

function evaluate(res) {
  const failures = [];
  const rows = [];
  const fail = (m) => failures.push(m);

  if (!res.seed.visible.ok) fail('visibili FAIL sul seed');
  if (!(res.seed.visible.tests >= 25)) fail(`visibili sul seed: ${res.seed.visible.tests} test (attesi >= 25)`);
  for (const [k, r] of Object.entries(res.seed.held)) if (r.ok) fail(`${k}: gli held-out PASSANO sul seed (devono fallire)`);

  for (const [key, e] of Object.entries(res.subtasks)) {
    const row = { sub: key, visRef: e.visible.ok ? 'PASS' : 'FAIL', heldRef: e.held.ok ? 'PASS' : 'FAIL', ownTests: e.ownTests.ok ? 'PASS' : 'FAIL', ci: e.ci.passed ? 'PASS' : 'FAIL', dep: '-' };
    if (!e.visible.ok) fail(`${key}: visibili FAIL con il riferimento`);
    if (!e.ownTests.ok) fail(`${key}: i test del riferimento (test/) falliscono`);
    if (!e.held.ok) fail(`${key}: held-out FAIL con il riferimento (${e.held.failed.join(' | ')})`);
    if (!e.ci.passed) fail(`${key}: la CI fallisce sul riferimento (${e.ci.failed.join(', ')})`);
    if (e.heldWithoutDeps) {
      row.dep = e.heldWithoutDeps.ok ? 'NO' : 'si';
      if (e.heldWithoutDeps.ok) fail(`${key}: il riferimento passa anche senza le dipendenze`);
    }
    rows.push(row);
  }

  const f = res.feature;
  if (!f.visible.ok) fail('feature completa: visibili FAIL');
  if (!f.held.ok) fail(`feature completa: held-out FAIL (${f.held.failed.join(' | ')})`);
  if (!f.ci.passed) fail(`feature completa: CI FAIL (${f.ci.failed.join(', ')})`);
  if (!f.mergeHeld.ok) fail(`merge prima del CR: held-out dei sotto-compiti pre-CR FAIL (${f.mergeHeld.failed.join(' | ')})`);

  const mrows = [];
  for (const m of MUTANTS) {
    const e = res.mutants[m.name];
    if (!e) continue;
    const row = { name: m.name, sub: m.subtask, type: m.type, ch: m.channel, caught: '', vis: e.visible.ok ? 'pass' : 'CAUGHT' };
    if (m.channel === 'held-out') {
      const hit = m.expectCaughtBy.filter((k) => e.caughtBy.includes(k));
      row.caught = e.caughtBy.length ? e.caughtBy.join(',') : 'NON CATTURATO';
      if (!e.caughtBy.length) fail(`mutante ${m.name}: NON catturato da nessun test held-out`);
      else if (!hit.length) fail(`mutante ${m.name}: catturato da ${e.caughtBy.join(',')} ma non dai file attesi (${m.expectCaughtBy.join(',')})`);
      if (e.visible.ok === false) fail(`mutante ${m.name}: i test visibili lo catturano già (dovrebbe essere un difetto non coperto dai visibili)`);
      if (explain) console.log(`  ${m.name}: ${e.failedTests.join(' | ')}`);
    } else {
      row.caught = e.ci.passed ? 'CI NON FALLISCE' : `ci:${e.ci.failed.join(',')}`;
      if (e.caughtBy.length) fail(`mutante ${m.name} (solo CI): gli held-out lo catturano (${e.caughtBy.join(',')})`);
      if (!e.visible.ok) fail(`mutante ${m.name} (solo CI): i test visibili falliscono`);
      if (e.ci.passed || !e.ci.failed.includes(m.ciCheck)) fail(`mutante ${m.name}: la CI non fallisce sul controllo atteso ${m.ciCheck} (falliti: ${e.ci.failed.join(',') || 'nessuno'})`);
    }
    mrows.push(row);
  }
  for (const c of res.conflicts) {
    if (c.skipped) continue;
    if (!(c.conflicts > 0)) fail(`conflitto Git non inevitabile fra ${c.ours} e ${c.theirs} su ${c.file} (merge-file: ${c.conflicts})`);
  }
  failures.push(...res.statics.problems);
  return { rows, mrows, failures };
}

function printTable(rows, cols) {
  const w = cols.map(([k, h]) => Math.max(h.length, ...rows.map((r) => String(r[k]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' | ');
  console.log(line(cols.map(([, h]) => h)));
  console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
  for (const r of rows) console.log(line(cols.map(([k]) => r[k])));
}

// --- main -------------------------------------------------------------------------------------------------------

let exitCode = 1;
try {
  if (materialize) {
    const dir = resolve(materialize);
    mkdirSync(dir, { recursive: true });
    copyTree(SEED, dir);
    applyOverlays(dir, stages().chains.FEATURE);
    console.log(`Albero della feature completa scritto in ${dir}`);
    exitCode = 0;
  } else {
    console.log('Validazione fixture di squadra (seed-app-team)');
    const first = validateOnce();
    const { rows, mrows, failures } = evaluate(first);
    const st = first.statics;
    console.log('\nBaseline: %d test visibili (%d pass, %d fail); held-out sul seed: %s.', first.seed.visible.tests, first.seed.visible.pass, first.seed.visible.fail,
      Object.entries(first.seed.held).map(([k, r]) => `${k} ${r.ok ? 'PASS!' : 'FAIL'}`).join(', '));
    console.log(`Seed: ${st.src.files} file sorgente, ${st.src.lines} righe, ${st.adrs} ADR, ${st.visibleTests} test visibili; held-out: ${st.heldTests} test in ${heldFiles().length} file.\n`);
    printTable(rows, [['sub', 'Sotto-compito'], ['visRef', 'Visibili rif'], ['ownTests', 'Test rif'], ['heldRef', 'Held-out rif'], ['ci', 'CI rif'], ['dep', 'Fallisce senza dip.']]);
    console.log(`\nFeature completa: visibili ${first.feature.visible.ok ? 'PASS' : 'FAIL'}, held-out ${first.feature.held.ok ? 'PASS' : 'FAIL'} (${first.feature.held.pass}/${first.feature.held.tests}), CI ${first.feature.ci.passed ? 'PASS' : 'FAIL'}.\n`);
    console.log('Mutanti (held-out: bocciato = file dei test che falliscono; solo-CI: controllo che fallisce):');
    printTable(mrows, [['name', 'Mutante'], ['sub', 'Sotto-compito'], ['type', 'Tipo'], ['ch', 'Canale'], ['caught', 'Catturato da'], ['vis', 'Visibili']]);
    const heldMutants = mrows.filter((r) => r.ch === 'held-out');
    const caught = heldMutants.filter((r) => r.caught !== 'NON CATTURATO').length;
    const byType = {};
    for (const r of mrows) byType[r.type] = (byType[r.type] ?? 0) + 1;
    const bySub = {};
    for (const r of mrows) bySub[r.sub] = (bySub[r.sub] ?? 0) + 1;
    console.log(`\nMutanti totali ${mrows.length} (held-out ${heldMutants.length}: catturati ${caught}, non catturati ${heldMutants.length - caught}; solo-CI ${mrows.length - heldMutants.length}).`);
    console.log(`Per tipo: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
    console.log(`Per sotto-compito: ${Object.entries(bySub).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
    for (const c of first.conflicts) console.log(`Conflitto Git ${c.ours} contro ${c.theirs} su ${c.file}: ${c.skipped ? `non verificato (${c.skipped})` : `${c.conflicts} conflitti (${c.markers} marcatori)`}.`);
    console.log(`Catalogo: ${st.subtasks} sotto-compiti; diamante chiuso in ${st.diamond}; coppie parallele sullo stesso file: ${st.parallelSharedFiles.join('; ') || 'nessuna'}.`);

    // Determinismo: stesso risultato in N esecuzioni complete.
    const digest = (r) => createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 12);
    const digests = [digest(first)];
    for (let i = 1; i < runsWanted; i++) digests.push(digest(validateOnce()));
    const same = digests.every((d) => d === digests[0]);
    console.log(`Determinismo (${runsWanted} esecuzioni complete): ${runsWanted > 1 ? (same ? 'identiche' : 'DIVERSE') : 'non verificato (una sola esecuzione)'} [${digests.join(' ')}].`);
    if (runsWanted > 1 && !same) failures.push('la validazione ripetuta dà risultati diversi');

    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`Tempo totale: ${secs} s.`);
    if (failures.length) {
      console.log('\nPROBLEMI:');
      for (const f of failures) console.log(`- ${f}`);
    } else console.log('\nTUTTO OK.');
    if (jsonOut) {
      writeFileSync(jsonOut, JSON.stringify({ ok: failures.length === 0, failures, digests, seconds: secs, mutants: mrows, subtasks: rows, statics: { ...st, problems: undefined } }, null, 2));
    }
    exitCode = failures.length ? 1 : 0;
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
process.exit(exitCode);
