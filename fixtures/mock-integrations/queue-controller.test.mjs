import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockJira } from './mock-jira-http.mjs';
import { QueueController } from './queue-controller.mjs';
import { seed } from '../../scripts/jira-seed.mjs';

const catalog = JSON.parse(readFileSync(new URL('../issue-catalog/issues.json', import.meta.url), 'utf8'));
const status = (jira, k) => jira.issues.get(k).fields.status.name;

async function setup() {
  const jira = createMockJira(catalog);
  const baseUrl = await jira.listen();
  const statePath = join(mkdtempSync(join(tmpdir(), 'qc-')), 'state.json');
  return { jira, baseUrl, statePath, mk: () => new QueueController({ baseUrl, statePath, projectKey: 'KAN' }) };
}

test('S05: drena la coda in ordine, mai ISSUE-4 (bloccata) né ISSUE-5 (ambigua); PR pronta = In Review', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  const order = [];
  let k;
  while ((k = await qc.claim('w1'))) {
    order.push(k);
    await qc.complete(k, 'w1', `https://git.example/pr/${k}`);
  }
  assert.equal(order[0], 'ISSUE-1');
  assert.deepEqual([...order].sort(), ['ISSUE-1', 'ISSUE-2', 'ISSUE-3', 'ISSUE-6']);
  assert.equal(status(jira, 'ISSUE-1'), 'In Review', 'la PR pronta non porta a Done');
  assert.equal(jira.issues.get('ISSUE-1').remotelinks[0].url, 'https://git.example/pr/ISSUE-1');
  assert.equal(status(jira, 'ISSUE-5'), 'To Do');
  await jira.close();
});

test('un bloccante In Review non sblocca il dipendente: serve il Done (merge umano)', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  jira.issues.get('ISSUE-4').fields.labels.push('ready'); // ora è pronta, ma bloccata da ISSUE-1
  assert.equal(await qc.claim('w1'), 'ISSUE-1');
  await qc.complete('ISSUE-1', 'w1', 'https://pr/1');
  const taken = [];
  let k;
  while ((k = await qc.claim('w1'))) { taken.push(k); await qc.complete(k, 'w1', 'https://pr/x'); }
  assert.ok(!taken.includes('ISSUE-4'), 'ISSUE-1 è solo In Review');
  jira.setStatus('ISSUE-1', 'Done'); // un umano fa il merge
  assert.equal(await qc.claim('w1'), 'ISSUE-4');
  await jira.close();
});

test('stati localizzati: "Da completare" riconosciuto come To Do', async () => {
  const { jira, mk } = await setup();
  jira.issues.get('ISSUE-1').fields.status = { name: 'Da completare', statusCategory: { key: 'new' } };
  assert.equal(await mk().claim('w1'), 'ISSUE-1');
  assert.equal(status(jira, 'ISSUE-1'), 'In Progress');
  await jira.close();
});

test('S04: cinque worker concorrenti non reclamano mai la stessa issue', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  const got = await Promise.all(['w1', 'w2', 'w3', 'w4', 'w5'].map((w) => qc.claim(w)));
  const taken = got.filter(Boolean);
  assert.equal(new Set(taken).size, taken.length, `doppioni: ${taken}`);
  const inProgress = [...jira.issues.keys()].filter((k) => status(jira, k) === 'In Progress');
  assert.deepEqual([...inProgress].sort(), [...taken].sort());
  await jira.close();
});

test('S06: riavvio del controller, lease scaduta riconciliata e issue riassegnabile', async () => {
  const { jira, mk } = await setup();
  assert.equal(await mk().claim('w1', 1000, 500), 'ISSUE-1');
  const qc2 = mk();
  assert.equal(qc2.state.leases['ISSUE-1'].workerId, 'w1');
  assert.deepEqual(await qc2.reconcile(2000), ['ISSUE-1']);
  assert.equal(status(jira, 'ISSUE-1'), 'To Do');
  assert.equal(await qc2.claim('w2', 2000), 'ISSUE-1');
  await jira.close();
});

test('S06: lease valida dopo il riavvio non rilasciata; In Review non viene mai riportata indietro', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  await qc.claim('w1', 1000, 60_000);
  assert.deepEqual(await mk().reconcile(2000), []);
  await qc.complete('ISSUE-1', 'w1', 'https://pr/1');
  assert.deepEqual(await mk().reconcile(10 ** 12), [], 'una issue In Review senza lease non va riaperta');
  assert.equal(status(jira, 'ISSUE-1'), 'In Review');
  await jira.close();
});

