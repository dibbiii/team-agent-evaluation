// Logica PURA (nessun I/O) per le metriche di coordinamento e il punteggio composito della fixture di squadra.
// Schema del run-log e motivazioni dei pesi: docs/team-fixture.md.

// Pesi del punteggio composito (somma 100). Dichiarati qui e ristampati in ogni risultato: nessun peso nascosto.
export const WEIGHTS = {
  correctness: 45, // frazione di test held-out superati
  delivery: 10, // workflow_acceptance.delivered (PR, CI finale, review, ticket) misurato dal runner locale
  dependency_order: 8, // sotto-compiti completati dopo le loro dipendenze
  cr_assumptions: 10, // assunzioni aggiornate dopo il change-request (4 punti di controllo)
  questions: 10, // domande attese poste (60%) e assenza di domande inutili (40%)
  ci_efficiency: 5, // pochi tentativi di CI oltre il primo per ticket
  git_conflicts: 3, // conflitti Git incontrati
  human_interventions: 4, // interventi umani non pianificati
  review_agreement: 5, // il verdetto del Reviewer concorda con l'esito dei test
};

export const CR_ASSUMPTIONS = ['CR:ledger', 'CR:wiring', 'CR:notify', 'CR:event'];
export const CI_EXTRA_CAP = 6;
export const CONFLICT_CAP = 4;
export const INTERVENTION_CAP = 4;
export const USELESS_QUESTION_CAP = 4;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const nonNegInt = (x) => Number.isInteger(x) && x >= 0;

// Controlla il run-log (dichiarato dal driver). Restituisce { errors, warnings }. Un campo mancante vale «non misurato» (null), non zero.
export function validateRunLog(log, knownTasks = []) {
  const errors = [];
  const warnings = [];
  if (!isObj(log)) return { errors: ['il run-log deve essere un oggetto JSON'], warnings };
  if (log.arm !== undefined && !['single', 'team', 'other'].includes(log.arm)) errors.push('arm deve essere single, team o other');
  if (log.questions !== undefined) {
    if (!Array.isArray(log.questions)) errors.push('questions deve essere un array');
    else if (log.questions.some((q) => !(typeof q === 'string' || (isObj(q) && typeof q.text === 'string')))) errors.push('ogni domanda è una stringa o { text }');
  }
  for (const f of ['human_interventions', 'git_conflicts', 'tracker_updates']) {
    if (log[f] !== undefined && log[f] !== null && !nonNegInt(log[f])) errors.push(`${f} deve essere un intero >= 0 o null`);
  }
  if (log.ci_attempts !== undefined && log.ci_attempts !== null) {
    if (!isObj(log.ci_attempts) || Object.values(log.ci_attempts).some((v) => !nonNegInt(v))) errors.push('ci_attempts deve essere { task: intero >= 0 }');
  }
  if (log.completion_order !== undefined && log.completion_order !== null) {
    if (!Array.isArray(log.completion_order)) errors.push('completion_order deve essere un array di chiavi');
    else {
      for (const k of log.completion_order) if (knownTasks.length && !knownTasks.includes(k)) errors.push(`completion_order: sotto-compito sconosciuto ${k}`);
      if (new Set(log.completion_order).size !== log.completion_order.length) errors.push('completion_order: sotto-compiti ripetuti');
    }
  }
  if (log.prs !== undefined && log.prs !== null && !Array.isArray(log.prs)) errors.push('prs deve essere un array');
  if (log.change_request !== undefined && !isObj(log.change_request)) errors.push('change_request deve essere un oggetto');
  if (log.cost_usd !== undefined && log.cost_usd !== null && !(typeof log.cost_usd === 'number' && log.cost_usd >= 0)) errors.push('cost_usd deve essere un numero >= 0 o null');
  if (log.roles_used !== undefined && !Array.isArray(log.roles_used)) errors.push('roles_used deve essere un array');
  for (const f of ['questions', 'human_interventions', 'git_conflicts', 'ci_attempts', 'completion_order', 'cost_usd']) {
    if (log[f] === undefined) warnings.push(`${f} assente: non misurato`);
  }
  return { errors, warnings };
}

