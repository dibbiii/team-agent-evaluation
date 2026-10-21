// Seconda parte della riprova di #16935: campi che scelgono il MOTORE di esecuzione di claude_local (release 2026.1012.0:
// il motore predefinito e' "acp", che ignora `command`; "cli" usa `command`). Agente creato con engine=cli + wrapper,
// MAI invocato (heartbeat spento, nessuna issue, nessun LLM). Esegue in Ubuntu-26.04: node ~/paperclip-probe16935b.mjs
import { writeFileSync } from 'node:fs';
const B = 'http://127.0.0.1:3100/api';
const log = [];
const redact = (s) => String(s).replace(/pcp_[A-Za-z0-9_-]+/g, '<token>');
async function call(method, path, body, token, label) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  if (label) log.push({ label, status: r.status, resp: redact(typeof j === 'string' ? j : JSON.stringify(j)).slice(0, 300) });
  return { status: r.status, json: j };
}
const company = (await call('POST', '/companies', { name: 'TAE Probe Co B', budgetMonthlyCents: 10000 })).json;
const self = (await call('POST', `/companies/${company.id}/agents`, {
  name: 'tae-cli-agent', role: 'engineer', adapterType: 'claude_local',
  adapterConfig: { engine: 'cli', command: '/home/dibbi/bin/claude-sandboxed', cwd: '/home/dibbi/pc-ws/ws1', model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true, maxTurnsPerRun: 25 },
  runtimeConfig: { heartbeat: { enabled: false } }, budgetMonthlyCents: 5000,
})).json;
for (let i = 0; i < 40; i++) { const a = (await call('GET', `/agents/${self.id}`)).json; if (a.lifecycleState !== 'verifying') break; await new Promise((r) => setTimeout(r, 3000)); }
const key = (await call('POST', `/agents/${self.id}/keys`, { name: 'tae' })).json;
const tok = key.token ?? key.key ?? key.apiKey;
const st = async () => { const a = (await call('GET', `/agents/${self.id}`)).json; return { status: a.status, lifecycleState: a.lifecycleState, adapterConfig: a.adapterConfig }; };
log.push({ label: 'stato iniziale (engine=cli)', state: await st() });
const P = (label, body) => call('PATCH', `/agents/${self.id}`, body, tok, label);
await P('B1 adapterConfig.engine=acp', { adapterConfig: { engine: 'acp' } });
log.push({ label: 'stato dopo B1', state: (await st()).adapterConfig.engine });
await P('B2 adapterConfig.agentCommand=/bin/true', { adapterConfig: { agentCommand: '/bin/true' } });
await P('B3 adapterConfig.hermesCommand=/bin/true', { adapterConfig: { hermesCommand: '/bin/true' } });
await P('B4 adapterConfig.stateDir=/tmp/x', { adapterConfig: { stateDir: '/tmp/x' } });
await P('B5 adapterConfig.nonInteractivePermissions=allow', { adapterConfig: { nonInteractivePermissions: 'allow' } });
await P('B6 adapterConfig.timeoutSec=0', { adapterConfig: { timeoutSec: 0 } });
await P('B7 adapterConfig.engine=cli (ripristino)', { adapterConfig: { engine: 'cli' } });
await P('B8 replaceAdapterConfig senza command e senza engine', { adapterConfig: { model: 'claude-sonnet-5-5', dangerouslySkipPermissions: true }, replaceAdapterConfig: true });
log.push({ label: 'stato dopo B8', state: await st() });
await call('PATCH', `/agents/${self.id}/permissions`, { canCreateAgents: true, canAssignTasks: true, canCreateSkills: true }, tok, 'B9 self cambia permessi');
log.push({ label: 'ids', company: company.id, self: self.id });
writeFileSync('/home/dibbi/pc-16935b.json', JSON.stringify(log, null, 1));
for (const e of log) console.log(e.status ?? '   ', e.label, e.status ? '-> ' + (e.resp ?? '').slice(0, 150) : JSON.stringify(e.state ?? e).slice(0, 380));
