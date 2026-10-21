import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../src/cart.js';
import { makeShop, CUSTOMER } from './helpers.js';

test('HARD-1: il riepilogo del carrello coincide con la somma delle righe (3 righe da 0,75 EUR al 22%)', () => {
  const c = new Cart();
  for (const sku of ['A', 'B', 'C']) c.add(sku, 75);
  const s = c.summary({ country: 'IT' });
  assert.equal(s.taxCents, 48);
  assert.equal(s.totalCents, 273);
});

test('HARD-1: ordine, fattura e carrello concordano', () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'PEN', qty: 1 }, { sku: 'MUG', qty: 1 }] });
  assert.equal(o.totals.totalCents, shop.orders.invoice(o.id).totalCents);
});
