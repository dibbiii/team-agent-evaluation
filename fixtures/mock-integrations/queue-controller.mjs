// Issue Queue Controller minimo: parla con Jira SOLO via REST (stesso codice contro mock o Jira reale).
// Proprietario unico delle lease: Jira non offre un claim atomico, quindi la lease sta qui.
// Single-writer: il claim marca la lease in modo sincrono PRIMA di qualunque await.
//
// Aderenza a Jira Cloud (verificata solo contro il mock, che ne riproduce le forme):
//  - gli ID di transizione si scoprono con GET .../transitions (non sono fissi);
//  - gli stati si riconoscono per nome (anche localizzato) con ripiego sulla statusCategory;
//  - commenti in ADF; la PR pronta porta l'issue in "In Review", MAI in Done (il merge è umano);
//  - le dipendenze sono soddisfatte solo quando il bloccante è in categoria "done".
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PRIORITY = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };
const FIELDS = ['summary', 'status', 'priority', 'labels', 'issuelinks'];
// Nomi di stato noti (inglese e italiano). Un workflow con altri nomi va aggiunto qui.
const NAMES = {
  todo: ['To Do', 'Da completare'],
  progress: ['In Progress', 'In corso'],
  review: ['In Review', 'In revisione'],
};
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

export class QueueController {
  constructor({ baseUrl, statePath, authHeader = null, projectKey = 'KAN', readyLabel = 'ready' }) {
    this.baseUrl = baseUrl;
    this.statePath = statePath;
    this.projectKey = projectKey;
    this.readyLabel = readyLabel;
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

  async #all() {
    const out = [];
    let nextPageToken;
    do {
      const r = await this.#call('POST', '/rest/api/3/search/jql', {
        jql: `project = ${this.projectKey} ORDER BY created ASC`,
        fields: FIELDS,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      });
      out.push(...r.issues);
      nextPageToken = r.nextPageToken;
    } while (nextPageToken);
    return out;
  }

  async #transitionTo(key, names) {
    const { transitions } = await this.#call('GET', `/rest/api/3/issue/${key}/transitions`);
    const t = transitions.find((x) => names.includes(x.to.name));
    if (!t) throw new Error(`${key}: nessuna transizione verso ${names.join('/')} (disponibili: ${transitions.map((x) => x.to.name).join(', ')})`);
    await this.#call('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: t.id } });
  }

  // Eleggibile: To Do, etichetta "ready", nessuna lease attiva, bloccanti tutti in categoria "done".
  async #eligible(now) {
    const all = await this.#all();
    const cat = Object.fromEntries(all.map((i) => [i.key, i.fields.status.statusCategory.key]));
    return all
      .filter((i) => NAMES.todo.includes(i.fields.status.name) && i.fields.labels.includes(this.readyLabel))
      .filter((i) => !(this.state.leases[i.key]?.expiresAt > now))
      .filter((i) => i.fields.issuelinks.filter((l) => l.inwardIssue).every((l) => cat[l.inwardIssue.key] === 'done'))
      .sort((a, b) => (PRIORITY[a.fields.priority?.name] ?? 9) - (PRIORITY[b.fields.priority?.name] ?? 9) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  }

  async claim(workerId, now = Date.now(), ttlMs = 60_000) {
    // Tutta la sezione critica è sincrona dopo la lettura: nessun await tra scelta e lease.
    for (const issue of await this.#eligible(now)) {
      const lease = this.state.leases[issue.key];
      if (lease && lease.expiresAt > now) continue; // preso da un altro claim durante l'await
      this.state.leases[issue.key] = { workerId, expiresAt: now + ttlMs };
      this.save();
      try {
        await this.#transitionTo(issue.key, NAMES.progress);
        return issue.key;
      } catch (e) {
        delete this.state.leases[issue.key]; // rollback: Jira non ha accettato la transizione
        this.save();
        throw e;
      }
    }
    return null;
  }

  // PR pronta: link, commento e stato "In Review". Il passaggio a Done spetta a chi fa il merge.
  async complete(key, workerId, prUrl) {
    if (this.state.leases[key]?.workerId !== workerId) return false;
    await this.#call('POST', `/rest/api/3/issue/${key}/remotelink`, { object: { url: prUrl, title: 'Pull request' } });
    await this.#call('POST', `/rest/api/3/issue/${key}/comment`, { body: adf(`PR pronta per review: ${prUrl}`) });
    await this.#transitionTo(key, NAMES.review);
    delete this.state.leases[key];
    this.save();
    return true;
  }

  // Dopo un riavvio: issue "In Progress" senza lease valida tornano "To Do". "In Review" non si tocca.
  async reconcile(now = Date.now()) {
    const released = [];
    for (const issue of await this.#all()) {
      if (!NAMES.progress.includes(issue.fields.status.name)) continue;
      const l = this.state.leases[issue.key];
      if (!l || l.expiresAt <= now) {
        await this.#transitionTo(issue.key, NAMES.todo);
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
