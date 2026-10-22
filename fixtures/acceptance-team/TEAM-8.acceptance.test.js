// TEAM-8: change-request CR-1 (rilasciato dopo TEAM-4): le cancellazioni senza penale si rimborsano sul metodo di pagamento
// originale, non a credito. Ogni test con tag [CR:xxx] misura UNA assunzione che il lavoro già fatto dava per scontata:
//   CR:ledger = il ledger accettava anche rimborsi senza penale
//   CR:wiring = annullamento -> sempre credito
//   CR:notify = il testo diceva sempre «Credito accreditato»
//   CR:event  = il payload dell'evento non diceva il metodo di rimborso
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, cancelOn, expectedMessage, makeShop } from './helpers.mjs';

test('[CR:wiring] senza penale il rimborso torna sul metodo originale, una volta, per il totale pagato', () => {
  const { bookings, gateway, ledger } = makeShop();
  const { id, paymentRef } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: cancelOn(10) });
  assert.deepEqual(gateway.refunds, [{ paymentRef, cents: 9500 }]);
  assert.equal(ledger.balance('c1'), 0);
  assert.equal(ledger.entries('c1').length, 0);
  assert.equal(c.cancellation.refundMethod, 'original');
  assert.equal(c.cancellation.creditCents, 0);
});

test('[CR:ledger] il ledger rifiuta un rimborso senza penale con use_original_payment_method', () => {
  const clock = api.createClock('2026-03-01');
  const ledger = new api.CreditLedger({ clock, ids: api.createIdGenerator('cr') });
  const free = api.refundBreakdown({ rentalCents: 4500, depositCents: 5000, startDate: '2026-04-10', cancelDate: '2026-03-20' });
  assert.equal(free.feeCents, 0);
  assert.throws(() => ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: free }), { code: 'use_original_payment_method' });
  assert.equal(ledger.entries('c1').length, 0);
  const partial = api.refundBreakdown({ rentalCents: 4500, depositCents: 5000, startDate: '2026-04-10', cancelDate: '2026-04-05' });
  assert.equal(ledger.postRefund({ customerId: 'c1', bookingId: 'bk_2', breakdown: partial }).amountCents, 8150);
});

test('[CR:notify] il testo dell\'avviso per i rimborsi sul metodo originale', () => {
  const { bookings, outbox } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(10) });
  assert.equal(outbox.messages[0].body, 'Prenotazione bk_1 annullata. Nessuna penale. Rimborso di 95,00 EUR sul metodo di pagamento originale.');
  assert.equal(outbox.messages[0].body, expectedMessage(id, { feeCents: 0, refundCents: 9500, method: 'original' }));
});

test('[CR:notify] cancellationMessage distingue i due metodi', () => {
  assert.equal(
    api.cancellationMessage('bk_2', { feeCents: 0, refundCents: 2000, refundMethod: 'original' }),
    'Prenotazione bk_2 annullata. Nessuna penale. Rimborso di 20,00 EUR sul metodo di pagamento originale.',
  );
  assert.equal(api.cancellationMessage('bk_2', { feeCents: 300, refundCents: 2000 }), 'Prenotazione bk_2 annullata. Penale: 3,00 EUR. Credito accreditato: 20,00 EUR.');
});

test('[CR:event] l\'evento dichiara il metodo di rimborso', () => {
  const free = makeShop();
  const a = free.bookings.create(BASE);
  free.bookings.cancel(a.id, { on: cancelOn(8) });
  const pa = free.events.log.find((e) => e.type === 'booking.cancelled').payload;
  assert.equal(pa.refundMethod, 'original');
  assert.equal(pa.feeCents, 0);
  assert.equal(pa.refundCents, 9500);
  const late = makeShop();
  const b = late.bookings.create(BASE);
  late.bookings.cancel(b.id, { on: cancelOn(2) });
  assert.equal(late.events.log.find((e) => e.type === 'booking.cancelled').payload.refundMethod, 'credit');
});

test('[CR:wiring] con penale resta il credito e il gateway non viene toccato', () => {
  const { bookings, gateway, ledger } = makeShop();
  const { id } = bookings.create(BASE);
  const c = bookings.cancel(id, { on: cancelOn(6) });
  assert.equal(gateway.refunds.length, 0);
  assert.equal(c.cancellation.refundMethod, 'credit');
  assert.equal(ledger.balance('c1'), 8150);
});

test('[CR:wiring][ADR-005] se il rimborso sul gateway fallisce non resta nessuna traccia', () => {
  const { bookings, gateway, ledger, outbox, events } = makeShop();
  const { id } = bookings.create(BASE);
  gateway.failNextRefund();
  assert.throws(() => bookings.cancel(id, { on: cancelOn(10) }), { code: 'gateway_down' });
  assert.equal(bookings.get(id).status, 'confirmed');
  assert.equal(outbox.messages.length, 0);
  assert.equal(ledger.entries('c1').length, 0);
  assert.equal(events.log.filter((e) => e.type === 'booking.cancelled').length, 0);
  bookings.cancel(id, { on: cancelOn(10) }); // il ritentativo riesce e rimborsa una sola volta
  assert.equal(gateway.refunds.length, 1);
});

test('[CR] il confine è a 7 giorni: 7 = metodo originale, 6 = credito', () => {
  const s7 = makeShop();
  const a = s7.bookings.create(BASE);
  assert.equal(s7.bookings.cancel(a.id, { on: cancelOn(7) }).cancellation.refundMethod, 'original');
  const s6 = makeShop();
  const b = s6.bookings.create(BASE);
  assert.equal(s6.bookings.cancel(b.id, { on: cancelOn(6) }).cancellation.refundMethod, 'credit');
});

test('[CR:wiring] nessun doppio rimborso: gateway e credito non si sommano mai', () => {
  for (const days of [20, 7, 6, 3, 1, -2]) {
    const { bookings, gateway, ledger } = makeShop();
    const { id } = bookings.create(BASE);
    const c = bookings.cancel(id, { on: cancelOn(days) });
    const viaGateway = gateway.refunds.reduce((s, r) => s + r.cents, 0);
    assert.equal(viaGateway + ledger.balance('c1'), c.cancellation.refundCents, `a ${days} giorni`);
    assert.ok(viaGateway === 0 || ledger.balance('c1') === 0, `a ${days} giorni entrambi i canali`);
  }
});
