// Valida / installa / lancia un trigger "manual.run" self-contained sull'Hub di prova (API pubblica, chiave in ~/ps-hub-key).
// Uso: node ~/paseo-hub-trigger.mjs validate|install|dispatch <workspace> <ISSUE-N> [chiave-consegna]
// Variabili: DAEMON_SLUG (slug del daemon in Hub), MODE (default bypassPermissions), MODEL (default claude-sonnet-5-5).
// validate e install chiedono al daemon di controllare l'agente (provider/modello/modo): nessun modello viene invocato.
import { readFileSync, writeFileSync } from 'node:fs';
const HOME = process.env.HOME;
const [action, ws, issue, deliveryKey] = process.argv.slice(2);
const key = readFileSync(`${HOME}/ps-hub-key`, 'utf8').trim();
const base = 'http://127.0.0.1:3000';
const slug = process.env.DAEMON_SLUG;
if (!slug) throw new Error('DAEMON_SLUG mancante');
const prompt = readFileSync(`${HOME}/ps-prompt-${issue}.txt`, 'utf8').trim();
const name = `tae-${issue.toLowerCase()}`;
const indent = (s) => s.split('\n').map((l) => `    ${l}`).join('\n');
const yaml = [
  `name: ${name}`,
  'enabled: true',
  'on:',
  '  manual.run: {}',
  'run:',
  `  target: { daemon: ${slug}, cwd: /home/dibbi/ps-ws/${ws} }`,
  `  agent: { provider: claude, model: ${process.env.MODEL ?? 'claude-sonnet-5-5'}, mode: ${process.env.MODE ?? 'bypassPermissions'} }`,
  '  continuation: { mode: new }',
  '  max_runtime: 20m',
  '  idle_timeout: 5m',
  '  prompt: |',
  indent(prompt),
  indent('Quando hai finito chiama lo strumento finish_execution di Hub (executionId indicato da Hub).'),
  '',
].join('\n');
async function call(method, path, body) {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
let res;
if (action === 'validate' || action === 'install') {
  res = await call('POST', `/api/v1/triggers/${action}`, { yaml });
} else if (action === 'dispatch') {
  if (!deliveryKey) throw new Error('chiave di consegna mancante');
  res = await call('POST', '/api/v1/manual-runs', { projectSlug: process.env.PROJECT_SLUG ?? 'default', trigger: name, actor: 'tae-operator', deliveryKey, input: '' });
} else throw new Error('azione sconosciuta');
console.log(`${action}: HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 700)}`);
writeFileSync(`${HOME}/ps-trigger-${action}.json`, JSON.stringify({ status: res.status, body: res.json }, null, 2));
