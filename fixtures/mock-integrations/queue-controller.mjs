// Issue Queue Controller minimo: parla con Jira SOLO via REST (stesso codice contro mock o Jira reale).
// Proprietario unico delle lease: Jira non offre un claim atomico, quindi la lease sta qui.
// Single-writer: il claim marca la lease in modo sincrono PRIMA di qualunque await.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PRIORITY = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };
const TR = { start: '11', back: '21', done: '31' };

export class QueueController {
  constructor({ baseUrl, statePath, authHeader = null }) {
    this.baseUrl = baseUrl;
    this.statePath = statePath;
    this.headers = { 'content-type': 'application/json', ...(authHeader ? { authorization: authHeader } : {}) };
    this.state = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, 'utf8'))
      : { leases: {}, seenEvents: [] };
  }

  save() {
    writeFileSync(this.statePath, JSON.stringify(this.state));
  }

  async #call(method, path, body) {
    const res = await fetch(this.baseUrl + path, { method, headers: this.headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  async #search(statuses) {
    const jql = `status in (${statuses.map((s) => `"${s}"`).join(',')})`;
    return (await this.#call('POST', '/rest/api/3/search/jql', { jql })).issues;
  }

  // Un'issue è eleggibile se: To Do, etichetta "ready", nessuna lease attiva,
  // tutte le issue che la bloccano sono Done.
  async #eligible(now) {
    const all = await this.#search(['To Do', 'In Progress', 'Done']);
    const status = Object.fromEntries(all.map((i) => [i.key, i.fields.status.name]));
    return all
      .filter((i) => i.fields.status.name === 'To Do' && i.fields.labels.includes('ready'))
      .filter((i) => !(this.state.leases[i.key]?.expiresAt > now))
      .filter((i) => i.fields.issuelinks.every((l) => status[l.inwardIssue.key] === 'Done'))
      .sort((a, b) => PRIORITY[a.fields.priority.name] - PRIORITY[b.fields.priority.name] || a.key.localeCompare(b.key));
  }

  async claim(workerId, now = Date.now(), ttlMs = 60_000) {
    // Tutta la sezione critica è sincrona dopo la lettura: nessun await tra scelta e lease.
    for (const issue of await this.#eligible(now)) {
      const lease = this.state.leases[issue.key];
      if (lease && lease.expiresAt > now) continue; // preso da un altro claim durante l'await
      this.state.leases[issue.key] = { workerId, expiresAt: now + ttlMs };
      this.save();
      try {
        await this.#call('POST', `/rest/api/3/issue/${issue.key}/transitions`, { transition: { id: TR.start } });
        return issue.key;
      } catch (e) {
        delete this.state.leases[issue.key]; // rollback: Jira non ha accettato la transizione
        this.save();
        throw e;
      }
    }
    return null;
  }

  async complete(key, workerId, prUrl) {
    if (this.state.leases[key]?.workerId !== workerId) return false;
    await this.#call('POST', `/rest/api/3/issue/${key}/remotelink`, { object: { url: prUrl, title: 'Pull request' } });
    await this.#call('POST', `/rest/api/3/issue/${key}/comment`, { body: `PR pronta per review: ${prUrl}` });
    await this.#call('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: TR.done } });
    delete this.state.leases[key];
    this.save();
    return true;
  }

  // Dopo un riavvio: issue "In Progress" senza lease valida tornano "To Do".
  async reconcile(now = Date.now()) {
    const released = [];
    for (const issue of await this.#search(['In Progress'])) {
      const l = this.state.leases[issue.key];
      if (!l || l.expiresAt <= now) {
        await this.#call('POST', `/rest/api/3/issue/${issue.key}/transitions`, { transition: { id: TR.back } });
        delete this.state.leases[issue.key];
        released.push(issue.key);
      }
    }
    this.save();
    return released;
  }

  // Webhook duplicati: ogni evento si applica una sola volta.
  handleEvent(event) {
    if (this.state.seenEvents.includes(event.id)) return { applied: false, reason: 'duplicate' };
    this.state.seenEvents.push(event.id);
    this.save();
    return { applied: true };
  }
}
