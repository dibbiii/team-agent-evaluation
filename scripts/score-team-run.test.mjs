// Test di scripts/score-team-run.mjs, scripts/team-ci.mjs e delle librerie di punteggio (eseguire con: node --test scripts/*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMMON_PARTS, WEIGHTS, checkDependencyOrder, ciSummary, componentScores, composite, compositeCommon, reviewAgreement, staleAssumptions, validateRunLog } from './lib/team-score-lib.mjs';
import { CATALOG, applyEdits, makeTmp, readJson, referenceTree, stages } from './lib/team-fixture-lib.mjs';
import { scoreRun } from './score-team-run.mjs';
import { askOracle, classifyQuestions, releaseChangeRequest } from '../fixtures/oracle-team/oracle.mjs';
import { MUTANTS } from '../fixtures/reference-team/mutants.mjs';

const catalog = readJson(CATALOG);

test('i pesi del composito sommano 100', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('validateRunLog accetta un log completo e segnala i campi non validi', () => {
  const keys = catalog.map((t) => t.key);
  const good = { arm: 'team', questions: ['a'], human_interventions: 0, git_conflicts: 1, ci_attempts: { 'TEAM-2': 2 }, completion_order: ['TEAM-2'], cost_usd: 1.2 };
  assert.deepEqual(validateRunLog(good, keys).errors, []);
  const bad = validateRunLog({ arm: 'x', questions: 'no', human_interventions: -1, completion_order: ['TEAM-99', 'TEAM-99'], ci_attempts: { a: 1.5 } }, keys);
  assert.ok(bad.errors.length >= 5, bad.errors.join(' | '));
  assert.match(validateRunLog({}, keys).warnings.join(' '), /non misurato/);
});

test('ordine di dipendenza: rispettato, violato e dipendenza mai completata', () => {
  assert.equal(checkDependencyOrder(null, catalog), null);
  assert.equal(checkDependencyOrder(['TEAM-1', 'TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6', 'TEAM-8', 'TEAM-7'], catalog).ok, true);
  const wrong = checkDependencyOrder(['TEAM-1', 'TEAM-3', 'TEAM-2'], catalog); // TEAM-3 prima di TEAM-2
  assert.deepEqual(wrong.violations.map((v) => v.task), ['TEAM-3']);
  const missing = checkDependencyOrder(['TEAM-5'], catalog); // TEAM-3 e TEAM-4 mai completati
  assert.deepEqual(missing.violations[0].missing.sort(), ['TEAM-3', 'TEAM-4']);
});

test('assunzioni non aggiornate: contano i punti di controllo [CR:xxx] con test falliti', () => {
  assert.deepEqual(staleAssumptions([]), []);
  assert.deepEqual(staleAssumptions(['[CR:notify] testo', '[CR:notify] altro', '[T3] altro', '[CR:wiring][ADR-005] atomico']), ['CR:wiring', 'CR:notify']);
});

test('composito: 100 se tutto perfetto, voci non misurate escluse e riportate a 100', () => {
  const perfect = componentScores({
    correctness: 1, delivered: true, order: { completed: 7, violations: [] }, crStale: 0, crMeasured: true,
    questions: { expected_total: 3, expected_covered: 3, useless: 0 }, ci: { extra: 0 }, conflicts: 0, interventions: 0, review: 1,
  });
  assert.equal(composite(perfect).total, 100);
  assert.equal(composite(perfect).coverage, 1);
  // braccio «agente solo»: niente ordine, niente review, niente conflitti dichiarati
  const solo = componentScores({ correctness: 0.5, delivered: null, order: null, crStale: 0, crMeasured: false, questions: null, ci: null, conflicts: null, interventions: 0, review: null });
  const c = composite(solo);
  assert.equal(c.coverage, (45 + 4) / 100);
  assert.equal(c.total, Math.round(((45 * 0.5 + 4 * 1) / 49) * 1000) / 10);
  assert.equal(c.parts.dependency_order.score, null);
  assert.equal(composite({}).total, null);
});

test('composito comune: usa solo le voci misurabili nei due bracci e riporta a 100', () => {
  assert.deepEqual(COMMON_PARTS, ['correctness', 'delivery', 'cr_assumptions', 'questions', 'ci_efficiency', 'human_interventions']);
  const team = { correctness: 1, delivery: 1, cr_assumptions: 1, questions: 1, ci_efficiency: 1, human_interventions: 1, dependency_order: 0, git_conflicts: 0, review_agreement: 0 };
  assert.equal(compositeCommon(team).total, 100); // le voci solo-team non contano
  assert.equal(compositeCommon(team).coverage, 1);
  assert.equal(composite(team).total, 100 - 8 * 100 / 100 - 3 - 5); // il composito completo le conta (peso 8 + 3 + 5)
});

test('composito: i punteggi seguono la formula dichiarata', () => {
  const s = componentScores({
    correctness: 0.8, delivered: false, order: { completed: 4, violations: [{ task: 'TEAM-3', missing: ['TEAM-2'] }] }, crStale: 2, crMeasured: true,
    questions: { expected_total: 3, expected_covered: 1, useless: 2 }, ci: { extra: 3 }, conflicts: 2, interventions: 1, review: 0.5,
  });
  assert.equal(s.delivery, 0);
  assert.equal(s.dependency_order, 0.75);
  assert.equal(s.cr_assumptions, 0.5);
  assert.equal(Math.round(s.questions * 1000) / 1000, Math.round((0.6 * (1 / 3) + 0.4 * 0.5) * 1000) / 1000);
  assert.equal(s.ci_efficiency, 0.5);
  assert.equal(s.git_conflicts, 0.5);
  assert.equal(s.human_interventions, 0.75);
  assert.equal(s.review_agreement, 0.5);
});

test('accordo del reviewer e sintesi dei tentativi di CI', () => {
  assert.equal(reviewAgreement('approve', true), 1);
  assert.equal(reviewAgreement('approve', false), 0);
  assert.equal(reviewAgreement('request_changes', false), 1);
  assert.equal(reviewAgreement('request_changes', true), 0.5);
  assert.equal(reviewAgreement('boh', true), null);
  assert.equal(ciSummary(null), null);
  assert.deepEqual(ciSummary({ 'TEAM-2': 3, 'TEAM-3': 1, 'TEAM-4': 0 }), { tasks: 2, total: 4, extra: 2 });
});

test('oracolo: risposta per voce, domande utili, ripetute e inutili', () => {
  assert.equal(askOracle('Cosa succede se si annulla dopo la data di inizio?').id, 'Q1-after-start');
  assert.equal(askOracle('Come arrotondiamo la penale?').id, 'Q2-rounding');
  assert.equal(askOracle('Il credito scade dopo 90 giorni?').id, 'Q3-credit-expiry');
  assert.equal(askOracle('Che fuso orario usiamo?').expected, false);
  assert.match(askOracle('Qual è il colore del logo?').answer, /Non è importante/);
  const c = classifyQuestions([
    'Cosa accade dopo l\'inizio del noleggio?',
    'Come arrotondare la penale?',
    'Come arrotondare ancora la penale?',
    'Che formato hanno le date?',
    { text: 'Domanda senza senso' },
  ]);
  assert.equal(c.useful, 2);
  assert.equal(c.useless, 3);
  assert.deepEqual(c.missed, ['Q3-credit-expiry']);
});

test('il change-request si rilascia copiando il file nel workspace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tae-cr-'));
  try {
    const file = releaseChangeRequest(dir);
    assert.match(readFileSync(file, 'utf8'), /CR-1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyEdits rifiuta modifiche non applicabili o ambigue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tae-edit-'));
  try {
    writeFileSync(join(dir, 'f.js'), 'a\nb\na\n');
    assert.throws(() => applyEdits(dir, [{ file: 'f.js', find: 'a', replace: 'x' }]), /compare 2 volte/);
    assert.throws(() => applyEdits(dir, [{ file: 'f.js', find: 'zzz', replace: 'x' }]), /compare 0 volte/);
    applyEdits(dir, [{ file: 'f.js', find: 'b', replace: 'B' }]);
    assert.equal(readFileSync(join(dir, 'f.js'), 'utf8'), 'a\nB\na\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- integrazione: valutazione reale di alberi di riferimento (costo 0, qualche secondo) ---

function writeLog(dir, log) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'run-log.json');
  writeFileSync(file, JSON.stringify(log));
  return file;
}

const perfectLog = {
  run_id: 'test-perfect',
  arm: 'team',
  questions: ['Cosa succede dopo la data di inizio?', 'Come si arrotonda la penale?', 'Il credito scade dopo 90 giorni (ADR-004)?'],
  human_interventions: 0,
  git_conflicts: 1,
  ci_attempts: { 'TEAM-2': 1, 'TEAM-3': 1, 'TEAM-4': 1, 'TEAM-5': 2, 'TEAM-6': 1, 'TEAM-8': 1 },
  completion_order: ['TEAM-1', 'TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-6', 'TEAM-5', 'TEAM-8', 'TEAM-7'],
  change_request: { released_after: 'TEAM-4', released: true },
  prs: [{ task: 'TEAM-2', branch: 'b2' }],
  tracker_updates: 7,
  review_expected: true,
  cost_usd: null,
};

test('scoreRun: la soluzione di riferimento completa dà PASS, delivered e composito 100', () => {
  const root = makeTmp('tae-score-test-');
  try {
    const tree = referenceTree(root, stages().chains.FEATURE);
    const logDir = join(root, 'logs');
    const logFile = writeLog(logDir, perfectLog);
    writeFileSync(join(logDir, 'review.json'), JSON.stringify({ verdict: 'approve', findings: [] }));
    // una riga di ci-log per ogni tentativo dichiarato
    const lines = Object.entries(perfectLog.ci_attempts).flatMap(([task, n]) => Array.from({ length: n }, (_, i) => JSON.stringify({ task, attempt: i + 1, passed: i === n - 1 })));
    writeFileSync(join(logDir, 'ci-log.jsonl'), `${lines.join('\n')}\n`);
    const r = scoreRun({ finalDir: tree, runLogPath: logFile });
    assert.equal(r.code_acceptance, 'PASS', JSON.stringify(r.code));
    assert.equal(r.status, 'PASS');
    assert.equal(r.code.held_out.passed, r.code.held_out.total);
    assert.ok(r.code.held_out.total >= 50);
    assert.equal(r.workflow_acceptance.delivered, true);
    assert.equal(r.workflow_acceptance.ci_status, 'passed');
    assert.equal(r.workflow_acceptance.review_state, 'approved');
    assert.equal(r.coordination.stale_assumptions_after_cr.count, 0);
    assert.equal(r.coordination.dependency_order.ok, true);
    assert.equal(r.coordination.questions.useful, 3);
    assert.equal(r.coordination.ci.source, 'ci-log del runner locale');
    assert.equal(r.coordination.ci.extra, 1);
    assert.equal(r.composite.coverage, 1);
    assert.ok(r.composite.total > 90 && r.composite.total < 100, String(r.composite.total)); // un conflitto e un tentativo di CI in più
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scoreRun: senza il change-request applicato il codice fallisce e le 4 assunzioni risultano non aggiornate', () => {
  const root = makeTmp('tae-score-test-');
  try {
    const tree = referenceTree(root, stages().chains.MERGE); // fino al merge, prima del CR-1
    const r = scoreRun({ finalDir: tree, runLogPath: writeLog(join(root, 'l'), perfectLog) });
    assert.equal(r.code_acceptance, 'FAIL');
    assert.equal(r.coordination.stale_assumptions_after_cr.count, 4);
    assert.ok(r.code.held_out.failed.every((n) => /CR|FEATURE/.test(n)), r.code.held_out.failed.join(' | '));
    assert.equal(r.workflow_acceptance.delivered, false); // CI finale fallita: manca la riga TEAM-8 nel CHANGELOG
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scoreRun: il seed da solo fallisce; modificare un ADR esistente è una violazione di integrità', () => {
  const root = makeTmp('tae-score-test-');
  try {
    const seedTree = referenceTree(root, []);
    const seedRes = scoreRun({ finalDir: seedTree, runLogPath: writeLog(join(root, 'a'), { arm: 'single' }) });
    assert.equal(seedRes.code_acceptance, 'FAIL');
    assert.ok(seedRes.code.held_out.passed <= 2, 'sul seed passano al più i test di regressione già veri'); // es. riprenotare dopo un annullamento
    assert.equal(seedRes.coordination.questions, null); // non misurato, non zero
    assert.ok(seedRes.composite.coverage < 0.6);

    const tampered = referenceTree(root, stages().chains.FEATURE, [{ file: 'docs/adr/ADR-004-credito-cliente-non-scade.md', find: 'Il saldo è la somma delle voci registrate, senza filtri sulla data.', replace: 'Il saldo esclude le voci più vecchie di 90 giorni.' }]);
    const t = scoreRun({ finalDir: tampered, runLogPath: writeLog(join(root, 'b'), { arm: 'team' }) });
    assert.equal(t.code.held_out.passed, t.code.held_out.total);
    assert.equal(t.code_acceptance, 'FAIL');
    assert.match(t.code.integrity_violations.join(' '), /ADR-004.*modificato/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scoreRun: un run-log non valido non produce punteggi', () => {
  const root = makeTmp('tae-score-test-');
  try {
    const r = scoreRun({ finalDir: referenceTree(root, []), runLogPath: writeLog(join(root, 'l'), { questions: 5 }) });
    assert.equal(r.error, 'run-log non valido');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('team-ci: passa sul riferimento, boccia le violazioni comuni con un messaggio, conta i tentativi nel log', () => {
  const root = makeTmp('tae-ci-test-');
  try {
    const ok = referenceTree(root, stages().chains.FEATURE);
    const bad = referenceTree(root, stages().chains.FEATURE, MUTANTS.find((m) => m.name === 'ci-math-ceil').edits);
    const run = (dir, ...extra) => spawnSync(process.execPath, ['scripts/team-ci.mjs', dir, '--task', 'FEATURE', ...extra], { encoding: 'utf8', cwd: join(import.meta.dirname, '..') });
    assert.equal(run(ok).status, 0);
    const log = join(root, 'ci-log.jsonl');
    const first = run(bad, '--log', log);
    assert.equal(first.status, 1);
    assert.match(first.stdout, /\[money-helpers\] src\/policy\.js:\d+/);
    assert.match(first.stdout, /tentativo 1/);
    const second = run(bad, '--log', log);
    assert.match(second.stdout, /tentativo 2/);
    const entries = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(entries.map((e) => [e.task, e.attempt, e.passed]), [['FEATURE', 1, false], ['FEATURE', 2, false]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
