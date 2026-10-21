// Gateway di pagamento finto, deterministico (nessun timer reale, nessuna rete).
//
// Semantica (modellata su gateway reali con idempotency key):
//  - una charge/refund RIUSCITA è memorizzata per chiave: la stessa chiave restituisce il risultato originale
//    (replayed: true) e NON crea un nuovo addebito/rimborso;
//  - due richieste con la stessa chiave contemporaneamente in corso: la seconda fallisce con
//    GatewayError('idempotency_in_progress');
//  - un rifiuto (decline) non viene memorizzato: la stessa chiave può essere riprovata.
//
// Modalità di guasto da accodare con queueFailure(mode, op):
//  op 'charge': 'decline' | 'timeout-before-charge' | 'timeout-after-charge' (addebito avvenuto, risposta persa)
//  op 'refund': 'decline' | 'timeout-before-refund' | 'timeout-after-refund'
export class GatewayError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}

export class GatewayTimeoutError extends GatewayError {
  constructor() {
    super('timeout', 'Gateway timeout');
    this.name = 'GatewayTimeoutError';
  }
}

const defaultLatency = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

export class FakeGateway {
  calls = []; // ogni richiesta ricevuta, anche se fallita
  captures = []; // addebiti effettivamente avvenuti
  refunds = []; // rimborsi effettivamente avvenuti
  #chargeByKey = new Map();
  #refundByKey = new Map();
  #inflight = new Set();
  #failures = [];

  constructor({ latency = defaultLatency } = {}) {
    this.latency = latency;
  }

  queueFailure(mode, op = 'charge') {
    this.#failures.push({ mode, op });
  }

  #takeFailure(op) {
    const i = this.#failures.findIndex((f) => f.op === op);
    return i < 0 ? null : this.#failures.splice(i, 1)[0].mode;
  }

  async charge({ orderId, amountCents, currency, idempotencyKey }) {
    this.calls.push({ op: 'charge', orderId, amountCents, currency, idempotencyKey });
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new GatewayError('invalid_amount');
    const stored = this.#chargeByKey.get(idempotencyKey);
    if (stored) return { ...stored, replayed: true };
    if (this.#inflight.has(idempotencyKey)) throw new GatewayError('idempotency_in_progress');
    const failure = this.#takeFailure('charge');
    this.#inflight.add(idempotencyKey);
    try {
      await this.latency();
      if (failure === 'decline') throw new GatewayError('card_declined');
      if (failure === 'timeout-before-charge') throw new GatewayTimeoutError();
      const capture = { id: `ch_${this.captures.length + 1}`, orderId, amountCents, currency, idempotencyKey };
      this.captures.push(capture);
      this.#chargeByKey.set(idempotencyKey, capture);
      if (failure === 'timeout-after-charge') throw new GatewayTimeoutError();
      return { ...capture, replayed: false };
    } finally {
      this.#inflight.delete(idempotencyKey);
    }
  }

  async refund({ chargeId, amountCents, idempotencyKey }) {
    this.calls.push({ op: 'refund', chargeId, amountCents, idempotencyKey });
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new GatewayError('invalid_amount');
    const stored = this.#refundByKey.get(idempotencyKey);
    if (stored) return { ...stored, replayed: true };
    const inflightKey = `refund:${idempotencyKey}`;
    if (this.#inflight.has(inflightKey)) throw new GatewayError('idempotency_in_progress');
    const charge = this.captures.find((c) => c.id === chargeId);
    if (!charge) throw new GatewayError('unknown_charge');
    const failure = this.#takeFailure('refund');
    this.#inflight.add(inflightKey);
    try {
      await this.latency();
      if (failure === 'decline') throw new GatewayError('refund_declined');
      if (failure === 'timeout-before-refund') throw new GatewayTimeoutError();
      const already = this.refunds.filter((r) => r.chargeId === chargeId).reduce((s, r) => s + r.amountCents, 0);
      if (already + amountCents > charge.amountCents) throw new GatewayError('refund_exceeds_charge');
      const refund = { id: `re_${this.refunds.length + 1}`, chargeId, amountCents, idempotencyKey };
      this.refunds.push(refund);
      this.#refundByKey.set(idempotencyKey, refund);
      if (failure === 'timeout-after-refund') throw new GatewayTimeoutError();
      return { ...refund, replayed: false };
    } finally {
      this.#inflight.delete(inflightKey);
    }
  }
}
