import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';

test('gli handler sono chiamati nell ordine di sottoscrizione', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('x', () => seen.push(1));
  bus.on('x', () => seen.push(2));
  bus.on('x', () => seen.push(3));
  bus.emit('x');
  assert.deepEqual(seen, [1, 2, 3]);
});

test('emit passa il payload e restituisce il numero di handler chiamati', () => {
  const bus = new EventBus();
  let got;
  bus.on('x', (p) => (got = p));
  assert.equal(bus.emit('x', { a: 1 }), 1);
  assert.deepEqual(got, { a: 1 });
  assert.equal(bus.emit('nessuno'), 0);
});

test('la funzione restituita da on disiscrive', () => {
  const bus = new EventBus();
  let n = 0;
  const off = bus.on('x', () => n++);
  bus.emit('x');
  off();
  bus.emit('x');
  assert.equal(n, 1);
  assert.equal(bus.listenerCount('x'), 0);
});

test('off rimuove l handler indicato', () => {
  const bus = new EventBus();
  let n = 0;
  const h = () => n++;
  bus.on('x', h);
  bus.off('x', h);
  bus.emit('x');
  assert.equal(n, 0);
});

test('on rifiuta un handler non funzione', () => {
  assert.throws(() => new EventBus().on('x', 42), TypeError);
});
