import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportOrdersCsv } from '../src/export.js';

const order = (over = {}) => ({
  id: 'ord_1', createdAt: '2026-03-01T10:00:00.000Z', status: 'paid', country: 'IT',
  customer: { name: 'Mario Rossi', email: 'mario@example.com' },
  totals: { subtotalCents: 1000, discountCents: 0, taxCents: 220, totalCents: 1220 },
  refundedCents: 0, note: '', ...over,
});

test('HARD-6: riga semplice con CRLF e importi decimali', () => {
  const csv = exportOrdersCsv([order()]);
  assert.ok(csv.startsWith('id,createdAt,status,customerName,customerEmail,country,subtotal,discount,tax,total,refunded,note\r\n'));
  assert.ok(csv.includes(',10.00,0.00,2.20,12.20,0.00,'));
});

test('HARD-6: formula neutralizzata nel testo, importo negativo intatto', () => {
  const csv = exportOrdersCsv([order({ customer: { name: '=1+1', email: 'a@b.it' }, refundedCents: 1250 })]);
  assert.ok(!csv.includes(',=1+1,'));
  assert.ok(csv.includes(',-12.50,'));
});
