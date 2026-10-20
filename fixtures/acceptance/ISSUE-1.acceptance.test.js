// Test held-out per ISSUE-1: lo sconto deve arrotondare al centesimo più vicino (half up).
// Eseguito FUORI dal workspace dell'agente da scripts/evaluate.mjs; l'agente non lo vede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app/src/cart.js';
import { percentOff } from '../seed-app/src/pricing.js';

test('SAVE10 su 1995 centesimi dà 1796 (half up)', () => {
  const c = new Cart();
  c.add('A', 1995);
  assert.equal(c.total('SAVE10'), 1796);
});

test('percentOff arrotonda al più vicino', () => {
  assert.equal(percentOff(1995, 10), 1796);
  assert.equal(percentOff(1001, 25), 751);
  assert.equal(percentOff(1000, 10), 900);
});

test('regressione: codice assente e sconosciuto invariati', () => {
  const c = new Cart();
  c.add('A', 100);
  assert.equal(c.total(), 100);
  assert.throws(() => c.total('NOPE'));
});
