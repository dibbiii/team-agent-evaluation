// Held-out HARD-5: il report vendite deve dare risultati identici alla baseline ma con un numero di accessi ai dati
// non proporzionale a ordini x prodotti. Misura CHIAMATE (sorgenti strumentate), non il tempo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salesReport } from '../seed-app-hard/src/reports.js';
import { buildOrders, buildProducts, buildTieProducts, GOLDEN_RANGE } from './data/hard5-input.mjs';

const golden = JSON.parse(readFileSync(new URL('./data/hard5.golden.json', import.meta.url), 'utf8'));
const products = [...buildProducts(), ...buildTieProducts()];

const plainCatalog = { getProduct: (sku) => products.find((p) => p.sku === sku) };

test('risultati identici alla baseline (tutti gli ordini)', () => {
  const orders = buildOrders();
  const r = salesReport({ orders: { list: () => orders }, catalog: plainCatalog });
  assert.deepEqual(r, golden.all);
});

test('risultati identici alla baseline (intervallo di date)', () => {
  const orders = buildOrders();
  const r = salesReport({ orders: { list: () => orders }, catalog: plainCatalog, ...GOLDEN_RANGE });
  assert.deepEqual(r, golden.ranged);
});

test('a parità di ricavo l ordine è per sku; la media arrotonda half-even; l input non viene modificato', () => {
  const orders = buildOrders();
  const snapshot = structuredClone(orders);
  const r = salesReport({ orders: { list: () => orders }, catalog: plainCatalog });
  const a = r.rows.findIndex((x) => x.sku === 'T-A');
  const b = r.rows.findIndex((x) => x.sku === 'T-B');
  assert.ok(a >= 0 && b === a + 1);
  assert.equal(r.rows[a].avgUnitCents, 500); // 1001/2 = 500,5 -> pari
  assert.deepEqual(orders, snapshot);
  assert.deepEqual(salesReport({ orders: { list: () => orders }, catalog: plainCatalog }), r);
});

test('elenco vuoto e nessun ordine venduto', () => {
  const empty = { list: () => [] };
  assert.deepEqual(salesReport({ orders: empty, catalog: plainCatalog }), { rows: [], totalNetCents: 0, orderCount: 0, byCountry: [] });
  const onlyCreated = [{ id: 'x', status: 'created', country: 'IT', createdAt: '2026-01-01T00:00:00.000Z', lines: [{ sku: 'A01', qty: 1, taxableCents: 100 }] }];
  assert.equal(salesReport({ orders: { list: () => onlyCreated }, catalog: plainCatalog }).orderCount, 0);
});

test('conteggio chiamate: una sola scansione degli ordini e una ricerca a catalogo per sku distinto', () => {
  const orders = buildOrders(240, 7, { ghost: false, ties: false });
  let listCalls = 0;
  let linesReads = 0;
  const wrapped = orders.map((o) => {
    const w = { ...o };
    delete w.lines;
    Object.defineProperty(w, 'lines', {
      enumerable: true,
      get() {
        linesReads++;
        return o.lines;
      },
    });
    return w;
  });
  const lookups = new Map();
  const catalog = {
    getProduct(sku) {
      lookups.set(sku, (lookups.get(sku) ?? 0) + 1);
      return products.find((p) => p.sku === sku);
    },
  };
  const result = salesReport({ orders: { list: () => (listCalls++, wrapped) }, catalog });
  assert.ok(result.rows.length > 10, 'dataset significativo');
  assert.ok(listCalls <= 1, `list() chiamata ${listCalls} volte`);
  for (const [sku, n] of lookups) assert.ok(n <= 1, `getProduct(${sku}) chiamato ${n} volte`);
  assert.ok(linesReads <= 3 * orders.length, `righe lette ${linesReads} volte per ${orders.length} ordini`);
  // gli stessi dati, senza strumentazione, danno lo stesso risultato
  const plain = salesReport({ orders: { list: () => orders }, catalog: plainCatalog });
  assert.deepEqual(result, plain);
});
