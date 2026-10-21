import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuro, formatMoney, convert } from '../src/money.js';

const RATES = { EUR: 1000000, USD: 1082500, JPY: 150000000 };

test('HARD-4: formatMoney senza valuta coincide con formatEuro', () => {
  assert.equal(formatMoney(1796), formatEuro(1796));
  assert.equal(formatMoney(1796, 'JPY'), '1796 JPY');
});

test('HARD-4: convert arrotonda half-even', () => {
  assert.equal(convert(1000, 'EUR', 'USD', RATES), 1082);
  assert.equal(convert(3, 'EUR', 'JPY', RATES), 4);
});
