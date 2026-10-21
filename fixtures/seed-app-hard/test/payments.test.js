import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeGateway, PaymentService } from '../src/index.js';

const req = (key = 'k1', amountCents = 1000) => ({ orderId: 'o1', amountCents, currency: 'EUR', idempotencyKey: key });

test('charge registra un addebito', async () => {
  const gw = new FakeGateway();
  const r = await gw.charge(req());
  assert.equal(r.replayed, false);
  assert.equal(gw.captures.length, 1);
});

test('la stessa chiave non addebita due volte', async () => {
  const gw = new FakeGateway();
  const a = await gw.charge(req());
  const b = await gw.charge(req());
  assert.equal(b.replayed, true);
  assert.equal(b.id, a.id);
  assert.equal(gw.captures.length, 1);
});

test('un rifiuto non viene memorizzato: la stessa chiave si può riprovare', async () => {
  const gw = new FakeGateway();
  gw.queueFailure('decline');
  await assert.rejects(gw.charge(req()), (e) => e.code === 'card_declined');
  await gw.charge(req());
  assert.equal(gw.captures.length, 1);
});

test('timeout-after-charge: addebito avvenuto ma risposta persa', async () => {
  const gw = new FakeGateway();
  gw.queueFailure('timeout-after-charge');
  await assert.rejects(gw.charge(req()), (e) => e.code === 'timeout');
  assert.equal(gw.captures.length, 1);
  const again = await gw.charge(req());
  assert.equal(again.replayed, true);
  assert.equal(gw.captures.length, 1);
});

test('due richieste contemporanee con la stessa chiave: la seconda fallisce', async () => {
  const gw = new FakeGateway();
  const [a, b] = await Promise.allSettled([gw.charge(req()), gw.charge(req())]);
  assert.equal(a.status, 'fulfilled');
  assert.equal(b.status, 'rejected');
  assert.equal(b.reason.code, 'idempotency_in_progress');
  assert.equal(gw.captures.length, 1);
});

test('importo non valido rifiutato', async () => {
  const gw = new FakeGateway();
  await assert.rejects(gw.charge(req('k', 0)), (e) => e.code === 'invalid_amount');
});

test('refund: replay per chiave e tetto sull importo addebitato', async () => {
  const gw = new FakeGateway();
  const ch = await gw.charge(req());
  await gw.refund({ chargeId: ch.id, amountCents: 600, idempotencyKey: 'r1' });
  const again = await gw.refund({ chargeId: ch.id, amountCents: 600, idempotencyKey: 'r1' });
  assert.equal(again.replayed, true);
  assert.equal(gw.refunds.length, 1);
  await assert.rejects(gw.refund({ chargeId: ch.id, amountCents: 500, idempotencyKey: 'r2' }), (e) => e.code === 'refund_exceeds_charge');
});

test('PaymentService.collect usa il totale dell ordine', async () => {
  const gw = new FakeGateway();
  const svc = new PaymentService({ gateway: gw });
  await svc.collect({ id: 'o9', payAttempts: 1, totals: { totalCents: 4321 } });
  assert.equal(gw.captures[0].amountCents, 4321);
  assert.equal(gw.captures[0].orderId, 'o9');
});
