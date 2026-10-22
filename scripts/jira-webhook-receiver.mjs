// Ricevitore minimo di webhook Jira (prova S05, parte "webhook reali").
// - Ascolta SOLO su 127.0.0.1; è raggiungibile da Jira solo attraverso un tunnel temporaneo.
// - Accetta solo POST su /hook/<SEGRETO>; ogni altra richiesta riceve 404 (nessuna informazione).
// - Ogni evento si applica una volta sola (stessa regola di QueueController.handleEvent): i duplicati si contano e si scartano.
// - Registra su file solo i campi che servono (chiave, stato, orario), mai l'intero corpo.
// Uso: HOOK_SECRET=... node scripts/jira-webhook-receiver.mjs [porta]
import http from 'node:http';
import crypto from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const secret = process.env.HOOK_SECRET;
if (!secret || secret.length < 16) {
  console.error('HOOK_SECRET mancante o troppo corto (minimo 16 caratteri).');
  process.exit(1);
}
const port = Number(process.argv[2] ?? 8787);
const LOG = 'results/raw/jira-webhook-events.jsonl';
mkdirSync('results/raw', { recursive: true });

const seen = new Set();
const stats = { received: 0, applied: 0, duplicates: 0, rejected: 0 };
const expected = Buffer.from(`/hook/${secret}`);

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (req.method !== 'POST' || !safeEqual(Buffer.from(path), expected)) {
    stats.rejected++;
    res.writeHead(404).end();
    return;
  }
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 16 * 1024) { res.writeHead(413).end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end(); return; }
    stats.received++;
    const id = `${body.issue ?? '?'}|${body.status ?? '?'}|${body.ts ?? '?'}`;
    const duplicate = seen.has(id);
    if (duplicate) stats.duplicates++; else { seen.add(id); stats.applied++; }
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), id, issue: body.issue, status: body.status, event: body.event, duplicate }) + '\n');
    console.log(`${duplicate ? 'DUPLICATO' : 'APPLICATO '} ${id}  (ricevuti ${stats.received}, applicati ${stats.applied}, duplicati ${stats.duplicates}, rifiutati ${stats.rejected})`);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ applied: !duplicate }));
  });
});

server.listen(port, '127.0.0.1', () => console.log(`In ascolto su 127.0.0.1:${port} (percorso /hook/<segreto>)`));
