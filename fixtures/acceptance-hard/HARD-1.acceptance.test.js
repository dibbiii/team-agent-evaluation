// Held-out HARD-1: l'IVA è per riga half-even (ADR-001) e tutti i punti che la mostrano concordano con la fattura.
// Eseguito FUORI dal workspace dell'agente da scripts/evaluate.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app-hard/src/cart.js';
import { vatReport } from '../seed-app-hard/src/reports.js';
import { roundHalfEven } from '../seed-app-hard/src/money.js';
import { makeShop, CUSTOMER, prng } from './helpers.mjs';

const items = (...pairs) => pairs.map(([sku, qty]) => ({ sku, qty }));

async function paidOrder(shop, req) {
  const o = shop.orders.createOrder({ customer: CUSTOMER, ...req });
  await shop.orders.pay(o.id);
  return o;
}

test('tre righe da 0,75 EUR al 22%: carrello, ordine e fattura danno la stessa IVA (48)', () => {
  const shop = makeShop();
  const c = new Cart();
  for (const sku of ['P1', 'P2', 'P3']) c.add(sku, 75);
  const s = c.summary({ country: 'IT' });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: items(['P1', 1], ['P2', 1], ['P3', 1]) });
  const inv = shop.orders.invoice(o.id);
  assert.equal(inv.taxCents, 48);
  assert.equal(s.taxCents, 48);
  assert.equal(s.totalCents, 273);
  assert.equal(o.totals.taxCents, 48);
  assert.equal(o.totals.totalCents, 273);
  assert.equal(inv.totalCents, 273);
});

test('metà esatte: half-even (16,5 -> 16; 5,5 -> 6), non half-up', () => {
  const shop = makeShop();
  const a = shop.orders.createOrder({ customer: CUSTOMER, items: items(['PEN', 1]) });
  assert.equal(shop.orders.invoice(a.id).taxCents, 16);
  assert.equal(a.totals.taxCents, 16);
  const c = new Cart();
  c.add('X', 25);
  assert.equal(c.summary({ country: 'IT' }).taxCents, 6);
});

test('righe singole: totali invariati rispetto ai valori storici', () => {
  const cases = [
    // [sku, qty, country, code, tax, total]
    ['MUG', 1, 'IT', undefined, 275, 1525],
    ['TEA', 1, 'IT', undefined, 99, 1089],
    ['BOOK', 1, 'IT', undefined, 80, 2080],
    ['MUG', 3, 'DE', undefined, 712, 4462], // 712,5 -> pari
    ['S1', 1, 'FR', 'SAVE10', 60, 360],
    ['MUG', 1, 'IT', 'SAVE25', 206, 1143],
  ];
  const shop = makeShop();
  for (const [sku, qty, country, code, tax, total] of cases) {
    const o = shop.orders.createOrder({ customer: CUSTOMER, items: items([sku, qty]), country, code });
    assert.equal(o.totals.taxCents, tax, `${sku}x${qty} ${country} ${code} tax`);
    assert.equal(o.totals.totalCents, total, `${sku}x${qty} ${country} ${code} total`);
    assert.equal(shop.orders.invoice(o.id).totalCents, total);
  }
});

test('carrello, ordine memorizzato e fattura coincidono su molti carrelli misti (sconti, categorie, paesi)', () => {
  const rnd = prng(20260317);
  const skus = ['MUG', 'TEA', 'BOOK', 'PEN', 'P1', 'S1', 'S2', 'S3'];
  const countries = ['IT', 'DE', 'FR', 'ES'];
  const codes = [undefined, 'SAVE10', 'SAVE25', 'WELCOME5'];
  const shop = makeShop();
  let multiLine = 0;
  for (let n = 0; n < 60; n++) {
    const picked = new Map();
    for (let k = 0, lines = 1 + Math.floor(rnd() * 5); k < lines; k++) {
      picked.set(skus[Math.floor(rnd() * skus.length)], 1 + Math.floor(rnd() * 4));
    }
    const req = {
      items: [...picked].map(([sku, qty]) => ({ sku, qty })),
      country: countries[Math.floor(rnd() * countries.length)],
      code: codes[Math.floor(rnd() * codes.length)],
    };
    const cart = new Cart();
    for (const { sku, qty } of req.items) {
      const p = shop.catalog.getProduct(sku);
      cart.add(sku, p.priceCents, qty, p.category);
    }
    const summary = cart.summary({ country: req.country, code: req.code });
    const o = shop.orders.createOrder({ customer: CUSTOMER, ...req });
    const inv = shop.orders.invoice(o.id);
    // La fattura è la verità (ADR-001): IVA di riga half-even sull'imponibile della riga.
    const expectedTax = inv.lines.reduce((s, l) => s + roundHalfEven(l.netCents * l.rateBp, 10000), 0);
    assert.equal(inv.taxCents, expectedTax, 'fattura = somma IVA di riga half-even');
    assert.equal(inv.totalCents, inv.netCents + inv.taxCents);
    assert.equal(summary.taxCents, inv.taxCents, `carrello vs fattura (caso ${n})`);
    assert.equal(summary.totalCents, inv.totalCents);
    assert.equal(o.totals.taxCents, inv.taxCents, `ordine vs fattura (caso ${n})`);
    assert.equal(o.totals.totalCents, inv.totalCents);
    if (req.items.length > 1) multiLine++;
  }
  assert.ok(multiLine > 20, 'il test copre davvero carrelli con più righe');
});

test('il report IVA coincide con la somma delle IVA delle fatture, per paese', async () => {
  const shop = makeShop();
  const paid = [];
  paid.push(await paidOrder(shop, { items: items(['P1', 1], ['P2', 1], ['P3', 1]), country: 'IT' }));
  paid.push(await paidOrder(shop, { items: items(['PEN', 1], ['P1', 1]), country: 'IT' }));
  paid.push(await paidOrder(shop, { items: items(['S1', 1], ['S2', 2], ['S3', 1]), country: 'DE', code: 'SAVE10' }));
  paid.push(await paidOrder(shop, { items: items(['MUG', 1], ['PEN', 3], ['P2', 1]), country: 'ES' }));
  shop.orders.createOrder({ customer: CUSTOMER, items: items(['P1', 1], ['P2', 1]), country: 'IT' }); // non pagato: escluso

  const expected = new Map();
  for (const o of paid) {
    const inv = shop.orders.invoice(o.id);
    const row = expected.get(o.country) ?? { country: o.country, netCents: 0, taxCents: 0 };
    row.netCents += inv.netCents;
    row.taxCents += inv.taxCents;
    expected.set(o.country, row);
  }
  const rows = [...expected.values()].sort((a, b) => (a.country < b.country ? -1 : 1));
  const report = vatReport(shop.orders.listOrders());
  assert.deepEqual(report.rows, rows);
  assert.equal(report.totalTaxCents, rows.reduce((s, r) => s + r.taxCents, 0));
});
