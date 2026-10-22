import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookingService, Catalog, CreditLedger, EventBus, FakeGateway, Outbox, createClock, createIdGenerator } from '../src/index.js';
import { ITEMS } from './helpers.js';

function shop() {
  const clock = createClock('2026-03-01');
  const gateway = new FakeGateway();
  const ledger = new CreditLedger({ clock, ids: createIdGenerator('cr') });
  const outbox = new Outbox();
  const bookings = new BookingService({ catalog: new Catalog(ITEMS), payments: gateway, events: new EventBus(), clock, ids: createIdGenerator('bk'), stock: { DRILL: 2 }, outbox, ledger });
  return { bookings, gateway, ledger, outbox };
}
const base = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

test('senza penale il rimborso torna sul metodo originale e non c\'è credito', () => {
  const { bookings, gateway, ledger, outbox } = shop();
  const { id, paymentRef } = bookings.create(base);
  const c = bookings.cancel(id, { on: '2026-03-20' });
  assert.deepEqual(gateway.refunds, [{ paymentRef, cents: 9500 }]);
  assert.equal(ledger.balance('c1'), 0);
  assert.equal(c.cancellation.refundMethod, 'original');
  assert.match(outbox.pending()[0].body, /Rimborso di 95,00 EUR sul metodo di pagamento originale/);
});

test('con penale resta il credito', () => {
  const { bookings, gateway, ledger } = shop();
  const { id } = bookings.create(base);
  bookings.cancel(id, { on: '2026-04-05' });
  assert.equal(gateway.refunds.length, 0);
  assert.equal(ledger.balance('c1'), 8150);
});
