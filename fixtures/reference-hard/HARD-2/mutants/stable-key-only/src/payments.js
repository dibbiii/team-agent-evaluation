import { BASE_CURRENCY } from './config.js';

// Astrazione sopra il gateway: costruisce le richieste (importo, valuta, idempotency key).
export class PaymentService {
  constructor({ gateway }) {
    this.gateway = gateway;
  }

  async collect(order) {
    // ADR-004: chiave stabile per ordine, identica per tutti i tentativi.
    const idempotencyKey = `order:${order.id}`;
    return this.gateway.charge({
      orderId: order.id,
      amountCents: order.totals.totalCents,
      currency: BASE_CURRENCY,
      idempotencyKey,
    });
  }

  async refund(order, amountCents, sequence = 1) {
    return this.gateway.refund({
      chargeId: order.chargeId,
      amountCents,
      idempotencyKey: `${order.id}#refund#${sequence}`,
    });
  }
}
