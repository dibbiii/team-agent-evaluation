import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreditLedger, createClock, createIdGenerator, refundBreakdown } from '../src/index.js';

const make = () => new CreditLedger({ clock: createClock('2026-03-01'), ids: createIdGenerator('cr') });
const breakdown = refundBreakdown({ rentalCents: 10000, depositCents: 5000, startDate: '2026-04-10', cancelDate: '2026-04-05' });

test('postRefund registra una voce e il saldo la somma', () => {
  const ledger = make();
  const entry = ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown });
  assert.equal(entry.amountCents, 12000);
  assert.equal(ledger.balance('c1'), 12000);
  assert.equal(ledger.balance('c2'), 0);
});

test('postRefund è idempotente per prenotazione e valida il breakdown', () => {
  const ledger = make();
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown });
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown });
  assert.equal(ledger.entries('c1').length, 1);
  assert.throws(() => ledger.postRefund({ customerId: 'c1', bookingId: 'bk_2', breakdown: { ...breakdown, refundCents: 5 } }), { code: 'invalid_breakdown' });
});
