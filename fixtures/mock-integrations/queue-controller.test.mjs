import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockJira } from './mock-jira-http.mjs';
import { QueueController } from './queue-controller.mjs';

const catalog = JSON.parse(readFileSync(new URL('../issue-catalog/issues.json', import.meta.url), 'utf8'));

async function setup() {
  const jira = createMockJira(catalog);
  const baseUrl = await jira.listen();
  const statePath = join(mkdtempSync(join(tmpdir(), 'qc-')), 'state.json');
  return { jira, baseUrl, statePath, mk: () => new QueueController({ baseUrl, statePath }) };
}

test('S05: drena la coda in ordine, mai ISSUE-4 prima di ISSUE-1 né ISSUE-5 (ambigua)', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  const order = [];
  let k;
  while ((k = await qc.claim('w1'))) {
    order.push(k);
    await qc.complete(k, 'w1', `https://git.example/pr/${k}`);
  }
  assert.equal(order[0], 'ISSUE-1');
  assert.ok(!order.includes('ISSUE-5'), 'ambigua: mai selezionata');
  assert.ok(!order.includes('ISSUE-4'), 'ISSUE-4 non ha etichetta ready (non pronta) anche se ISSUE-1 è Done');
  assert.deepEqual([...order].sort(), ['ISSUE-1', 'ISSUE-2', 'ISSUE-3', 'ISSUE-6']);
  assert.equal(jira.issues.get('ISSUE-1').fields.status.name, 'Done');
  assert.equal(jira.issues.get('ISSUE-1').remotelinks[0].url, 'https://git.example/pr/ISSUE-1');
  assert.equal(jira.issues.get('ISSUE-5').fields.status.name, 'To Do');
  await jira.close();
});

test('S04: tre worker concorrenti non reclamano mai la stessa issue', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  const got = await Promise.all(['w1', 'w2', 'w3', 'w4', 'w5'].map((w) => qc.claim(w)));
  const taken = got.filter(Boolean);
  assert.equal(new Set(taken).size, taken.length, `doppioni: ${taken}`);
  const inProgress = [...jira.issues.values()].filter((i) => i.fields.status.name === 'In Progress').map((i) => i.key);
  assert.deepEqual([...inProgress].sort(), [...taken].sort());
  await jira.close();
});

test('S06: riavvio del controller, lease scaduta riconciliata e issue riassegnabile', async () => {
  const { jira, mk } = await setup();
  const qc1 = mk();
  assert.equal(await qc1.claim('w1', 1000, 500), 'ISSUE-1');
  const qc2 = mk(); // nuovo processo, stesso stato su file
  assert.equal(qc2.state.leases['ISSUE-1'].workerId, 'w1');
  assert.deepEqual(await qc2.reconcile(2000), ['ISSUE-1']);
  assert.equal(jira.issues.get('ISSUE-1').fields.status.name, 'To Do');
  assert.equal(await qc2.claim('w2', 2000), 'ISSUE-1');
  await jira.close();
});

test('S06: lease ancora valida dopo il riavvio non viene rilasciata', async () => {
  const { jira, mk } = await setup();
  assert.equal(await mk().claim('w1', 1000, 60_000), 'ISSUE-1');
  assert.deepEqual(await mk().reconcile(2000), []);
  assert.equal(jira.issues.get('ISSUE-1').fields.status.name, 'In Progress');
  await jira.close();
});

test('S05: evento webhook duplicato applicato una volta, anche dopo il riavvio', async () => {
  const { jira, mk } = await setup();
  assert.equal(mk().handleEvent({ id: 'evt-1' }).applied, true);
  assert.equal(mk().handleEvent({ id: 'evt-1' }).applied, false);
  await jira.close();
});

test('un complete con worker sbagliato è rifiutato e non tocca Jira', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  await qc.claim('w1');
  const before = jira.log.length;
  assert.equal(await qc.complete('ISSUE-1', 'w2', 'https://x'), false);
  assert.equal(jira.log.length, before);
  await jira.close();
});

test('rollback: se Jira rifiuta la transizione la lease non resta orfana', async () => {
  const { jira, baseUrl, statePath } = await setup();
  const qc = new QueueController({ baseUrl, statePath });
  await jira.close(); // Jira "indisponibile"
  await assert.rejects(() => qc.claim('w1'));
  assert.deepEqual(qc.state.leases, {});
});
