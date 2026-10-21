import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validateQuantity, validateCountry, validateCustomer } from '../src/validators.js';

test('validateEmail accetta e normalizza gli spazi', () => {
  assert.equal(validateEmail('  a@b.it '), 'a@b.it');
});

test('validateEmail rifiuta forme non valide', () => {
  for (const bad of ['', 'a', 'a@b', '@b.it', 'a b@c.it', null, 5]) {
    assert.throws(() => validateEmail(bad), /Invalid email/);
  }
});

test('validateQuantity', () => {
  assert.equal(validateQuantity(3), 3);
  for (const bad of [0, -1, 1.5, 100, '2']) assert.throws(() => validateQuantity(bad), /Invalid quantity/);
});

test('validateCountry', () => {
  assert.equal(validateCountry('IT'), 'IT');
  assert.throws(() => validateCountry('XX'), /Unknown country/);
});

test('validateCustomer restituisce il cliente normalizzato', () => {
  assert.deepEqual(validateCustomer({ id: 'c', name: 'Ada', email: 'a@b.it', tier: 'gold' }), {
    id: 'c',
    name: 'Ada',
    email: 'a@b.it',
    tier: 'gold',
  });
  assert.equal(validateCustomer({ id: 'c', name: 'Ada', email: 'a@b.it' }).tier, null);
});

test('validateCustomer non altera il testo non fidato', () => {
  const c = validateCustomer({ id: 'c', name: '=1+1', email: 'a@b.it' });
  assert.equal(c.name, '=1+1');
});

test('validateCustomer rifiuta id, nome, fascia non validi', () => {
  assert.throws(() => validateCustomer({ id: '', name: 'A', email: 'a@b.it' }), /Invalid customer id/);
  assert.throws(() => validateCustomer({ id: 'c', name: '  ', email: 'a@b.it' }), /Invalid customer name/);
  assert.throws(() => validateCustomer({ id: 'c', name: 'x'.repeat(201), email: 'a@b.it' }), /Invalid customer name/);
  assert.throws(() => validateCustomer({ id: 'c', name: 'A', email: 'a@b.it', tier: 'vip' }), /Unknown tier/);
});
