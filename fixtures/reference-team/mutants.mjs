// Mutanti: soluzioni plausibilmente sbagliate. Ogni mutante è una lista di modifiche testuali applicate all'albero della FEATURE completa
// (seed + riferimenti + merge + CR-1). `find` deve comparire esattamente una volta nel file.
//   channel 'held-out' = deve essere bocciato da almeno uno dei test held-out elencati in `expectCaughtBy` (nomi dei file senza .acceptance.test.js)
//   channel 'ci'       = i test (visibili e held-out) passano, ma la CI locale (scripts/team-ci.mjs, task FEATURE) deve fallire sul controllo `ciCheck`
// type: dependency-ignored | merge-conflict | stale-after-cr | incomplete-guess | subtle | adr-violation | ci
const L = (...lines) => lines.join('\n');
const hardCancelBlock = L(
  '    if (breakdown.feeCents === 0) {',
  '      this.payments.refund(booking.paymentRef, breakdown.refundCents);',
  "      refundMethod = 'original';",
  '    } else if (this.ledger) {',
);
const ledgerCr = L(
  "    // CR-1: le cancellazioni senza penale si rimborsano sul metodo di pagamento originale, non a credito.",
  "    if (breakdown.feeCents === 0) throw fail('use_original_payment_method');",
  '',
);
const notifyCr = L(
  "  if (refundMethod === 'original') {",
  '    return `Prenotazione ${bookingId} annullata. Nessuna penale. Rimborso di ${formatEuro(refundCents)} sul metodo di pagamento originale.`;',
  '  }',
  '',
);
const eventCr = L('      refundCents: breakdown.refundCents,', '      refundMethod,', '    });');
const enqueueBlock = L(
  '    this.outbox.enqueue({',
  '      to: booking.customerId,',
  "      subject: 'Prenotazione annullata',",
  '      body: cancellationMessage(booking.id, { ...breakdown, refundMethod }),',
  '      dedupeKey: `cancel:${booking.id}`,',
  '    });',
  '',
);
const ledgerBlock = L(
  '    } else if (this.ledger) {',
  '      const entry = this.ledger.postRefund({ customerId: booking.customerId, bookingId: booking.id, breakdown });',
  '      creditCents = entry ? entry.amountCents : 0;',
  '    }',
);

