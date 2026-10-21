// Held-out HARD-3: rimborsi parziali per righe (richiede la correzione di HARD-1: totale ordine = somma delle righe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShop, CUSTOMER } from './helpers.mjs';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function paid(shop, items, extra = {}) {
  const o = shop.orders.createOrder({ customer: CUSTOMER, items, ...extra });
  await shop.orders.pay(o.id);
  return o;
}

// |amount - gross*qty/ordered| <= 1 centesimo, in aritmetica intera.
const withinOneCent = (amount, gross, qty, ordered) => Math.abs(amount * ordered - gross * qty) <= ordered;

test('rimborsi successivi di un ordine scontato: ogni quota è proporzionale e la somma è esattamente il pagato', async () => {
  const shop = makeShop();
  const events = [];
  shop.events.on('order.items_refunded', (p) => events.push(p));
  const o = await paid(
    shop,
    [{ sku: 'MUG', qty: 2 }, { sku: 'TEA', qty: 3 }, { sku: 'PEN', qty: 3 }, { sku: 'BOOK', qty: 1 }],
    { code: 'SAVE10' },
  );
  const order = shop.orders.getOrder(o.id);
  const inv = shop.orders.invoice(o.id);
  assert.equal(order.paidCents, inv.totalCents, 'prerequisito: pagato = totale fattura (HARD-1)');
  const gross = Object.fromEntries(inv.lines.map((l) => [l.sku, l.grossCents]));
  const ordered = Object.fromEntries(order.lines.map((l) => [l.sku, l.qty]));

  const steps = [
    [{ sku: 'PEN', qty: 1 }],
    [{ sku: 'MUG', qty: 1 }, { sku: 'TEA', qty: 2 }],
    [{ sku: 'PEN', qty: 1 }],
    [{ sku: 'TEA', qty: 1 }, { sku: 'BOOK', qty: 1 }],
    [{ sku: 'MUG', qty: 1 }],
    [{ sku: 'PEN', qty: 1 }],
  ];
  const refunds = [];
  for (let i = 0; i < steps.length; i++) {
    const r = await shop.orders.refundItems(o.id, steps[i]);
    refunds.push(r);
    assert.ok(Number.isInteger(r.amountCents) && r.amountCents > 0);
    assert.equal(r.amountCents, r.netCents + r.taxCents);
    assert.equal(r.amountCents, sum(r.lines.map((l) => l.amountCents)));
    for (const l of r.lines) {
      assert.ok(withinOneCent(l.amountCents, gross[l.sku], l.qty, ordered[l.sku]), `${l.sku}: quota non proporzionale`);
      assert.equal(l.amountCents, l.netCents + l.taxCents);
    }
    const now = shop.orders.getOrder(o.id);
    assert.equal(now.refundedCents, sum(refunds.map((x) => x.amountCents)));
    assert.equal(now.status, i < steps.length - 1 ? 'paid' : 'refunded');
  }
  assert.equal(sum(refunds.map((r) => r.amountCents)), order.paidCents, 'la somma dei rimborsi è il pagato');
  assert.equal(sum(refunds.map((r) => r.taxCents)), inv.taxCents, 'IVA rimborsata = IVA fatturata');
  assert.equal(sum(refunds.map((r) => r.netCents)), inv.netCents);
  assert.deepEqual(shop.gateway.refunds.map((r) => r.amountCents), refunds.map((r) => r.amountCents));
  assert.equal(events.length, steps.length);
  assert.deepEqual(events.map((e) => e.amountCents), refunds.map((r) => r.amountCents));
  assert.ok(events.every((e) => e.orderId === o.id));
});

test('tre righe da 0,75 EUR: rimborsando una riga alla volta il totale pagato è restituito al centesimo', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'P1', qty: 1 }, { sku: 'P2', qty: 1 }, { sku: 'P3', qty: 1 }]);
  const a = await shop.orders.refundItems(o.id, [{ sku: 'P1', qty: 1 }]);
  const b = await shop.orders.refundItems(o.id, [{ sku: 'P2', qty: 1 }]);
  const c = await shop.orders.refundItems(o.id, [{ sku: 'P3', qty: 1 }]);
  assert.equal(a.amountCents + b.amountCents + c.amountCents, 273);
  assert.equal(shop.orders.getOrder(o.id).refundedCents, 273);
  assert.equal(shop.orders.getOrder(o.id).status, 'refunded');
});

test('lo sconto è ripartito: rimborsare una riga di un ordine scontato non restituisce il prezzo pieno', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 1 }, { sku: 'BOOK', qty: 1 }], { code: 'SAVE25' });
  const inv = shop.orders.invoice(o.id);
  const r = await shop.orders.refundItems(o.id, [{ sku: 'BOOK', qty: 1 }]);
  const line = inv.lines.find((l) => l.sku === 'BOOK');
  assert.equal(r.amountCents, line.grossCents);
  assert.ok(r.amountCents < 2000 + 80, 'inferiore al prezzo pieno IVA inclusa');
});

test('la stessa riga non si rimborsa due volte (anche con voci duplicate nella stessa richiesta)', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'PEN', qty: 3 }, { sku: 'MUG', qty: 1 }]);
  await assert.rejects(shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 2 }, { sku: 'PEN', qty: 2 }]));
  assert.equal(shop.gateway.refunds.length, 0);
  assert.equal(shop.orders.getOrder(o.id).refundedCents, 0);

  await shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 1 }, { sku: 'PEN', qty: 2 }]); // 3 in totale: ok
  const afterFirst = shop.orders.getOrder(o.id).refundedCents;
  await assert.rejects(shop.orders.refundItems(o.id, [{ sku: 'PEN', qty: 1 }]));
  assert.equal(shop.orders.getOrder(o.id).refundedCents, afterFirst);
  assert.equal(shop.orders.getOrder(o.id).status, 'paid');
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  assert.equal(shop.orders.getOrder(o.id).status, 'refunded');
  assert.equal(shop.orders.getOrder(o.id).refundedCents, shop.orders.getOrder(o.id).paidCents);
});

