// Genera i file "golden" dal sorgente BASELINE (seed-app-hard). Uso: node data/generate-golden.mjs [--check]
// Con --check non scrive: confronta con i file esistenti ed esce con 1 se differiscono.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { salesReport } from '../../seed-app-hard/src/reports.js';
import { shippingCost } from '../../seed-app-hard/src/shipping.js';
import { buildOrders, buildProducts, buildTieProducts, GOLDEN_RANGE } from './hard5-input.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function buildHard5Golden() {
  const products = [...buildProducts(), ...buildTieProducts()];
  const byOrder = buildOrders();
  const catalog = { getProduct: (sku) => products.find((p) => p.sku === sku) };
  const source = { list: () => byOrder };
  return {
    all: salesReport({ orders: source, catalog }),
    ranged: salesReport({ orders: source, catalog, ...GOLDEN_RANGE }),
  };
}

export function buildHard9Golden() {
  const countries = ['IT', 'DE', 'FR', 'ES', 'GB', 'CH', 'NO', 'US', 'JP', 'XX'];
  const weights = [
    0.5, 1, 50, 99, 100, 101, 199, 200, 201, 449, 450, 451, 499, 500, 500.5, 501, 599, 600, 601, 999, 1000, 1001, 1099,
    1100, 1101, 1500, 1999, 2000, 2001, 2500, 4999, 5000, 5001, 5099, 5100, 5500, 6000, 6100, 9999, 10000, 10001, 10100,
    12345, 15000, 20000,
  ];
  const cases = [];
  for (const country of countries) for (const grams of weights) cases.push([country, grams, 0, shippingCost(country, grams, 0)]);
  for (const subtotal of [0, 9999, 10000, 10001]) {
    for (const country of ['IT', 'DE']) {
      for (const grams of [100, 500, 501, 3000, 7000]) cases.push([country, grams, subtotal, shippingCost(country, grams, subtotal)]);
    }
  }
  return cases;
}

const files = {
  'hard5.golden.json': buildHard5Golden(),
  'hard9.golden.json': buildHard9Golden(),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = false;
  for (const [name, data] of Object.entries(files)) {
    const text = JSON.stringify(data, null, 1) + '\n';
    const path = join(here, name);
    if (check) {
      if (readFileSync(path, 'utf8') !== text) {
        console.error(`golden diverso dalla baseline: ${name}`);
        bad = true;
      }
    } else {
      writeFileSync(path, text);
      console.log(`scritto ${name}`);
    }
  }
  process.exit(bad ? 1 : 0);
}
