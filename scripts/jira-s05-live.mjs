#!/usr/bin/env node
// S05 su JIRA REALE (nessun LLM, nessun costo): prova il controller di coda contro il progetto indicato.
// Cosa fa: claim in ordine di priorità, claim concorrenti senza doppioni, "In revisione" alla PR, dipendenza
// sbloccata solo dal "Completata" (merge umano), riconciliazione, rispetto dei ticket che non sono del benchmark.
// Sicurezza:
//  - DRY-RUN di default (nessuna rete). Serve --apply per eseguire.
//  - Tocca SOLO le issue con l'etichetta tae-benchmark; rifiuta di partire se non sono tutte "To Do" e se non sono 6.
//  - Alla fine rimette stati, etichetta `ready` e rimuove commenti e link creati (cleanup anche in caso di errore).
//  - Il token non viene mai stampato.
// Uso: JIRA_BASE_URL=... JIRA_EMAIL=... JIRA_API_TOKEN=... [JIRA_PROJECT=KAN] node scripts/jira-s05-live.mjs [--apply]
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { QueueController } from '../fixtures/mock-integrations/queue-controller.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = 'example.invalid'; // dominio riservato: riconosce i link/commenti creati da questa prova

export async function runS05Live({ baseUrl, email, token, project = 'KAN', apply = false, log = console.log, resultPath = null }) {
  if (!apply) {
    log('DRY-RUN: nessuna chiamata di rete. Con --apply la prova esegue, sulle sole issue con etichetta tae-benchmark:');
    for (const s of [
      '1. claim in ordine di priorità (attesa: ISSUE-1)',
      '2. tre claim concorrenti senza doppioni',
      '3. completamento di ISSUE-1: PR finta (https://example.invalid), commento, stato "In revisione"',
      '4. ISSUE-4 resa pronta ma NON presa finché ISSUE-1 è solo "In revisione"',
      '5. "Completata" su ISSUE-1 (merge umano simulato): ISSUE-4 diventa presa',
      '6. riconciliazione con lease scadute: le issue "In corso" tornano "Da completare"',
      '7. i ticket non del benchmark (es. KAN-2) restano invariati',
      '8. cleanup: stati, etichetta ready, commenti e link rimessi come prima',
    ]) log('   ' + s);
    return { applied: false };
  }

  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  const headers = { 'content-type': 'application/json', authorization: auth };
  const call = async (method, path, body) => {
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        break;
      } catch (e) {
        if (method !== 'GET' && !path.endsWith('/search/jql')) throw e; // niente retry sulle scritture
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  const search = async (jql) =>
    (await call('POST', '/rest/api/3/search/jql', { jql, fields: ['summary', 'status', 'labels', 'issuelinks'], maxResults: 100 })).issues;
  const statusOf = async (key) => (await call('GET', `/rest/api/3/issue/${key}?fields=status`)).fields.status;
  const toCategory = async (key, cat) => {
    const { transitions } = await call('GET', `/rest/api/3/issue/${key}/transitions`);
    const t = transitions.find((x) => x.to.statusCategory?.key === cat && !/revis|review/i.test(x.to.name));
    if (!t) throw new Error(`${key}: nessuna transizione verso la categoria ${cat}`);
    await call('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: t.id } });
  };

  const bench = await search(`project = ${project} AND labels = "tae-benchmark" ORDER BY created ASC`);
  if (bench.length !== 6) throw new Error(`Attese 6 issue tae-benchmark, trovate ${bench.length}. Esegui prima scripts/jira-seed.mjs --apply.`);
  const notClean = bench.filter((i) => i.fields.status.statusCategory.key !== 'new');
  if (notClean.length) throw new Error(`Stato non pulito: ${notClean.map((i) => i.key).join(', ')} non sono in "To Do". Rimettile a "Da completare" e riprova.`);
  const keyOf = (n) => bench.find((i) => i.fields.labels.includes(`tae-issue-${n}`))?.key;
  const [k1, k2, k3, k4, k5, k6] = [1, 2, 3, 4, 5, 6].map(keyOf);
  const originalLabels = Object.fromEntries(bench.map((i) => [i.key, [...i.fields.labels]]));
  const benchKeys = new Set(bench.map((i) => i.key));
  const others = (await search(`project = ${project} ORDER BY created ASC`)).filter((i) => !benchKeys.has(i.key));
  const othersBefore = Object.fromEntries(others.map((i) => [i.key, i.fields.status.name]));

  const checks = {};
  const notes = [];
  const qc = new QueueController({
    baseUrl,
    statePath: join(mkdtempSync(join(tmpdir(), 's05live-')), 'state.json'),
    authHeader: auth,
    projectKey: project,
  });
  const started = new Date();
  let failure = null;
  try {
    const first = await qc.claim('w1');
    checks.first_claim_is_highest_priority = first === k1;
    log(`  1. primo claim: ${first} (atteso ${k1})`);

    const got = (await Promise.all(['w2', 'w3', 'w4'].map((w) => qc.claim(w)))).filter(Boolean);
    checks.concurrent_claims_distinct = got.length === 3 && new Set([first, ...got]).size === 4;
    log(`  2. claim concorrenti: ${got.join(', ')}`);

    checks.complete_moves_to_review = false;
    await qc.complete(first, 'w1', `https://${MARK}/pr/1`);
    const st = await statusOf(first);
    checks.complete_moves_to_review = /revis|review/i.test(st.name);
    log(`  3. ${first} dopo la PR: "${st.name}"`);

    await call('PUT', `/rest/api/3/issue/${k4}`, { fields: { labels: [...originalLabels[k4], 'ready'] } });
    const early = await qc.claim('w5');
    checks.blocked_not_taken_while_in_review = early === null;
    log(`  4. ${k4} resa pronta, claim con ${first} in revisione: ${early ?? 'nessuna issue (corretto)'}`);

    await toCategory(first, 'done');
    const late = await qc.claim('w5');
    checks.unblocked_after_done = late === k4;
    log(`  5. dopo "Completata" su ${first}: claim = ${late} (atteso ${k4})`);

    const released = (await qc.reconcile(Date.now() + 1e9)).sort();
    const expected = [...got, ...(late ? [late] : [])].sort();
    checks.reconcile_releases_in_progress = JSON.stringify(released) === JSON.stringify(expected);
    log(`  6. riconciliate: ${released.join(', ')}`);

    checks.duplicate_event_idempotent = qc.handleEvent({ id: 'live-evt-1' }).applied === true && qc.handleEvent({ id: 'live-evt-1' }).applied === false;

    const othersAfter = Object.fromEntries((await search(`project = ${project} ORDER BY created ASC`)).filter((i) => !benchKeys.has(i.key)).map((i) => [i.key, i.fields.status.name]));
    checks.user_tickets_untouched = JSON.stringify(othersAfter) === JSON.stringify(othersBefore);
    log(`  7. ticket non del benchmark invariati: ${checks.user_tickets_untouched}`);
  } catch (e) {
    failure = e;
    notes.push(`errore: ${e.message}`);
  } finally {
    // 8. cleanup, sempre, solo sulle issue del benchmark
    for (const key of benchKeys) {
      try {
        const cur = await statusOf(key);
        if (cur.statusCategory.key !== 'new') await toCategory(key, 'new');
        await call('PUT', `/rest/api/3/issue/${key}`, { fields: { labels: originalLabels[key] } });
        const links = await call('GET', `/rest/api/3/issue/${key}/remotelink`);
        for (const l of links ?? []) if (String(l.object?.url).includes(MARK)) await call('DELETE', `/rest/api/3/issue/${key}/remotelink/${l.id}`);
        const { comments } = await call('GET', `/rest/api/3/issue/${key}/comment`);
        for (const c of comments ?? []) if (JSON.stringify(c.body).includes(MARK)) await call('DELETE', `/rest/api/3/issue/${key}/comment/${c.id}`);
      } catch (e) {
        notes.push(`cleanup ${key}: ${e.message}`);
      }
    }
    log('  8. cleanup eseguito' + (notes.some((n) => n.startsWith('cleanup')) ? ' CON ERRORI (vedi note)' : ''));
  }

  const finished = new Date();
  const pass = !failure && Object.values(checks).length >= 8 && Object.values(checks).every(Boolean);
  const record = {
    run_id: randomUUID(),
    candidate: 'reference-queue-controller+jira-cloud',
    candidate_version: null,
    scenario_id: 'S05',
    mode: 'MOCK', // nessun LLM; Jira REALE
    model: null,
    baseline_commit: null,
    status: pass ? 'PASS' : 'FAIL',
    started_at_utc: started.toISOString(),
    finished_at_utc: finished.toISOString(),
    duration_seconds: (finished - started) / 1000,
    input_tokens: null,
    output_tokens: null,
    cache_tokens: null,
    estimated_cost_usd: 0,
    retries: 0,
    human_interventions: 0,
    checks,
    artifact_paths: [],
    blockers: [],
    notes: `Jira Cloud reale, progetto ${project}, nessun LLM. Issue: ${[k1, k2, k3, k4, k5, k6].join(',')}. ${notes.join(' | ')}`,
  };
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, JSON.stringify(record, null, 2));
  }
  log(pass ? 'ESITO: PASS' : `ESITO: FAIL ${JSON.stringify(checks)} ${notes.join(' | ')}`);
  return { applied: true, record };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const apply = process.argv.includes('--apply');
  const { JIRA_BASE_URL: baseUrl, JIRA_EMAIL: email, JIRA_API_TOKEN: token, JIRA_PROJECT: project = 'KAN' } = process.env;
  if (apply && (!baseUrl || !email || !token)) {
    console.error("Mancano JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN nell'ambiente.");
    process.exit(2);
  }
  const resultPath = join(root, 'results', `S05-jira-live-${randomUUID().slice(0, 8)}.json`);
  runS05Live({ baseUrl, email, token, project, apply, resultPath }).then((r) => process.exit(r.applied && r.record.status !== 'PASS' ? 1 : 0)).catch((e) => {
    console.error('ERRORE:', e.message.split(token ?? '\u0000').join('***'));
    process.exit(1);
  });
}
