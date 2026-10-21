// Finto Jira "stupido": sottoinsieme della REST API v3 di Jira Cloud, solo per test.
// Riproduce le differenze che contano rispetto a un Jira reale (viste sul progetto KAN dell'utente):
//  - workflow To Do / In Progress / In Review / Done con statusCategory (new/indeterminate/done);
//  - ID di transizione NON prevedibili: vanno scoperti con GET .../transitions;
//  - commenti e descrizioni solo in ADF (Atlassian Document Format): una stringa semplice è rifiutata (400);
//  - issueLink "Blocks" con la direzione che ritengo sia quella reale (la verifica su Jira vero la fa scripts/jira-seed.mjs).
// NON implementa JQL reale: senza filtro `status` restituisce tutte le issue; con `status = "X"` / `status in (...)` filtra.
// Non ha lease né priorità di scheduling: come Jira reale, non impedisce due claim.
import { createServer } from 'node:http';

const STATUSES = [
  { name: 'To Do', cat: 'new', tid: '3' },
  { name: 'In Progress', cat: 'indeterminate', tid: '5' },
  { name: 'In Review', cat: 'indeterminate', tid: '7' },
  { name: 'Done', cat: 'done', tid: '9' },
];
const statusObj = (name) => {
  const s = STATUSES.find((x) => x.name === name);
  return { name: s.name, statusCategory: { key: s.cat } };
};
const isAdf = (b) => b && typeof b === 'object' && b.type === 'doc' && b.version === 1 && Array.isArray(b.content);

