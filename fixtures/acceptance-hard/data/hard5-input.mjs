// Dati deterministici per HARD-5 (nessuna dipendenza dal sorgente da valutare).
import { prng } from '../helpers.mjs';

const CATEGORIES = ['standard', 'reduced', 'books'];
export const SKUS = Array.from({ length: 24 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`);

export function buildProducts() {
  return SKUS.map((sku, i) => ({
    sku,
    name: `Prodotto ${sku}`,
    category: CATEGORIES[i % 3],
    priceCents: 199 + ((i * 137) % 1900),
  }));
}

// n ordini pseudo-casuali. ghost: include uno sku non presente a catalogo. ties: aggiunge due prodotti con ricavi uguali
// e media a metà centesimo (verificano ordinamento a parità e arrotondamento half-even della media).
export function buildOrders(n = 300, seed = 20260101, { ghost = true, ties = true } = {}) {
  const rnd = prng(seed);
  const products = buildProducts();
  const statuses = ['created', 'paid', 'paid', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
  const countries = ['IT', 'IT', 'DE', 'FR', 'ES'];
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  const orders = [];
  for (let i = 0; i < n; i++) {
    const nLines = 1 + Math.floor(rnd() * 4);
    const used = new Set();
    const lines = [];
    for (let k = 0; k < nLines; k++) {
      let p = products[Math.floor(rnd() * products.length)];
      if (ghost && rnd() < 0.03) p = { sku: 'GHOST', priceCents: 500 };
      if (used.has(p.sku)) continue;
      used.add(p.sku);
      const qty = 1 + Math.floor(rnd() * 5);
      const net = p.priceCents * qty;
      const discount = rnd() < 0.3 ? Math.floor(net * rnd() * 0.2) : 0;
      lines.push({ sku: p.sku, qty, taxableCents: net - discount });
    }
    orders.push({
      id: `o${i + 1}`,
      status: statuses[Math.floor(rnd() * statuses.length)],
      country: countries[Math.floor(rnd() * countries.length)],
      createdAt: new Date(base + i * 3_600_000).toISOString(),
      lines,
    });
  }
  if (ties) {
    const at = new Date(base + (n + 1) * 3_600_000).toISOString();
    orders.push({ id: 'tie1', status: 'paid', country: 'IT', createdAt: at, lines: [{ sku: 'T-B', qty: 2, taxableCents: 1001 }] });
    orders.push({ id: 'tie2', status: 'delivered', country: 'IT', createdAt: at, lines: [{ sku: 'T-A', qty: 2, taxableCents: 1001 }] });
  }
  return orders;
}

export function buildTieProducts() {
  return [
    { sku: 'T-A', name: 'Gemello A', category: 'standard' },
    { sku: 'T-B', name: 'Gemello B', category: 'standard' },
  ];
}

export const GOLDEN_RANGE = { from: '2026-01-03T00:00:00.000Z', to: '2026-01-09T12:00:00.000Z' };
