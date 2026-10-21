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

// ---- scripts/jira-check.mjs (sola lettura) ----
import { check } from '../../scripts/jira-check.mjs';

test('check: elenca utente, progetto, issue e transizioni senza scrivere nulla', async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira(catalog, { auth });
  const baseUrl = await jira.listen();
  const lines = [];
  const r = await check({ baseUrl, email: 'a@b.c', token: 'tok', project: 'KAN', log: (l) => lines.push(l) });
  assert.equal(r.project, 'KAN');
  assert.equal(r.issues, 6);
  assert.ok(r.transitions.some((t) => t.startsWith('In Review')));
  assert.equal(jira.log.length, 0, 'nessuna scrittura');
  assert.ok(!lines.join('\n').includes('tok'), 'il token non compare nell\'output');
  await jira.close();
});

test('check: token sbagliato -> 401 con messaggio chiaro; progetto sbagliato -> 404', async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira(catalog, { auth });
  const baseUrl = await jira.listen();
  await assert.rejects(() => check({ baseUrl, email: 'a@b.c', token: 'SBAGLIATO', log: () => {} }), /401.*non corrispondono/);
  await assert.rejects(() => check({ baseUrl, email: 'a@b.c', token: 'tok', project: 'ZZZ', log: () => {} }), /404/);
  await jira.close();
});

// ---- ambito del controller e direzione del link osservata su Jira reale ----
test('ambito: i ticket dell\'utente senza etichetta tae-benchmark non vengono mai toccati (nemmeno da reconcile)', async () => {
  const { jira, mk } = await setup();
  // come il KAN-2 reale: In corso, senza lease, non del benchmark
  jira.addIssue('KAN-2', { summary: 'Task 2', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } });
  const qc = mk();
  const before = jira.log.length;
  assert.deepEqual(await qc.reconcile(10 ** 12), []);
  assert.equal(status(jira, 'KAN-2'), 'In Progress');
  assert.equal(jira.log.length, before, 'nessuna scrittura su KAN-2');
  const taken = [];
  let k;
  while ((k = await qc.claim('w1'))) taken.push(k);
  assert.ok(!taken.includes('KAN-2'));
  await jira.close();
});

test('seed con Jira che inverte la direzione: la rileva, ricrea il link e lo verifica', async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira([], { projectKey: 'KAN', auth, invertLinks: true });
  const baseUrl = await jira.listen();
  const lines = [];
  const r = await seed({ baseUrl, email: 'a@b.c', token: 'tok', project: 'KAN', catalog, apply: true, mapPath: null, log: (l) => lines.push(l) });
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
  assert.ok(lines.some((l) => /direzione invertita/.test(l)), 'ha segnalato e corretto l\'inversione');
  const blocked = jira.issues.get(r.map['ISSUE-4']);
  assert.ok(blocked.fields.issuelinks.some((l) => l.inwardIssue?.key === r.map['ISSUE-1']));
  assert.equal([...jira.issues.values()].flatMap((i) => i.fields.issuelinks).length, 2, 'un solo collegamento (visto dai due lati)');
  // e il controller, con quel link, non sceglie ISSUE-4 prima del Done di ISSUE-1
  jira.issues.get(r.map['ISSUE-4']).fields.labels.push('ready');
  const qc = new QueueController({ baseUrl, statePath: join(mkdtempSync(join(tmpdir(), 'qc-')), 's.json'), authHeader: auth });
  const taken = [];
  let k;
  while ((k = await qc.claim('w1'))) taken.push(k);
  assert.ok(!taken.includes(r.map['ISSUE-4']));
  await jira.close();
});

test('seed: una seconda esecuzione su Jira con direzione invertita non duplica né rompe i link', async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira([], { projectKey: 'KAN', auth, invertLinks: true });
  const baseUrl = await jira.listen();
  const args = { baseUrl, email: 'a@b.c', token: 'tok', project: 'KAN', catalog, apply: true, mapPath: null, log: () => {} };
  await seed(args);
  const r2 = await seed(args);
  assert.equal(r2.warnings.length, 0);
  assert.equal(jira.issues.size, 6);
  assert.equal([...jira.issues.values()].flatMap((i) => i.fields.issuelinks).length, 2);
  await jira.close();
});

test('check: mostra i collegamenti con il lato e il testo', async () => {
  const jira = createMockJira(catalog, {});
  const baseUrl = await jira.listen();
  const lines = [];
  await check({ baseUrl, email: 'a', token: 'b', log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /collegamento \[Blocks\] inwardIssue=ISSUE-1/.test(l)));
  await jira.close();
});

// ---- scripts/jira-s05-live.mjs contro il mock (la stessa prova che l'utente esegue su Jira reale) ----
import { runS05Live } from '../../scripts/jira-s05-live.mjs';

test('S05 live (su mock): passa, rimette tutto a posto e non tocca i ticket dell\'utente', async () => {
  const auth = 'Basic ' + Buffer.from('a@b.c:tok').toString('base64');
  const jira = createMockJira([], { projectKey: 'KAN', auth });
  const baseUrl = await jira.listen();
  const args = { baseUrl, email: 'a@b.c', token: 'tok', project: 'KAN', log: () => {} };
  await seed({ ...args, catalog, apply: true, mapPath: null });
  jira.addIssue('USR-1', { summary: 'ticket utente', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } });
  const labelsBefore = JSON.stringify([...jira.issues.values()].map((i) => [i.key, i.fields.labels]));

  const dry = await runS05Live({ ...args, apply: false });
  assert.equal(dry.applied, false);

  const r = await runS05Live({ ...args, apply: true });
  assert.equal(r.record.status, 'PASS', JSON.stringify(r.record.checks) + r.record.notes);
  assert.equal(Object.keys(r.record.checks).length >= 8, true);
  // cleanup completo
  for (const i of jira.issues.values()) {
    if (i.key === 'USR-1') { assert.equal(i.fields.status.name, 'In Progress'); continue; }
    assert.equal(i.fields.status.name, 'To Do', `${i.key} non rimessa a To Do`);
    assert.equal(i.comments.length, 0, `${i.key} ha ancora commenti`);
    assert.equal(i.remotelinks.length, 0, `${i.key} ha ancora link`);
  }
  assert.equal(JSON.stringify([...jira.issues.values()].map((i) => [i.key, i.fields.labels])), labelsBefore);
  await jira.close();
});

test('S05 live: rifiuta di partire se il progetto non ha le 6 issue o non sono tutte To Do', async () => {
  const jira = createMockJira([], { projectKey: 'KAN' });
  const baseUrl = await jira.listen();
  const args = { baseUrl, email: 'a', token: 'b', project: 'KAN', log: () => {} };
  await assert.rejects(() => runS05Live({ ...args, apply: true }), /Attese 6 issue/);
  await seed({ ...args, catalog, apply: true, mapPath: null });
  jira.setStatus([...jira.issues.keys()][0], 'In Progress');
  await assert.rejects(() => runS05Live({ ...args, apply: true }), /Stato non pulito/);
  await jira.close();
});
