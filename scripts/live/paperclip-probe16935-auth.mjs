// Riprova di #16935 in modalita' authenticated (private, loopback, Better Auth). Agenti claude_local creati e MAI invocati.
// Esegue in Ubuntu-26.04: node ~/paperclip-probe16935-auth.mjs  (server gia' avviato in authenticated).
// Passi: invito bootstrap (CLI, token mai stampato) -> sign-up utente di prova -> accetta invito (primo admin) -> company,
// agenti, chiave -> stessi PATCH della riprova in local_trusted. Password casuale, mai stampata. Scrive ~/pc-16935-auth.json
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const ORIGIN = 'http://127.0.0.1:3100';
const B = `${ORIGIN}/api`;
const log = [];
const red = (s) => String(s).replace(/pcp_[A-Za-z0-9_-]+/g, '<token>');
let cookie = '';
async function call(method, path, body, token, label) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = `Bearer ${token}`;
  else if (cookie) headers.cookie = cookie;
  const r = await fetch(B + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length && !token) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  if (label) log.push({ label, status: r.status, resp: red(typeof j === 'string' ? j : JSON.stringify(j)).slice(0, 260) });
  return { status: r.status, json: j };
}
// 0. controllo: senza autenticazione
await call('POST', '/companies', { name: 'x' }, undefined, '0 POST /companies senza credenziali');
// 1. invito bootstrap
const cli = spawnSync('/home/dibbi/pc-node/node_modules/node/bin/node', ['node_modules/paperclipai/dist/index.js', 'auth', 'bootstrap-ceo', '--force', '--base-url', ORIGIN, '-d', process.env.PC_DATA_DIR ?? '/home/dibbi/pc-data'], {
  cwd: '/home/dibbi/pc', encoding: 'utf8', env: { HOME: '/home/dibbi/pc-home', PATH: '/usr/bin:/bin', PAPERCLIP_TELEMETRY_DISABLED: '1', PAPERCLIP_UPDATE_CHECK: '0' },
});
const m = /invite\/([A-Za-z0-9_-]+)/.exec(cli.stdout + cli.stderr);
log.push({ label: '1 bootstrap-ceo --force', status: cli.status, resp: m ? 'invito creato (token omesso)' : 'nessun invito' });
if (!m) { console.log(JSON.stringify(log, null, 1)); throw new Error('nessun invito'); }
const invite = m[1];
// 2. sign-up
const password = randomBytes(18).toString('base64url');
const email = 'tae-board@example.invalid';
await call('POST', '/auth/sign-up/email', { email, password, name: 'TAE Board' }, undefined, '2 sign-up email');
const sess = await call('GET', '/auth/get-session', undefined, undefined, '2b get-session');
// 3. accetta invito bootstrap
await call('POST', `/invites/${invite}/accept`, { requestType: 'human' }, undefined, '3 accept invito bootstrap_ceo');
// 4. company + agenti
const comp = await call('POST', '/companies', { name: 'TAE Probe Auth Co', budgetMonthlyCents: 10000 }, undefined, '4 POST /companies (sessione board)');
const company = comp.json;
if (!company.id) { writeFileSync('/home/dibbi/pc-16935-auth.json', JSON.stringify(log, null, 1)); console.log(log.map((e) => `${e.status} ${e.label} -> ${e.resp}`).join('\n')); throw new Error('company non creata'); }
const mk = async (name, role, budget) => (await call('POST', `/companies/${company.id}/agents`, {
  name, role, adapterType: 'claude_local',
  adapterConfig: { engine: 'cli', command: '/home/dibbi/bin/claude-sandboxed', cwd: '/home/dibbi/pc-ws/ws1', model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true, maxTurnsPerRun: 25 },
  runtimeConfig: { heartbeat: { enabled: false } }, budgetMonthlyCents: budget,
}, undefined, `create ${name}`)).json;
const self = await mk('tae-auth-agent', 'engineer', 5000);
const peer = await mk('tae-auth-peer', 'qa', 7000);
for (let i = 0; i < 40; i++) { const a = (await call('GET', `/agents/${self.id}`)).json; if (a.lifecycleState !== 'verifying') break; await new Promise((r) => setTimeout(r, 3000)); }
const key = (await call('POST', `/agents/${self.id}/keys`, { name: 'tae' })).json;
const tok = key.token ?? key.key ?? key.apiKey;
log.push({ label: 'board crea chiave agente', status: tok ? 201 : 'n/d', resp: '<omessa>' });
const st = async (id) => { const a = (await call('GET', `/agents/${id}`)).json; return { budgetMonthlyCents: a.budgetMonthlyCents, adapterConfig: a.adapterConfig }; };
log.push({ label: 'stato iniziale', state: await st(self.id) });
const P = (label, id, body) => call('PATCH', `/agents/${id}`, body, tok, label);
await P('A1 self budgetMonthlyCents=99999999', self.id, { budgetMonthlyCents: 99999999 });
await P('A2 self adapterConfig.dangerouslySkipPermissions=false', self.id, { adapterConfig: { dangerouslySkipPermissions: false } });
await P('A3 self adapterConfig.command=/bin/true', self.id, { adapterConfig: { command: '/bin/true' } });
await P('A4 self adapterConfig.engine=acp', self.id, { adapterConfig: { engine: 'acp' } });
await P('A5 self adapterConfig.agentCommand=/bin/true', self.id, { adapterConfig: { agentCommand: '/bin/true' } });
await P('A6 self replaceAdapterConfig senza command', self.id, { adapterConfig: { model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true }, replaceAdapterConfig: true });
log.push({ label: 'stato dopo A1-A6 (self)', state: await st(self.id) });
await P('A7 peer budgetMonthlyCents=1', peer.id, { budgetMonthlyCents: 1 });
await P('A8 peer replaceAdapterConfig senza command', peer.id, { adapterConfig: { model: 'claude-opus-5' }, replaceAdapterConfig: true });
log.push({ label: 'stato finale peer', state: await st(peer.id) });
await call('POST', `/agents/${self.id}/keys`, { name: 'x' }, tok, 'A9 self crea nuova chiave');
await call('PATCH', `/companies/${company.id}`, { budgetMonthlyCents: 99999999 }, tok, 'A10 self cambia budget company');
writeFileSync('/home/dibbi/pc-16935-auth.json', JSON.stringify(log, null, 1));
for (const e of log) console.log(e.status ?? '   ', e.label, e.status ? '-> ' + (e.resp ?? '').slice(0, 150) : JSON.stringify(e.state ?? e).slice(0, 300));
