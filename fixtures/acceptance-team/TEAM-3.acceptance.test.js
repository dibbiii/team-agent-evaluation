// TEAM-3: BookingService.cancel con penale (REQ-2). Dipende da TEAM-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, cancelOn, expectedFee, makeShop } from './helpers.mjs';

test('[T3] cancel applica la penale per scaglione e registra la scomposizione', () => {
  const rows = [
    [10, 0, 'free'],
    [5, 1350, 'partial'],
    [1, 3150, 'late'],
    [-2, 4500, 'started'],
  ];
  for (const [days, fee, tier] of rows) {
    const { bookings } = makeShop();
    const { id } = bookings.create(BASE);
    const c = bookings.cancel(id, { on: cancelOn(days) }).cancellation;
    assert.equal(c.feeCents, fee, `penale a ${days}`);
    assert.equal(c.refundCents, 4500 - fee + 5000);
    assert.equal(c.tier, tier);
    assert.equal(c.rentalCents, 4500);
    assert.equal(c.depositCents, 5000);
    assert.equal(c.cancelledOn, cancelOn(days));
  }
});

test('[T3] senza {on} si usa clock.today()', () => {
  const { bookings, clock } = makeShop();
  const { id } = bookings.create(BASE);
  clock.set('2026-04-08');
  const c = bookings.cancel(id).cancellation;
  assert.equal(c.cancelledOn, '2026-04-08');
  assert.equal(c.tier, 'late');
});

test('[T3] {on} ha la precedenza su clock.today()', () => {
  const { bookings, clock } = makeShop({ today: '2026-04-09' });
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: '2026-03-01' });
  assert.equal(c.cancellation.tier, 'free');
  assert.equal(clock.today(), '2026-04-09');
});

test('[T3] la penale parte dalla tariffa scontata (7 giorni), non dal totale pagato', () => {
  const { bookings } = makeShop();
  const { id } = bookings.create({ ...BASE, endDate: '2026-04-17' }); // 7 giorni: 10500 - 1050 = 9450, deposito 5000
  const c = bookings.cancel(id, { on: cancelOn(5) }).cancellation;
  assert.equal(c.rentalCents, 9450);
  assert.equal(c.feeCents, expectedFee(9450, 5));
  assert.equal(c.refundCents, 9450 - c.feeCents + 5000);
});

test('[T3] la quantità moltiplica noleggio e deposito', () => {
  const { bookings } = makeShop();
  const { id } = bookings.create({ ...BASE, qty: 2 });
  const c = bookings.cancel(id, { on: cancelOn(4) }).cancellation;
  assert.equal(c.rentalCents, 9000);
  assert.equal(c.depositCents, 10000);
  assert.equal(c.feeCents, 2700);
  assert.equal(c.refundCents, 9000 - 2700 + 10000);
});

test('[T3] stato, scorte e copie: dopo cancel la prenotazione è annullata e le unità tornano libere', () => {
  const { bookings } = makeShop({ stock: { DRILL: 1, LADDER: 1, MIXER: 1, ODD: 1 } });
  const { id } = bookings.create(BASE);
  assert.equal(bookings.availableUnits('DRILL', BASE.startDate, BASE.endDate), 0);
  const returned = bookings.cancel(id, { on: cancelOn(2) });
  assert.equal(returned.status, 'cancelled');
  assert.equal(bookings.get(id).status, 'cancelled');
  assert.equal(bookings.get(id).cancellation.tier, 'late');
  assert.equal(bookings.availableUnits('DRILL', BASE.startDate, BASE.endDate), 1);
  assert.doesNotThrow(() => bookings.create({ ...BASE, customerId: 'c2' })); // si può riprenotare le stesse date
  returned.cancellation.feeCents = 1; // il valore restituito è una copia
  assert.equal(bookings.get(id).cancellation.feeCents, 3150);
});

test('[T3] evento booking.cancelled con penale e rimborso', () => {
  const { bookings, events } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(5) });
  const evts = events.log.filter((e) => e.type === 'booking.cancelled');
  assert.equal(evts.length, 1);
  const p = evts[0].payload;
  assert.equal(p.bookingId, id);
  assert.equal(p.customerId, 'c1');
  assert.equal(p.feeCents, 1350);
  assert.equal(p.refundCents, 8150);
});

test('[T3] errori: not_found e already_cancelled senza effetti sul secondo tentativo', () => {
  const { bookings, events } = makeShop();
  assert.throws(() => bookings.cancel('nope'), { code: 'not_found' });
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(5) });
  assert.throws(() => bookings.cancel(id, { on: cancelOn(1) }), { code: 'already_cancelled' });
  assert.equal(bookings.get(id).cancellation.feeCents, 1350);
  assert.equal(events.log.filter((e) => e.type === 'booking.cancelled').length, 1);
});

test('[T3] data non valida: errore e nessun cambio di stato', () => {
  const { bookings, events } = makeShop();
  const { id } = bookings.create(BASE);
  assert.throws(() => bookings.cancel(id, { on: '2026-02-30' }), { code: 'invalid_date' });
  assert.equal(bookings.get(id).status, 'confirmed');
  assert.equal(bookings.get(id).cancellation, undefined);
  assert.equal(events.log.filter((e) => e.type === 'booking.cancelled').length, 0);
});

test('[T3][Q1] nel flusso completo, cancellare a noleggio iniziato trattiene tutta la tariffa', () => {
  const { bookings } = makeShop();
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: '2026-04-11' }).cancellation;
  assert.equal(c.feeCents, 4500);
  assert.equal(c.refundCents, 5000);
});

test('[T3] il modulo policy è davvero usato: gli scaglioni del flusso coincidono con quelli del modulo', () => {
  for (const days of [9, 7, 6, 3, 2, 0, -1]) {
    const { bookings } = makeShop();
    const { id } = bookings.create({ ...BASE, sku: 'ODD', endDate: '2026-04-13' });
    const c = bookings.cancel(id, { on: cancelOn(days) }).cancellation;
    const direct = api.cancellationFee({ rentalCents: 3003, startDate: BASE.startDate, cancelDate: cancelOn(days) });
    assert.equal(c.feeCents, direct.feeCents, `a ${days} giorni`);
    assert.equal(c.tier, direct.tier);
  }
});
