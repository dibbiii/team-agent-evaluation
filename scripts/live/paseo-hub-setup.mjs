// Prepara l'Hub di prova (gia' avviato da paseo-server.sh hub start): accesso dell'owner bootstrap, cambio password, chiave API
// con i 5 scope pubblici, salvata in ~/ps-hub-key (600, mai stampata). Poi l'amministratore lancia `paseo hub connect`.
// Uso: node ~/paseo-hub-setup.mjs   (legge ~/ps-pass; non stampa password ne' chiavi)
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
const HOME = process.env.HOME;
const base = 'http://127.0.0.1:3000';
const pass = readFileSync(`${HOME}/ps-pass`, 'utf8').trim();
const email = 'owner@tae.invalid';
let cookie = '';
async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...new Map([...cookie.split('; ').filter(Boolean), ...set.map((c) => c.split(';')[0])].map((c) => [c.split('=')[0], c])).values()].join('; ');
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const steps = [];
const note = (k, v) => { steps.push([k, v]); console.log(`${k}: ${v}`); };
let r = await call('POST', '/api/auth/sign-in/email', { email, password: `${pass}-Aa1` });
if (r.status !== 200) {
  r = await call('POST', '/api/auth/sign-in/email', { email, password: `${pass}-Bb2` });
}
note('sign-in owner', r.status);
if (r.status !== 200) process.exit(1);
const st = await call('GET', '/api/auth/get-session');
note('mustChangePassword', JSON.stringify(st.json?.user?.mustChangePassword));
if (st.json?.user?.mustChangePassword) {
  const cp = await call('POST', '/api/auth/change-password', { currentPassword: `${pass}-Aa1`, newPassword: `${pass}-Bb2`, revokeOtherSessions: false });
  note('change-password', cp.status);
}
const state = await call('GET', '/api/auth/paseo/state');
note('state (chiavi)', `${state.status} ${Object.keys(state.json ?? {}).join(',')}`);
const orgs = state.json?.organizations ?? state.json?.memberships ?? [];
const orgId = state.json?.activeOrganizationId ?? orgs[0]?.id ?? orgs[0]?.organizationId;
note('organizzazione', JSON.stringify(orgs.map((o) => ({ id: o.id ?? o.organizationId, name: o.name, role: o.role }))));
if (orgId) {
  const sel = await call('POST', '/api/auth/paseo/select-organization', { organizationId: orgId });
  note('select-organization', `${sel.status} ${JSON.stringify(sel.json).slice(0, 150)}`);
}
const scopes = ['projects:read', 'configuration:validate', 'configuration:install', 'runs:dispatch', 'daemons:enroll'];
const k = await call('POST', '/api/auth/paseo/api-keys', { name: 'tae-live', scopes });
note('create api-key', k.status);
if (k.status >= 300) { console.log(JSON.stringify(k.json).slice(0, 300)); process.exit(1); }
const secret = k.json?.secret ?? k.json?.key ?? k.json?.token ?? k.json?.apiKey;
if (typeof secret !== 'string') { console.log('forma della risposta inattesa: chiavi =', Object.keys(k.json ?? {})); process.exit(1); }
writeFileSync(`${HOME}/ps-hub-key`, secret, { mode: 0o600 }); chmodSync(`${HOME}/ps-hub-key`, 0o600);
note('chiave salvata in ~/ps-hub-key', `${secret.slice(0, 9)}... (${secret.length} caratteri)`);
