// Held-out HARD-2: nessun doppio addebito dopo un timeout, né con richieste concorrenti (ADR-004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop, CUSTOMER } from './helpers.mjs';

function setup() {
  const shop = makeShop();
  const paidEvents = [];
  shop.events.on('order.paid', (p) => paidEvents.push(p.orderId));
  const create = (sku = 'MUG', qty = 1) => shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku, qty }] });
  return { shop, paidEvents, create };
}

test('timeout dopo l addebito: la richiesta ripetuta non addebita di nuovo', async () => {
  const { shop, paidEvents, create } = setup();
  const o = create();
  shop.gateway.queueFailure('timeout-after-charge');
  await shop.orders.pay(o.id).catch(() => {});
  const result = await shop.orders.pay(o.id);
  assert.equal(result.status, 'paid');
  assert.equal(result.paidCents, o.totals.totalCents);
  assert.equal(shop.gateway.captures.length, 1);
  assert.equal(shop.gateway.captures[0].amountCents, o.totals.totalCents);
  assert.equal(paidEvents.length, 1);
  assert.equal(shop.orders.getOrder(o.id).status, 'paid');
});

test('più timeout consecutivi e poi successo: sempre un solo addebito', async () => {
  const { shop, create } = setup();
  const o = create();
  shop.gateway.queueFailure('timeout-after-charge');
  await shop.orders.pay(o.id).catch(() => {});
  shop.gateway.queueFailure('timeout-before-charge');
  await shop.orders.pay(o.id).catch(() => {});
  await shop.orders.pay(o.id).catch(() => {});
  const final = await shop.orders.pay(o.id);
  assert.equal(final.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
});

test('la idempotency key è stabile per ordine e diversa fra ordini', async () => {
  const { shop, create } = setup();
  const a = create();
  const b = create('TEA');
  shop.gateway.queueFailure('timeout-after-charge');
  await shop.orders.pay(a.id).catch(() => {});
  await shop.orders.pay(a.id).catch(() => {});
  await shop.orders.pay(b.id);
  const keys = (id) => new Set(shop.gateway.calls.filter((c) => c.op === 'charge' && c.orderId === id).map((c) => c.idempotencyKey));
  assert.equal(keys(a.id).size, 1);
  assert.equal(keys(b.id).size, 1);
  assert.notEqual([...keys(a.id)][0], [...keys(b.id)][0]);
});

test('due pay() concorrenti: un solo addebito, un solo evento, entrambe risolvono con l ordine pagato', async () => {
  const { shop, paidEvents, create } = setup();
  const o = create();
  const [x, y] = await Promise.all([shop.orders.pay(o.id), shop.orders.pay(o.id)]);
  assert.equal(x.status, 'paid');
  assert.equal(y.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
  assert.equal(paidEvents.length, 1);
  assert.equal(shop.orders.getOrder(o.id).history.filter((h) => h.status === 'paid').length, 1);
});

test('molte pay() concorrenti sullo stesso ordine e ordini diversi in parallelo', async () => {
  const { shop, paidEvents, create } = setup();
  const a = create();
  const b = create('BOOK');
  const results = await Promise.all([a, a, a, b, b].map((o) => shop.orders.pay(o.id)));
  assert.ok(results.every((r) => r.status === 'paid'));
  assert.equal(shop.gateway.captures.length, 2);
  assert.deepEqual([...paidEvents].sort(), [a.id, b.id].sort());
});

test('concorrenza con timeout: dopo l assestamento una nuova pay() chiude senza altri addebiti', async () => {
  const { shop, paidEvents, create } = setup();
  const o = create();
  shop.gateway.queueFailure('timeout-after-charge');
  await Promise.allSettled([shop.orders.pay(o.id), shop.orders.pay(o.id)]);
  const final = await shop.orders.pay(o.id);
  assert.equal(final.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
  assert.equal(paidEvents.length, 1);
});

test('pay() su ordine già pagato non chiama il gateway', async () => {
  const { shop, create } = setup();
  const o = create();
  await shop.orders.pay(o.id);
  const before = shop.gateway.calls.length;
  const again = await shop.orders.pay(o.id);
  assert.equal(again.status, 'paid');
  assert.equal(shop.gateway.calls.length, before);
});

test('carta rifiutata: l ordine resta pagabile e il retry riesce con un solo addebito', async () => {
  const { shop, paidEvents, create } = setup();
  const o = create();
  shop.gateway.queueFailure('decline');
  await assert.rejects(shop.orders.pay(o.id), (e) => e.code === 'card_declined');
  assert.equal(shop.orders.getOrder(o.id).status, 'created');
  const ok = await shop.orders.pay(o.id);
  assert.equal(ok.status, 'paid');
  assert.equal(shop.gateway.captures.length, 1);
  assert.equal(paidEvents.length, 1);
});

test('un ordine annullato non è pagabile', async () => {
  const { shop, create } = setup();
  const o = create();
  await shop.orders.cancel(o.id);
  await assert.rejects(shop.orders.pay(o.id));
  assert.equal(shop.gateway.captures.length, 0);
});
