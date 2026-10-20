import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../src/cart.js';
import { formatEuro } from '../src/format.js';

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

test('total con codice sconosciuto lancia errore', () => {
  const c = new Cart();
  c.add('A', 100);
  assert.throws(() => c.total('NOPE'), /Unknown discount code/);
});

test('total senza codice è il subtotale', () => {
  const c = new Cart();
  c.add('A', 999);
  assert.equal(c.total(), 999);
});

test('formatEuro', () => {
  assert.equal(formatEuro(1796), '17,96 EUR');
  assert.equal(formatEuro(5), '0,05 EUR');
});
