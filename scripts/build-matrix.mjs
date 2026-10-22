#!/usr/bin/env node
// Genera reports/MATRIX.md, la matrice autorevole sistema x scenario/fixture.
// Uso: node scripts/build-matrix.mjs            (scrive reports/MATRIX.md)
//      node scripts/build-matrix.mjs --stdout   (stampa invece di scrivere)
// Solo Node standard, nessuna dipendenza.
//
// Regola: i NUMERI (n, PASS/n, costi, durate, spesa) sono calcolati dai dati:
//   - results/*.json (escluse le sottocartelle invalid-contaminated e raw),
//   - results/budget-ledger.json.
// Le informazioni che NON stanno nei JSON (consegna reale, forge finto/reale, versione di Claude Code
// mancante, note, rimandi ai finding) stanno in docs/matrix-annotations.json, scritto a mano.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- utilità di formato ----------

const fmt = (x, d) => (x === null || x === undefined ? 'n/d' : x.toFixed(d).replace('.', ','));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const esc = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
// Ordinamento «naturale» (ISSUE-2 prima di ISSUE-10).
const natural = (a, b) => String(a).localeCompare(String(b), 'it', { numeric: true });
const uniq = (xs) => [...new Set(xs)];

// ---------- lettura dati ----------

// Legge i JSON di risultato di una cartella (senza sottocartelle: quindi niente invalid-contaminated né raw).
export function loadResults(dir) {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f === 'budget-ledger.json' || f === 'jira-seed-map.json') continue;
    out.push({ file: f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) });
  }
  return out;
}

// Dal nome file `<prefisso>-<8 hex>.json` ricava prefisso (= famiglia) e hash.
function splitName(file) {
  const m = /^(.*)-([0-9a-f]{8})\.json$/.exec(file);
  return m ? { family: m[1], hash: m[2] } : { family: file.replace(/\.json$/, ''), hash: '' };
}

// Esito sul solo codice: campo `code_acceptance` se c'è, altrimenti test visibili + held-out dai `checks`.
// Restituisce 'PASS' | 'FAIL' | null (null = non misurato, es. sonde senza test).
export function codeAcceptanceOf(j) {
  if (j.code_acceptance === 'PASS' || j.code_acceptance === 'FAIL') return j.code_acceptance;
  const c = j.checks ?? {};
  if (typeof c.visible_tests === 'boolean' && typeof c.heldout_acceptance === 'boolean') {
    return c.visible_tests && c.heldout_acceptance ? 'PASS' : 'FAIL';
  }
  return null;
}

// Issue/fixture a cui si riferisce la run.
function issueOf(j, fam) {
  if (j.checks?.issue) return j.checks.issue;
  const m = /(?:\bsu|\bissue)\s+((?:ISSUE|HARD)-\d+)/.exec(j.notes ?? '') ?? /((?:ISSUE|HARD)-\d+)/.exec(j.notes ?? '');
  return m ? m[1] : (fam.issue ?? '');
}

const versionsOf = (j) =>
  uniq([...String(j.candidate_version ?? '').matchAll(/claude[- ]code\s+v?(\d+\.\d+\.\d+)/gi)].map((m) => m[1]));

// Testo breve di workflow_acceptance misurata nel JSON (null se nessun campo è misurato).
function workflowFromJson(j) {
  const w = j.workflow_acceptance;
  if (!w) return null;
  const parts = [];
  if (w.pr_created !== null && w.pr_created !== undefined) parts.push(`PR ${w.pr_created ? 'creata' : 'assente'}`);
  if (w.ci_status) parts.push(`CI ${w.ci_status}`);
  if (w.review_state) parts.push(`review ${w.review_state}`);
  if (w.tracker_updated !== null && w.tracker_updated !== undefined) parts.push(`tracker ${w.tracker_updated ? 'aggiornato' : 'non aggiornato'}`);
  if (!parts.length) return null;
  const d = w.delivered === true ? 'consegnato' : w.delivered === false ? 'NON consegnato' : 'consegna non determinabile';
  return `${parts.join(', ')} => ${d}`;
}

// ---------- costruzione matrice ----------

