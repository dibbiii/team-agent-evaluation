// TEAM-6: avviso al cliente in outbox (REQ-5, ADR-003). Dipende da TEAM-3. Non dipende dal ledger.
// Solo scaglioni con penale > 0: il testo per i rimborsi sul metodo originale è oggetto del change-request (TEAM-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, cancelOn, expectedMessage, makeShop } from './helpers.mjs';

test('[T6] il testo dell\'avviso è quello del requisito', () => {
  const { bookings, outbox } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(5) });
  assert.equal(outbox.messages.length, 1);
  assert.equal(outbox.messages[0].body, 'Prenotazione bk_1 annullata. Penale: 13,50 EUR. Credito accreditato: 81,50 EUR.');
  assert.equal(outbox.messages[0].body, expectedMessage(id, { feeCents: 1350, refundCents: 8150 }));
});

test('[T6] destinatario, oggetto, chiave di deduplica e stato', () => {
  const { bookings, outbox } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(1) });
  const m = outbox.pending()[0];
  assert.equal(m.to, 'c1');
  assert.equal(m.subject, 'Prenotazione annullata');
  assert.equal(m.dedupeKey, `cancel:${id}`);
  assert.equal(m.status, 'pending');
});

test('[T6][ADR-003] l\'avviso è in outbox anche senza alcun listener sul bus di eventi', () => {
  const { bookings, outbox, events } = makeShop();
  const { id } = bookings.create(BASE);
  bookings.cancel(id, { on: cancelOn(4) });
  assert.equal(events.errors.length, 0);
  assert.equal(outbox.pending().length, 1);
});

test('[T6] penale 100% e importi con centesimi dispari', () => {
  const { bookings, outbox } = makeShop();
  const a = bookings.create(BASE);
  bookings.cancel(a.id, { on: cancelOn(-1) });
  assert.equal(outbox.messages[0].body, `Prenotazione ${a.id} annullata. Penale: 45,00 EUR. Credito accreditato: 50,00 EUR.`);
  const b = bookings.create({ ...BASE, sku: 'ODD' }); // noleggio 3003, deposito 333
  bookings.cancel(b.id, { on: cancelOn(1) }); // 70% -> 2103, rimborso 3003 - 2103 + 333 = 1233
  assert.equal(outbox.messages[1].body, `Prenotazione ${b.id} annullata. Penale: 21,03 EUR. Credito accreditato: 12,33 EUR.`);
});

test('[T6] nessun avviso se l\'annullamento fallisce', () => {
  const { bookings, outbox } = makeShop();
  assert.throws(() => bookings.cancel('nope'), { code: 'not_found' });
  const { id } = bookings.create(BASE);
  assert.throws(() => bookings.cancel(id, { on: '2026-99-99' }), { code: 'invalid_date' });
  assert.equal(outbox.messages.length, 0);
  bookings.cancel(id, { on: cancelOn(5) });
  assert.throws(() => bookings.cancel(id, { on: cancelOn(5) }), { code: 'already_cancelled' });
  assert.equal(outbox.messages.length, 1);
});

test('[T6] cancellationMessage è esportata dal pacchetto', () => {
  assert.equal(api.cancellationMessage('bk_9', { feeCents: 5, refundCents: 1005 }), 'Prenotazione bk_9 annullata. Penale: 0,05 EUR. Credito accreditato: 10,05 EUR.');
});

test('[T6] un annullamento per ogni prenotazione: un avviso ciascuna', () => {
  const { bookings, outbox } = makeShop();
  const ids = [1, 2, 3].map(() => bookings.create(BASE).id);
  for (const id of ids) bookings.cancel(id, { on: cancelOn(2) });
  assert.deepEqual(outbox.messages.map((m) => m.dedupeKey), ids.map((id) => `cancel:${id}`));
});
