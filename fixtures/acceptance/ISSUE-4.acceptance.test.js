// Held-out ISSUE-4: Cart.summary(code) restituisce il totale formattato. Dipende da ISSUE-1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app/src/cart.js';

test("summary('SAVE10') su 1995 = '17,96 EUR' (richiede il fix di ISSUE-1)", () => {
  const c = new Cart();
  c.add('A', 1995);
  assert.equal(c.summary('SAVE10'), '17,96 EUR');
});

test('summary senza codice', () => {
  const c = new Cart();
  c.add('A', 1005);
  assert.equal(c.summary(), '10,05 EUR');
});
