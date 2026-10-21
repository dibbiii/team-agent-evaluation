import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';

test('HARD-10: un handler che lancia non ferma gli altri e finisce in onError', () => {
  const errors = [];
  const bus = new EventBus({ onError: (e, info) => errors.push([e.message, info.type]) });
  const seen = [];
  bus.on('x', () => seen.push(1));
  bus.on('x', () => { throw new Error('boom'); });
  bus.on('x', () => seen.push(3));
  bus.emit('x', {});
  assert.deepEqual(seen, [1, 3]);
  assert.deepEqual(errors, [['boom', 'x']]);
});

test('HARD-10: disiscriversi durante l emit non salta gli altri handler', () => {
  const bus = new EventBus();
  const seen = [];
  const off1 = bus.on('x', () => { seen.push(1); off1(); });
  bus.on('x', () => seen.push(2));
  bus.emit('x');
  bus.emit('x');
  assert.deepEqual(seen, [1, 2, 2]);
});
