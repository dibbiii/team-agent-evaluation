import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationMessage } from '../src/index.js';
import { makeShop } from './helpers.js';

const base = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

test('cancellationMessage formatta gli importi', () => {
  assert.equal(cancellationMessage('bk_1', { feeCents: 1350, refundCents: 8150 }), 'Prenotazione bk_1 annullata. Penale: 13,50 EUR. Credito accreditato: 81,50 EUR.');
});

test('cancel accoda un solo avviso in outbox', () => {
  const { bookings, outbox } = makeShop();
  const { id } = bookings.create(base);
  bookings.cancel(id, { on: '2026-04-05' });
  assert.equal(outbox.pending().length, 1);
  assert.equal(outbox.pending()[0].dedupeKey, `cancel:${id}`);
});
