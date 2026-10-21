import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAuditLog, registerLowStockAlert, ordersByStatus, topCustomers } from '../src/index.js';
import { makeShop, CUSTOMER } from './helpers.js';

test('registerAuditLog registra gli eventi e si disiscrive', async () => {
  const shop = makeShop();
  const log = [];
  const stop = registerAuditLog(shop.events, (e) => log.push(e.type));
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  await shop.orders.pay(o.id);
  stop();
  shop.orders.ship(o.id);
  assert.deepEqual(log, ['order.created', 'order.paid']);
});

test('registerLowStockAlert avvisa sotto soglia dopo la spedizione', async () => {
  const shop = makeShop({ stock: { MUG: 6, TEA: 0, BOOK: 0, PEN: 0 } });
  const alerts = [];
  registerLowStockAlert(shop.events, { orders: shop.orders, inventory: shop.inventory, threshold: 5, notify: (a) => alerts.push(a) });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 2 }] });
  await shop.orders.pay(o.id);
  shop.orders.ship(o.id);
  assert.deepEqual(alerts, [{ sku: 'MUG', left: 4 }]);
});

test('ordersByStatus e topCustomers', async () => {
  const shop = makeShop();
  const a = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  shop.orders.createOrder({ customer: { ...CUSTOMER, id: 'c2' }, items: [{ sku: 'PEN', qty: 1 }] });
  await shop.orders.pay(a.id);
  const all = shop.orders.listOrders();
  assert.deepEqual(ordersByStatus(all), [{ status: 'created', count: 1 }, { status: 'paid', count: 1 }]);
  assert.deepEqual(topCustomers(all), [{ customerId: 'c1', spentCents: 1525 }]);
});
