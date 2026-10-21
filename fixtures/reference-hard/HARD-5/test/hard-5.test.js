import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesReport } from '../src/reports.js';

test('HARD-5: una sola chiamata a list() e una ricerca per sku', () => {
  let listCalls = 0;
  const lookups = [];
  const orders = [
    { id: 'a', status: 'paid', country: 'IT', createdAt: '2026-01-01', lines: [{ sku: 'X', qty: 1, taxableCents: 100 }] },
    { id: 'b', status: 'paid', country: 'IT', createdAt: '2026-01-02', lines: [{ sku: 'X', qty: 2, taxableCents: 200 }] },
  ];
  const source = { list: () => (listCalls++, orders) };
  const catalog = { getProduct: (sku) => (lookups.push(sku), { name: sku, category: 'standard' }) };
  const r = salesReport({ orders: source, catalog });
  assert.equal(listCalls, 1);
  assert.deepEqual(lookups, ['X']);
  assert.equal(r.rows[0].qty, 3);
});
