import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shippingCost } from '../src/shipping.js';
import { SHIPPING_TABLE } from '../src/shipping-table.js';

test('HARD-9: la tabella è dati puri', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SHIPPING_TABLE)), SHIPPING_TABLE);
});

test('HARD-9: soglie esclusive della zona extra conservate', () => {
  assert.equal(shippingCost('GB', 500), 1890);
  assert.equal(shippingCost('IT', 500), 490);
});
