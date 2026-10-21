#!/usr/bin/env node
// Controllo in SOLA LETTURA del Jira configurato nell'ambiente. Non crea, non modifica, non cancella nulla.
// Mostra: chi sei, il progetto, le issue esistenti e le transizioni realmente disponibili (per adattare il controller).
// Il token non viene mai stampato.
// Uso: JIRA_BASE_URL=... JIRA_EMAIL=... JIRA_API_TOKEN=... [JIRA_PROJECT=KAN] node scripts/jira-check.mjs
import { pathToFileURL } from 'node:url';

export async function check({ baseUrl, email, token, project = 'KAN', log = console.log }) {
  const headers = {
    'content-type': 'application/json',
    authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
  };
  const call = async (method, path, body) => {
    // Sola lettura: un errore di rete momentaneo ('fetch failed') viene ritentato fino a 3 volte.
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (!res.ok) {
      const hint = { 401: 'email e token non corrispondono (o token scaduto/revocato)', 403: 'il tuo account non ha i permessi necessari', 404: 'URL o chiave progetto sbagliati, oppure nessun accesso a quel progetto' }[res.status] ?? '';
      throw new Error(`${method} ${path} -> ${res.status}${hint ? ` (${hint})` : ''}`);
    }
    return res.json();
  };

  const me = await call('GET', '/rest/api/3/myself');
  log(`Utente autenticato: ${me.displayName}`);
  const proj = await call('GET', `/rest/api/3/project/${encodeURIComponent(project)}`);
  log(`Progetto: ${proj.key} - "${proj.name}" (stile: ${proj.style ?? 'n/d'})`);

  const found = await call('POST', '/rest/api/3/search/jql', {
    jql: `project = ${project} ORDER BY created ASC`,
    fields: ['summary', 'status', 'issuetype', 'labels', 'issuelinks'],
    maxResults: 50,
  });
  log(`Issue esistenti: ${found.issues.length}`);
  for (const i of found.issues) {
    log(`  ${i.key} | ${i.fields.issuetype?.name ?? '?'} | ${i.fields.status?.name ?? '?'} (${i.fields.status?.statusCategory?.key ?? '?'}) | ${i.fields.summary}`);
    for (const l of i.fields.issuelinks ?? []) {
      const side = l.inwardIssue ? `inwardIssue=${l.inwardIssue.key} ("${l.type?.inward}")` : `outwardIssue=${l.outwardIssue?.key} ("${l.type?.outward}")`;
      log(`      collegamento [${l.type?.name}] ${side}`);
    }
  }

  let transitions = [];
  if (found.issues[0]) {
    const t = await call('GET', `/rest/api/3/issue/${found.issues[0].key}/transitions`);
    transitions = t.transitions.map((x) => `${x.to.name} [${x.to.statusCategory?.key ?? '?'}]`);
    log(`Transizioni disponibili da ${found.issues[0].key}: ${transitions.join(', ') || '(nessuna)'}`);
  }
  log('CONTROLLO COMPLETATO (sola lettura).');
  return { user: me.displayName, project: proj.key, issues: found.issues.length, transitions };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { JIRA_BASE_URL: baseUrl, JIRA_EMAIL: email, JIRA_API_TOKEN: token, JIRA_PROJECT: project = 'KAN' } = process.env;
  const missing = Object.entries({ JIRA_BASE_URL: baseUrl, JIRA_EMAIL: email, JIRA_API_TOKEN: token }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Variabili mancanti nell'ambiente: ${missing.join(', ')}`);
    process.exit(2);
  }
  check({ baseUrl, email, token, project }).catch((e) => {
    console.error('ERRORE:', e.message.split(token).join('***'));
    process.exit(1);
  });
}
