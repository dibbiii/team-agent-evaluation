#!/usr/bin/env node
// Valuta una run sulla fixture di squadra: prende la cartella FINALE dell'agente (o del team) e il run-log.json scritto dal driver.
// Produce: code_acceptance (test visibili originali + held-out), workflow_acceptance (PR/CI/review simulati dal runner locale, formato
// di docs/results-schema.md), le metriche di coordinamento e un punteggio composito con pesi dichiarati. Nessuna rete, nessun modello.
//
// Uso: node scripts/score-team-run.mjs <cartella-finale> <run-log.json> [--review <review.json>] [--ci-log <ci-log.jsonl>] [--out <risultato.json>] [--json]
//   review.json (opzionale, accanto al run-log di default): { "verdict": "approve" | "request_changes", "findings": [{ "text": "..." }] }
//   ci-log.jsonl (opzionale, accanto al run-log di default): scritto da `scripts/team-ci.mjs --log`; se presente conta i tentativi di CI in modo oggettivo.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCi } from './lib/team-ci-lib.mjs';
import { CATALOG, SEED, listFiles, makeTmp, readJson, runHeldAll, runVisibleOriginal, workspaceFrom } from './lib/team-fixture-lib.mjs';
import { WEIGHTS, checkDependencyOrder, ciSummary, componentScores, composite, compositeCommon, reviewAgreement, staleAssumptions, validateRunLog } from './lib/team-score-lib.mjs';
import { buildWorkflowAcceptance } from './lib/workflow-acceptance.mjs';
import { classifyQuestions } from '../fixtures/oracle-team/oracle.mjs';
import { rmSync } from 'node:fs';

