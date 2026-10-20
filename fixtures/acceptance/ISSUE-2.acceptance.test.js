// Held-out ISSUE-2: SAVE50 con tetto di sconto a 2000 centesimi, solo per SAVE50.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app/src/cart.js';

const total = (cents, code) => {
  const c = new Cart();
  c.add('A', cents);
  return c.total(code);
};

test('SAVE50 su 10000 = 8000 (tetto 2000)', () => assert.equal(total(10000, 'SAVE50'), 8000));
test('SAVE50 su 2000 = 1000 (sotto il tetto)', () => assert.equal(total(2000, 'SAVE50'), 1000));
test('SAVE25 non ha tetto', () => assert.equal(total(40000, 'SAVE25'), 30000));
test('SAVE10 invariato', () => assert.equal(total(10000, 'SAVE10'), 9000));
