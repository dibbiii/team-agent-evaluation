import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop, CUSTOMER } from './helpers.js';

test('HARD-2: ripetere pay() dopo un timeout non addebita due volte', async () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  shop.gateway.queueFailure('timeout-after-charge');
  await assert.rejects(shop.orders.pay(o.id));
  const paid = await shop.orders.pay(o.id);
  assert.equal(paid.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
});

test('HARD-2: due pay() concorrenti addebitano una sola volta', async () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  const [a, b] = await Promise.all([shop.orders.pay(o.id), shop.orders.pay(o.id)]);
  assert.equal(a.status, 'paid');
  assert.equal(b.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
});
