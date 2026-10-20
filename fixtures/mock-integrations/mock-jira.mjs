// Mock Jira + Issue Queue Controller minimo (riferimento per S04/S05/S06).
// Stato su file JSON: sopravvive al riavvio. Nessuna rete, nessun LLM.
// Serve a MISURARE adapter e lease; NON dimostra capacità dei candidati.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PRIORITY = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };

export class MockQueue {
  constructor(statePath) {
    this.statePath = statePath;
    this.state = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, 'utf8'))
      : { issues: {}, leases: {}, seenEvents: [], log: [] };
  }

  save() {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  load(catalog) {
    for (const i of catalog) {
      if (!this.state.issues[i.key]) this.state.issues[i.key] = { ...i, status: 'To Do', pr: null };
    }
    this.save();
  }

  // Un evento con lo stesso id viene applicato una sola volta (idempotenza).
  applyEvent(event) {
    if (this.state.seenEvents.includes(event.id)) return { applied: false, reason: 'duplicate' };
    this.state.seenEvents.push(event.id);
    const issue = this.state.issues[event.key];
    if (!issue) return { applied: false, reason: 'unknown-issue' };
    if (event.type === 'ready') issue.ready = true;
    if (event.type === 'status') issue.status = event.status;
    this.state.log.push(event);
    this.save();
    return { applied: true };
  }

  isEligible(issue, now) {
    if (issue.status !== 'To Do' || !issue.ready) return false;
    const lease = this.state.leases[issue.key];
    if (lease && lease.expiresAt > now) return false;
    return issue.blocked_by.every((k) => this.state.issues[k]?.status === 'Done');
  }

  // Claim atomico: legge e scrive nello stesso passo sincrono (un solo processo scrive lo stato).
  claim(workerId, now = Date.now(), ttlMs = 60_000) {
    const candidates = Object.values(this.state.issues)
      .filter((i) => this.isEligible(i, now))
      .sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.key.localeCompare(b.key));
    const next = candidates[0];
    if (!next) return null;
    this.state.leases[next.key] = { workerId, expiresAt: now + ttlMs };
    next.status = 'In Progress';
    this.save();
    return next.key;
  }

  heartbeat(key, workerId, now = Date.now(), ttlMs = 60_000) {
    const l = this.state.leases[key];
    if (!l || l.workerId !== workerId) return false;
    l.expiresAt = now + ttlMs;
    this.save();
    return true;
  }

  // Riconciliazione dopo riavvio: le issue in corso con lease scaduta tornano in coda.
  reconcile(now = Date.now()) {
    const released = [];
    for (const issue of Object.values(this.state.issues)) {
      const l = this.state.leases[issue.key];
      if (issue.status === 'In Progress' && (!l || l.expiresAt <= now)) {
        issue.status = 'To Do';
        delete this.state.leases[issue.key];
        released.push(issue.key);
      }
    }
    this.save();
    return released;
  }

  complete(key, workerId, prUrl) {
    const l = this.state.leases[key];
    if (!l || l.workerId !== workerId) return false;
    this.state.issues[key].status = 'Done';
    this.state.issues[key].pr = prUrl;
    delete this.state.leases[key];
    this.save();
    return true;
  }
}
