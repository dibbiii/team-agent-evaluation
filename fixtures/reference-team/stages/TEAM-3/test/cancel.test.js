import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop } from './helpers.js';

const base = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

test('cancel applica la penale e registra la scomposizione', () => {
  const { bookings } = makeShop();
  const { id } = bookings.create(base);
  const c = bookings.cancel(id, { on: '2026-04-05' });
  assert.equal(c.cancellation.feeCents, 1350);
  assert.equal(c.cancellation.refundCents, 8150);
  assert.equal(c.cancellation.cancelledOn, '2026-04-05');
});

test('cancel senza data usa clock.today()', () => {
  const { bookings, clock } = makeShop();
  const { id } = bookings.create(base);
  clock.set('2026-04-09');
  assert.equal(bookings.cancel(id).cancellation.tier, 'late');
});
