// Finto Jira "stupido": sottoinsieme della REST API v3 di Jira Cloud, solo per test.
// NON implementa JQL reale: supporta soltanto `status = "X"` e `status in ("X","Y")`.
// Non ha lease né priorità di scheduling: come Jira reale, non impedisce due claim.
import { createServer } from 'node:http';

const TRANSITIONS = [
  { id: '11', name: 'Start', to: { name: 'In Progress' } },
  { id: '21', name: 'Back to To Do', to: { name: 'To Do' } },
  { id: '31', name: 'Done', to: { name: 'Done' } },
];

export function createMockJira(catalog) {
  const issues = new Map();
  for (const c of catalog) {
    issues.set(c.key, {
      id: String(10000 + issues.size),
      key: c.key,
      fields: {
        summary: c.summary,
        description: c.description,
        status: { name: 'To Do' },
        priority: { name: c.priority },
        labels: c.ready ? ['ready'] : [],
        issuelinks: c.blocked_by.map((k) => ({
          type: { name: 'Blocks', inward: 'is blocked by' },
          inwardIssue: { key: k },
        })),
      },
      comments: [],
      remotelinks: [],
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    try {
      if (req.method === 'POST' && path === '/rest/api/3/search/jql') {
        const { jql = '' } = await readBody(req);
        const m = jql.match(/status\s*(?:=\s*"([^"]+)"|in\s*\(([^)]*)\))/i);
        const wanted = m ? (m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))) : null;
        const out = [...issues.values()].filter((i) => !wanted || wanted.includes(i.fields.status.name));
        return json(res, 200, { issues: out.map(({ comments, remotelinks, ...i }) => i) });
      }
      let m = path.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)(?:\/(\w+))?$/);
      if (!m) return json(res, 404, { errorMessages: ['not found'] });
      const issue = issues.get(m[1]);
      if (!issue) return json(res, 404, { errorMessages: ['Issue does not exist'] });
      const sub = m[2];
      if (req.method === 'GET' && !sub) {
        const { comments, remotelinks, ...i } = issue;
        return json(res, 200, i);
      }
      if (req.method === 'GET' && sub === 'transitions') return json(res, 200, { transitions: TRANSITIONS });
      if (req.method === 'POST' && sub === 'transitions') {
        const { transition } = await readBody(req);
        const t = TRANSITIONS.find((x) => x.id === transition?.id);
        if (!t) return json(res, 400, { errorMessages: ['invalid transition'] });
        issue.fields.status = { name: t.to.name };
        log.push({ op: 'transition', key: issue.key, to: t.to.name });
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'POST' && sub === 'comment') {
        const { body } = await readBody(req);
        issue.comments.push(body);
        log.push({ op: 'comment', key: issue.key });
        return json(res, 201, { id: String(issue.comments.length) });
      }
      if (req.method === 'POST' && sub === 'remotelink') {
        const { object } = await readBody(req);
        issue.remotelinks.push(object);
        log.push({ op: 'remotelink', key: issue.key, url: object?.url });
        return json(res, 201, { id: issue.remotelinks.length });
      }
      return json(res, 405, { errorMessages: ['method not allowed'] });
    } catch (e) {
      return json(res, 500, { errorMessages: [String(e.message)] });
    }
  });

  return {
    issues,
    log,
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => server.close(r)),
  };
}
