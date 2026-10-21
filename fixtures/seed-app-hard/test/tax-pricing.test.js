import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxRate, lineTax } from '../src/tax.js';
import { percentOff, codeDiscount, loyaltyDiscount, bestDiscount, applyCode } from '../src/pricing.js';

test('taxRate per paese e categoria', () => {
  assert.equal(taxRate('IT'), 2200);
  assert.equal(taxRate('IT', 'books'), 400);
  assert.equal(taxRate('DE', 'reduced'), 700);
});

test('taxRate rifiuta paese o categoria sconosciuti', () => {
  assert.throws(() => taxRate('XX'), /Unknown country/);
  assert.throws(() => taxRate('IT', 'luxury'), /Unknown tax category/);
  assert.throws(() => taxRate('constructor'), /Unknown country/);
});

test('lineTax: half-even sulle metà', () => {
  assert.equal(lineTax(75, 2200), 16); // 16,5 -> 16
  assert.equal(lineTax(25, 2200), 6); // 5,5 -> 6
  assert.equal(lineTax(1000, 2200), 220);
});

test('percentOff arrotonda half-up e restituisce lo sconto', () => {
  assert.equal(percentOff(1995, 10), 200);
  assert.equal(percentOff(1000, 25), 250);
});

test('codeDiscount', () => {
  assert.equal(codeDiscount(1995, 'SAVE10'), 200);
  assert.equal(codeDiscount(10000, 'WELCOME5'), 500);
  assert.equal(codeDiscount(300, 'WELCOME5'), 300);
  assert.equal(codeDiscount(1000), 0);
  assert.equal(codeDiscount(1000, ''), 0);
});

test('codeDiscount rifiuta codici sconosciuti, anche prototipali', () => {
  assert.throws(() => codeDiscount(1000, 'NOPE'), /Unknown discount code/);
  assert.throws(() => codeDiscount(1000, 'constructor'), /Unknown discount code/);
});

test('loyaltyDiscount per fascia', () => {
  assert.equal(loyaltyDiscount(10000, { tier: 'gold' }), 500);
  assert.equal(loyaltyDiscount(1000, { tier: 'silver' }), 30);
  assert.equal(loyaltyDiscount(1000, { tier: null }), 0);
  assert.equal(loyaltyDiscount(1000, undefined), 0);
});

test('bestDiscount: un solo sconto, il più vantaggioso', () => {
  assert.deepEqual(bestDiscount(10000, { code: 'SAVE10', customer: { tier: 'platinum' } }), {
    kind: 'code',
    code: 'SAVE10',
    amountCents: 1000,
  });
  assert.deepEqual(bestDiscount(10000, { code: 'WELCOME5', customer: { tier: 'platinum' } }), {
    kind: 'loyalty',
    tier: 'platinum',
    amountCents: 800,
  });
});

test('bestDiscount: a parità vince il codice; senza sconti kind none', () => {
  assert.equal(bestDiscount(10000, { code: 'WELCOME5', customer: { tier: 'gold' } }).kind, 'code');
  assert.deepEqual(bestDiscount(10000, {}), { kind: 'none', amountCents: 0 });
});

test('applyCode restituisce il totale scontato', () => {
  assert.equal(applyCode(1995, 'SAVE10'), 1795);
  assert.equal(applyCode(1995), 1995);
});
