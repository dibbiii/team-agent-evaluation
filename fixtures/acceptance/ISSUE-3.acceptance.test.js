// Held-out ISSUE-3: DISCOUNT_CODES accetta {percent, maxOffCents}; i valori numerici restano validi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app/src/cart.js';
import { DISCOUNT_CODES } from '../seed-app/src/pricing.js';

const total = (cents, code) => {
  const c = new Cart();
  c.add('A', cents);
  return c.total(code);
};

test('SAVE25 con tetto 5000 su 40000 = 35000', () => {
  const original = DISCOUNT_CODES.SAVE25;
  DISCOUNT_CODES.SAVE25 = { percent: 25, maxOffCents: 5000 };
  try {
    assert.equal(total(40000, 'SAVE25'), 35000);
  } finally {
    DISCOUNT_CODES.SAVE25 = original;
  }
});

test('voce senza tetto: {percent} soltanto', () => {
  DISCOUNT_CODES.TMP = { percent: 10 };
  try {
    assert.equal(total(10000, 'TMP'), 9000);
  } finally {
    delete DISCOUNT_CODES.TMP;
  }
});

test('regressione: voci numeriche esistenti', () => {
  assert.equal(total(10000, 'SAVE10'), 9000);
  assert.equal(total(10000, 'SAVE25'), 7500);
});
