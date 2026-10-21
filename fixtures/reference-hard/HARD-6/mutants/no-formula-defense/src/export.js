import { toDecimalString } from './money.js';

// Escape minimale: racchiude tra virgolette se c'è una virgola. (Solo per exportProductsCsv, storico.)
function escapeCell(value) {
  const s = String(value ?? '');
  return s.includes(',') ? `"${s}"` : s;
}

export function exportProductsCsv(products) {
  const rows = [['sku', 'name', 'category', 'price']];
  for (const p of products) rows.push([p.sku, p.name, p.category, toDecimalString(p.priceCents)]);
  return rows.map((r) => r.map(escapeCell).join(',')).join('\n') + '\n';
}

// --- Esportazione ordini per la contabilità (RFC 4180) ---

// RFC 4180: i campi con virgola, virgolette o a capo vanno tra virgolette, le virgolette si raddoppiano.
function csvEscape(s) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ADR-005: una cella di testo che un foglio di calcolo interpreterebbe come formula viene neutralizzata con un apice.
const FORMULA_START = /^[=+\-@\t\r]/;
function text(value) {
  let s = String(value ?? '');
  return csvEscape(s);
}

// Gli importi sono numeri generati dal sistema, non testo del cliente: mai alterati (un rimborso resta "-12.50").
function amount(cents) {
  return toDecimalString(cents);
}

export const ORDER_CSV_COLUMNS = [
  'id', 'createdAt', 'status', 'customerName', 'customerEmail', 'country',
  'subtotal', 'discount', 'tax', 'total', 'refunded', 'note',
];

export function exportOrdersCsv(orders) {
  const lines = [ORDER_CSV_COLUMNS.join(',')];
  for (const o of orders) {
    lines.push(
      [
        text(o.id),
        text(o.createdAt),
        text(o.status),
        text(o.customer?.name),
        text(o.customer?.email),
        text(o.country),
        amount(o.totals.subtotalCents),
        amount(o.totals.discountCents),
        amount(o.totals.taxCents),
        amount(o.totals.totalCents),
        amount(o.refundedCents ? -o.refundedCents : 0),
        text(o.note),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
