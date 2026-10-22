import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCents, ceilDiv, formatEuro, pct, sum } from '../src/index.js';

test('pct arrotonda half-up al centesimo', () => {
  assert.equal(pct(1000, 10), 100);
  assert.equal(pct(1005, 10), 101); // 100,5 -> 101
  assert.equal(pct(1004, 10), 100);
  assert.equal(pct(0, 30), 0);
});

test('ceilDiv divide per eccesso', () => {
  assert.equal(ceilDiv(10, 5), 2);
  assert.equal(ceilDiv(11, 5), 3);
  assert.equal(ceilDiv(0, 7), 0);
});

test('assertCents rifiuta i non interi', () => {
  assert.equal(assertCents(5), 5);
  assert.throws(() => assertCents(1.5), { code: 'invalid_amount' });
  assert.throws(() => assertCents('10'), { code: 'invalid_amount' });
});

test('sum somma interi e rifiuta i decimali', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([]), 0);
  assert.throws(() => sum([1, 0.5]), { code: 'invalid_amount' });
});

test('formatEuro usa la virgola e due decimali', () => {
  assert.equal(formatEuro(1234), '12,34 EUR');
  assert.equal(formatEuro(5), '0,05 EUR');
  assert.equal(formatEuro(0), '0,00 EUR');
  assert.equal(formatEuro(-250), '-2,50 EUR');
});
