import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/inventory.js';

test('available = giacenza - prenotato', () => {
  const inv = new Inventory({ A: 10 });
  inv.reserve('o1', [{ sku: 'A', qty: 4 }]);
  assert.equal(inv.onHand('A'), 10);
  assert.equal(inv.available('A'), 6);
});

test('reserve è tutto o niente', () => {
  const inv = new Inventory({ A: 5, B: 1 });
  assert.throws(() => inv.reserve('o1', [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 2 }]), /Insufficient stock for B/);
  assert.equal(inv.available('A'), 5);
});

test('righe con lo stesso sku vengono aggregate', () => {
  const inv = new Inventory({ A: 3 });
  assert.throws(() => inv.reserve('o1', [{ sku: 'A', qty: 2 }, { sku: 'A', qty: 2 }]));
});

test('release restituisce la disponibilità', () => {
  const inv = new Inventory({ A: 5 });
  inv.reserve('o1', [{ sku: 'A', qty: 5 }]);
  assert.equal(inv.release('o1'), true);
  assert.equal(inv.available('A'), 5);
  assert.equal(inv.release('o1'), false);
});

test('commit scarica la giacenza', () => {
  const inv = new Inventory({ A: 5 });
  inv.reserve('o1', [{ sku: 'A', qty: 2 }]);
  inv.commit('o1');
  assert.equal(inv.onHand('A'), 3);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => inv.commit('o1'), /No reservation/);
});

test('restock aumenta la giacenza e valida la quantità', () => {
  const inv = new Inventory({});
  inv.restock('A', 3);
  assert.equal(inv.onHand('A'), 3);
  assert.throws(() => inv.restock('A', 0), /Invalid quantity/);
});

test('una seconda prenotazione per lo stesso ordine è rifiutata', () => {
  const inv = new Inventory({ A: 5 });
  inv.reserve('o1', [{ sku: 'A', qty: 1 }]);
  assert.throws(() => inv.reserve('o1', [{ sku: 'A', qty: 1 }]), /already has a reservation/);
});
