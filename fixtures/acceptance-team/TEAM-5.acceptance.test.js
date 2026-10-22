// TEAM-5: collegamento fra annullamento e credito (REQ-4). Dipende da TEAM-3 e TEAM-4.
// Solo scaglioni con penale > 0: il comportamento senza penale è oggetto del change-request (TEAM-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, cancelOn, makeShop } from './helpers.mjs';

test('[T5] cancel accredita il rimborso e il saldo è visibile', () => {
  const { bookings, ledger } = makeShop();
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: cancelOn(5) });
  assert.equal(ledger.balance('c1'), 8150);
  assert.equal(ledger.entries('c1')[0].bookingId, id);
  assert.equal(c.cancellation.creditCents, 8150);
});

test('[T5] penale 100% (noleggio iniziato): si accredita solo il deposito', () => {
  const { bookings, ledger } = makeShop();
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: cancelOn(-1) });
  assert.equal(ledger.balance('c1'), 5000);
  assert.equal(c.cancellation.creditCents, 5000);
});

test('[T5] rimborso zero: nessuna voce e creditCents 0', () => {
  const { bookings, ledger } = makeShop();
  const { id } = bookings.create({ ...BASE, sku: 'MIXER' }); // deposito 0
  const c = bookings.cancel(id, { on: cancelOn(-3) });
  assert.equal(c.cancellation.refundCents, 0);
  assert.equal(c.cancellation.creditCents, 0);
  assert.equal(ledger.entries('c1').length, 0);
});

test('[T5][ADR-005] se il ledger fallisce l\'annullamento non lascia tracce e l\'errore si propaga', () => {
  const broken = {
    postRefund() {
      throw api.fail('ledger_down');
    },
    balance: () => 0,
    entries: () => [],
  };
  const { bookings, events, outbox } = makeShop({ stock: { DRILL: 1, LADDER: 1, MIXER: 1, ODD: 1 }, ledger: broken });
  const { id } = bookings.create(BASE);
  assert.throws(() => bookings.cancel(id, { on: cancelOn(5) }), { code: 'ledger_down' });
  const b = bookings.get(id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.cancellation, undefined);
  assert.equal(bookings.availableUnits('DRILL', BASE.startDate, BASE.endDate), 0);
  assert.equal(events.log.filter((e) => e.type === 'booking.cancelled').length, 0);
  assert.equal(outbox.messages.length, 0);
});

test('[T5] dopo un errore del ledger si può riprovare e il credito è accreditato una volta sola', () => {
  let fail = true;
  const real = makeShop().ledger;
  const flaky = {
    postRefund(arg) {
      if (fail) {
        fail = false;
        throw api.fail('ledger_down');
      }
      return real.postRefund(arg);
    },
    balance: (c) => real.balance(c),
    entries: (c) => real.entries(c),
  };
  const { bookings } = makeShop({ ledger: flaky });
  const { id } = bookings.create(BASE);
  assert.throws(() => bookings.cancel(id, { on: cancelOn(5) }), { code: 'ledger_down' });
  bookings.cancel(id, { on: cancelOn(5) });
  assert.equal(real.balance('c1'), 8150);
  assert.equal(real.entries('c1').length, 1);
});

test('[T5] il secondo annullamento non accredita di nuovo', () => {
  const { bookings, ledger } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(5) });
  assert.throws(() => bookings.cancel(id, { on: cancelOn(5) }), { code: 'already_cancelled' });
  assert.equal(ledger.balance('c1'), 8150);
});

test('[T5] senza ledger l\'annullamento funziona e non accredita nulla', () => {
  const { bookings } = makeShop({ ledger: false });
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: cancelOn(5) });
  assert.equal(c.status, 'cancelled');
  assert.equal(c.cancellation.creditCents, 0);
});

test('[T5] clienti diversi hanno saldi separati', () => {
  const { bookings, ledger } = makeShop();
  const a = bookings.create(BASE);
  const b = bookings.create({ ...BASE, customerId: 'c2', sku: 'LADDER' });
  bookings.cancel(a.id, { on: cancelOn(5) });
  bookings.cancel(b.id, { on: cancelOn(1) });
  assert.equal(ledger.balance('c1'), 8150);
  assert.equal(ledger.balance('c2'), 2400 - 1680 + 2000); // noleggio 2400, penale 70% = 1680, deposito 2000
});
