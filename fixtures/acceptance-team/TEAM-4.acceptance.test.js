// TEAM-4: registro del credito (CreditLedger, REQ-3). Dipende da TEAM-2 (assertBreakdown/refundBreakdown).
// [ADR-004] = invariante della decisione approvata: il credito non scade mai. Passa sul seed? No (il modulo non esiste); fallisce se si implementa la scadenza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.mjs';

const make = (today = '2026-03-01') => {
  const clock = api.createClock(today);
  return { clock, ledger: new api.CreditLedger({ clock, ids: api.createIdGenerator('cr') }) };
};
const breakdown = (rental, deposit, daysBefore = 5) =>
  api.refundBreakdown({ rentalCents: rental, depositCents: deposit, startDate: '2026-04-10', cancelDate: api.addDays('2026-04-10', -daysBefore) });

test('[T4] postRefund registra una voce con i campi del contratto', () => {
  const { ledger } = make('2026-03-05');
  const entry = ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  // Si controllano i campi del contratto uno per uno: eventuali campi in più non sono un errore.
  assert.equal(entry.id, 'cr_1');
  assert.equal(entry.customerId, 'c1');
  assert.equal(entry.bookingId, 'bk_1');
  assert.equal(entry.kind, 'refund');
  assert.equal(entry.amountCents, 12000);
  assert.equal(entry.postedOn, '2026-03-05');
});

test('[T4] il saldo somma le voci del cliente e tiene separati i clienti', () => {
  const { ledger } = make();
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_2', breakdown: breakdown(4500, 5000) });
  ledger.postRefund({ customerId: 'c2', bookingId: 'bk_3', breakdown: breakdown(1000, 0) });
  assert.equal(ledger.balance('c1'), 12000 + 8150);
  assert.equal(ledger.balance('c2'), 700);
  assert.equal(ledger.balance('nessuno'), 0);
});

test('[T4] postRefund è idempotente per prenotazione', () => {
  const { ledger } = make();
  const a = ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  const b = ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  assert.equal(b.id, a.id);
  assert.equal(ledger.entries('c1').length, 1);
  assert.equal(ledger.balance('c1'), 12000);
});

test('[T4] rimborso zero: nessuna voce e risultato null', () => {
  const { ledger } = make();
  const zero = breakdown(1000, 0, -1); // noleggio già iniziato, nessun deposito: penale 100%, rimborso 0
  assert.equal(zero.refundCents, 0);
  assert.equal(ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: zero }), null);
  assert.equal(ledger.entries('c1').length, 0);
  assert.equal(ledger.balance('c1'), 0);
});

test('[T4] un breakdown incoerente è rifiutato con invalid_breakdown e non lascia voci', () => {
  const { ledger } = make();
  const good = breakdown(10000, 5000);
  for (const bad of [{ ...good, refundCents: good.refundCents + 1 }, { ...good, feeCents: -5 }, { ...good, feeCents: 99999 }, { ...good, depositCents: 1.5 }]) {
    assert.throws(() => ledger.postRefund({ customerId: 'c1', bookingId: 'bk_9', breakdown: bad }), { code: 'invalid_breakdown' });
  }
  assert.equal(ledger.entries('c1').length, 0);
});

test('[T4][ADR-004] il credito non scade mai: stesso saldo a 90, 91, 400 e 5000 giorni dopo', () => {
  const { ledger, clock } = make('2026-03-01');
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  const expected = 12000;
  for (const date of ['2026-05-30', '2026-05-31', '2026-06-01', '2027-04-05', '2040-01-01']) {
    clock.set(date);
    assert.equal(ledger.balance('c1'), expected, `saldo al ${date}`);
    assert.equal(ledger.balance('c1', { on: date }), expected, `saldo con on=${date}`);
  }
  assert.equal(ledger.entries('c1').length, 1);
});

test('[T4][ADR-004] il saldo con `on` molto futuro non perde nessuna voce', () => {
  const { ledger } = make('2026-03-01');
  for (let i = 1; i <= 4; i++) ledger.postRefund({ customerId: 'c1', bookingId: `bk_${i}`, breakdown: breakdown(1000 * i, 100) });
  assert.equal(ledger.balance('c1', { on: '2099-12-31' }), ledger.entries('c1').reduce((s, e) => s + e.amountCents, 0));
});

test('[T4] entries restituisce copie in ordine di registrazione', () => {
  const { ledger } = make();
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_1', breakdown: breakdown(10000, 5000) });
  ledger.postRefund({ customerId: 'c1', bookingId: 'bk_2', breakdown: breakdown(4500, 5000) });
  const list = ledger.entries('c1');
  assert.deepEqual(list.map((e) => e.bookingId), ['bk_1', 'bk_2']);
  list[0].amountCents = 1;
  assert.equal(ledger.balance('c1'), 12000 + 8150);
});