const read = (f) => readFileSync(f, 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');

// File protetti: le ADR esistenti e le regole della CI non si modificano da un ticket di sviluppo (aggiungere una nuova ADR è ammesso).
function integrityViolations(finalDir) {
  const out = [];
  for (const area of ['docs/adr', 'ci']) {
    for (const f of listFiles(join(SEED, area))) {
      const relPath = relative(SEED, f).split(sep).join('/');
      const other = join(finalDir, relPath);
      if (!existsSync(other)) out.push(`${relPath}: cancellato`);
      else if (norm(read(f)) !== norm(read(other))) out.push(`${relPath}: modificato`);
    }
  }
  return out;
}

export function scoreRun({ finalDir, runLogPath, reviewPath = null, ciLogPath = null }) {
  const final = resolve(finalDir);
  const catalog = readJson(CATALOG);
  const log = readJson(resolve(runLogPath));
  const logDir = dirname(resolve(runLogPath));
  const validation = validateRunLog(log, catalog.map((t) => t.key));
  if (validation.errors.length) return { error: 'run-log non valido', errors: validation.errors, warnings: validation.warnings };

  const tmp = makeTmp('tae-team-score-');
  try {
    // --- codice ---
    const visible = runVisibleOriginal(final, tmp);
    const ws = workspaceFrom(final, tmp);
    const { run: heldRun, per } = runHeldAll(ws);
    const total = heldRun.cases.length;
    const passed = heldRun.cases.filter((c) => c.ok).length;
    const failedNames = heldRun.cases.filter((c) => !c.ok).map((c) => c.name);
    const integrity = integrityViolations(final);
    const heldOk = total > 0 && passed === total && heldRun.ok;
    const codeAcceptance = visible.ok && heldOk && integrity.length === 0 ? 'PASS' : 'FAIL';

    // --- CI finale (simulata dal runner locale sull'albero finale) ---
    const ciFinal = runCi({ workspace: final, baseline: SEED, task: 'FEATURE' });

    // --- review ---
    const reviewFile = reviewPath ?? (existsSync(join(logDir, 'review.json')) ? join(logDir, 'review.json') : null);
    const review = reviewFile ? readJson(reviewFile) : null;
    const reviewState = review ? (review.verdict === 'approve' ? 'approved' : 'pending') : log.review_expected === true ? 'none' : null;

    // --- tentativi di CI: se c'è il ci-log del runner lo si usa (oggettivo), altrimenti il conteggio dichiarato ---
    const ciLogFile = ciLogPath ?? (existsSync(join(logDir, 'ci-log.jsonl')) ? join(logDir, 'ci-log.jsonl') : null);
    let attempts = log.ci_attempts ?? null;
    let attemptsSource = attempts ? 'dichiarato dal driver' : null;
    const notes = [];
    if (ciLogFile) {
      const entries = read(ciLogFile).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const fromLog = {};
      for (const e of entries) fromLog[e.task] = (fromLog[e.task] ?? 0) + 1;
      if (attempts && JSON.stringify(Object.entries(fromLog).sort()) !== JSON.stringify(Object.entries(attempts).sort())) notes.push('ci_attempts dichiarato diverso dal ci-log: vale il ci-log');
      attempts = fromLog;
      attemptsSource = 'ci-log del runner locale';
    }
    const ci = ciSummary(attempts);

    // --- domande ---
    const questions = Array.isArray(log.questions) ? classifyQuestions(log.questions) : null;

    // --- ordine di dipendenza e assunzioni dopo il CR ---
    const order = checkDependencyOrder(log.completion_order, catalog);
    const stale = staleAssumptions(failedNames);
    const crReleased = log.change_request?.released === true;

    // --- esito del codice per sotto-compito (tutti i test del sotto-compito passano) ---
    const subtasks = {};
    for (const [k, p] of Object.entries(per)) subtasks[k] = { tests: p.tests, pass: p.pass, ok: p.pass === p.tests };
    const tagged = (tag) => {
      const names = heldRun.cases.filter((c) => c.name.includes(`[${tag}]`));
      return names.length ? { tests: names.length, ok: names.every((c) => c.ok) } : null;
    };
    const diagnostics = { 'Q1 noleggio già iniziato': tagged('Q1'), 'Q2 arrotondamento': tagged('Q2'), 'ADR-004 credito non scade': tagged('ADR-004') };

    // --- workflow_acceptance (simulato dal runner locale) ---
    const flags = { ci: ciFinal.passed ? 'passed' : 'failed', notes: 'PR/CI/review simulati dal runner locale (scripts/team-ci.mjs); non sono un forge reale' };
    if (Array.isArray(log.prs)) flags.pr = log.prs.length > 0 ? 'created' : 'none';
    if (reviewState) flags.review = reviewState;
    if (typeof log.tracker_updates === 'number') flags.tracker = log.tracker_updates > 0 ? 'updated' : 'none';
    const workflow = buildWorkflowAcceptance(flags);

    // --- composito ---
    const reviewScore = review ? reviewAgreement(review.verdict, codeAcceptance === 'PASS') : null;
    const scores = componentScores({
      correctness: total ? passed / total : 0,
      delivered: workflow.delivered,
      order,
      crStale: stale.length,
      crMeasured: crReleased,
      questions,
      ci,
      conflicts: log.git_conflicts ?? null,
      interventions: log.human_interventions ?? null,
      review: reviewScore,
    });
    const comp = composite(scores);
    const common = compositeCommon(scores);

    return {
      run_id: log.run_id ?? null,
      arm: log.arm ?? null,
      status: codeAcceptance,
      code_acceptance: codeAcceptance,
      workflow_acceptance: workflow,
      code: {
        visible: { ok: visible.ok, tests: visible.tests, pass: visible.pass },
        held_out: { total, passed, failed: failedNames },
        per_subtask: subtasks,
        diagnostics,
        integrity_violations: integrity,
      },
      coordination: {
        git_conflicts: log.git_conflicts ?? null,
        ci: ci ? { ...ci, source: attemptsSource, final_ci: ciFinal.passed ? 'passed' : 'failed', final_ci_failed_checks: ciFinal.failedChecks } : { final_ci: ciFinal.passed ? 'passed' : 'failed', final_ci_failed_checks: ciFinal.failedChecks },
        questions: questions ?? null,
        stale_assumptions_after_cr: crReleased ? { count: stale.length, of: 4, which: stale } : null,
        human_interventions: log.human_interventions ?? null,
        dependency_order: order,
        review: review ? { verdict: review.verdict, findings: Array.isArray(review.findings) ? review.findings.length : null, agreement: reviewScore } : null,
      },
      composite: { total: comp.total, coverage: comp.coverage, weights: WEIGHTS, parts: comp.parts },
      composite_common: { total: common.total, coverage: common.coverage, parts: Object.keys(common.parts), note: 'solo le voci misurabili allo stesso modo nei due bracci (agente solo e team): è il confronto equo' },
      cost: { cost_usd: log.cost_usd ?? null, tokens: log.tokens ?? null, turns: log.turns ?? null, roles_used: log.roles_used ?? null },
      warnings: [...validation.warnings, ...notes],
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function printSummary(r) {
  if (r.error) {
    console.log(`ERRORE: ${r.error}\n- ${r.errors.join('\n- ')}`);
    return;
  }
  const c = r.coordination;
  console.log(`Run ${r.run_id ?? '(senza id)'} [${r.arm ?? 'braccio non dichiarato'}]`);
  console.log(`code_acceptance: ${r.code_acceptance}  (held-out ${r.code.held_out.passed}/${r.code.held_out.total}; visibili ${r.code.visible.pass}/${r.code.visible.tests}; integrità ${r.code.integrity_violations.length ? r.code.integrity_violations.join(', ') : 'ok'})`);
  console.log(`workflow_acceptance: ${JSON.stringify(r.workflow_acceptance)}`);
  for (const [k, v] of Object.entries(r.code.diagnostics)) if (v) console.log(`  diagnosi ${k}: ${v.ok ? 'ok' : 'FALLITO'} (${v.tests} test)`);
  console.log(`Coordinamento: conflitti ${c.git_conflicts ?? 'n/m'}; tentativi CI ${c.ci?.total ?? 'n/m'} (extra ${c.ci?.extra ?? 'n/m'}, CI finale ${c.ci.final_ci}); interventi umani ${c.human_interventions ?? 'n/m'}`);
  console.log(`  domande utili/inutili: ${c.questions ? `${c.questions.useful}/${c.questions.useless} (attese non poste: ${c.questions.missed.join(', ') || 'nessuna'})` : 'n/m'}; assunzioni non aggiornate dopo il CR: ${c.stale_assumptions_after_cr ? `${c.stale_assumptions_after_cr.count} di 4` : 'n/m'}`);
  console.log(`  ordine di dipendenza: ${c.dependency_order ? (c.dependency_order.ok ? 'rispettato' : `violato (${c.dependency_order.violations.map((v) => v.task).join(', ')})`) : 'n/m'}`);
  console.log(`Composito: ${r.composite.total ?? 'n/m'} / 100 (voci misurate: ${Math.round(r.composite.coverage * 100)}% del peso); composito comune ai due bracci: ${r.composite_common.total ?? 'n/m'}`);
  for (const [k, p] of Object.entries(r.composite.parts)) console.log(`  ${k.padEnd(20)} peso ${String(p.weight).padStart(2)}  punteggio ${p.score ?? 'n/m'}  punti ${p.points ?? 'n/m'}`);
  for (const w of r.warnings) console.log(`  nota: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : null;
  };
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--review', '--ci-log', '--out'].includes(args[i - 1]));
  if (positional.length < 2) {
    console.error('uso: score-team-run.mjs <cartella-finale> <run-log.json> [--review <file>] [--ci-log <file>] [--out <file>] [--json]');
    process.exit(2);
  }
  const result = scoreRun({ finalDir: positional[0], runLogPath: positional[1], reviewPath: opt('review'), ciLogPath: opt('ci-log') });
  if (opt('out')) writeFileSync(opt('out'), `${JSON.stringify(result, null, 2)}\n`);
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else printSummary(result);
  process.exit(result.error ? 2 : result.code_acceptance === 'PASS' ? 0 : 1);
}
