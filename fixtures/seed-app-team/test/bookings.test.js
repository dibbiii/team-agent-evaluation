import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop } from './helpers.js';

const base = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

test('create addebita il totale (noleggio + deposito) e conferma la prenotazione', () => {
  const { bookings, gateway, events } = makeShop();
  const b = bookings.create(base);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.rentalCents, 4500);
  assert.equal(b.depositCents, 5000);
  assert.equal(b.paidCents, 9500);
  assert.equal(gateway.charges.length, 1);
  assert.equal(gateway.charges[0].cents, 9500);
  assert.equal(b.paymentRef, gateway.charges[0].paymentRef);
  assert.equal(events.log[0].type, 'booking.created');
});

test('create rifiuta cliente mancante, sku sconosciuto e periodo non valido', () => {
  const { bookings } = makeShop();
  assert.throws(() => bookings.create({ ...base, customerId: '' }), { code: 'invalid_customer' });
  assert.throws(() => bookings.create({ ...base, sku: 'NOPE' }), { code: 'unknown_sku' });
  assert.throws(() => bookings.create({ ...base, endDate: base.startDate }), { code: 'invalid_period' });
});

test('la disponibilità tiene conto delle prenotazioni sovrapposte', () => {
  const { bookings } = makeShop();
  bookings.create({ ...base, sku: 'LADDER' });
  assert.equal(bookings.availableUnits('LADDER', '2026-04-11', '2026-04-12'), 0);
  assert.equal(bookings.availableUnits('LADDER', '2026-04-13', '2026-04-15'), 1); // la fine è esclusa
  assert.throws(() => bookings.create({ ...base, sku: 'LADDER', startDate: '2026-04-12', endDate: '2026-04-14' }), { code: 'not_available' });
});

test('la quantità consuma più unità di scorta', () => {
  const { bookings } = makeShop();
  bookings.create({ ...base, qty: 2 });
  assert.equal(bookings.availableUnits('DRILL', base.startDate, base.endDate), 0);
  assert.throws(() => bookings.create(base), { code: 'not_available' });
});

test('get e list restituiscono copie, list filtra per cliente', () => {
  const { bookings } = makeShop();
  const a = bookings.create(base);
  bookings.create({ ...base, customerId: 'c2', sku: 'MIXER' });
  a.status = 'hacked';
  assert.equal(bookings.get(a.id).status, 'confirmed');
  assert.equal(bookings.list().length, 2);
  assert.equal(bookings.list({ customerId: 'c2' }).length, 1);
  assert.throws(() => bookings.get('nope'), { code: 'not_found' });
});

test('cancel cambia lo stato ed emette booking.cancelled', () => {
  const { bookings, events } = makeShop();
  const { id } = bookings.create(base);
  const cancelled = bookings.cancel(id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(bookings.get(id).status, 'cancelled');
  const evt = events.log.find((e) => e.type === 'booking.cancelled');
  assert.equal(evt.payload.bookingId, id);
  assert.equal(evt.payload.customerId, 'c1');
});

test('cancel: id sconosciuto e doppio annullamento', () => {
  const { bookings } = makeShop();
  assert.throws(() => bookings.cancel('nope'), { code: 'not_found' });
  const { id } = bookings.create(base);
  bookings.cancel(id);
  assert.throws(() => bookings.cancel(id), { code: 'already_cancelled' });
});

test('cancel libera le unità di scorta', () => {
  const { bookings } = makeShop();
  const { id } = bookings.create({ ...base, sku: 'LADDER' });
  assert.equal(bookings.availableUnits('LADDER', base.startDate, base.endDate), 0);
  bookings.cancel(id);
  assert.equal(bookings.availableUnits('LADDER', base.startDate, base.endDate), 1);
});
