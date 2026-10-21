import { toDecimalString } from './money.js';

// Escape minimale: racchiude tra virgolette se c'è una virgola.
function escapeCell(value) {
  const s = String(value ?? '');
  return s.includes(',') ? `"${s}"` : s;
}

export function exportProductsCsv(products) {
  const rows = [['sku', 'name', 'category', 'price']];
  for (const p of products) rows.push([p.sku, p.name, p.category, toDecimalString(p.priceCents)]);
  return rows.map((r) => r.map(escapeCell).join(',')).join('\n') + '\n';
}
