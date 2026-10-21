// Run LIVE di Paperclip (claude_local dentro bwrap) su una issue della fixture. Esegue in Ubuntu-26.04 con Node 24:
// Variabili: MAX_RUNS (default 1: oltre questo numero di run cancella le attive), SETTLE_S (default 20), RUN_TIMEOUT_S.
//   node ~/paperclip-run.mjs <nome-run> <ISSUE-N> <workspace-name>
// Crea company, agente claude_local (command = ~/bin/claude-sandboxed), progetto con workspace locale, issue assegnata
// (l'assegnazione fa partire da sola il wakeup), osserva fino a stato terminale, raccoglie tutto in ~/pc-run-<nome>.json.
// Tetti: budget agente 100 cent, company 150 cent; guardia: cancella la run oltre RUN_TIMEOUT_S (default 1200 s) o se
// compare una seconda run. Non stampa token. Nessun segreto letto.
import { readFileSync, writeFileSync } from 'node:fs';
const [name, issueKey, wsName] = process.argv.slice(2);
if (!name || !issueKey || !wsName) throw new Error('uso: paperclip-run.mjs <nome> <ISSUE-N> <workspace>');
const B = 'http://127.0.0.1:3100/api';
const HOME = '/home/dibbi';
const WRAP = `${HOME}/bin/claude-sandboxed`;
const CWD = `${HOME}/pc-ws/${wsName}`;
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 1);
const SETTLE_S = Number(process.env.SETTLE_S ?? 20);
const TIMEOUT_S = Number(process.env.RUN_TIMEOUT_S ?? 1200);
const prompt = readFileSync(`${HOME}/pc-prompt-${issueKey}.txt`, 'utf8');
const title = prompt.split('\n')[1].replace(/^Issue /, '').slice(0, 200);
const out = { name, issueKey, startedAt: new Date().toISOString(), http: [] };
async function call(method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, json: j };
}
const company = (await call('POST', '/companies', { name: `TAE Run ${name}`, budgetMonthlyCents: 150 })).json;
const agent = (await call('POST', `/companies/${company.id}/agents`, {
  name: `tae-${name}`, role: 'engineer', adapterType: 'claude_local',
  adapterConfig: { engine: 'cli', command: WRAP, cwd: CWD, model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true, maxTurnsPerRun: 25 },
  runtimeConfig: { heartbeat: { enabled: false } }, budgetMonthlyCents: 100,
})).json;
out.ids = { company: company.id, agent: agent.id };
for (let i = 0; i < 40; i++) {
  const a = (await call('GET', `/agents/${agent.id}`)).json;
  if (a.lifecycleState !== 'verifying') { out.agentAfterVerify = { status: a.status, lifecycleState: a.lifecycleState }; break; }
  await new Promise((r) => setTimeout(r, 3000));
}
const project = (await call('POST', `/companies/${company.id}/projects`, { name: `seed-app-${name}`, workspace: { cwd: CWD, isPrimary: true, sourceType: 'local_path' } })).json;
out.ids.project = project.id;
out.projectResp = { id: project.id, executionWorkspacePolicy: project.executionWorkspacePolicy ?? null, workspaces: project.workspaces ?? project.primaryWorkspace ?? null };
const t0 = Date.now();
const issueRes = await call('POST', `/companies/${company.id}/issues`, { title, description: prompt, assigneeAgentId: agent.id, projectId: project.id, status: 'todo', priority: 'high' });
out.issueCreate = { status: issueRes.status, id: issueRes.json.id, identifier: issueRes.json.identifier, statusAfter: issueRes.json.status };
const issueId = issueRes.json.id;
console.log(`issue ${issueRes.json.identifier} creata (HTTP ${issueRes.status}); osservo...`);
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out', 'error']);
let last = '';
const timeline = [];
let cancelled = false;
let idleSince = null;
for (;;) {
  const runs = (await call('GET', `/companies/${company.id}/heartbeat-runs`)).json;
  const list = Array.isArray(runs) ? runs : runs.runs ?? [];
  const iss = (await call('GET', `/issues/${issueId}`)).json;
  const ag = (await call('GET', `/agents/${agent.id}`)).json;
  const snap = `${Math.round((Date.now() - t0) / 1000)}s runs=[${list.map((r) => r.status).join(',')}] issue=${iss.status} agent=${ag.status}`;
  if (snap.replace(/^\d+s /, '') !== last.replace(/^\d+s /, '')) { console.log(snap); timeline.push(snap); }
  last = snap;
  const active = list.filter((r) => !terminal.has(r.status));
  if (list.length > MAX_RUNS && !cancelled) {
    for (const r of active) { await call('POST', `/heartbeat-runs/${r.id}/cancel`); }
    cancelled = true; timeline.push('GUARDIA: oltre MAX_RUNS rilevata, cancellate le attive');
  }
  if (list.length >= 1 && active.length === 0) { idleSince ??= Date.now(); if ((Date.now() - idleSince) / 1000 >= SETTLE_S) break; } else idleSince = null;
  if ((Date.now() - t0) / 1000 > TIMEOUT_S) {
    for (const r of active) await call('POST', `/heartbeat-runs/${r.id}/cancel`);
    timeline.push('GUARDIA: timeout, run cancellata'); cancelled = true;
    await new Promise((r) => setTimeout(r, 5000));
    break;
  }
  await new Promise((r) => setTimeout(r, 4000));
}
// attesa breve per eventuali effetti a valle (budget, commenti, nuove run)
await new Promise((r) => setTimeout(r, 8000));
out.timeline = timeline;
out.wallSeconds = (Date.now() - t0) / 1000;
const get = async (label, path) => { const r = await call('GET', path); out[label] = { status: r.status, body: r.json }; return r.json; };
const runs = await get('runs', `/companies/${company.id}/heartbeat-runs`);
const list = Array.isArray(runs) ? runs : runs.runs ?? [];
out.runDetails = [];
for (const r of list) {
  const d = (await call('GET', `/heartbeat-runs/${r.id}`)).json;
  const ev = (await call('GET', `/heartbeat-runs/${r.id}/events`)).json;
  const lg = await call('GET', `/heartbeat-runs/${r.id}/log`);
  out.runDetails.push({ id: r.id, detail: d, events: ev, log: typeof lg.json === 'string' ? lg.json : JSON.stringify(lg.json) });
}
await get('issueFinal', `/issues/${issueId}`);
await get('comments', `/issues/${issueId}/comments`);
await get('agentFinal', `/agents/${agent.id}`);
await get('companyFinal', `/companies/${company.id}`);
await get('budgetsOverview', `/companies/${company.id}/budgets/overview`);
await get('costsSummary', `/companies/${company.id}/costs/summary`);
await get('costsByAgent', `/companies/${company.id}/costs/by-agent`);
await get('costsByModel', `/companies/${company.id}/costs/by-agent-model`);
await get('activity', `/companies/${company.id}/activity`);
await get('workProducts', `/issues/${issueId}/work-products`);
out.finishedAt = new Date().toISOString();
writeFileSync(`${HOME}/pc-run-${name}.json`, JSON.stringify(out, null, 1));
console.log(`scritto ${HOME}/pc-run-${name}.json`);
for (const r of out.runDetails) {
  const d = r.detail;
  console.log(JSON.stringify({ id: r.id, status: d.status, exitCode: d.exitCode, startedAt: d.startedAt, finishedAt: d.finishedAt, error: d.error, errorCode: d.errorCode, usage: d.usageJson ?? d.usage, costStatus: d.costStatus, resultJson: d.resultJson ? JSON.stringify(d.resultJson).slice(0, 600) : null }));
}
console.log('issue finale:', out.issueFinal.body.status, '| agente:', out.agentFinal.body.status, out.agentFinal.body.pauseReason ?? '', '| company:', out.companyFinal.body.status, out.companyFinal.body.pauseReason ?? '');
