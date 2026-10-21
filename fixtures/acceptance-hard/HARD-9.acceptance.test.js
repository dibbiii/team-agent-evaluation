// Held-out HARD-9: refactoring a comportamento identico. Le regole di spedizione passano in una tabella di dati;
// i risultati restano IDENTICI a quelli della baseline (file golden calcolato dal baseline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shippingCost, zoneFor } from '../seed-app-hard/src/shipping.js';
import { SHIPPING_TABLE } from '../seed-app-hard/src/shipping-table.js';

const golden = JSON.parse(readFileSync(new URL('./data/hard9.golden.json', import.meta.url), 'utf8'));

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

test('golden: tutti i casi zona x peso (confini inclusi) coincidono con la baseline', () => {
  assert.ok(golden.length >= 300);
  const wrong = [];
  for (const [country, grams, subtotal, expected] of golden) {
    const got = shippingCost(country, grams, subtotal);
    if (got !== expected) wrong.push(`${country} ${grams}g subtotale ${subtotal}: atteso ${expected}, ottenuto ${got}`);
  }
  assert.deepEqual(wrong, []);
});

test('golden con la tabella passata esplicitamente (copia profonda congelata)', () => {
  const table = deepFreeze(structuredClone(SHIPPING_TABLE));
  for (const [country, grams, subtotal, expected] of golden) {
    assert.equal(shippingCost(country, grams, subtotal, table), expected, `${country} ${grams}g`);
  }
});

test('SHIPPING_TABLE è solo dati: sopravvive a un giro in JSON', () => {
  const roundTrip = JSON.parse(JSON.stringify(SHIPPING_TABLE));
  assert.deepEqual(roundTrip, SHIPPING_TABLE);
  assert.equal(typeof SHIPPING_TABLE.roundingGrams, 'number');
  assert.equal(typeof SHIPPING_TABLE.defaultZone, 'string');
  assert.ok(SHIPPING_TABLE.zones && typeof SHIPPING_TABLE.zones === 'object');
});

test('la funzione legge davvero la tabella (schema descritto nella issue)', () => {
  const table = {
    roundingGrams: 50,
    defaultZone: 'z2',
    freeShipping: { zone: 'z1', minSubtotalCents: 5000 },
    zones: {
      z1: {
        countries: ['IT', 'FR'],
        extraPerKgCents: 10,
        tiers: [
          { maxGrams: 200, inclusive: true, priceCents: 100 },
          { maxGrams: 400, inclusive: false, priceCents: 200 },
        ],
      },
      z2: { countries: [], extraPerKgCents: 30, tiers: [{ maxGrams: 1000, inclusive: true, priceCents: 500 }] },
    },
  };
  assert.equal(zoneFor('IT', table), 'z1');
  assert.equal(zoneFor('US', table), 'z2');
  assert.equal(shippingCost('IT', 200, 0, table), 100);
  assert.equal(shippingCost('IT', 201, 0, table), 200);
  assert.equal(shippingCost('IT', 351, 0, table), 200); // peso fatturabile 400: non < 400, oltre l ultimo scaglione, 0 kg extra
  assert.equal(shippingCost('IT', 401, 0, table), 210); // 450 g: 200 + 1 kg iniziato * 10
  assert.equal(shippingCost('FR', 1, 0, table), 100);
  assert.equal(shippingCost('US', 1000, 0, table), 500);
  assert.equal(shippingCost('US', 1001, 0, table), 530);
  assert.equal(shippingCost('IT', 100, 5000, table), 0);
  assert.equal(shippingCost('IT', 100, 4999, table), 100);
  assert.equal(shippingCost('US', 100, 99999, table), 500);
  const noFree = { ...table, freeShipping: undefined };
  assert.equal(shippingCost('IT', 100, 99999, noFree), 100);
  assert.throws(() => shippingCost('IT', 0, 0, table), RangeError);
  assert.throws(() => shippingCost('IT', Infinity, 0, table), RangeError);
});