test('richieste non valide sono rifiutate senza alcun effetto', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }]);
  const bad = [
    [{ sku: 'ZZZ', qty: 1 }],
    [{ sku: 'TEA', qty: 1 }],
    [{ sku: 'MUG', qty: 3 }],
    [{ sku: 'MUG', qty: 0 }],
    [{ sku: 'MUG', qty: -1 }],
    [{ sku: 'MUG', qty: 1.5 }],
    [],
  ];
  for (const items of bad) await assert.rejects(shop.orders.refundItems(o.id, items), undefined, JSON.stringify(items));
  await assert.rejects(shop.orders.refundItems('ord_999', [{ sku: 'MUG', qty: 1 }]));
  assert.equal(shop.gateway.refunds.length, 0);
  assert.equal(shop.orders.getOrder(o.id).refundedCents, 0);
  assert.equal(shop.orders.getOrder(o.id).status, 'paid');
});

test('ordini non pagati o annullati non sono rimborsabili', async () => {
  const shop = makeShop();
  const created = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  await assert.rejects(shop.orders.refundItems(created.id, [{ sku: 'MUG', qty: 1 }]));
  const toCancel = await paid(shop, [{ sku: 'MUG', qty: 1 }]);
  await shop.orders.cancel(toCancel.id);
  await assert.rejects(shop.orders.refundItems(toCancel.id, [{ sku: 'MUG', qty: 1 }]));
});

test('ordini spediti e consegnati sono rimborsabili; restock opzionale rimette a scorta solo le quantità rimborsate', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 3 }, { sku: 'TEA', qty: 2 }]);
  shop.orders.ship(o.id);
  const onHand = (sku) => shop.inventory.onHand(sku);
  assert.equal(onHand('MUG'), 97);
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]); // senza restock
  assert.equal(onHand('MUG'), 97);
  shop.orders.deliver(o.id);
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 2 }, { sku: 'TEA', qty: 1 }], { restock: true });
  assert.equal(onHand('MUG'), 99);
  assert.equal(onHand('TEA'), 99);
  assert.equal(shop.orders.getOrder(o.id).status, 'delivered');
});

test('evento order.refunded una sola volta, solo all ultimo rimborso', async () => {
  const shop = makeShop();
  const full = [];
  shop.events.on('order.refunded', (p) => full.push(p.orderId));
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }]);
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  assert.equal(full.length, 0);
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  assert.deepEqual(full, [o.id]);
});

test('guasto del gateway: nessuno stato cambia e il rimborso si può ripetere', async () => {
  const shop = makeShop();
  const events = [];
  shop.events.on('order.items_refunded', (p) => events.push(p));
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }, { sku: 'PEN', qty: 1 }]);
  shop.orders.ship(o.id);
  shop.gateway.queueFailure('decline', 'refund');
  await assert.rejects(shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }], { restock: true }));
  const after = shop.orders.getOrder(o.id);
  assert.equal(after.refundedCents, 0);
  assert.equal(shop.inventory.onHand('MUG'), 98);
  assert.equal(events.length, 0);
  const r = await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  assert.equal(shop.gateway.refunds.length, 1);
  assert.equal(shop.gateway.refunds[0].amountCents, r.amountCents);
});

test('timeout dopo il rimborso: ripetere la stessa richiesta non rimborsa due volte (ADR-004)', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }]);
  shop.gateway.queueFailure('timeout-after-refund', 'refund');
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]).catch(() => {});
  const r = await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]).catch(() => null);
  assert.ok(r, 'la richiesta ripetuta deve riuscire');
  assert.equal(shop.gateway.refunds.length, 1);
  assert.equal(shop.orders.getOrder(o.id).refundedCents, shop.gateway.refunds[0].amountCents);
});

test('refund(orderId) dopo rimborsi parziali restituisce solo il residuo; poi non c è più nulla da rimborsare', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }, { sku: 'BOOK', qty: 1 }], { code: 'SAVE10' });
  const first = await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  const done = await shop.orders.refund(o.id);
  assert.equal(done.status, 'refunded');
  assert.equal(done.refundedCents, done.paidCents);
  const total = sum(shop.gateway.refunds.map((r) => r.amountCents));
  assert.equal(total, done.paidCents);
  assert.equal(shop.gateway.refunds.length, 2);
  assert.equal(shop.gateway.refunds[0].amountCents, first.amountCents);
  await assert.rejects(shop.orders.refundItems(o.id, [{ sku: 'BOOK', qty: 1 }]));
});

test('annullare un ordine pagato e già parzialmente rimborsato restituisce solo il residuo', async () => {
  const shop = makeShop();
  const o = await paid(shop, [{ sku: 'MUG', qty: 2 }]);
  await shop.orders.refundItems(o.id, [{ sku: 'MUG', qty: 1 }]);
  const c = await shop.orders.cancel(o.id);
  assert.equal(c.status, 'cancelled');
  assert.equal(sum(shop.gateway.refunds.map((r) => r.amountCents)), c.paidCents);
});
