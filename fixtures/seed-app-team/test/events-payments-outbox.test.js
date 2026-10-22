import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, FakeGateway, Outbox } from '../src/index.js';

test('EventBus chiama gli handler in ordine e isola gli errori', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('x', () => seen.push('a'));
  bus.on('x', () => {
    throw new Error('boom');
  });
  bus.on('x', () => seen.push('c'));
  bus.emit('x', { n: 1 });
  assert.deepEqual(seen, ['a', 'c']);
  assert.equal(bus.errors.length, 1);
  assert.equal(bus.log.length, 1);
});

test('EventBus: la disiscrizione funziona', () => {
  const bus = new EventBus();
  let calls = 0;
  const off = bus.on('x', () => calls++);
  bus.emit('x');
  off();
  bus.emit('x');
  assert.equal(calls, 1);
});

test('FakeGateway addebita e rimborsa fino al massimo addebitato', () => {
  const gw = new FakeGateway();
  const { paymentRef } = gw.charge({ customerId: 'c1', cents: 1000, ref: 'r1' });
  gw.refund(paymentRef, 400);
  gw.refund(paymentRef, 600);
  assert.throws(() => gw.refund(paymentRef, 1), { code: 'refund_exceeds_charge' });
  assert.equal(gw.refunds.length, 2);
});

test('FakeGateway: rimborso su pagamento sconosciuto e guasto iniettato', () => {
  const gw = new FakeGateway();
  assert.throws(() => gw.refund('pay_x', 10), { code: 'unknown_payment' });
  const { paymentRef } = gw.charge({ customerId: 'c1', cents: 1000, ref: 'r1' });
  gw.failNextRefund();
  assert.throws(() => gw.refund(paymentRef, 10), { code: 'gateway_down' });
  gw.refund(paymentRef, 10); // il guasto vale una volta sola
  assert.equal(gw.refunds.length, 1);
});

test('Outbox accoda, deduplica per chiave e segna come spedito', () => {
  const box = new Outbox();
  const a = box.enqueue({ to: 'c1', subject: 's', body: 'b', dedupeKey: 'k1' });
  const again = box.enqueue({ to: 'c1', subject: 's', body: 'b2', dedupeKey: 'k1' });
  assert.equal(a.id, again.id);
  assert.equal(box.messages.length, 1);
  assert.equal(box.pending().length, 1);
  box.markSent(a.id);
  assert.equal(box.pending().length, 0);
  assert.throws(() => box.enqueue({ to: 'c1', subject: '', body: 'b' }), { code: 'invalid_message' });
});
