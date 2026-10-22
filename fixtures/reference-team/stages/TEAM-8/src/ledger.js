import { assertBreakdown } from './policy.js';
import { sum } from './money.js';
import { fail } from './util.js';

// Registro del credito cliente. Le voci sono immutabili e il credito non scade mai (ADR-004).
export class CreditLedger {
  #entries = [];

  constructor({ clock, ids }) {
    this.clock = clock;
    this.ids = ids;
  }

  postRefund({ customerId, bookingId, breakdown }) {
    if (!customerId || !bookingId) throw fail('invalid_entry');
    assertBreakdown(breakdown);
    // CR-1: le cancellazioni senza penale si rimborsano sul metodo di pagamento originale, non a credito.
    if (breakdown.feeCents === 0) throw fail('use_original_payment_method');
    const existing = this.#entries.find((e) => e.kind === 'refund' && e.bookingId === bookingId);
    if (existing) return { ...existing };
    if (breakdown.refundCents === 0) return null;
    const entry = {
      id: this.ids(),
      customerId,
      bookingId,
      kind: 'refund',
      amountCents: breakdown.refundCents,
      postedOn: this.clock.today(),
    };
    this.#entries.push(entry);
    return { ...entry };
  }

  // `on` è accettato per compatibilità ma non cambia il saldo: nessuna scadenza.
  balance(customerId) {
    return sum(this.#entries.filter((e) => e.customerId === customerId).map((e) => e.amountCents));
  }

  entries(customerId) {
    return this.#entries.filter((e) => e.customerId === customerId).map((e) => ({ ...e }));
  }
}
