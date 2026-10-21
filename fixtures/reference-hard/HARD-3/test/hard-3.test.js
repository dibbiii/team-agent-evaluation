import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop, CUSTOMER } from './helpers.js';

test('HARD-3: rimborsi parziali successivi sommano esattamente al pagato', async () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'PEN', qty: 3 }], code: 'SAVE10' });
  await shop.orders.pay(o.id);
  const a = await shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 1 }]);
  const b = await shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 2 }]);
  assert.equal(a.amountCents + b.amountCents, shop.orders.getOrder(o.id).paidCents);
  assert.equal(shop.orders.getOrder(o.id).status, 'refunded');
});

test('HARD-3: non si rimborsa due volte la stessa riga', async () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'PEN', qty: 1 }, { sku: 'MUG', qty: 1 }] });
  await shop.orders.pay(o.id);
  await shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 1 }]);
  await assert.rejects(shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 1 }]));
});
