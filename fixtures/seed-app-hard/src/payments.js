import { BASE_CURRENCY } from './config.js';

// Astrazione sopra il gateway: costruisce le richieste (importo, valuta, idempotency key).
export class PaymentService {
  constructor({ gateway }) {
    this.gateway = gateway;
  }

  async collect(order) {
    // La chiave identifica il tentativo di pagamento (order.payAttempts).
    const idempotencyKey = `${order.id}#${order.payAttempts}`;
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
