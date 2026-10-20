import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockQueue } from './mock-jira.mjs';

const catalog = JSON.parse(
  readFileSync(new URL('../issue-catalog/issues.json', import.meta.url), 'utf8'),
);
const fresh = () => {
  const q = new MockQueue(join(mkdtempSync(join(tmpdir(), 'mockjira-')), 'state.json'));
  q.load(catalog);
  return q;
};

test('la issue bloccata e quella ambigua non vengono mai scelte', () => {
  const q = fresh();
  const claimed = [];
  let k;
  while ((k = q.claim('w1', 0))) claimed.push(k);
  assert.ok(!claimed.includes('ISSUE-4'), 'ISSUE-4 è bloccata da ISSUE-1');
  assert.ok(!claimed.includes('ISSUE-5'), 'ISSUE-5 è ambigua (ready=false)');
});

test('due worker non reclamano la stessa issue', () => {
  const q = fresh();
  const a = q.claim('w1', 0);
  const b = q.claim('w2', 0);
  assert.notEqual(a, b);
});

test('priorità: ISSUE-1 (High) viene prima delle Medium', () => {
  assert.equal(fresh().claim('w1', 0), 'ISSUE-1');
});

test('dopo Done di ISSUE-1, ISSUE-4 resta non pronta finché non arriva evento ready', () => {
  const q = fresh();
  q.claim('w1', 0);
  q.complete('ISSUE-1', 'w1', 'pr://1');
  const keys = [];
  let k;
  while ((k = q.claim('w1', 0))) keys.push(k);
  assert.ok(!keys.includes('ISSUE-4'));
  q.applyEvent({ id: 'e1', key: 'ISSUE-4', type: 'ready' });
  assert.equal(q.claim('w1', 0), 'ISSUE-4');
});

test('evento duplicato applicato una sola volta', () => {
  const q = fresh();
  assert.equal(q.applyEvent({ id: 'e9', key: 'ISSUE-5', type: 'ready' }).applied, true);
  assert.equal(q.applyEvent({ id: 'e9', key: 'ISSUE-5', type: 'ready' }).applied, false);
});

test('riavvio: stato persistito e lease scaduta riconciliata', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'mockjira-')), 'state.json');
  const q1 = new MockQueue(path);
  q1.load(catalog);
  assert.equal(q1.claim('w1', 1000, 500), 'ISSUE-1');
  const q2 = new MockQueue(path); // simula il riavvio dell'orchestratore
  assert.equal(q2.state.issues['ISSUE-1'].status, 'In Progress');
  assert.deepEqual(q2.reconcile(2000), ['ISSUE-1']);
  assert.equal(q2.claim('w2', 2000), 'ISSUE-1');
});

test('heartbeat prolunga la lease solo al proprietario', () => {
  const q = fresh();
  q.claim('w1', 0, 100);
  assert.equal(q.heartbeat('ISSUE-1', 'w2', 50), false);
  assert.equal(q.heartbeat('ISSUE-1', 'w1', 50, 100), true);
});
