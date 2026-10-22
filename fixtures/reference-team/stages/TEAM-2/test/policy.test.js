import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBreakdown, cancellationFee, refundBreakdown } from '../src/index.js';

const at = (cancelDate) => ({ rentalCents: 10000, startDate: '2026-04-10', cancelDate });

test('scaglioni di penale', () => {
  assert.equal(cancellationFee(at('2026-04-03')).tier, 'free');
  assert.equal(cancellationFee(at('2026-04-04')).feeCents, 3000);
  assert.equal(cancellationFee(at('2026-04-08')).feeCents, 7000);
  assert.equal(cancellationFee(at('2026-04-11')).percent, 100);
});

test('la penale si arrotonda per eccesso', () => {
  assert.equal(cancellationFee({ rentalCents: 1001, startDate: '2026-04-10', cancelDate: '2026-04-05' }).feeCents, 301);
});

test('refundBreakdown e assertBreakdown sono coerenti', () => {
  const b = refundBreakdown({ rentalCents: 10000, depositCents: 5000, startDate: '2026-04-10', cancelDate: '2026-04-05' });
  assert.equal(b.refundCents, 12000);
  assert.equal(assertBreakdown(b), b);
  assert.throws(() => assertBreakdown({ ...b, refundCents: 1 }), { code: 'invalid_breakdown' });
});
