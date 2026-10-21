import { roundHalfEven, roundHalfUp } from './money.js';
import { COUNTED_STATUSES } from './config.js';

// Report IVA per paese sugli ordini venduti. `orders` è un array di ordini.
export function vatReport(orders) {
  const byCountry = new Map();
  for (const o of orders) {
    if (!COUNTED_STATUSES.includes(o.status)) continue;
    // Per aliquota: si somma l'imponibile del gruppo e si arrotonda una volta.
    const groups = new Map();
    for (const l of o.lines) groups.set(l.rateBp, (groups.get(l.rateBp) ?? 0) + l.taxableCents);
    const row = byCountry.get(o.country) ?? { country: o.country, netCents: 0, taxCents: 0 };
    for (const [rate, net] of groups) {
      row.netCents += net;
      row.taxCents += roundHalfEven(net * rate, 10000);
    }
    byCountry.set(o.country, row);
  }
  const rows = [...byCountry.values()].sort((a, b) => (a.country < b.country ? -1 : 1));
  return { rows, totalTaxCents: rows.reduce((s, r) => s + r.taxCents, 0) };
}

// Conteggio ordini per stato, in ordine alfabetico di stato.
export function ordersByStatus(orders) {
  const counts = {};
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
  return Object.keys(counts)
    .sort()
    .map((status) => ({ status, count: counts[status] }));
}

// Primi `limit` clienti per spesa (totale pagato meno rimborsi), a parità per id cliente.
export function topCustomers(orders, limit = 3) {
  const spend = new Map();
  for (const o of orders) {
    if (!COUNTED_STATUSES.includes(o.status)) continue;
    spend.set(o.customer.id, (spend.get(o.customer.id) ?? 0) + o.paidCents - o.refundedCents);
  }
  return [...spend.entries()]
    .map(([customerId, spentCents]) => ({ customerId, spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents || (a.customerId < b.customerId ? -1 : 1))
    .slice(0, limit);
}

// Report vendite. `orders` è una sorgente con list() -> ordini; `catalog` espone getProduct(sku).
// Conta solo gli ordini venduti, filtrabili per intervallo (createdAt ISO, estremi inclusi).
// Ricavo = imponibile di riga (dopo lo sconto). Una sola scansione degli ordini, una ricerca per sku distinto.
export function salesReport({ orders, catalog, from, to } = {}) {
  const inRange = (o) => COUNTED_STATUSES.includes(o.status) && (!from || o.createdAt >= from) && (!to || o.createdAt <= to);
  const products = new Map();
  const lookup = (sku) => {
    if (!products.has(sku)) products.set(sku, catalog.getProduct(sku) ?? null);
    return products.get(sku);
  };

  const bySku = new Map();
  const byCountry = new Map();
  let orderCount = 0;
  for (const o of orders.list()) {
    if (!inRange(o)) continue;
    orderCount++;
    const country = byCountry.get(o.country) ?? { country: o.country, netCents: 0, orders: 0 };
    country.orders++;
    const seen = new Set();
    for (const l of o.lines) {
      let row = bySku.get(l.sku);
      if (!row) {
        const p = lookup(l.sku);
        row = { sku: l.sku, name: p?.name ?? l.sku, category: p?.category ?? null, qty: 0, orders: 0, netCents: 0, avgUnitCents: 0, shareBp: 0 };
        bySku.set(l.sku, row);
      }
      row.qty += l.qty;
      row.netCents += l.taxableCents;
      if (!seen.has(l.sku)) {
        seen.add(l.sku);
        row.orders++;
      }
      country.netCents += l.taxableCents;
    }
    byCountry.set(o.country, country);
  }

  const rows = [...bySku.values()];
  const totalNetCents = rows.reduce((s, r) => s + r.netCents, 0);
  for (const r of rows) {
    r.avgUnitCents = roundHalfEven(r.netCents, r.qty);
    r.shareBp = totalNetCents > 0 ? roundHalfUp(r.netCents * 10000, totalNetCents) : 0;
  }
  rows.sort((a, b) => b.netCents - a.netCents);

  return {
    rows,
    totalNetCents,
    orderCount,
    byCountry: [...byCountry.values()].sort((a, b) => (a.country < b.country ? -1 : a.country > b.country ? 1 : 0)),
  };
}
