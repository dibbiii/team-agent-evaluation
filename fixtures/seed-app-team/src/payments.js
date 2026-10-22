import { assertCents, sum } from './money.js';
import { fail } from './util.js';

// Gateway di pagamento finto: nessun timer, nessuna rete. Si può far fallire il prossimo rimborso.
export class FakeGateway {
  charges = [];
  refunds = [];
  #n = 0;
  #nextRefundError = null;

  charge({ customerId, cents, ref }) {
    assertCents(cents);
    if (cents <= 0) throw fail('invalid_amount');
    const paymentRef = `pay_${++this.#n}`;
    this.charges.push({ paymentRef, customerId, cents, ref });
    return { paymentRef, cents };
  }

  refund(paymentRef, cents) {
    if (this.#nextRefundError) {
      const error = this.#nextRefundError;
      this.#nextRefundError = null;
      throw error;
    }
    assertCents(cents);
    const charge = this.charges.find((c) => c.paymentRef === paymentRef);
    if (!charge) throw fail('unknown_payment');
    const already = sum(this.refunds.filter((r) => r.paymentRef === paymentRef).map((r) => r.cents));
    if (cents <= 0 || already + cents > charge.cents) throw fail('refund_exceeds_charge');
    this.refunds.push({ paymentRef, cents });
    return { paymentRef, cents };
  }

  failNextRefund(error = fail('gateway_down')) {
    this.#nextRefundError = error;
  }
}
