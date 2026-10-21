#!/usr/bin/env node
// Crea nel progetto Jira indicato le 6 issue sintetiche di fixtures/issue-catalog/issues.json.
// Sicurezza:
//  - DRY-RUN di default: senza --apply non fa nessuna chiamata di rete e non scrive nulla.
//  - Opera SOLO sul progetto indicato (JIRA_PROJECT, default KAN) e solo sull'host di JIRA_BASE_URL.
//  - Il token non viene mai stampato né scritto su file; si legge da variabili d'ambiente.
//  - Idempotente: ogni issue porta l'etichetta tae-<chiave-catalogo>; se esiste già non viene ricreata.
// Uso:
//   JIRA_BASE_URL=https://<sito>.atlassian.net JIRA_EMAIL=<email> JIRA_API_TOKEN=<token> \
//     node scripts/jira-seed.mjs            # anteprima
//   ... node scripts/jira-seed.mjs --apply  # crea
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adf = (paras) => ({
  type: 'doc',
  version: 1,
  content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

export const planFor = (catalog) =>
  catalog.map((c) => ({
    catalogKey: c.key,
    label: `tae-${c.key.toLowerCase()}`,
    summary: `[${c.key}] ${c.summary}`,
    // Tipo "Task" per tutte: un progetto team-managed può non avere "Bug"; il tipo originale resta nel testo.
    description: adf([
      `Tipo originale: ${c.type}. Priorità: ${c.priority}. Scenario: ${c.scenario}.`,
      c.description,
      c.acceptance.length ? `Criteri di accettazione: ${c.acceptance.join(' | ')}` : 'Criteri di accettazione: (non indicati)',
      'Issue sintetica del benchmark team-agent-evaluation.',
    ]),
    labels: ['tae-benchmark', `tae-${c.key.toLowerCase()}`, ...(c.ready ? ['ready'] : [])],
    priority: c.priority,
    blockedBy: c.blocked_by,
  }));

export async function seed({ baseUrl, email, token, project = 'KAN', apply = false, catalog, log = console.log, mapPath = join(root, 'results', 'jira-seed-map.json') }) {
  const plan = planFor(catalog);
  if (!apply) {
    log(`DRY-RUN su progetto ${project}: nessuna chiamata di rete. Verrebbero create ${plan.length} issue:`);
    for (const p of plan) log(`  - ${p.summary}  labels=[${p.labels.join(', ')}] priorità=${p.priority}${p.blockedBy.length ? ` bloccata da ${p.blockedBy.join(',')}` : ''}`);
    return { applied: false, plan };
  }
  const u = new URL(baseUrl);
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('JIRA_BASE_URL deve essere https');
  const headers = {
    'content-type': 'application/json',
    authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
  };
  const isRead = (method, path) => method === 'GET' || path.endsWith('/search/jql');
  const call = async (method, path, body) => {
    // Nuovo tentativo SOLO per le letture: ripetere una creazione potrebbe duplicarla.
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        break;
      } catch (e) {
        if (!isRead(method, path) || attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`), { status: res.status, text });
    return text ? JSON.parse(text) : null;
  };
  const find = async (label) =>
    (await call('POST', '/rest/api/3/search/jql', { jql: `project = ${project} AND labels = "${label}"`, fields: ['summary'], maxResults: 5 })).issues[0]?.key ?? null;

  const map = {};
  for (const p of plan) {
    let key = await find(p.label);
    if (key) {
      log(`  = ${p.catalogKey}: già presente come ${key}`);
    } else {
      const fields = { project: { key: project }, summary: p.summary, issuetype: { name: 'Task' }, description: p.description, labels: p.labels };
      try {
        key = (await call('POST', '/rest/api/3/issue', { fields: { ...fields, priority: { name: p.priority } } })).key;
      } catch (e) {
        if (e.status === 400 && /priority/i.test(e.text)) {
          log(`    (campo priorità non accettato: creo senza priorità)`);
          key = (await call('POST', '/rest/api/3/issue', { fields })).key;
        } else throw e;
      }
      log(`  + ${p.catalogKey}: creata ${key}`);
    }
    map[p.catalogKey] = key;
  }

  const warnings = [];
  for (const p of plan) {
    for (const b of p.blockedBy) {
      const blocked = map[p.catalogKey];
      const blocker = map[b];
      // Sul bloccato, il bloccante deve comparire come inwardIssue ("è bloccata da"): è ciò che legge il controller.
      const readLink = async () =>
        (await call('GET', `/rest/api/3/issue/${blocked}?fields=issuelinks`)).fields.issuelinks.find(
          (l) => l.type?.name === 'Blocks' && (l.inwardIssue?.key === blocker || l.outwardIssue?.key === blocker),
        );
      const create = (inward, outward) => call('POST', '/rest/api/3/issueLink', { type: { name: 'Blocks' }, inwardIssue: { key: inward }, outwardIssue: { key: outward } });
      let link = await readLink();
      if (!link) {
        await create(blocked, blocker);
        log(`  ~ collegamento creato tra ${blocker} e ${blocked}`);
        link = await readLink();
      }
      if (link?.outwardIssue?.key === blocker) {
        // Direzione invertita (il bloccato blocca il bloccante): è un collegamento fra due issue del benchmark, lo correggo.
        log(`  ! direzione invertita tra ${blocker} e ${blocked}: elimino il collegamento e lo ricreo al contrario`);
        await call('DELETE', `/rest/api/3/issueLink/${link.id}`);
        await create(blocker, blocked);
        link = await readLink();
      }
      if (link?.inwardIssue?.key !== blocker) {
        warnings.push(`DIREZIONE DEL LINK NON VERIFICATA tra ${blocker} e ${blocked} (letto: ${JSON.stringify(link ?? null)}). Controlla in Jira che ${blocked} risulti "è bloccata da" ${blocker}.`);
      } else {
        log(`  ✓ ${blocked} è bloccata da ${blocker} (verificato)`);
      }
    }
  }
  if (mapPath) {
    mkdirSync(dirname(mapPath), { recursive: true });
    writeFileSync(mapPath, JSON.stringify({ project, map }, null, 2)); // solo chiavi Jira, nessun segreto
  }
  for (const w of warnings) log(w);
  log(warnings.length ? 'COMPLETATO CON AVVISI (vedi sopra).' : 'COMPLETATO: direzione dei collegamenti verificata.');
  return { applied: true, map, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const catalog = JSON.parse(readFileSync(join(root, 'fixtures', 'issue-catalog', 'issues.json'), 'utf8'));
  const apply = process.argv.includes('--apply');
  const { JIRA_BASE_URL: baseUrl, JIRA_EMAIL: email, JIRA_API_TOKEN: token, JIRA_PROJECT: project = 'KAN' } = process.env;
  if (apply && (!baseUrl || !email || !token)) {
    console.error('Mancano JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN nell\'ambiente.');
    process.exit(2);
  }
  seed({ baseUrl, email, token, project, apply, catalog }).catch((e) => {
    console.error('ERRORE:', e.message.replace(token ?? '\u0000', '***'));
    process.exit(1);
  });
}
