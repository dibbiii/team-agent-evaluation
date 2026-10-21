import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, billableGrams, shippingCost } from '../src/shipping.js';

test('zoneFor', () => {
  assert.equal(zoneFor('IT'), 'domestic');
  assert.equal(zoneFor('DE'), 'eu');
  assert.equal(zoneFor('GB'), 'extra');
  assert.equal(zoneFor('US'), 'world');
  assert.equal(zoneFor('??'), 'world');
});

test('billableGrams arrotonda per eccesso ai 100 g', () => {
  assert.equal(billableGrams(1), 100);
  assert.equal(billableGrams(100), 100);
  assert.equal(billableGrams(101), 200);
});

test('Italia: primo scaglione e soglia di 500 g', () => {
  assert.equal(shippingCost('IT', 450), 490);
  assert.equal(shippingCost('IT', 500), 490);
  assert.equal(shippingCost('IT', 501), 590);
});

test('Italia: spedizione gratuita da 100,00 EUR', () => {
  assert.equal(shippingCost('IT', 800, 10000), 0);
  assert.equal(shippingCost('IT', 800, 9999), 590);
  assert.equal(shippingCost('DE', 800, 10000), 1290);
});

test('UE: scaglioni', () => {
  assert.equal(shippingCost('DE', 1000), 1290);
  assert.equal(shippingCost('FR', 2500), 2190);
});

test('oltre l ultimo scaglione si aggiunge un supplemento per kg iniziato', () => {
  assert.equal(shippingCost('IT', 6000), 1140);
  assert.equal(shippingCost('IT', 6100), 1290);
});

test('peso non valido lancia', () => {
  assert.throws(() => shippingCost('IT', 0), RangeError);
  assert.throws(() => shippingCost('IT', NaN), RangeError);
});
