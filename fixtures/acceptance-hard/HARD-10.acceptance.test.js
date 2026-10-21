// Held-out HARD-10: bus di eventi con isolamento degli errori, ordine stabile e disiscrizione sicura durante l'emit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../seed-app-hard/src/events.js';
import { makeShop, CUSTOMER, flush } from './helpers.mjs';

test('un handler che lancia non impedisce agli altri di girare e l errore arriva a onError', () => {
  const errors = [];
  const bus = new EventBus({ onError: (error, info) => errors.push({ error, info }) });
  const seen = [];
  const boom = new Error('boom');
  bus.on('x', () => seen.push('a'));
  bus.on('x', () => {
    throw boom;
  });
  bus.on('x', () => seen.push('c'));
  const payload = { n: 1 };
  assert.doesNotThrow(() => bus.emit('x', payload));
  assert.deepEqual(seen, ['a', 'c']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error, boom);
  assert.equal(errors[0].info.type, 'x');
  assert.equal(errors[0].info.payload, payload);
});

test('più handler che falliscono: un onError per ciascuno, nell ordine di sottoscrizione', () => {
  const errors = [];
  const bus = new EventBus({ onError: (e) => errors.push(e.message) });
  const seen = [];
  bus.on('x', () => {
    throw new Error('e1');
  });
  bus.on('x', () => seen.push(2));
  bus.on('x', () => {
    throw new Error('e3');
  });
  bus.on('x', () => seen.push(4));
  bus.emit('x');
  bus.emit('x');
  assert.deepEqual(seen, [2, 4, 2, 4]);
  assert.deepEqual(errors, ['e1', 'e3', 'e1', 'e3']);
});

test('senza onError: emit non lancia, gli altri girano e gli errori restano osservabili in bus.errors', () => {
  const bus = new EventBus();
  const seen = [];
  const boom = new Error('boom');
  bus.on('x', () => {
    throw boom;
  });
  bus.on('x', () => seen.push('b'));
  assert.doesNotThrow(() => bus.emit('x', 7));
  assert.deepEqual(seen, ['b']);
  assert.equal(bus.errors.length, 1);
  assert.equal(bus.errors[0].error, boom);
  assert.equal(bus.errors[0].type, 'x');
  assert.equal(bus.errors[0].payload, 7);
});

test('un onError che lancia non rompe il bus', () => {
  const bus = new EventBus({
    onError: () => {
      throw new Error('onError difettoso');
    },
  });
  const seen = [];
  bus.on('x', () => {
    throw new Error('e');
  });
  bus.on('x', () => seen.push('b'));
  assert.doesNotThrow(() => bus.emit('x'));
  assert.deepEqual(seen, ['b']);
});

test('emit restituisce il numero di handler invocati, compresi quelli che hanno lanciato', () => {
  const bus = new EventBus({ onError: () => {} });
  bus.on('x', () => {
    throw new Error('e');
  });
  bus.on('x', () => {});
  assert.equal(bus.emit('x'), 2);
  assert.equal(bus.emit('niente'), 0);
});

test('handler asincrono rifiutato: l errore arriva a onError, emit resta sincrono', async () => {
  const errors = [];
  const bus = new EventBus({ onError: (e, info) => errors.push([e.message, info.type]) });
  const seen = [];
  bus.on('x', async () => {
    throw new Error('async boom');
  });
  bus.on('x', () => seen.push('b'));
  const n = bus.emit('x');
  assert.equal(n, 2);
  assert.deepEqual(seen, ['b']);
  await flush();
  assert.deepEqual(errors, [['async boom', 'x']]);
});

test('ordine di sottoscrizione mantenuto, anche con lo stesso handler registrato più volte', () => {
  const bus = new EventBus();
  const seen = [];
  const f = () => seen.push('f');
  bus.on('x', f);
  bus.on('x', () => seen.push('g'));
  bus.on('x', f);
  bus.on('x', () => seen.push('h'));
  bus.emit('x');
  assert.deepEqual(seen, ['f', 'g', 'f', 'h']);
  assert.equal(bus.listenerCount('x'), 4);
});

test('la funzione restituita da on() rimuove solo la propria sottoscrizione ed è idempotente', () => {
  const bus = new EventBus();
  const seen = [];
  const f = () => seen.push('f');
  bus.on('x', f);
  bus.on('x', () => seen.push('g'));
  const offSecondF = bus.on('x', f);
  offSecondF();
  offSecondF();
  bus.emit('x');
  assert.deepEqual(seen, ['f', 'g']);
  assert.equal(bus.listenerCount('x'), 2);
});

test('disiscrizione durante l emit: chi non ha ancora girato non viene chiamato, gli altri non vengono saltati', () => {
  const bus = new EventBus();
  const seen = [];
  let offB;
  bus.on('x', () => {
    seen.push('a');
    offB();
  });
  offB = bus.on('x', () => seen.push('b'));
  bus.on('x', () => seen.push('c'));
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'c']);
  seen.length = 0;
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'c']);
});

test('un handler che si disiscrive da solo durante l emit non fa saltare il successivo', () => {
  const bus = new EventBus();
  const seen = [];
  const off = bus.on('x', () => {
    seen.push('a');
    off();
  });
  bus.on('x', () => seen.push('b'));
  bus.on('x', () => seen.push('c'));
  bus.emit('x');
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'b', 'c', 'b', 'c']);
});

test('sottoscrizione durante l emit: il nuovo handler scatta dal prossimo emit', () => {
  const bus = new EventBus();
  const seen = [];
  let added = false;
  bus.on('x', () => {
    seen.push('a');
    if (!added) {
      added = true;
      bus.on('x', () => seen.push('late'));
    }
  });
  bus.on('x', () => seen.push('b'));
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'b']);
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'b', 'a', 'b', 'late']);
});

test('off(type, handler) continua a funzionare', () => {
  const bus = new EventBus();
  const seen = [];
  const h = () => seen.push('h');
  bus.on('x', h);
  bus.off('x', h);
  bus.emit('x');
  assert.deepEqual(seen, []);
});

test('integrazione con gli ordini: un sottoscrittore difettoso non blocca gli altri né il pagamento', async () => {
  const errors = [];
  const events = new EventBus({ onError: (e, info) => errors.push([e.message, info.type]) });
  const shop = makeShop({ events });
  const seen = [];
  events.on('order.paid', () => {
    throw new Error('sottoscrittore rotto');
  });
  events.on('order.paid', (p) => seen.push(p.orderId));
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  const paid = await shop.orders.pay(o.id);
  assert.equal(paid.status, 'paid');
  assert.deepEqual(seen, [o.id]);
  assert.deepEqual(errors, [['sottoscrittore rotto', 'order.paid']]);
});
