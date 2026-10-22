// TEAM-2: modulo di penale (policy). Tag nei nomi: [Q1] = requisito incompleto sul noleggio già iniziato, [Q2] = arrotondamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, expectedFee, expectedPercent, expectedTier, prng } from './helpers.mjs';

const START = '2026-04-10';
const at = (days, rentalCents = 10000, depositCents = 5000) => ({ rentalCents, depositCents, startDate: START, cancelDate: api.addDays(START, -days) });

test('[T2] scaglioni sui confini: 7, 6, 3, 2 e 0 giorni di anticipo', () => {
  const rows = [
    [7, 'free', 0, 0],
    [6, 'partial', 30, 3000],
    [3, 'partial', 30, 3000],
    [2, 'late', 70, 7000],
    [0, 'late', 70, 7000],
  ];
  for (const [days, tier, percent, fee] of rows) {
    const r = api.cancellationFee(at(days));
    assert.equal(r.tier, tier, `tier a ${days} giorni`);
    assert.equal(r.percent, percent, `percent a ${days} giorni`);
    assert.equal(r.feeCents, fee, `penale a ${days} giorni`);
    assert.equal(r.daysBefore, days);
  }
});

test('[T2] molto in anticipo la penale è zero', () => {
  const r = api.cancellationFee(at(90));
  assert.deepEqual([r.tier, r.feeCents], ['free', 0]);
});

test('[T2][Q1] cancellazione a noleggio già iniziato: penale 100% della tariffa e deposito restituito', () => {
  for (const after of [1, 2, 30]) {
    const b = api.refundBreakdown({ rentalCents: 10000, depositCents: 5000, startDate: START, cancelDate: api.addDays(START, after) });
    assert.equal(b.tier, 'started', `tier ${after} giorni dopo l'inizio`);
    assert.equal(b.percent, 100);
    assert.equal(b.feeCents, 10000);
    assert.equal(b.refundCents, 5000);
  }
});

test('[T2][Q2] la penale si arrotonda per eccesso al centesimo', () => {
  // 30% di 1001 = 300,3 -> 301 (non 300); 70% di 2002 = 1401,4 -> 1402; 70% di 3003 = 2102,1 -> 2103
  assert.equal(api.cancellationFee({ rentalCents: 1001, startDate: START, cancelDate: api.addDays(START, -5) }).feeCents, 301);
  assert.equal(api.cancellationFee({ rentalCents: 2002, startDate: START, cancelDate: api.addDays(START, -1) }).feeCents, 1402);
  assert.equal(api.cancellationFee({ rentalCents: 3003, startDate: START, cancelDate: api.addDays(START, -1) }).feeCents, 2103);
  // i casi esatti restano esatti
  assert.equal(api.cancellationFee({ rentalCents: 1000, startDate: START, cancelDate: api.addDays(START, -5) }).feeCents, 300);
});

test('[T2] refundBreakdown: campi e coerenza del rimborso', () => {
  const b = api.refundBreakdown(at(5, 4500, 5000));
  for (const [k, v] of Object.entries({ rentalCents: 4500, depositCents: 5000, feeCents: 1350, refundCents: 8150, percent: 30, tier: 'partial', daysBefore: 5 })) assert.equal(b[k], v, k);
});

test('[T2] proprietà su 300 casi pseudo-casuali: penale e rimborso coerenti con il modello', () => {
  const rnd = prng(20260501);
  let lastDays = null;
  for (let i = 0; i < 300; i++) {
    const rental = Math.floor(rnd() * 50000) + 1;
    const deposit = Math.floor(rnd() * 8000);
    const days = Math.floor(rnd() * 25) - 8;
    const b = api.refundBreakdown(at(days, rental, deposit));
    assert.equal(b.feeCents, expectedFee(rental, days), `caso ${i}: penale`);
    assert.equal(b.percent, expectedPercent(days));
    assert.equal(b.tier, expectedTier(days));
    assert.equal(b.refundCents, rental - b.feeCents + deposit);
    assert.ok(b.feeCents >= 0 && b.feeCents <= rental);
    assert.doesNotThrow(() => api.assertBreakdown(b));
    lastDays = days;
  }
  assert.notEqual(lastDays, null);
});

test('[T2] la penale non diminuisce al ridursi dell\'anticipo', () => {
  let prev = -1;
  for (let days = 12; days >= -3; days--) {
    const fee = api.cancellationFee(at(days, 7777)).feeCents;
    assert.ok(fee >= prev, `a ${days} giorni la penale ${fee} è minore di ${prev}`);
    prev = fee;
  }
});

test('[T2] assertBreakdown accetta il valido e rifiuta l\'incoerente con invalid_breakdown', () => {
  const ok = { rentalCents: 1000, depositCents: 200, feeCents: 300, refundCents: 900 };
  assert.doesNotThrow(() => api.assertBreakdown(ok));
  const bads = [
    { ...ok, refundCents: 901 },
    { ...ok, feeCents: 1001, refundCents: 199 },
    { ...ok, feeCents: -1, refundCents: 1201 },
    { ...ok, depositCents: -200, refundCents: 500 },
    { ...ok, feeCents: 300.5 },
    { ...ok, rentalCents: '1000' },
    null,
  ];
  for (const bad of bads) assert.throws(() => api.assertBreakdown(bad), { code: 'invalid_breakdown' }, JSON.stringify(bad));
});

test('[T2] input non validi: date e importi', () => {
  assert.throws(() => api.cancellationFee({ rentalCents: 1000, startDate: START, cancelDate: '2026-13-01' }), { code: 'invalid_date' });
  assert.throws(() => api.cancellationFee({ rentalCents: 10.5, startDate: START, cancelDate: START }), { code: 'invalid_amount' });
});
