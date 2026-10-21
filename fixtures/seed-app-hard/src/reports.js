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
// Ricavo = imponibile di riga (dopo lo sconto).
export function salesReport({ orders, catalog, from, to } = {}) {
  const inRange = (o) => COUNTED_STATUSES.includes(o.status) && (!from || o.createdAt >= from) && (!to || o.createdAt <= to);

  const skus = [];
  for (const o of orders.list().filter(inRange)) {
    for (const l of o.lines) if (!skus.includes(l.sku)) skus.push(l.sku);
  }

  const rows = skus.map((sku) => {
    let qty = 0;
    let netCents = 0;
    let orderCount = 0;
    let name = sku;
    let category = null;
    for (const o of orders.list().filter(inRange)) {
      let seen = false;
      for (const l of o.lines) {
        if (l.sku !== sku) continue;
        const product = catalog.getProduct(l.sku);
        name = product?.name ?? sku;
        category = product?.category ?? null;
        qty += l.qty;
        netCents += l.taxableCents;
        seen = true;
      }
      if (seen) orderCount++;
    }
    return { sku, name, category, qty, orders: orderCount, netCents, avgUnitCents: roundHalfEven(netCents, qty), shareBp: 0 };
  });

  const totalNetCents = rows.reduce((s, r) => s + r.netCents, 0);
  for (const r of rows) r.shareBp = totalNetCents > 0 ? roundHalfUp(r.netCents * 10000, totalNetCents) : 0;
  rows.sort((a, b) => b.netCents - a.netCents || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));

  const countries = [];
  for (const o of orders.list().filter(inRange)) if (!countries.includes(o.country)) countries.push(o.country);
  countries.sort();
  const byCountry = countries.map((country) => {
    let net = 0;
    let n = 0;
    for (const o of orders.list().filter(inRange)) {
      if (o.country !== country) continue;
      n++;
      for (const l of o.lines) net += l.taxableCents;
    }
    return { country, netCents: net, orders: n };
  });

  return {
    rows,
    totalNetCents,
    orderCount: orders.list().filter(inRange).length,
    byCountry,
  };
}
