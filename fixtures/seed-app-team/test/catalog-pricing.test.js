import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Catalog, quote } from '../src/index.js';
import { ITEMS } from './helpers.js';

test('il catalogo restituisce copie e rifiuta duplicati e sku sconosciuti', () => {
  const catalog = new Catalog(ITEMS);
  const drill = catalog.get('DRILL');
  drill.dailyRateCents = 1;
  assert.equal(catalog.get('DRILL').dailyRateCents, 1500);
  assert.throws(() => catalog.get('NOPE'), { code: 'unknown_sku' });
  assert.throws(() => catalog.add(ITEMS[0]), { code: 'duplicate_sku' });
  assert.equal(catalog.list().length, 3);
});

test('il catalogo rifiuta tariffe non intere', () => {
  assert.throws(() => new Catalog([{ sku: 'X', name: 'X', dailyRateCents: 10.5 }]), { code: 'invalid_amount' });
});

test('quote: tariffa per i giorni, deposito a parte', () => {
  const q = quote({ item: ITEMS[0], startDate: '2026-03-10', endDate: '2026-03-13' });
  assert.deepEqual(q, { days: 3, rentalCents: 4500, depositCents: 5000, totalCents: 9500 });
});

test('quote: la quantità moltiplica tariffa e deposito', () => {
  const q = quote({ item: ITEMS[1], startDate: '2026-03-10', endDate: '2026-03-12', qty: 2 });
  assert.deepEqual(q, { days: 2, rentalCents: 3200, depositCents: 4000, totalCents: 7200 });
});

test('quote: sconto settimanale del 10% da 7 giorni, half-up', () => {
  const q = quote({ item: ITEMS[0], startDate: '2026-03-10', endDate: '2026-03-17' });
  assert.equal(q.days, 7);
  assert.equal(q.rentalCents, 9450); // 10500 - 1050
  const odd = quote({ item: { sku: 'X', name: 'X', dailyRateCents: 1005, depositCents: 0 }, startDate: '2026-03-10', endDate: '2026-03-17' });
  assert.equal(odd.rentalCents, 6331); // 7035 - pct(7035,10)=704 (703,5 half-up)
});

test('quote: periodo o quantità non validi', () => {
  assert.throws(() => quote({ item: ITEMS[0], startDate: '2026-03-10', endDate: '2026-03-10' }), { code: 'invalid_period' });
  assert.throws(() => quote({ item: ITEMS[0], startDate: '2026-03-10', endDate: '2026-03-12', qty: 0 }), { code: 'invalid_quantity' });
});
