import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop, CUSTOMER } from './helpers.js';

const one = (shop, extra = {}) =>
  shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], ...extra });

test('createOrder: totali di una riga singola e prenotazione scorte', () => {
  const shop = makeShop();
  const o = one(shop);
  assert.equal(o.status, 'created');
  assert.deepEqual(o.totals, { subtotalCents: 1250, discountCents: 0, taxCents: 275, totalCents: 1525 });
  assert.equal(shop.inventory.available('MUG'), 49);
});

test('createOrder rifiuta sku sconosciuto, carrello vuoto, cliente non valido', () => {
  const shop = makeShop();
  assert.throws(() => shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'ZZZ', qty: 1 }] }), /Unknown product/);
  assert.throws(() => shop.orders.createOrder({ customer: CUSTOMER, items: [] }), /at least one item/);
  assert.throws(() => shop.orders.createOrder({ customer: { id: 'x', name: 'A', email: 'nope' }, items: [{ sku: 'MUG', qty: 1 }] }), /Invalid email/);
});

test('createOrder non prenota nulla se le scorte non bastano', () => {
  const shop = makeShop({ stock: { MUG: 1, TEA: 0, BOOK: 0, PEN: 0 } });
  assert.throws(() => shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }, { sku: 'TEA', qty: 1 }] }), /Insufficient stock/);
  assert.equal(shop.inventory.available('MUG'), 1);
});

test('getOrder restituisce una copia', () => {
  const shop = makeShop();
  const o = one(shop);
  o.status = 'delivered';
  assert.equal(shop.orders.getOrder(o.id).status, 'created');
});

test('pay: addebita il totale e porta a paid', async () => {
  const shop = makeShop();
  const o = one(shop);
  const paid = await shop.orders.pay(o.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.paidCents, 1525);
  assert.equal(shop.gateway.captures.length, 1);
  assert.equal(shop.gateway.captures[0].currency, 'EUR');
  assert.equal(shop.gateway.captures[0].amountCents, 1525);
});

test('pay con carta rifiutata lascia l ordine created', async () => {
  const shop = makeShop();
  const o = one(shop);
  shop.gateway.queueFailure('decline');
  await assert.rejects(shop.orders.pay(o.id), (e) => e.code === 'card_declined');
  assert.equal(shop.orders.getOrder(o.id).status, 'created');
  assert.equal(shop.gateway.captures.length, 0);
});

test('ship scarica la giacenza e deliver chiude il ciclo', async () => {
  const shop = makeShop();
  const o = one(shop);
  await shop.orders.pay(o.id);
  shop.orders.ship(o.id);
  assert.equal(shop.inventory.onHand('MUG'), 49);
  assert.equal(shop.orders.deliver(o.id).status, 'delivered');
});

test('transizioni non valide lanciano', async () => {
  const shop = makeShop();
  const o = one(shop);
  assert.throws(() => shop.orders.ship(o.id), /Invalid transition/);
  await shop.orders.pay(o.id);
  assert.throws(() => shop.orders.deliver(o.id), /Invalid transition/);
});

test('cancel di un ordine created rilascia le scorte', async () => {
  const shop = makeShop();
  const o = one(shop);
  const c = await shop.orders.cancel(o.id);
  assert.equal(c.status, 'cancelled');
  assert.equal(shop.inventory.available('MUG'), 50);
  await assert.rejects(shop.orders.pay(o.id), /Cannot pay/);
});

test('cancel di un ordine pagato rimborsa tutto', async () => {
  const shop = makeShop();
  const o = one(shop);
  await shop.orders.pay(o.id);
  const c = await shop.orders.cancel(o.id);
  assert.equal(c.refundedCents, 1525);
  assert.equal(shop.gateway.refunds.length, 1);
});

test('refund totale dopo la spedizione', async () => {
  const shop = makeShop();
  const o = one(shop);
  await shop.orders.pay(o.id);
  shop.orders.ship(o.id);
  const r = await shop.orders.refund(o.id);
  assert.equal(r.status, 'refunded');
  assert.equal(r.refundedCents, 1525);
  await assert.rejects(shop.orders.refund(o.id), /Cannot refund/);
});

test('refund di un ordine non pagato lancia', async () => {
  const shop = makeShop();
  const o = one(shop);
  await assert.rejects(shop.orders.refund(o.id), /Cannot refund/);
});

test('eventi emessi nell ordine del ciclo di vita', async () => {
  const shop = makeShop();
  const seen = [];
  for (const t of ['order.created', 'order.paid', 'order.shipped', 'order.delivered']) {
    shop.events.on(t, (p) => seen.push([t, p.orderId]));
  }
  const o = one(shop);
  await shop.orders.pay(o.id);
  shop.orders.ship(o.id);
  shop.orders.deliver(o.id);
  assert.deepEqual(seen.map((s) => s[0]), ['order.created', 'order.paid', 'order.shipped', 'order.delivered']);
  assert.ok(seen.every((s) => s[1] === o.id));
});

test('la storia usa l orologio iniettato', async () => {
  const shop = makeShop();
  const o = one(shop);
  await shop.orders.pay(o.id);
  const h = shop.orders.getOrder(o.id).history;
  assert.deepEqual(h.map((x) => x.status), ['created', 'paid']);
  assert.equal(h[0].at, '2026-03-01T10:00:00.000Z');
});

test('la fattura di una riga coincide con il totale ordine', () => {
  const shop = makeShop();
  const o = one(shop);
  const inv = shop.orders.invoice(o.id);
  assert.equal(inv.totalCents, o.totals.totalCents);
  assert.equal(inv.lines.length, 1);
});
