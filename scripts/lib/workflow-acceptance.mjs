// Logica PURA (nessun I/O) per il campo `workflow_acceptance` dei JSON di risultato.
// Separata da evaluate.mjs per poterla testare senza lanciare i test della fixture.
// Schema e motivazioni: docs/results-schema.md.

// Valori ammessi per ogni flag da riga di comando e il valore che salvano nel JSON.
// `favorable` dice se quel valore conta come «a favore della consegna».
const FLAGS = {
  pr: { field: 'pr_created', map: { created: { value: true, favorable: true }, none: { value: false, favorable: false } } },
  ci: {
    field: 'ci_status',
    map: {
      passed: { value: 'passed', favorable: true },
      failed: { value: 'failed', favorable: false },
      none: { value: 'none', favorable: false },
    },
  },
  review: {
    field: 'review_state',
    map: {
      approved: { value: 'approved', favorable: true },
      pending: { value: 'pending', favorable: false },
      none: { value: 'none', favorable: false },
    },
  },
  tracker: { field: 'tracker_updated', map: { updated: { value: true, favorable: true }, none: { value: false, favorable: false } } },
};

// Separa gli argomenti posizionali dai flag `--nome=valore`.
// Restituisce { positional, flags } oppure lancia Error se un flag non è valido.
export function splitArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(a);
    if (!m) {
      if (a.startsWith('--')) throw new Error(`flag non valido (usa --nome=valore): ${a}`);
      positional.push(a);
      continue;
    }
    const [, name, value] = m;
    if (name === 'notes') flags.notes = value;
    else if (FLAGS[name]) {
      if (!(value in FLAGS[name].map)) {
        throw new Error(`valore non ammesso per --${name}: "${value}" (ammessi: ${Object.keys(FLAGS[name].map).join('|')})`);
      }
      flags[name] = value;
    } else throw new Error(`flag sconosciuto: --${name}`);
  }
  return { positional, flags };
}

// Costruisce l'oggetto workflow_acceptance. Tutto vale null («non misurato») salvo i flag passati.
export function buildWorkflowAcceptance(flags = {}) {
  const wa = { pr_created: null, ci_status: null, review_state: null, tracker_updated: null, delivered: null, notes: null };
  const favorable = [];
  for (const [name, spec] of Object.entries(FLAGS)) {
    if (flags[name] === undefined) continue;
    const entry = spec.map[flags[name]];
    wa[spec.field] = entry.value;
    favorable.push(entry.favorable);
  }
  if (flags.notes) wa.notes = flags.notes;
  wa.delivered = computeDelivered(wa);
  return wa;
}

// delivered: false se UN campo misurato è sfavorevole; true solo se tutti i campi misurati
// sono favorevoli E pr_created è stato misurato; null in tutti gli altri casi.
export function computeDelivered(wa) {
  const measured = [];
  if (wa.pr_created !== null && wa.pr_created !== undefined) measured.push(wa.pr_created === true);
  if (wa.ci_status !== null && wa.ci_status !== undefined) measured.push(wa.ci_status === 'passed');
  if (wa.review_state !== null && wa.review_state !== undefined) measured.push(wa.review_state === 'approved');
  if (wa.tracker_updated !== null && wa.tracker_updated !== undefined) measured.push(wa.tracker_updated === true);
  if (measured.some((ok) => !ok)) return false;
  const prMeasured = wa.pr_created !== null && wa.pr_created !== undefined;
  return prMeasured && measured.length > 0 ? true : null;
}
