import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundHalfUp, roundHalfEven, allocate, formatEuro, toDecimalString, assertCents } from '../src/money.js';

test('roundHalfUp arrotonda le metà via da zero', () => {
  assert.equal(roundHalfUp(5, 2), 3);
  assert.equal(roundHalfUp(-5, 2), -3);
  assert.equal(roundHalfUp(4, 2), 2);
});

test('roundHalfEven arrotonda le metà al pari', () => {
  assert.equal(roundHalfEven(5, 2), 2);
  assert.equal(roundHalfEven(7, 2), 4);
  assert.equal(roundHalfEven(-5, 2), -2);
  assert.equal(roundHalfEven(25, 10), 2);
  assert.equal(roundHalfEven(35, 10), 4);
});

test('i resti non metà arrotondano al più vicino in entrambe le modalità', () => {
  assert.equal(roundHalfEven(1, 3), 0);
  assert.equal(roundHalfEven(2, 3), 1);
  assert.equal(roundHalfUp(1, 3), 0);
  assert.equal(roundHalfUp(2, 3), 1);
});

test('operandi non validi lanciano', () => {
  assert.throws(() => roundHalfUp(1, 0), RangeError);
  assert.throws(() => roundHalfEven(1.5, 2), RangeError);
});

test('il risultato zero non è mai -0', () => {
  assert.ok(Object.is(roundHalfUp(-1, 3), 0));
  assert.ok(Object.is(roundHalfEven(-1, 3), 0));
});

test('allocate distribuisce il resto in modo deterministico', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(10, [60, 30, 10]), [6, 3, 1]);
});

test('allocate: la somma delle parti è sempre il totale', () => {
  for (const total of [0, 1, 7, 99, 1001]) {
    const parts = allocate(total, [3, 5, 11, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

test('allocate con pesi nulli', () => {
  assert.deepEqual(allocate(0, [0, 0]), [0, 0]);
  assert.throws(() => allocate(5, [0, 0]), RangeError);
});

test('formatEuro', () => {
  assert.equal(formatEuro(1796), '17,96 EUR');
  assert.equal(formatEuro(5), '0,05 EUR');
  assert.equal(formatEuro(-250), '-2,50 EUR');
});

test('toDecimalString', () => {
  assert.equal(toDecimalString(1250), '12.50');
  assert.equal(toDecimalString(-1250), '-12.50');
  assert.equal(toDecimalString(5), '0.05');
});

test('assertCents rifiuta i float', () => {
  assert.throws(() => assertCents(1.5), TypeError);
  assert.equal(assertCents(150), 150);
});
