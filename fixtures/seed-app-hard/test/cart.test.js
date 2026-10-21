import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../src/cart.js';

test('subtotal somma prezzo per quantità', () => {
  const c = new Cart();
  c.add('A', 1000, 2);
  c.add('B', 250);
  assert.equal(c.subtotal(), 2250);
});

test('add dello stesso sku accumula la quantità', () => {
  const c = new Cart();
  c.add('A', 100);
  c.add('A', 100, 2);
  assert.equal(c.items[0].qty, 3);
});

test('items restituisce copie', () => {
  const c = new Cart();
  c.add('A', 100);
  c.items[0].qty = 50;
  assert.equal(c.items[0].qty, 1);
});

test('remove elimina la riga', () => {
  const c = new Cart();
  c.add('A', 100);
  c.add('B', 100);
  c.remove('A');
  assert.deepEqual(c.items.map((i) => i.sku), ['B']);
});

test('prezzo o quantità non validi lanciano', () => {
  const c = new Cart();
  assert.throws(() => c.add('A', -1), /Invalid price/);
  assert.throws(() => c.add('A', 1.5), /Invalid price/);
  assert.throws(() => c.add('A', 100, 0), /Invalid quantity/);
});

test('total storico: sconto da codice, senza IVA', () => {
  const c = new Cart();
  c.add('A', 40000);
  assert.equal(c.total('SAVE25'), 30000);
  assert.equal(c.total(), 40000);
  assert.throws(() => c.total('NOPE'), /Unknown discount code/);
});

test('summary riga singola con IVA standard', () => {
  const c = new Cart();
  c.add('MUG', 1250);
  const s = c.summary({ country: 'IT' });
  assert.equal(s.taxCents, 275);
  assert.equal(s.totalCents, 1525);
  assert.equal(s.discount.kind, 'none');
});

test('summary usa l aliquota della categoria', () => {
  const c = new Cart();
  c.add('TEA', 990, 1, 'reduced');
  assert.equal(c.summary({ country: 'IT' }).taxCents, 99);
  assert.equal(c.summary({ country: 'DE' }).taxCents, 69); // 69,3 -> 69
});

test('summary ripartisce lo sconto sulle righe: la somma è lo sconto', () => {
  const c = new Cart();
  c.add('A', 1000);
  c.add('B', 333, 3);
  c.add('C', 1);
  const s = c.summary({ code: 'SAVE10' });
  assert.equal(s.lines.reduce((x, l) => x + l.discountCents, 0), s.discountCents);
  assert.equal(s.lines.every((l) => l.taxableCents === l.netCents - l.discountCents), true);
});

test('summary applica lo sconto fedeltà quando conviene', () => {
  const c = new Cart();
  c.add('A', 10000);
  const s = c.summary({ customer: { tier: 'gold' } });
  assert.equal(s.discount.kind, 'loyalty');
  assert.equal(s.discountCents, 500);
});

test('summary rifiuta un paese sconosciuto', () => {
  const c = new Cart();
  c.add('A', 100);
  assert.throws(() => c.summary({ country: 'XX' }), /Unknown country/);
});
