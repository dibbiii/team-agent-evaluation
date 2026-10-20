// Held-out ISSUE-6: quantità massima 99 per sku; formatLimitError in format.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app/src/cart.js';
import { formatLimitError } from '../seed-app/src/format.js';

test('add oltre 99 totali per sku lancia errore', () => {
  const c = new Cart();
  c.add('A', 100, 99);
  assert.throws(() => c.add('A', 100, 1));
  assert.equal(c.items[0].qty, 99, 'lo stato non cambia dopo il rifiuto');
});

test('add singolo oltre 99 lancia errore', () => {
  assert.throws(() => new Cart().add('A', 100, 100));
});

test('99 pezzi sono ammessi', () => {
  const c = new Cart();
  c.add('A', 100, 99);
  assert.equal(c.subtotal(), 9900);
});

test("formatLimitError('A', 99)", () => {
  assert.equal(formatLimitError('A', 99), 'A: massimo 99 pezzi');
});
