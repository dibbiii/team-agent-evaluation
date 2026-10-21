// Riprova di #16935 con adapter claude_local (agenti creati ma MAI invocati: heartbeat spento, nessuna issue, nessun LLM).
// Esegue dentro Ubuntu-26.04 con Node 24: node ~/paperclip-probe16935.mjs  (server su 127.0.0.1:3100, local_trusted).
// Il token dell'agente non viene mai stampato. Scrive ~/pc-16935.json con ogni risposta HTTP.
import { writeFileSync } from 'node:fs';
const B = 'http://127.0.0.1:3100/api';
const WRAP = '/home/dibbi/bin/claude-sandboxed';
const CWD = '/home/dibbi/pc-ws/ws1';
const log = [];
const redact = (s) => String(s).replace(/pcp_[A-Za-z0-9_-]+/g, '<token>').replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer <token>');
async function call(method, path, body, token, label) {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { j = text; }
  if (label) log.push({ label, method, path: path.replace(/[0-9a-f-]{36}/g, '<id>'), body: redact(JSON.stringify(body ?? null)), status: r.status, resp: redact(typeof j === 'string' ? j : JSON.stringify(j)).slice(0, 400) });
  return { status: r.status, json: j };
}
const company = (await call('POST', '/companies', { name: 'TAE Probe Co', budgetMonthlyCents: 10000 })).json;
const mk = async (name, role, budget) => {
  const r = await call('POST', `/companies/${company.id}/agents`, {
    name, role, adapterType: 'claude_local',
    adapterConfig: { command: WRAP, cwd: CWD, model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true, maxTurnsPerRun: 25 },
    runtimeConfig: { heartbeat: { enabled: false } }, budgetMonthlyCents: budget,
  }, undefined, `create ${name}`);
  return r.json;
};
const self = await mk('tae-claude-agent', 'engineer', 5000);
const peer = await mk('tae-claude-peer', 'qa', 7000);
if (!self.id || !peer.id) { console.log(JSON.stringify(log, null, 1)); throw new Error('creazione agente fallita'); }
// attende la fine del ciclo di verifica (nessun LLM: la sonda hello e' saltata perche' il command non si chiama "claude")
for (let i = 0; i < 40; i++) {
  const a = (await call('GET', `/agents/${self.id}`)).json;
  if (a.lifecycleState !== 'verifying') break;
  await new Promise((r) => setTimeout(r, 3000));
}
const st = async (id) => { const a = (await call('GET', `/agents/${id}`)).json; return { status: a.status, lifecycleState: a.lifecycleState, budgetMonthlyCents: a.budgetMonthlyCents, adapterConfig: a.adapterConfig }; };
log.push({ label: 'stato iniziale self', state: await st(self.id) });
const key = (await call('POST', `/agents/${self.id}/keys`, { name: 'tae' }, undefined, 'board crea chiave agente')).json;
const tok = key.token ?? key.key ?? key.apiKey;
log[log.length - 1].resp = '<risposta con token omessa>';
await call('GET', '/agents/me', undefined, tok, 'GET /agents/me (chiave agente)');
const P = (label, id, body) => call('PATCH', `/agents/${id}`, body, tok, label);
const cfg = async (label) => { log.push({ label: `stato dopo: ${label}`, state: await st(self.id) }); };
await P('1 self budgetMonthlyCents=99999999', self.id, { budgetMonthlyCents: 99999999 }); await cfg('1');
await P('2 self adapterConfig.dangerouslySkipPermissions=false', self.id, { adapterConfig: { dangerouslySkipPermissions: false } }); await cfg('2');
await P('3 self adapterConfig.command=/bin/true', self.id, { adapterConfig: { command: '/bin/true' } });
await P('4 self adapterConfig.extraArgs', self.id, { adapterConfig: { extraArgs: ['--tae-marker'] } });
await P('5 self adapterConfig.env.FOO', self.id, { adapterConfig: { env: { FOO: 'bar' } } });
await P('6 self adapterConfig.env.ANTHROPIC_API_KEY (plain)', self.id, { adapterConfig: { env: { ANTHROPIC_API_KEY: 'sk-tae-fake' } } });
await P('7 self adapterConfig.cwd=/', self.id, { adapterConfig: { cwd: '/' } });
await P('8 self adapterConfig.filesystemSandboxCommand', self.id, { adapterConfig: { filesystemSandboxCommand: '/bin/true' } });
await P('9 self adapterConfig.args', self.id, { adapterConfig: { args: ['--x'] } });
await P('10 self adapterConfig.model=claude-opus-5 (campo non-host)', self.id, { adapterConfig: { model: 'claude-opus-5' } }); await cfg('10');
await P('11 self adapterConfig.maxTurnsPerRun=9999', self.id, { adapterConfig: { maxTurnsPerRun: 9999 } });
await P('12 self adapterConfig.networkScope/filesystemScope', self.id, { adapterConfig: { networkScope: 'open', filesystemScope: 'none' } }); await cfg('12');
await P('13 self replaceAdapterConfig (senza command)', self.id, { adapterConfig: { model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true }, replaceAdapterConfig: true }); await cfg('13 replace senza command');
await P('14 self adapterType=codex_local', self.id, { adapterType: 'codex_local', adapterConfig: {} }); await cfg('14');
await P('15 peer budgetMonthlyCents=1', peer.id, { budgetMonthlyCents: 1 });
await P('16 peer adapterConfig.command=/bin/true', peer.id, { adapterConfig: { command: '/bin/true' } });
await P('17 peer adapterConfig.dangerouslySkipPermissions=false', peer.id, { adapterConfig: { dangerouslySkipPermissions: false } });
await P('18 peer replaceAdapterConfig (senza command)', peer.id, { adapterConfig: { model: 'claude-opus-5' }, replaceAdapterConfig: true });
log.push({ label: 'stato finale peer', state: await st(peer.id) });
await call('POST', `/agents/${self.id}/keys`, { name: 'x' }, tok, '19 self crea nuova chiave');
await call('PATCH', `/agents/${self.id}/permissions`, { canCreateAgents: true }, tok, '20 self cambia permessi');
await call('PATCH', `/companies/${company.id}`, { budgetMonthlyCents: 99999999 }, tok, '21 self cambia budget company');
log.push({ label: 'ids', company: company.id, self: self.id, peer: peer.id });
writeFileSync('/home/dibbi/pc-16935.json', JSON.stringify(log, null, 1));
for (const e of log) console.log(e.status ?? '   ', e.label, e.status ? '-> ' + (e.resp ?? '').slice(0, 170) : JSON.stringify(e.state ?? e).slice(0, 420));