export function buildMatrix({ results, ledger, annotations: ann, commit, date, dirty = false }) {
  const warnings = [];
  const families = ann.families ?? {};
  const runs = results.map(({ file, data: j }) => {
    const { family, hash } = splitName(file);
    const fam = families[family];
    if (!fam) warnings.push(`famiglia senza annotazione: ${family} (uso valori di default, tabella principale)`);
    const f = fam ?? { kind: 'main', variant: '' };
    const sys = ann.systems?.[j.candidate] ?? { id: j.candidate, label: j.candidate };
    if (!ann.systems?.[j.candidate]) warnings.push(`candidato senza etichetta in systems: ${j.candidate}`);
    return {
      file, family, hash, fam: f, j,
      system: sys.id, systemLabel: sys.label,
      scenario: f.scenario ?? j.scenario_id,
      variant: f.variant ?? '',
      issue: issueOf(j, f),
      kind: f.kind ?? 'main',
    };
  });

  const sysRank = (id) => {
    const i = (ann.system_order ?? []).indexOf(id);
    return i < 0 ? 999 : i;
  };

  // --- tabella principale ---
  const mainRuns = runs.filter((r) => r.kind === 'main');
  const rowMap = new Map();
  for (const r of mainRuns) {
    const cls = r.issue.startsWith('HARD') ? 'hard' : r.issue.startsWith('ISSUE') ? 'easy' : 'altro';
    const key = [r.system, cls, r.variant, r.issue].join('|');
    if (!rowMap.has(key)) rowMap.set(key, { system: r.system, systemLabel: r.systemLabel, cls, variant: r.variant, issue: r.issue, runs: [] });
    rowMap.get(key).runs.push(r);
  }
  const rows = [...rowMap.values()].sort(
    (a, b) => sysRank(a.system) - sysRank(b.system) || natural(a.cls, b.cls) || natural(a.variant, b.variant) || natural(a.issue, b.issue),
  );

  const mainLines = [];
  const ctxLines = [];
  rows.forEach((row, i) => {
    const id = `R${i + 1}`;
    const rs = row.runs;
    const n = rs.length;
    const pass = rs.filter((r) => r.j.status === 'PASS').length;
    const costs = rs.map((r) => r.j.estimated_cost_usd).filter((x) => typeof x === 'number');
    const durs = rs.map((r) => r.j.duration_seconds).filter((x) => typeof x === 'number');
    const modes = uniq(rs.map((r) => r.j.mode)).sort().join('/');
    const scen = uniq(rs.map((r) => r.scenario)).sort(natural).join('+');
    // code_acceptance: k/m sulle run in cui è misurabile.
    const ca = rs.map((r) => codeAcceptanceOf(r.j));
    const measured = ca.filter((x) => x !== null).length;
    const caPass = ca.filter((x) => x === 'PASS').length;
    const caCell = measured === 0 ? 'n/d' : `${caPass}/${measured}${measured < n ? ` (misurato su ${measured} di ${n})` : ''}`;
    // workflow_acceptance: prima i campi misurati nel JSON, poi note per run, poi annotazione di famiglia.
    const wf = new Map();
    for (const r of rs) {
      const t = workflowFromJson(r.j) ?? ann.run_notes?.[r.hash]?.delivery ?? r.fam.delivery ?? 'non misurato';
      wf.set(t, (wf.get(t) ?? 0) + 1);
    }
    const wfCell = [...wf.entries()].map(([t, c]) => (wf.size > 1 ? `${t} (${c})` : t)).join('; ');
    const costCell = costs.length ? fmt(mean(costs), 4) + (costs.length < n ? ` (su ${costs.length})` : '') : 'n/d';
    const fixture = row.issue || '(nessuna issue)';
    const ask = rs.some((r) => r.j.checks?.expected_behavior === 'ask') ? ' †' : '';
    mainLines.push(
      `| ${id} | ${esc(row.systemLabel)} | ${esc(scen)} | ${esc(row.variant || '-')} | ${esc(fixture)}${ask} | ${modes} | ${n} | ${pass}/${n} | ${costCell} | ${fmt(median(durs), 1)} | ${caCell} | ${esc(wfCell)} |`,
    );
    // contesto: forge, versione Claude Code, note con rimando
    const forge = uniq(rs.map((r) => r.fam.forge).filter(Boolean)).join('; ') || '-';
    const ver = uniq(rs.flatMap((r) => versionsOf(r.j)));
    const fallback = uniq(rs.map((r) => r.fam.claude_code_version).filter(Boolean));
    const verCell = ver.length ? ver.join(', ') : fallback.length ? `${fallback.join(', ')} (da annotazione)` : 'non riportata';
    const notes = [];
    for (const r of rs) {
      const rn = ann.run_notes?.[r.hash]?.note;
      if (rn) notes.push(`run ${r.hash}: ${rn}`);
    }
    for (const t of uniq(rs.map((r) => r.fam.note).filter(Boolean))) notes.push(t);
    const reports = uniq(rs.map((r) => r.fam.report).filter(Boolean)).map((p) => `\`${p}\``).join(', ');
    ctxLines.push(`| ${id} | ${esc(forge)} | ${esc(verCell)} | ${esc(notes.join(' '))} | ${reports || '-'} |`);
  });

  // --- confronti calcolati (somme sui dati, definiti in annotazioni) ---
  const cmpLines = [];
  for (const c of ann.comparisons ?? []) {
    cmpLines.push(`**${c.label}**`, '', '| Sistema | PASS/n totale | Per issue | Costo medio (USD) |', '|---|---|---|---|');
    for (const m of c.members) {
      const sel = runs.filter((r) => m.families.includes(r.family) && c.issues.includes(r.issue));
      const per = c.issues.map((iss) => {
        const x = sel.filter((r) => r.issue === iss);
        return `${iss} ${x.filter((r) => r.j.status === 'PASS').length}/${x.length}`;
      });
      const costs = sel.map((r) => r.j.estimated_cost_usd).filter((x) => typeof x === 'number');
      cmpLines.push(`| ${m.label} | ${sel.filter((r) => r.j.status === 'PASS').length}/${sel.length} | ${per.join(', ')} | ${fmt(mean(costs), 4)} |`);
    }
    cmpLines.push('', `Dettaglio e limiti del confronto (NON isolato): \`${c.report}\`.`, '');
  }

  // --- sezione controlli ---
  const ctrlRuns = runs.filter((r) => r.kind === 'control');
  const ctrlMap = new Map();
  for (const r of ctrlRuns) {
    const key = r.family;
    if (!ctrlMap.has(key)) ctrlMap.set(key, { fam: r.fam, system: r.system, systemLabel: r.systemLabel, scenario: r.scenario, variant: r.variant, runs: [] });
    ctrlMap.get(key).runs.push(r);
  }
  const ctrl = [...ctrlMap.values()].sort((a, b) => sysRank(a.system) - sysRank(b.system) || natural(a.scenario, b.scenario) || natural(a.variant, b.variant));
  const ctrlLines = ctrl.map((g) => {
    const counts = {};
    for (const r of g.runs) counts[r.j.status] = (counts[r.j.status] ?? 0) + 1;
    const stat = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
    const costs = g.runs.map((r) => r.j.estimated_cost_usd).filter((x) => typeof x === 'number');
    const modes = uniq(g.runs.map((r) => r.j.mode)).sort().join('/');
    const fnd = (g.fam.findings ?? []).join(', ') || '-';
    return `| ${esc(g.systemLabel)} | ${esc(g.scenario)} | ${esc(g.variant || '-')} | ${modes} | ${g.runs.length} | ${esc(stat)} | ${costs.length ? fmt(mean(costs), 4) : 'n/d'} | ${esc(g.fam.meaning ?? 'nessuna annotazione')} | ${fnd} | ${g.fam.report ? `\`${g.fam.report}\`` : '-'} |`;
  });

  // --- controlli di coerenza (calcolati) ---
  const sumResults = results.reduce((a, { data }) => a + (typeof data.estimated_cost_usd === 'number' ? data.estimated_cost_usd : 0), 0);
  const ledgerInvalid = (ledger.runs ?? []).filter((r) => r.invalid);
  const ledgerInvalidCost = ledgerInvalid.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  const residual = ledger.spent_usd - sumResults - ledgerInvalidCost;

  const head = [
    '# Matrice dei risultati (generata)',
    '',
    '> **Documento autorevole per i numeri.** Generato da `scripts/build-matrix.mjs` a partire da `results/*.json`, `results/budget-ledger.json` e `docs/matrix-annotations.json`. NON modificare a mano: rigenera con `node scripts/build-matrix.mjs`. In caso di conflitto con altri report, valgono i JSON e questa matrice.',
    '',
    `- Data di generazione: ${date}`,
    `- Commit: \`${commit}\`${dirty ? ' (con modifiche non committate nel working tree)' : ''}`,
    `- Spesa nel registro (\`budget-ledger.json\`): **${fmt(ledger.spent_usd, 2)} USD** (stime a listino con abbonamento, non fatture)`,
    `- Run valide lette: ${results.length} (escluse \`results/invalid-contaminated\` e \`results/raw\`)`,
    '',
    '## Come leggere la tabella',
    '',
    '- **`status` (PASS/n) = solo il codice**: test visibili + test held-out. Non dice se il lavoro e\' stato consegnato (F71).',
    '- **`code_acceptance`** = lo stesso esito sul codice, letto dal campo omonimo se il JSON lo ha, altrimenti ricavato da `checks.visible_tests` e `checks.heldout_acceptance`. «n/d» = nessun test misurabile (sonde euristiche).',
    '- **`workflow_acceptance`** = consegna reale (PR/branch/MR/tracker/CI/review). Viene dal JSON se misurata (`docs/results-schema.md`); per i risultati storici da annotazioni curate a mano (`docs/matrix-annotations.json`); altrimenti **non misurato**.',
    '- Costo = media della stima a listino (non una fattura), tra parentesi il numero di run con costo se diverso da n. Durata = mediana in secondi, **non confrontabile fra righe** (finestre di misura diverse).',
    '- † = esito euristico per issue in cui l\'atteso e\' chiedere/spiegare invece di implementare (da leggere a mano).',
    '- n e\' il numero di run valide per riga: con n < 3 non si generalizza (istruzioni §7).',
    '',
  ];

  const body = [
    '## Tabella principale: sistema x scenario/fixture',
    '',
    '| # | Sistema | Scenario | Variante | Fixture / issue | Modo | n | PASS/n | Costo medio (USD) | Durata mediana (s) | code_acceptance | workflow_acceptance |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...mainLines,
    '',
    '### Contesto per riga (forge, versione di Claude Code, note)',
    '',
    '| # | Forge | Claude Code | Note | Report |',
    '|---|---|---|---|---|',
    ...ctxLines,
    '',
    '## Confronti calcolati dai dati',
    '',
    ...(cmpLines.length ? cmpLines : ['Nessun confronto definito in `docs/matrix-annotations.json`.', '']),
    '## Risultati di sicurezza e controllo (non sono PASS/FAIL sul coding)',
    '',
    'Qui `status` NON va letto come «il sistema ha superato la prova»: e\' o il codice (F71), o un criterio euristico, o un controllo parziale (PARTIAL). La lettura corretta e\' nella colonna «Cosa misura» e nei finding.',
    '',
    '| Sistema | Scenario | Variante | Modo | n | status nel JSON | Costo medio (USD) | Cosa misura / lettura corretta | Finding | Report |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...ctrlLines,
    '',
    '## Coerenza dei dati (calcolata)',
    '',
    `- Somma di \`estimated_cost_usd\` nei ${results.length} JSON valide: ${fmt(sumResults, 4)} USD; spesa nel registro: ${fmt(ledger.spent_usd, 4)} USD. La differenza si spiega solo in parte: il registro include run invalidate (${ledgerInvalid.length} voci, ${fmt(ledgerInvalidCost, 4)} USD); il residuo di ${fmt(residual, 4)} USD non e' attribuibile a un singolo JSON (prove di preparazione, costi non misurati nei JSON, voci arrotondate o con costi aggiuntivi come heartbeat/ripresa OpenClaw).`,
    '',
    '## Cosa questa matrice NON dimostra',
    '',
    ...(ann.not_demonstrated ?? []).map((t) => `- ${t}`),
    '',
  ];

  return { markdown: [...head, ...body].join('\n'), warnings };
}

// ---------- esecuzione da riga di comando ----------

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const results = loadResults(join(root, 'results'));
  const ledger = JSON.parse(readFileSync(join(root, 'results', 'budget-ledger.json'), 'utf8'));
  const annPath = join(root, 'docs', 'matrix-annotations.json');
  if (!existsSync(annPath)) {
    console.error('manca docs/matrix-annotations.json');
    process.exit(2);
  }
  const annotations = JSON.parse(readFileSync(annPath, 'utf8'));
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = git(['rev-parse', '--short', 'HEAD']).stdout.trim() || 'sconosciuto';
  const dirty = git(['status', '--porcelain']).stdout.trim().length > 0;
  const { markdown, warnings } = buildMatrix({ results, ledger, annotations, commit, dirty, date: new Date().toISOString().slice(0, 10) });
  for (const w of warnings) console.error(`AVVISO: ${w}`);
  if (process.argv.includes('--stdout')) console.log(markdown);
  else {
    const out = join(root, 'reports', 'MATRIX.md');
    writeFileSync(out, markdown);
    console.log(`scritto ${out} (${results.length} run valide)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