// Ordine di dipendenza: ogni sotto-compito completato deve avere TUTTE le sue dipendenze completate prima.
// Restituisce null se l'ordine non è stato dichiarato.
export function checkDependencyOrder(order, catalog) {
  if (!Array.isArray(order)) return null;
  const deps = Object.fromEntries(catalog.map((t) => [t.key, t.depends_on ?? []]));
  const pos = new Map(order.map((k, i) => [k, i]));
  const violations = [];
  for (const [task, i] of pos) {
    const missing = (deps[task] ?? []).filter((d) => !pos.has(d) || pos.get(d) > i);
    if (missing.length) violations.push({ task, missing });
  }
  return { completed: order.length, violations, ok: violations.length === 0 };
}

// Assunzioni del change-request non aggiornate: punti di controllo [CR:xxx] con almeno un test fallito.
export function staleAssumptions(failedNames) {
  return CR_ASSUMPTIONS.filter((id) => failedNames.some((n) => n.includes(`[${id}]`)));
}

// Punteggio di una voce del composito: numero in [0, 1] oppure null («non misurato»).
export function componentScores({ correctness, delivered, order, crStale, crMeasured, questions, ci, conflicts, interventions, review }) {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const s = {};
  s.correctness = correctness;
  s.delivery = delivered === true ? 1 : delivered === false ? 0 : null;
  s.dependency_order = order === null || order === undefined ? null : clamp(1 - order.violations.length / Math.max(1, order.completed));
  s.cr_assumptions = crMeasured ? clamp(1 - crStale / CR_ASSUMPTIONS.length) : null;
  s.questions = questions ? clamp(0.6 * (questions.expected_total ? questions.expected_covered / questions.expected_total : 1) + 0.4 * clamp(1 - questions.useless / USELESS_QUESTION_CAP)) : null;
  s.ci_efficiency = ci ? clamp(1 - ci.extra / CI_EXTRA_CAP) : null;
  s.git_conflicts = conflicts === null || conflicts === undefined ? null : clamp(1 - conflicts / CONFLICT_CAP);
  s.human_interventions = interventions === null || interventions === undefined ? null : clamp(1 - interventions / INTERVENTION_CAP);
  s.review_agreement = review === null || review === undefined ? null : review;
  return s;
}

// Composito: somma pesata delle sole voci misurate, riportata a 100. `coverage` = quota di peso misurata.
export function composite(scores, weights = WEIGHTS) {
  let used = 0;
  let points = 0;
  const parts = {};
  for (const [name, w] of Object.entries(weights)) {
    const v = scores[name];
    if (v === null || v === undefined) {
      parts[name] = { weight: w, score: null, points: null };
      continue;
    }
    used += w;
    points += w * v;
    parts[name] = { weight: w, score: Math.round(v * 1000) / 1000, points: Math.round(w * v * 100) / 100 };
  }
  const total = used === 0 ? null : Math.round((points / used) * 1000) / 10;
  return { total, coverage: used / Object.values(weights).reduce((a, b) => a + b, 0), parts };
}

// Accordo fra il verdetto del Reviewer e l'esito dei test: 1 = concorda, 0 = approvato un codice che fallisce, 0.5 = allarme su codice che passa.
export function reviewAgreement(verdict, codePass) {
  if (verdict === 'approve') return codePass ? 1 : 0;
  if (verdict === 'request_changes') return codePass ? 0.5 : 1;
  return null;
}

// Tentativi di CI: `attempts` = { task: n }. extra = tentativi oltre il primo per ogni ticket con almeno un tentativo.
export function ciSummary(attempts) {
  if (!attempts || !Object.keys(attempts).length) return null;
  const tasks = Object.entries(attempts).filter(([, n]) => n > 0);
  const total = tasks.reduce((s, [, n]) => s + n, 0);
  return { tasks: tasks.length, total, extra: total - tasks.length };
}

// Voci misurabili ALLO STESSO MODO in entrambi i bracci (agente solo e team). Il composito «comune» usa solo queste, riportate a 100:
// è l'unico confronto equo fra i bracci, perché «ordine di dipendenza», «conflitti Git» e «accordo del reviewer» esistono per costruzione
// solo nel team.
export const COMMON_PARTS = ['correctness', 'delivery', 'cr_assumptions', 'questions', 'ci_efficiency', 'human_interventions'];

export function compositeCommon(scores) {
  const weights = Object.fromEntries(COMMON_PARTS.map((k) => [k, WEIGHTS[k]]));
  return composite(scores, weights);
}
