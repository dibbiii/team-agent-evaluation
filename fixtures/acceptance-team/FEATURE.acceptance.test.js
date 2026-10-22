// Integrazione della feature completa (specifica finale, change-request incluso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, cancelOn, expectedFee, expectedMessage, expectedPercent, makeShop, prng } from './helpers.mjs';

test('[FEATURE] percorso completo per ogni scaglione: rimborso, instradamento, avviso ed evento concordano', () => {
  const rows = [
    [20, 'original'],
    [7, 'original'],
    [6, 'credit'],
    [3, 'credit'],
    [2, 'credit'],
    [0, 'credit'],
    [-1, 'credit'],
  ];
  for (const [days, method] of rows) {
    const { bookings, gateway, ledger, outbox, events } = makeShop();
    const created = bookings.create(BASE);
    const fee = expectedFee(4500, days);
    const refund = 4500 - fee + 5000;
    const c = bookings.cancel(created.id, { on: cancelOn(days) });
    assert.equal(c.cancellation.feeCents, fee, `${days}: penale`);
    assert.equal(c.cancellation.refundCents, refund, `${days}: rimborso`);
    assert.equal(c.cancellation.refundMethod, method, `${days}: metodo`);
    assert.equal(gateway.refunds.reduce((s, r) => s + r.cents, 0), method === 'original' ? refund : 0, `${days}: gateway`);
    assert.equal(ledger.balance('c1'), method === 'credit' ? refund : 0, `${days}: credito`);
    assert.equal(outbox.messages[0].body, expectedMessage(created.id, { feeCents: fee, refundCents: refund, method }), `${days}: testo`);
    const payload = events.log.find((e) => e.type === 'booking.cancelled').payload;
    assert.deepEqual([payload.feeCents, payload.refundCents, payload.refundMethod], [fee, refund, method], `${days}: evento`);
  }
});

test('[FEATURE] proprietà su 120 prenotazioni pseudo-casuali: nessun centesimo perso o creato', () => {
  const rnd = prng(777);
  const { bookings, gateway, ledger, outbox } = makeShop({ stock: { DRILL: 500, LADDER: 500, MIXER: 500, ODD: 500 } });
  const skus = ['DRILL', 'LADDER', 'MIXER', 'ODD'];
  let paidTotal = 0;
  let feeTotal = 0;
  for (let i = 0; i < 120; i++) {
    const customerId = `c${Math.floor(rnd() * 5)}`;
    const days = 1 + Math.floor(rnd() * 9);
    const start = api.addDays('2026-06-01', Math.floor(rnd() * 20));
    const b = bookings.create({ customerId, sku: skus[Math.floor(rnd() * 4)], startDate: start, endDate: api.addDays(start, days), qty: 1 + Math.floor(rnd() * 3) });
    const before = Math.floor(rnd() * 22) - 6;
    const c = bookings.cancel(b.id, { on: api.addDays(start, -before) }).cancellation;
    assert.equal(c.feeCents, expectedFee(b.rentalCents, before), `caso ${i}`);
    assert.equal(c.feeCents + c.refundCents, b.rentalCents + b.depositCents, `caso ${i}: totale`);
    assert.equal(c.refundMethod, expectedPercent(before) === 0 ? 'original' : 'credit', `caso ${i}: metodo`);
    paidTotal += b.paidCents;
    feeTotal += c.feeCents;
  }
  const refunded = gateway.refunds.reduce((s, r) => s + r.cents, 0);
  const credited = ['c0', 'c1', 'c2', 'c3', 'c4'].reduce((s, c) => s + ledger.balance(c), 0);
  assert.equal(refunded + credited + feeTotal, paidTotal);
  assert.equal(outbox.messages.length, 120);
});

test('[FEATURE] dopo l\'annullamento le date tornano disponibili e la stessa prenotazione si può rifare', () => {
  const { bookings } = makeShop({ stock: { DRILL: 1, LADDER: 1, MIXER: 1, ODD: 1 } });
  const first = bookings.create(BASE);
  assert.throws(() => bookings.create({ ...BASE, customerId: 'c2' }), { code: 'not_available' });
  bookings.cancel(first.id, { on: cancelOn(5) });
  const again = bookings.create({ ...BASE, customerId: 'c2' });
  assert.equal(again.status, 'confirmed');
  assert.equal(bookings.list({ customerId: 'c1' })[0].status, 'cancelled');
});
