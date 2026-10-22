import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookingService, Catalog, CreditLedger, EventBus, FakeGateway, createClock, createIdGenerator, fail } from '../src/index.js';
import { ITEMS } from './helpers.js';

function shop(ledger) {
  const clock = createClock('2026-03-01');
  const ids = createIdGenerator('bk');
  const l = ledger ?? new CreditLedger({ clock, ids: createIdGenerator('cr') });
  const bookings = new BookingService({ catalog: new Catalog(ITEMS), payments: new FakeGateway(), events: new EventBus(), clock, ids, stock: { DRILL: 2 }, ledger: l });
  return { bookings, ledger: l };
}
const base = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

test('cancel accredita il rimborso sul conto del cliente', () => {
  const { bookings, ledger } = shop();
  const { id } = bookings.create(base);
  const c = bookings.cancel(id, { on: '2026-04-05' });
  assert.equal(c.cancellation.creditCents, 8150);
  assert.equal(ledger.balance('c1'), 8150);
});

test('se il ledger fallisce la prenotazione resta confermata', () => {
  const { bookings } = shop({
    postRefund() {
      throw fail('ledger_down');
    },
  });
  const { id } = bookings.create(base);
  assert.throws(() => bookings.cancel(id, { on: '2026-04-05' }), { code: 'ledger_down' });
  assert.equal(bookings.get(id).status, 'confirmed');
});