export const MUTANTS = [
  // ---- TEAM-2: modulo di penale ----
  {
    name: 'round-half-up', subtask: 'TEAM-2', type: 'incomplete-guess', channel: 'held-out', expectCaughtBy: ['TEAM-2'],
    description: "Requisito incompleto indovinato male (Q2): la penale usa pct() (half-up) invece dell'arrotondamento per eccesso.",
    edits: [
      { file: 'src/policy.js', find: "import { assertCents, ceilDiv } from './money.js';", replace: "import { assertCents, pct } from './money.js';" },
      { file: 'src/policy.js', find: 'feeCents: ceilDiv(rentalCents * percent, 100)', replace: 'feeCents: pct(rentalCents, percent)' },
    ],
  },
  {
    name: 'started-throws', subtask: 'TEAM-2', type: 'incomplete-guess', channel: 'held-out', expectCaughtBy: ['TEAM-2', 'TEAM-3'],
    description: "Requisito incompleto indovinato male (Q1): dopo l'inizio del noleggio l'annullamento viene rifiutato.",
    edits: [
      {
        file: 'src/policy.js',
        find: 'const { tier, percent } = daysBefore < 0 ? STARTED : FEE_TIERS.find((t) => daysBefore >= t.minDays);',
        replace: L("  if (daysBefore < 0) throw fail('already_started');", '  const { tier, percent } = FEE_TIERS.find((t) => daysBefore >= t.minDays);'),
      },
    ],
  },
  {
    name: 'started-continues-late', subtask: 'TEAM-2', type: 'incomplete-guess', channel: 'held-out', expectCaughtBy: ['TEAM-2', 'TEAM-3'],
    description: "Requisito incompleto indovinato male (Q1): dopo l'inizio si continua ad applicare lo scaglione 70%.",
    edits: [
      {
        file: 'src/policy.js',
        find: 'daysBefore < 0 ? STARTED : FEE_TIERS.find((t) => daysBefore >= t.minDays)',
        replace: 'FEE_TIERS.find((t) => daysBefore >= t.minDays) ?? FEE_TIERS[2]',
      },
    ],
  },
  {
    name: 'free-boundary-off-by-one', subtask: 'TEAM-2', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-2'],
    description: 'Difetto sottile: lo scaglione gratuito parte da 8 giorni invece di 7.',
    edits: [{ file: 'src/policy.js', find: "{ tier: 'free', minDays: 7, percent: 0 }", replace: "{ tier: 'free', minDays: 8, percent: 0 }" }],
  },
  {
    name: 'fee-on-total-with-deposit', subtask: 'TEAM-2', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-2'],
    description: 'Difetto sottile: la penale è calcolata su noleggio + deposito invece che sul solo noleggio.',
    edits: [
      {
        file: 'src/policy.js',
        find: 'const { feeCents, percent, tier, daysBefore } = cancellationFee({ rentalCents, startDate, cancelDate });',
        replace: 'const { feeCents, percent, tier, daysBefore } = cancellationFee({ rentalCents: rentalCents + depositCents, startDate, cancelDate });',
      },
    ],
  },
  {
    name: 'assert-breakdown-lax', subtask: 'TEAM-2', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-2', 'TEAM-4'],
    description: 'Difetto sottile: assertBreakdown non controlla la coerenza del rimborso.',
    edits: [{ file: 'src/policy.js', find: "  if (b.refundCents !== b.rentalCents - b.feeCents + b.depositCents) throw bad('rimborso incoerente');\n", replace: '' }],
  },
  // ---- TEAM-3: annullamento ----
  {
    name: 'cancel-no-policy', subtask: 'TEAM-3', type: 'dependency-ignored', channel: 'held-out', expectCaughtBy: ['TEAM-3'],
    description: 'Dipendenza ignorata: cancel non usa il modulo di penale (stub «per ora senza penale»).',
    edits: [
      {
        file: 'src/bookings.js',
        find: L(
          '    const breakdown = refundBreakdown({',
          '      rentalCents: booking.rentalCents,',
          '      depositCents: booking.depositCents,',
          '      startDate: booking.startDate,',
          '      cancelDate: cancelledOn,',
          '    });',
        ),
        replace: "    const breakdown = { rentalCents: booking.rentalCents, depositCents: booking.depositCents, feeCents: 0, refundCents: booking.paidCents, percent: 0, tier: 'free', daysBefore: 0 };",
      },
    ],
  },
  {
    name: 'cancel-ignores-on', subtask: 'TEAM-3', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-3'],
    description: 'Difetto sottile: cancel ignora la data { on } e usa sempre clock.today().',
    edits: [{ file: 'src/bookings.js', find: 'const cancelledOn = on ?? this.clock.today();', replace: 'const cancelledOn = this.clock.today();' }],
  },
  {
    name: 'cancel-ignores-quantity', subtask: 'TEAM-3', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-3', 'FEATURE'],
    description: 'Difetto sottile: la penale è calcolata su una sola unità (tariffa divisa per la quantità), quindi sbaglia per le prenotazioni con più unità.',
    edits: [{ file: 'src/bookings.js', find: '      rentalCents: booking.rentalCents,', replace: '      rentalCents: booking.rentalCents / booking.qty,' }],
  },
  {
    name: 'status-before-validation', subtask: 'TEAM-3', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-3'],
    description: 'Difetto sottile (ADR-005): lo stato cambia prima di validare la data; una data non valida lascia la prenotazione annullata a metà.',
    edits: [{ file: 'src/bookings.js', find: '    const breakdown = refundBreakdown({', replace: "    booking.status = 'cancelled';\n    const breakdown = refundBreakdown({" }],
  },
  // ---- TEAM-4: registro del credito ----
  {
    name: 'credit-expires-90-days', subtask: 'TEAM-4', type: 'adr-violation', channel: 'held-out', expectCaughtBy: ['TEAM-4'],
    description: 'Conflitto con ADR-004: il requisito dice «scade dopo 90 giorni» e viene implementato alla lettera.',
    edits: [
      { file: 'src/ledger.js', find: "import { assertBreakdown } from './policy.js';", replace: "import { daysBetween } from './calendar.js';\nimport { assertBreakdown } from './policy.js';" },
      {
        file: 'src/ledger.js',
        find: L(
          '  balance(customerId) {',
          '    return sum(this.#entries.filter((e) => e.customerId === customerId).map((e) => e.amountCents));',
        ),
        replace: L(
          '  balance(customerId, { on } = {}) {',
          '    const today = on ?? this.clock.today();',
          '    return sum(this.#entries.filter((e) => e.customerId === customerId && daysBetween(e.postedOn, today) <= 90).map((e) => e.amountCents));',
        ),
      },
    ],
  },
  {
    name: 'post-not-idempotent', subtask: 'TEAM-4', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-4'],
    description: 'Difetto sottile: postRefund non è idempotente per prenotazione.',
    edits: [{ file: 'src/ledger.js', find: '    if (existing) return { ...existing };\n', replace: '' }],
  },
  {
    name: 'ledger-skips-validation', subtask: 'TEAM-4', type: 'dependency-ignored', channel: 'held-out', expectCaughtBy: ['TEAM-4'],
    description: 'Dipendenza ignorata: il ledger non valida il breakdown con assertBreakdown di TEAM-2.',
    edits: [{ file: 'src/ledger.js', find: '    assertBreakdown(breakdown);\n', replace: '' }],
  },
  // ---- TEAM-5: collegamento annullamento e credito ----
  {
    name: 'credit-without-deposit', subtask: 'TEAM-5', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-5', 'FEATURE'],
    description: 'Difetto sottile: si accredita solo noleggio meno penale, il deposito si dimentica.',
    edits: [
      {
        file: 'src/bookings.js',
        find: 'const entry = this.ledger.postRefund({ customerId: booking.customerId, bookingId: booking.id, breakdown });',
        replace: 'const entry = this.ledger.postRefund({ customerId: booking.customerId, bookingId: booking.id, breakdown: { ...breakdown, depositCents: 0, refundCents: breakdown.rentalCents - breakdown.feeCents } });',
      },
    ],
  },
  {
    name: 'status-before-external-steps', subtask: 'TEAM-5', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-5', 'TEAM-8'],
    description: 'Difetto sottile (ADR-005): lo stato cambia prima dei passi esterni; se il ledger o il gateway falliscono la prenotazione resta annullata senza rimborso.',
    edits: [{ file: 'src/bookings.js', find: "    let refundMethod = 'credit';", replace: "    booking.status = 'cancelled';\n    let refundMethod = 'credit';" }],
  },
  {
    name: 'ledger-error-swallowed', subtask: 'TEAM-5', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-5'],
    description: 'Difetto sottile (ADR-005): un errore del ledger viene ingoiato e l\'annullamento prosegue senza credito.',
    edits: [
      {
        file: 'src/bookings.js',
        find: L(
          '      const entry = this.ledger.postRefund({ customerId: booking.customerId, bookingId: booking.id, breakdown });',
          '      creditCents = entry ? entry.amountCents : 0;',
        ),
        replace: L(
          '      try {',
          '        const entry = this.ledger.postRefund({ customerId: booking.customerId, bookingId: booking.id, breakdown });',
          '        creditCents = entry ? entry.amountCents : 0;',
          '      } catch {',
          '        creditCents = 0;',
          '      }',
        ),
      },
    ],
  },
  // ---- conflitto di merge fra TEAM-5 e TEAM-6 risolto male ----
  {
    name: 'merge-drops-notification', subtask: 'TEAM-6', type: 'merge-conflict', channel: 'held-out', expectCaughtBy: ['TEAM-6'],
    description: 'Conflitto risolto male: nel merge di cancel() si tiene solo il lato del credito e si perde l\'avviso in outbox.',
    edits: [{ file: 'src/bookings.js', find: enqueueBlock, replace: '' }],
  },
  {
    name: 'merge-drops-credit', subtask: 'TEAM-5', type: 'merge-conflict', channel: 'held-out', expectCaughtBy: ['TEAM-5'],
    description: 'Conflitto risolto male: nel merge di cancel() si tiene solo il lato dell\'avviso e si perde l\'accredito nel ledger.',
    edits: [{ file: 'src/bookings.js', find: ledgerBlock, replace: '    }' }],
  },
  {
    name: 'merge-notify-before-external-step', subtask: 'TEAM-6', type: 'merge-conflict', channel: 'held-out', expectCaughtBy: ['TEAM-5', 'TEAM-8'],
    description: 'Conflitto risolto male: l\'avviso finisce prima del passo esterno; se il ledger o il gateway falliscono resta un messaggio per un annullamento mai avvenuto.',
    edits: [
      {
        file: 'src/bookings.js',
        find: "    let refundMethod = 'credit';",
        replace: L(
          '    this.outbox.enqueue({',
          '      to: booking.customerId,',
          "      subject: 'Prenotazione annullata',",
          "      body: cancellationMessage(booking.id, { ...breakdown, refundMethod: breakdown.feeCents === 0 ? 'original' : 'credit' }),",
          '      dedupeKey: `cancel:${booking.id}`,',
          '    });',
          "    let refundMethod = 'credit';",
        ),
      },
    ],
  },
  // ---- TEAM-6: avviso ----
  {
    name: 'message-swapped-amounts', subtask: 'TEAM-6', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-6'],
    description: 'Difetto sottile: nel testo penale e credito sono scambiati.',
    edits: [{ file: 'src/notifications.js', find: 'Penale: ${formatEuro(feeCents)}. Credito accreditato: ${formatEuro(refundCents)}.', replace: 'Penale: ${formatEuro(refundCents)}. Credito accreditato: ${formatEuro(feeCents)}.' }],
  },
  {
    name: 'message-raw-cents', subtask: 'TEAM-6', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-6'],
    description: 'Difetto sottile: gli importi nel testo sono centesimi grezzi invece di formatEuro.',
    edits: [{ file: 'src/notifications.js', find: 'Penale: ${formatEuro(feeCents)}. Credito accreditato: ${formatEuro(refundCents)}.', replace: 'Penale: ${feeCents}. Credito accreditato: ${refundCents}.' }],
  },
  {
    name: 'message-no-dedupe-key', subtask: 'TEAM-6', type: 'subtle', channel: 'held-out', expectCaughtBy: ['TEAM-6'],
    description: 'Difetto sottile (ADR-003): il messaggio non ha la dedupeKey stabile.',
    edits: [{ file: 'src/bookings.js', find: '      dedupeKey: `cancel:${booking.id}`,\n', replace: '' }],
  },
  // ---- TEAM-8: assunzioni non aggiornate dopo il change-request ----
  {
    name: 'cr-wiring-not-updated', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8'],
    description: 'Assunzione non aggiornata: l\'annullamento senza penale continua a passare dal ledger (che ora lo rifiuta) invece che dal gateway.',
    edits: [{ file: 'src/bookings.js', find: hardCancelBlock, replace: '    if (this.ledger) {' }],
  },
  {
    name: 'cr-ledger-not-updated', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8'],
    description: 'Assunzione non aggiornata: il ledger continua ad accettare rimborsi senza penale.',
    edits: [{ file: 'src/ledger.js', find: ledgerCr, replace: '' }],
  },
  {
    name: 'cr-notify-not-updated', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8', 'FEATURE'],
    description: 'Assunzione non aggiornata: l\'avviso dice sempre «Credito accreditato», anche per i rimborsi sul metodo originale.',
    edits: [{ file: 'src/notifications.js', find: notifyCr, replace: '' }],
  },
  {
    name: 'cr-event-not-updated', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8', 'FEATURE'],
    description: 'Assunzione non aggiornata: il payload dell\'evento non riporta il metodo di rimborso.',
    edits: [{ file: 'src/bookings.js', find: eventCr, replace: L('      refundCents: breakdown.refundCents,', '    });') }],
  },
  {
    name: 'cr-refund-both-channels', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8', 'FEATURE'],
    description: 'Aggiornamento a metà: anche le cancellazioni con penale vengono rimborsate sul gateway oltre che accreditate (doppio rimborso).',
    edits: [{ file: 'src/bookings.js', find: '    } else if (this.ledger) {', replace: '    } else if (this.ledger) {\n      this.payments.refund(booking.paymentRef, breakdown.refundCents);' }],
  },
  {
    name: 'cr-not-applied', subtask: 'TEAM-8', type: 'stale-after-cr', channel: 'held-out', expectCaughtBy: ['TEAM-8', 'FEATURE'],
    description: 'Change-request ignorato del tutto: il codice resta quello di prima del CR-1 (tutto a credito).',
    edits: [
      { file: 'src/bookings.js', find: hardCancelBlock, replace: '    if (this.ledger) {' },
      { file: 'src/bookings.js', find: eventCr, replace: L('      refundCents: breakdown.refundCents,', '    });') },
      { file: 'src/ledger.js', find: ledgerCr, replace: '' },
      { file: 'src/notifications.js', find: notifyCr, replace: '' },
    ],
  },
  // ---- mutanti che solo la CI deve fermare (i test passano) ----
  {
    name: 'ci-math-ceil', subtask: 'TEAM-2', type: 'ci', channel: 'ci', ciCheck: 'money-helpers',
    description: 'Violazione comune: arrotondamento con Math.ceil fuori da money.js (ADR-001). Il comportamento è giusto, la CI lo boccia.',
    edits: [{ file: 'src/policy.js', find: 'ceilDiv(rentalCents * percent, 100)', replace: 'Math.ceil((rentalCents * percent) / 100)' }],
  },
  {
    name: 'ci-unsorted-exports', subtask: 'TEAM-2', type: 'ci', channel: 'ci', ciCheck: 'sorted-exports',
    description: 'Violazione comune: il nuovo export in coda a src/index.js invece che in ordine alfabetico (tipico dopo un merge).',
    edits: [
      { file: 'src/index.js', find: "export { FEE_TIERS, assertBreakdown, cancellationFee, refundBreakdown } from './policy.js';\n", replace: '' },
      { file: 'src/index.js', find: "export { createClock, createIdGenerator, fail } from './util.js';\n", replace: "export { createClock, createIdGenerator, fail } from './util.js';\nexport { FEE_TIERS, assertBreakdown, cancellationFee, refundBreakdown } from './policy.js';\n" },
    ],
  },
  {
    name: 'ci-missing-changelog', subtask: 'TEAM-8', type: 'ci', channel: 'ci', ciCheck: 'changelog',
    description: 'Violazione comune: manca la riga del ticket nel CHANGELOG.',
    edits: [{ file: 'CHANGELOG.md', find: '- TEAM-8: le cancellazioni senza penale si rimborsano sul metodo di pagamento originale (CR-1).\n', replace: '' }],
  },
  {
    name: 'ci-console-log', subtask: 'TEAM-3', type: 'ci', channel: 'ci', ciCheck: 'no-console',
    description: 'Violazione comune: console.log dimenticato in src/.',
    edits: [{ file: 'src/bookings.js', find: "    if (booking.status === 'cancelled') throw fail('already_cancelled');\n    const cancelledOn", replace: "    if (booking.status === 'cancelled') throw fail('already_cancelled');\n    console.log('cancel', id);\n    const cancelledOn" }],
  },
];