test('S05: evento webhook duplicato applicato una volta, anche dopo il riavvio', async () => {
  const { jira, mk } = await setup();
  assert.equal(mk().handleEvent({ id: 'evt-1' }).applied, true);
  assert.equal(mk().handleEvent({ id: 'evt-1' }).applied, false);
  await jira.close();
});

test('complete con worker sbagliato rifiutato e Jira non toccata', async () => {
  const { jira, mk } = await setup();
  const qc = mk();
  await qc.claim('w1');
  const before = jira.log.length;
  assert.equal(await qc.complete('ISSUE-1', 'w2', 'https://x'), false);
  assert.equal(jira.log.length, before);
  await jira.close();
});

test('rollback: se Jira è indisponibile la lease non resta orfana', async () => {
  const { jira, baseUrl, statePath } = await setup();
  const qc = new QueueController({ baseUrl, statePath });
  await jira.close();
  await assert.rejects(() => qc.claim('w1'));
  assert.deepEqual(qc.state.leases, {});
});

test('fedeltà del mock: commento in testo semplice rifiutato (Jira v3 vuole ADF)', async () => {
  const { jira, baseUrl } = await setup();
  const r = await fetch(`${baseUrl}/rest/api/3/issue/ISSUE-1/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'testo semplice' }) });
  assert.equal(r.status, 400);
  await jira.close();
});

test('autenticazione: senza header corretto il mock risponde 401', async () => {
  const jira = createMockJira(catalog, { auth: 'Basic abc' });
  const baseUrl = await jira.listen();
  const qc = new QueueController({ baseUrl, statePath: join(mkdtempSync(join(tmpdir(), 'qc-')), 's.json') });
  await assert.rejects(() => qc.claim('w1'), /401/);
  const ok = new QueueController({ baseUrl, statePath: join(mkdtempSync(join(tmpdir(), 'qc-')), 's.json'), authHeader: 'Basic abc' });
  assert.equal(await ok.claim('w1'), 'ISSUE-1');
  await jira.close();
});

// ---- scripts/jira-seed.mjs contro un progetto vuoto ----
const seedEnv = async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira([], { projectKey: 'KAN', auth });
  const baseUrl = await jira.listen();
  return { jira, baseUrl, args: { baseUrl, email: 'a@b.c', token: 'tok', project: 'KAN', catalog, log: () => {}, mapPath: null } };
};

test('seed: dry-run non fa nessuna chiamata', async () => {
  const jira = createMockJira([], { projectKey: 'KAN' });
  const r = await seed({ baseUrl: 'http://127.0.0.1:1', email: 'x', token: 'y', catalog, apply: false, log: () => {} });
  assert.equal(r.applied, false);
  assert.equal(r.plan.length, 6);
  assert.equal(jira.log.length, 0);
});

test('seed --apply: crea 6 issue, etichette, collegamento e il controller le legge correttamente', async () => {
  const { jira, baseUrl, args } = await seedEnv();
  const r = await seed({ ...args, apply: true });
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
  assert.equal(jira.issues.size, 6);
  const k4 = r.map['ISSUE-4'];
  const k1 = r.map['ISSUE-1'];
  assert.ok(jira.issues.get(k4).fields.issuelinks.some((l) => l.inwardIssue?.key === k1), 'ISSUE-4 è bloccata da ISSUE-1');
  assert.ok(jira.issues.get(r.map['ISSUE-1']).fields.labels.includes('ready'));
  assert.ok(!jira.issues.get(r.map['ISSUE-5']).fields.labels.includes('ready'), 'ISSUE-5 (ambigua) non è ready');
  const qc = new QueueController({ baseUrl, statePath: join(mkdtempSync(join(tmpdir(), 'qc-')), 's.json'), authHeader: args && 'Basic ' + Buffer.from('a@b.c:tok').toString('base64') });
  assert.equal(await qc.claim('w1'), k1, 'priorità High: ISSUE-1 per prima');
  await jira.close();
});

test('seed --apply è idempotente: una seconda esecuzione non crea duplicati', async () => {
  const { jira, args } = await seedEnv();
  await seed({ ...args, apply: true });
  await seed({ ...args, apply: true });
  assert.equal(jira.issues.size, 6);
  const links = [...jira.issues.values()].flatMap((i) => i.fields.issuelinks).length;
  assert.equal(links, 2, 'un solo collegamento (visto da entrambi i lati)');
  await jira.close();
});
