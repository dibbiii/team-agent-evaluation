import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesReport, vatReport } from '../src/reports.js';
import { exportProductsCsv } from '../src/export.js';
import { makeShop, CUSTOMER } from './helpers.js';

async function shopWithSales() {
  const shop = makeShop();
  const a = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 2 }, { sku: 'BOOK', qty: 1 }] });
  const b = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], country: 'DE' });
  const c = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'PEN', qty: 3 }] });
  await shop.orders.pay(a.id);
  await shop.orders.pay(b.id);
  return { shop, a, b, c };
}

test('salesReport conta solo gli ordini venduti', async () => {
  const { shop } = await shopWithSales();
  const r = salesReport({ orders: shop.orders.store, catalog: shop.catalog });
  assert.equal(r.orderCount, 2);
  assert.deepEqual(r.rows.map((x) => [x.sku, x.qty, x.netCents]), [['MUG', 3, 3750], ['BOOK', 1, 2000]]);
  assert.equal(r.totalNetCents, 5750);
});

test('salesReport: nome, categoria, media e quota', async () => {
  const { shop } = await shopWithSales();
  const [mug] = salesReport({ orders: shop.orders.store, catalog: shop.catalog }).rows;
  assert.equal(mug.name, 'Tazza');
  assert.equal(mug.avgUnitCents, 1250);
  assert.equal(mug.shareBp, 6522);
});

test('salesReport: raggruppa per paese in ordine alfabetico', async () => {
  const { shop } = await shopWithSales();
  const r = salesReport({ orders: shop.orders.store, catalog: shop.catalog });
  assert.deepEqual(r.byCountry, [
    { country: 'DE', netCents: 1250, orders: 1 },
    { country: 'IT', netCents: 4500, orders: 1 },
  ]);
});

test('salesReport: filtro per intervallo con estremi inclusi', async () => {
  const { shop, b } = await shopWithSales();
  const at = shop.orders.getOrder(b.id).createdAt;
  const r = salesReport({ orders: shop.orders.store, catalog: shop.catalog, from: at, to: at });
  assert.equal(r.orderCount, 1);
});

test('salesReport su elenco vuoto', () => {
  const shop = makeShop();
  const r = salesReport({ orders: shop.orders.store, catalog: shop.catalog });
  assert.deepEqual(r, { rows: [], totalNetCents: 0, orderCount: 0, byCountry: [] });
});

test('vatReport per ordine singola riga', async () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  await shop.orders.pay(o.id);
  const r = vatReport(shop.orders.listOrders());
  assert.deepEqual(r, { rows: [{ country: 'IT', netCents: 1250, taxCents: 275 }], totalTaxCents: 275 });
});

test('exportProductsCsv: intestazione, importi decimali, virgole', () => {
  const csv = exportProductsCsv([
    { sku: 'MUG', name: 'Tazza', category: 'standard', priceCents: 1250 },
    { sku: 'TEA', name: 'Tè, miscela', category: 'reduced', priceCents: 990 },
  ]);
  assert.equal(csv, 'sku,name,category,price\nMUG,Tazza,standard,12.50\nTEA,"Tè, miscela",reduced,9.90\n');
});