// invertLinks: simula il comportamento osservato su Jira reale (progetto KAN dell'utente), dove con
// POST issueLink {inwardIssue: X, outwardIssue: Y} X risulta il BLOCCANTE (X blocca Y).
export function createMockJira(catalog = [], { projectKey = 'KAN', auth = null, invertLinks = false } = {}) {
  const issues = new Map();
  let counter = 0;
  let linkCounter = 0;
  let subCounter = 0;
  const add = (key, fields) => {
    issues.set(key, { id: String(10000 + issues.size), key, fields, comments: [], remotelinks: [] });
  };
  for (const c of catalog) {
    add(c.key, {
      summary: c.summary,
      description: c.description,
      status: statusObj('To Do'),
      priority: { name: c.priority },
      labels: ['tae-benchmark', ...(c.ready ? ['ready'] : [])],
      issuelinks: c.blocked_by.map((k) => ({ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: k } })),
    });
  }
  const log = []; // richieste in scrittura, per i test

  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let s = '';
      req.on('data', (d) => (s += d));
      req.on('end', () => resolve(s ? JSON.parse(s) : {}));
    });
  const publicIssue = ({ comments, remotelinks, ...i }) => i;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    try {
      if (auth && req.headers.authorization !== auth) return json(res, 401, { errorMessages: ['unauthorized'] });

      if (req.method === 'GET' && path === '/rest/api/3/myself') return json(res, 200, { displayName: 'Utente Mock', accountId: 'mock' });
      const pm = path.match(/^\/rest\/api\/3\/project\/([A-Z]+)$/);
      if (req.method === 'GET' && pm) return pm[1] === projectKey ? json(res, 200, { key: projectKey, name: 'mock project', style: 'next-gen' }) : json(res, 404, { errorMessages: ['No project could be found'] });

      if (req.method === 'POST' && path === '/rest/api/3/search/jql') {
        const { jql = '' } = await readBody(req);
        const m = jql.match(/status\s*(?:=\s*"([^"]+)"|in\s*\(([^)]*)\))/i);
        const wanted = m ? (m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))) : null;
        const lbl = jql.match(/labels\s*=\s*"?([\w.-]+)"?/i)?.[1];
        const out = [...issues.values()]
          .filter((i) => !wanted || wanted.includes(i.fields.status.name))
          .filter((i) => !lbl || i.fields.labels.includes(lbl));
        return json(res, 200, { issues: out.map(publicIssue) });
      }

      if (req.method === 'POST' && path === '/rest/api/3/issue') {
        const { fields = {} } = await readBody(req);
        if (!fields.project?.key || !fields.summary || !fields.issuetype?.name) return json(res, 400, { errors: { project: 'required' } });
        if (fields.description !== undefined && !isAdf(fields.description)) return json(res, 400, { errors: { description: 'Operation value must be an Atlassian Document' } });
        const key = `${fields.project.key}-${++counter}`;
        add(key, {
          summary: fields.summary,
          description: fields.description ?? null,
          status: statusObj('To Do'),
          priority: fields.priority ?? { name: 'Medium' },
          labels: fields.labels ?? [],
          issuelinks: [],
        });
        log.push({ op: 'create', key });
        return json(res, 201, { id: issues.get(key).id, key });
      }

      if (req.method === 'POST' && path === '/rest/api/3/issueLink') {
        // Modalità normale: outwardIssue "blocks" inwardIssue. Con invertLinks: inwardIssue blocca outwardIssue.
        const { type, inwardIssue, outwardIssue } = await readBody(req);
        const a = issues.get(inwardIssue?.key);
        const b = issues.get(outwardIssue?.key);
        if (!a || !b || type?.name !== 'Blocks') return json(res, 404, { errorMessages: ['link target not found'] });
        const [blocked, blocker] = invertLinks ? [b, a] : [a, b];
        const t = { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' };
        const id = String(++linkCounter);
        blocked.fields.issuelinks.push({ id, type: t, inwardIssue: { key: blocker.key } });
        blocker.fields.issuelinks.push({ id, type: t, outwardIssue: { key: blocked.key } });
        log.push({ op: 'link', blocked: blocked.key, blocker: blocker.key });
        res.writeHead(201).end();
        return;
      }

      const dm = path.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/(comment|remotelink)\/(\d+)$/);
      if (req.method === 'DELETE' && dm) {
        const it = issues.get(dm[1]);
        if (!it) return json(res, 404, { errorMessages: ['Issue does not exist'] });
        const list = dm[2] === 'comment' ? it.comments : it.remotelinks;
        const idx = list.findIndex((x) => x.id === dm[3]);
        if (idx < 0) return json(res, 404, { errorMessages: ['not found'] });
        list.splice(idx, 1);
        log.push({ op: `delete-${dm[2]}`, key: it.key });
        res.writeHead(204).end();
        return;
      }

      const lm = path.match(/^\/rest\/api\/3\/issueLink\/(\d+)$/);
      if (req.method === 'DELETE' && lm) {
        for (const i of issues.values()) i.fields.issuelinks = i.fields.issuelinks.filter((l) => l.id !== lm[1]);
        log.push({ op: 'unlink', id: lm[1] });
        res.writeHead(204).end();
        return;
      }

      const m = path.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)(?:\/(\w+))?$/);
      if (!m) return json(res, 404, { errorMessages: ['not found'] });
      const issue = issues.get(m[1]);
      if (!issue) return json(res, 404, { errorMessages: ['Issue does not exist'] });
      const sub = m[2];
      if (req.method === 'GET' && !sub) return json(res, 200, publicIssue(issue));
      if (req.method === 'PUT' && !sub) {
        const { fields = {} } = await readBody(req);
        if (fields.labels) issue.fields.labels = fields.labels;
        log.push({ op: 'update', key: issue.key });
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'GET' && sub === 'comment') return json(res, 200, { comments: issue.comments });
      if (req.method === 'GET' && sub === 'remotelink') return json(res, 200, issue.remotelinks.map((r) => ({ id: r.id, object: { url: r.url, title: r.title } })));
      if (req.method === 'GET' && sub === 'transitions') {
        const cur = issue.fields.status.name;
        return json(res, 200, {
          transitions: STATUSES.filter((s) => s.name !== cur).map((s) => ({ id: s.tid, name: s.name, to: statusObj(s.name) })),
        });
      }
      if (req.method === 'POST' && sub === 'transitions') {
        const { transition } = await readBody(req);
        const s = STATUSES.find((x) => x.tid === transition?.id && x.name !== issue.fields.status.name);
        if (!s) return json(res, 400, { errorMessages: ['invalid or unavailable transition'] });
        issue.fields.status = statusObj(s.name);
        log.push({ op: 'transition', key: issue.key, to: s.name });
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'POST' && sub === 'comment') {
        const { body } = await readBody(req);
        if (!isAdf(body)) return json(res, 400, { errors: { comment: 'Comment body is not valid! (ADF required)' } });
        const cid = String(++subCounter);
        issue.comments.push({ id: cid, body });
        log.push({ op: 'comment', key: issue.key });
        return json(res, 201, { id: cid });
      }
      if (req.method === 'POST' && sub === 'remotelink') {
        const { object } = await readBody(req);
        const rid = String(++subCounter);
        issue.remotelinks.push({ id: rid, ...object });
        log.push({ op: 'remotelink', key: issue.key, url: object?.url });
        return json(res, 201, { id: Number(rid) });
      }
      return json(res, 405, { errorMessages: ['method not allowed'] });
    } catch (e) {
      return json(res, 500, { errorMessages: [String(e.message)] });
    }
  });

  return {
    issues,
    log,
    projectKey,
    // Simula l'azione umana (es. merge della PR): cambia stato senza passare dal controller.
    addIssue: (key, fields) => add(key, { description: null, priority: { name: 'Medium' }, labels: [], issuelinks: [], ...fields }),
    setStatus: (key, name) => { issues.get(key).fields.status = statusObj(name); },
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => server.close(r)),
  };
}
