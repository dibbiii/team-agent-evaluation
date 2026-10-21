// Run LIVE con il daemon Paseo locale (daemon avviato da paseo-server.sh daemon start, provider claude = wrapper bwrap).
// Crea un agente con createAgent (provider claude, modello esplicito, mode bypassPermissions, nessun MCP Paseo
// iniettato), lo segue fino a stato terminale, scrive tutto in ~/ps-run-<nome>.json. Non stampa la password del daemon.
// Uso: node ~/paseo-run.mjs <nome-run> <ISSUE-N> <workspace-name>  [MODE=bypassPermissions] [MODEL=claude-sonnet-5-5]
import { readFileSync, writeFileSync } from 'node:fs';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { WebSocket } from 'ws';

const [name, issueKey, wsName] = process.argv.slice(2);
if (!name || !issueKey || !wsName) throw new Error('uso: paseo-run.mjs <nome> <ISSUE-N> <workspace>');
const HOME = process.env.HOME;
const cwd = `${HOME}/ps-ws/${wsName}`;
const prompt = readFileSync(`${HOME}/ps-prompt-${issueKey}.txt`, 'utf8');
const password = readFileSync(`${HOME}/ps-pass`, 'utf8').trim();
const MODE = process.env.MODE ?? 'bypassPermissions';
const MODEL = process.env.MODEL ?? 'claude-sonnet-5-5';
const WAIT_TIMEOUT_S = Number(process.env.WAIT_TIMEOUT_S ?? 1200);

const factory = (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers });
const client = new DaemonClient({
  url: 'ws://127.0.0.1:6767/ws',
  clientId: `tae-run-${name}`,
  clientType: 'cli',
  password,
  webSocketFactory: factory,
  connectTimeoutMs: 8000,
  reconnect: { enabled: false },
});
await client.connect();
console.log('connesso al daemon');

const out = { name, issueKey, startedAt: new Date().toISOString(), mode: MODE, model: MODEL };
const created = await client.createAgent({
  provider: 'claude',
  model: MODEL,
  modeId: MODE,
  cwd,
  initialPrompt: prompt,
});
out.agentId = created.id;
console.log(`agente creato: ${created.id} (status ${created.status})`);

const t0 = Date.now();
const waited = await client.waitForFinish(created.id, WAIT_TIMEOUT_S * 1000);
out.waitStatus = waited.status;
out.waitError = waited.error;
out.lastMessage = waited.lastMessage;
out.final = waited.final;
out.durationSeconds = (Date.now() - t0) / 1000;
if (waited.status === 'timeout') {
  console.log('TIMEOUT: interrompo');
  await client.cancelAgent?.(created.id).catch(() => {});
}
out.timeline = [`waitForFinish: status=${waited.status} dopo ${out.durationSeconds.toFixed(1)}s`];
out.finishedAt = new Date().toISOString();
writeFileSync(`${HOME}/ps-run-${name}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ agentId: out.agentId, waitStatus: out.waitStatus, status: out.final?.status, usage: out.final?.usage, provider: out.final?.provider, model: out.final?.model, title: out.final?.title }, null, 2));
await client.close().catch(() => {});
process.exit(0);
