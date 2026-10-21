#!/usr/bin/env node
// S08 sulla baseline (Claude Code da solo, lato Windows): memoria e handoff fra sessioni INDIPENDENTI.
//
//   Sessione 1  implementa HARD-1 (IVA coerente, fixture difficile) e scrive HANDOFF.md (stato, decisioni, assunzioni,
//               cosa resta). Valutazione: held-out HARD-1.
//   Sessione 2  NUOVA (nessuna conversazione condivisa): riceve il repository della sessione 1 e il solo HANDOFF.md e
//               implementa HARD-3 (rimborsi parziali), che dipende da HARD-1. Valutazione: held-out HARD-3.
//               Controllo (--control): stessa sessione 2 SENZA HANDOFF.md e senza accenno ad esso (repo identico).
//   Sessione 3  invalidazione: dopo un commit che cambia un'assunzione documentata nell'handoff (aliquota IVA IT standard
//               22% -> 21% in src/tax.js), una sessione nuova di SOLA LETTURA (piu' git read-only) riceve (U) un compito
//               generico "riprendi dall'handoff" e (T) la domanda mirata "l'assunzione X e' ancora valida?", con una
//               assunzione che NON e' cambiata (Y) per misurare anche i falsi allarmi.
//
// Uso: node scripts/run-s08-handoff.mjs run [--control] [--dry]
//   --dry   stampa i prompt e termina (costo 0).
// n=1 per variante. Test held-out mai visibili all'agente: la valutazione usa scripts/evaluate.mjs (FIXTURE=hard) su una
// copia del solo src/ del workspace. Il workspace e' una cartella temporanea fuori dalla repo, copiata in results/raw/
// (ignorata da git) a fine fase per diagnosi.
// Restrizioni di Claude Code come run-baseline.mjs: CLAUDE_CODE_DISABLE_CLAUDE_MDS=1, --setting-sources project,
// --strict-mcp-config, --no-session-persistence, strumenti Read/Edit/Write/Glob/Grep e Bash(node:*|npm test) nelle sessioni
// 1-2; sessione 3 solo Read/Glob/Grep e Bash(git log|diff|show|status) (sola lettura).
// Budget: registro locale results/raw/s03-s08-spend.json (tetto 2,5 USD in comune con S03), per run max 1 USD, stop se
// la RAM libera scende sotto 1500 MB. NON modifica results/budget-ledger.json.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOTAL_CAP_USD = 2.5;
const S1_CAP = 0.6;
const S2_CAP = 0.8;
const S3_CAP = 0.3;
const MAX_TURNS = 30;
const MIN_FREE_MB = 1500;
const MODEL = 'claude-sonnet-5-5';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(root, 'fixtures', 'seed-app-hard');
const CATALOG = join(root, 'fixtures', 'issue-catalog', 'hard-issues.json');
const SPEND = join(root, 'results', 'raw', 's03-s08-spend.json');
const issues = JSON.parse(readFileSync(CATALOG, 'utf8'));
const H1 = issues.find((i) => i.key === 'HARD-1');
const H3 = issues.find((i) => i.key === 'HARD-3');

const argv = process.argv.slice(2);
const cmd = argv[0];
const dry = argv.includes('--dry');
const control = argv.includes('--control');
if (cmd !== 'run') {
  console.error('usage: run-s08-handoff.mjs run [--control] [--dry]');
  process.exit(2);
}

// --- utilita' ------------------------------------------------------------------------------------------------

function freeMb() {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes'], { encoding: 'utf8' });
  const n = Number(String(r.stdout).trim());
  return Number.isFinite(n) ? n : null;
}
const loadSpend = () => (existsSync(SPEND) ? JSON.parse(readFileSync(SPEND, 'utf8')) : { cap_usd: TOTAL_CAP_USD, spent_usd: 0, runs: [] });
function guard(capNext) {
  const mb = freeMb();
  if (mb !== null && mb < MIN_FREE_MB) { console.error(`STOP: RAM libera ${mb} MB (< ${MIN_FREE_MB}).`); process.exit(5); }
  const s = loadSpend();
  if (s.spent_usd + capNext > TOTAL_CAP_USD) { console.error(`STOP BUDGET: spesi ${s.spent_usd.toFixed(4)} USD, la prossima run (tetto ${capNext}) supererebbe ${TOTAL_CAP_USD}.`); process.exit(3); }
  return mb;
}
function account(label, cost) {
  const s = loadSpend();
  s.spent_usd = +(s.spent_usd + (cost ?? 0)).toFixed(6);
  s.runs.push({ label, cost_usd: cost, at: new Date().toISOString() });
  mkdirSync(dirname(SPEND), { recursive: true });
  writeFileSync(SPEND, JSON.stringify(s, null, 2));
  return s.spent_usd;
}
const copyTree = (from, to) => cpSync(from, to, { recursive: true, filter: (src) => !relative(from, src).split(sep).includes('node_modules') });
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8' });

function runClaude({ prompt, cwd, tools, allowed, cap, permissionMode = null, schema = null }) {
  const args = [
    '-p', '--model', MODEL, '--max-budget-usd', String(cap), '--max-turns', String(MAX_TURNS),
    '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--setting-sources', 'project', '--strict-mcp-config',
    ...(permissionMode ? ['--permission-mode', permissionMode] : []),
    '--tools', tools, '--allowedTools', ...allowed,
  ];
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  const t0 = Date.now();
  const r = spawnSync('claude', args, {
    cwd, input: prompt, encoding: 'utf8', timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' },
  });
  const events = String(r.stdout).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = [...events].reverse().find((e) => e.type === 'result') ?? null;
  const toolUses = [];
  for (const e of events) if (e.type === 'assistant') for (const b of e.message?.content ?? []) if (b.type === 'tool_use') toolUses.push({ name: b.name, input: b.input });
  let structured = result?.structured_output ?? null;
  if (!structured && schema && result?.result) { try { structured = JSON.parse(result.result); } catch { /* null */ } }
  return {
    raw: String(r.stdout), seconds: (Date.now() - t0) / 1000, toolUses, result, structured,
    text: String(result?.result ?? ''), cost: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
    executionError: !result || result.is_error === true,
  };
}
function saveRaw(name, run) {
  mkdirSync(join(root, 'results', 'raw'), { recursive: true });
  const file = `s08-${name}-${Date.now()}.jsonl`;
  writeFileSync(join(root, 'results', 'raw', file), run.raw);
  return file;
}
function keepWorkspace(name, ws) {
  const dest = join(root, 'results', 'raw', `s08-ws-${name}-${Date.now()}`);
  copyTree(ws, dest);
  return relative(root, dest);
}
function evaluate(ws, key) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'evaluate.mjs'), ws, key, 'baseline-claude-code', 'S08-tmp', 'LIVE', MODEL], { encoding: 'utf8', env: { ...process.env, FIXTURE: 'hard' } });
  let out = {};
  try { out = JSON.parse(r.stdout); } catch { /* vuoto */ }
  if (out.result_file && existsSync(out.result_file)) rmSync(out.result_file, { force: true }); // record temporaneo di evaluate.mjs: i dati entrano nel nostro record
  return { status: out.status ?? 'FAIL', checks: out.checks ?? {} };
}
function record({ status, started, finished, run, checks, notes, rawName, blockers = [] }) {
  const id = randomUUID();
  const u = run?.result?.usage;
  const rec = {
    run_id: id, candidate: 'baseline-claude-code',
    candidate_version: `claude-code ${spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim()}`,
    scenario_id: 'S08', mode: 'LIVE', model: MODEL,
    baseline_commit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() || null,
    status, started_at_utc: started.toISOString(), finished_at_utc: finished.toISOString(), duration_seconds: (finished - started) / 1000,
    input_tokens: u?.input_tokens ?? null, output_tokens: u?.output_tokens ?? null,
    cache_tokens: u ? (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : null,
    estimated_cost_usd: run?.cost ?? null, retries: 0, human_interventions: 0, checks,
    artifact_paths: rawName ? [`results/raw/${rawName}`] : [], blockers, notes,
  };
  const file = join(root, 'results', `S08-baseline-${id.slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify(rec, null, 2));
  return relative(root, file);
}

// --- prompt --------------------------------------------------------------------------------------------------

const implPrompt = (issue, extra = []) => [
  `Sei uno sviluppatore. Lavora nella cartella corrente (una libreria backend di e-commerce in Node, senza dipendenze, importi in centesimi interi). Le decisioni di architettura approvate sono in docs/adr/.`,
  `Issue ${issue.key} (${issue.type}, priorità ${issue.priority}): ${issue.summary}`,
  ``,
  issue.description,
  ``,
  `Criteri di accettazione:`,
  ...issue.acceptance.map((a) => `- ${a}`),
  ``,
  `Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con "npm test". Non cambiare l'interfaccia pubblica oltre quanto richiesto.`,
  ...extra,
].join('\n');

const S1_EXTRA = [
  ``,
  `Quando hai finito, scrivi nella radice del repository il file HANDOFF.md: un passaggio di consegne per una collega che NON ha accesso a questa conversazione e dovrà fare la prossima issue, che dipende da questo lavoro (rimborsi parziali per riga con IVA e sconto ripartiti, HARD-3). Sezioni obbligatorie:`,
  `1. Stato (cosa è fatto e verificato, cosa no);`,
  `2. Decisioni prese e perché;`,
  `3. Assunzioni: elenca numerate ogni dato su cui ti sei basato, con file e valore attuale (per esempio aliquote, modalità di arrotondamento, punti unici di calcolo), in modo che si possano ricontrollare;`,
  `4. File toccati;`,
  `5. Cosa resta e che cosa deve sapere chi riprende (rischi, trappole);`,
  `6. Come verificare (comandi).`,
  `Massimo 60 righe, italiano. Al termine rispondi con un riassunto di 3 righe.`,
];
const S2_HANDOFF = [
  ``,
  `Una collega ha lavorato prima di te su HARD-1, da cui questa issue dipende, e ha lasciato il passaggio di consegne nel file HANDOFF.md nella radice del repository.`,
  `Al termine rispondi con un riassunto di 3 righe.`,
];
const S2_NOHANDOFF = [``, `Al termine rispondi con un riassunto di 3 righe.`];

const RATE_NEW_BP = 2100; // l'aliquota IT standard passa da 2200 a 2100: cambia un'assunzione documentata
const S3_SCHEMA_T = {
  type: 'object',
  properties: {
    X: { type: 'object', properties: { still_valid: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['still_valid', 'evidence'] },
    Y: { type: 'object', properties: { still_valid: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['still_valid', 'evidence'] },
    handoff_needs_update: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['X', 'Y', 'handoff_needs_update', 'notes'],
};
const S3_SCHEMA_U = {
  type: 'object',
  properties: {
    status_summary: { type: 'string' },
    next_steps: { type: 'array', items: { type: 'string' } },
    discrepancies_or_risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['status_summary', 'next_steps', 'discrepancies_or_risks'],
};
const s3Head = `Sei uno sviluppatore che subentra su questo repository (libreria e-commerce Node, importi in centesimi, ADR in docs/adr/). Il passaggio di consegne di chi ti ha preceduto è in HANDOFF.md nella radice. Non conosci la conversazione precedente. Hai strumenti di sola lettura e git in sola lettura (log, diff, show, status): non puoi modificare nulla.`;
const S3_U = [s3Head, ``, `Riprendi il lavoro a partire da HANDOFF.md: riassumi lo stato e indica i prossimi passi che faresti; segnala eventuali discrepanze o rischi che noti.`].join('\n');
const S3_T = [
  s3Head, ``,
  `Prima di riprendere, controlla due assunzioni documentate nell'handoff e dimmi per ciascuna se è ANCORA VALIDA oggi sul repository (con evidenza: file/riga o commit):`,
  `- X: «l'aliquota IVA standard dell'Italia è 22%»;`,
  `- Y: «l'IVA di riga si arrotonda half-even tramite lineTax in src/tax.js, unico punto di arrotondamento dell'IVA (ADR-001)».`,
  `Indica anche se l'handoff va aggiornato.`,
].join('\n');

if (dry) {
  console.log('--- S1 ---\n' + implPrompt(H1, S1_EXTRA).slice(-1400));
  console.log('--- S2 (con handoff, coda) ---\n' + implPrompt(H3, S2_HANDOFF).slice(-500));
  console.log('--- S3 U ---\n' + S3_U + '\n--- S3 T ---\n' + S3_T);
  process.exit(0);
}

// --- esecuzione ----------------------------------------------------------------------------------------------

const IMPL_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash';
const IMPL_ALLOWED = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm test)', 'Bash(npm run test)'];
const RO_ALLOWED = ['Read', 'Glob', 'Grep', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)', 'Bash(git status:*)'];
const summary = {};

// ---- Sessione 1
const ws = mkdtempSync(join(tmpdir(), 'tae-s08-'));
try {
  copyTree(SEED, ws);
  let mb = guard(S1_CAP);
  let started = new Date();
  const s1 = runClaude({ prompt: implPrompt(H1, S1_EXTRA), cwd: ws, tools: IMPL_TOOLS, allowed: IMPL_ALLOWED, cap: S1_CAP, permissionMode: 'acceptEdits' });
  let finished = new Date();
  account('S08 sessione 1 (HARD-1 + handoff)', s1.cost);
  const handoffPath = join(ws, 'HANDOFF.md');
  const handoff = existsSync(handoffPath) ? readFileSync(handoffPath, 'utf8') : '';
  const ev1 = evaluate(ws, 'HARD-1');
  const hChecks = {
    handoff_exists: handoff.length > 0,
    handoff_lines: handoff ? handoff.split('\n').length : 0,
    handoff_mentions_rate_22: /\b22\s*%|2200/.test(handoff),
    handoff_mentions_lineTax_half_even: /lineTax/.test(handoff) && /half-?even/i.test(handoff),
    handoff_mentions_reports: /reports\.js|vatReport/.test(handoff),
    handoff_mentions_adr001: /ADR-001/.test(handoff),
  };
  const raw1 = saveRaw('s1', s1);
  const kept1 = keepWorkspace('s1', ws);
  const status1 = s1.executionError ? 'FAIL' : ev1.status === 'PASS' && hChecks.handoff_exists ? 'PASS' : 'FAIL';
  summary.s1 = { status: status1, heldout_hard1: ev1.checks.heldout_acceptance, cost: s1.cost, ...hChecks, file: record({
    status: status1, started, finished, run: s1, rawName: raw1,
    checks: { session: 1, issue: 'HARD-1', variant: 'implementa + scrive handoff', heldout_acceptance: ev1.checks.heldout_acceptance, visible_tests: ev1.checks.visible_tests, heldout_failures: ev1.checks.heldout_failures ?? null, ...hChecks, turns: s1.result?.num_turns ?? null, free_mb_before: mb, workspace_kept: kept1, handoff_text_excerpt: handoff.slice(0, 1500) },
    notes: `S08 sessione 1, n=1. PASS = held-out HARD-1 PASS e HANDOFF.md scritto. Riassunto agente: ${s1.text.replace(/\s+/g, ' ').slice(0, 300)}`,
    blockers: s1.executionError ? ['errore di esecuzione di claude'] : [],
  }) };
  console.log(JSON.stringify({ s1: summary.s1 }));

  // commit 1 = stato consegnato dalla sessione 1 (serve alla sessione 3)
  git(ws, 'init', '-q');
  git(ws, 'add', '-A');
  git(ws, 'commit', '-q', '-m', 'Sessione 1: HARD-1 (IVA coerente) + HANDOFF.md');

  // ---- Sessione 2 (con handoff) e controllo (senza)
  const variants = [{ id: 'with-handoff', mention: true }, ...(control ? [{ id: 'no-handoff', mention: false }] : [])];
  let ws2With = null;
  for (const v of variants) {
    const w2 = mkdtempSync(join(tmpdir(), 'tae-s08-s2-'));
    try {
      copyTree(ws, w2);
      if (!v.mention) { rmSync(join(w2, 'HANDOFF.md'), { force: true }); rmSync(join(w2, '.git'), { recursive: true, force: true }); }
      mb = guard(S2_CAP);
      started = new Date();
      const s2 = runClaude({ prompt: implPrompt(H3, v.mention ? S2_HANDOFF : S2_NOHANDOFF), cwd: w2, tools: IMPL_TOOLS, allowed: IMPL_ALLOWED, cap: S2_CAP, permissionMode: 'acceptEdits' });
      finished = new Date();
      account(`S08 sessione 2 (${v.id})`, s2.cost);
      const ev3 = evaluate(w2, 'HARD-3');
      const ev1b = evaluate(w2, 'HARD-1');
      const idxRead = s2.toolUses.findIndex((t) => (t.name === 'Read' && /HANDOFF\.md$/i.test(String(t.input?.file_path ?? ''))) || (t.name === 'Bash' && /HANDOFF\.md/.test(String(t.input?.command ?? ''))));
      const readHandoff = idxRead >= 0;
      const handoffAfter = existsSync(join(w2, 'HANDOFF.md')) ? readFileSync(join(w2, 'HANDOFF.md'), 'utf8') : '';
      const checks = {
        session: 2, issue: 'HARD-3', variant: v.id,
        handoff_provided: v.mention,
        handoff_read: readHandoff,
        handoff_read_at_tool_call_index: idxRead >= 0 ? idxRead : null,
        handoff_mentioned_in_final_answer: /handoff|passaggio di consegne/i.test(s2.text),
        handoff_file_modified_by_session2: v.mention ? handoffAfter !== handoff : null,
        heldout_acceptance: ev3.checks.heldout_acceptance,
        visible_tests: ev3.checks.visible_tests,
        heldout_failures: ev3.checks.heldout_failures ?? null,
        hard1_heldout_still_passes: ev1b.checks.heldout_acceptance,
        session1_hard1_heldout: ev1.checks.heldout_acceptance,
        tool_calls: s2.toolUses.length,
        turns: s2.result?.num_turns ?? null,
        free_mb_before: mb,
        final_answer_excerpt: s2.text.replace(/\s+/g, ' ').slice(0, 400),
      };
      const status = s2.executionError ? 'FAIL' : ev3.status;
      const raw2 = saveRaw(`s2-${v.id}`, s2);
      checks.workspace_kept = keepWorkspace(`s2-${v.id}`, w2);
      summary[`s2_${v.id}`] = { status, heldout_hard3: ev3.checks.heldout_acceptance, read_handoff: readHandoff, cost: s2.cost, turns: checks.turns, file: record({
        status, started, finished, run: s2, rawName: raw2, checks,
        notes: `S08 sessione 2 (${v.id}), n=1, sessione NUOVA. PASS = held-out HARD-3 PASS (la dipendenza HARD-1 e' quella fatta dalla sessione 1${v.mention ? ', con HANDOFF.md' : ', SENZA handoff (controllo)'}).`,
        blockers: s2.executionError ? ['errore di esecuzione di claude'] : [],
      }) };
      console.log(JSON.stringify({ [`s2_${v.id}`]: summary[`s2_${v.id}`] }));
      if (v.mention) ws2With = w2;
      else rmSync(w2, { recursive: true, force: true });
    } catch (e) {
      rmSync(w2, { recursive: true, force: true });
      throw e;
    }
  }

  // ---- Sessione 3: invalidazione (parte dal workspace con handoff della sessione 2)
  const w3 = ws2With;
  git(w3, 'add', '-A');
  git(w3, 'commit', '-q', '-m', 'Sessione 2: HARD-3 (rimborsi parziali)');
  const taxFile = join(w3, 'src', 'tax.js');
  const taxSrc = readFileSync(taxFile, 'utf8');
  const changed = taxSrc.replace('IT: { standard: 2200,', `IT: { standard: ${RATE_NEW_BP},`);
  if (changed === taxSrc) throw new Error('commit di invalidazione: pattern aliquota IT non trovato');
  writeFileSync(taxFile, changed);
  git(w3, 'add', '-A');
  git(w3, 'commit', '-q', '-m', `Aliquota IVA IT standard portata al 21% (decreto simulato)`);
  const hashChange = git(w3, 'rev-parse', '--short', 'HEAD').stdout.trim();

  const detectRate = (t) => /\b21\s*%|2100|aliquota[^.]{0,80}(cambiat|modificat|aggiornat|non è più|non e' più|non più|diversa)|(cambiat|modificat|aggiornat)[^.]{0,60}aliquota/i.test(t);
  const s3runs = [
    { id: 'U-compito-generico', prompt: S3_U, schema: S3_SCHEMA_U },
    { id: 'T-domanda-mirata', prompt: S3_T, schema: S3_SCHEMA_T },
  ];
  for (const v of s3runs) {
    mb = guard(S3_CAP);
    started = new Date();
    const s3 = runClaude({ prompt: v.prompt, cwd: w3, tools: 'Read,Glob,Grep,Bash', allowed: RO_ALLOWED, cap: S3_CAP, schema: v.schema });
    finished = new Date();
    account(`S08 sessione 3 (${v.id})`, s3.cost);
    const answer = JSON.stringify(s3.structured ?? s3.text);
    const ranGit = s3.toolUses.filter((t) => t.name === 'Bash').map((t) => String(t.input?.command ?? '').slice(0, 120));
    const sawRateInFile = s3.toolUses.some((t) => t.name === 'Read' && /tax\.js$/.test(String(t.input?.file_path ?? '')));
    let status;
    const checks = { session: 3, variant: v.id, invalidating_commit: hashChange, changed_assumption: 'aliquota IT standard 22% -> 21% (src/tax.js)', assumption_documented_in_handoff: summary.s1.handoff_mentions_rate_22, git_commands: ranGit, read_tax_js: sawRateInFile, turns: s3.result?.num_turns ?? null, free_mb_before: mb, answer_excerpt: answer.slice(0, 1200) };
    if (v.id.startsWith('T')) {
      const X = s3.structured?.X, Y = s3.structured?.Y;
      checks.X_reported_still_valid = X?.still_valid ?? null; // atteso: false
      checks.Y_reported_still_valid = Y?.still_valid ?? null; // atteso: true (nessun falso allarme)
      checks.handoff_needs_update = s3.structured?.handoff_needs_update ?? null;
      checks.X_evidence_cites_21_or_commit = X ? /21|2100|commit|git|tax\.js/i.test(X.evidence) : null;
      status = s3.executionError || !s3.structured ? 'FAIL' : X.still_valid === false && Y.still_valid === true ? 'PASS' : X.still_valid === false ? 'PARTIAL' : 'FAIL';
    } else {
      checks.spontaneously_mentions_rate_change = detectRate(answer);
      status = s3.executionError ? 'FAIL' : checks.spontaneously_mentions_rate_change ? 'PASS' : 'FAIL';
    }
    const raw3 = saveRaw(`s3-${v.id}`, s3);
    summary[`s3_${v.id}`] = { status, cost: s3.cost, ...Object.fromEntries(Object.entries(checks).filter(([k]) => /X_|Y_|spont|handoff_needs/.test(k))), file: record({
      status, started, finished, run: s3, rawName: raw3, checks,
      notes: `S08 sessione 3 (${v.id}), n=1, sessione NUOVA di sola lettura dopo un commit che cambia l'aliquota IT standard (assunzione ${summary.s1.handoff_mentions_rate_22 ? 'DOCUMENTATA' : 'NON documentata'} nell'handoff). Esito euristico (regex + schema): leggere results/raw/${raw3}.`,
      blockers: s3.executionError ? ['errore di esecuzione di claude'] : [],
    }) };
    console.log(JSON.stringify({ [`s3_${v.id}`]: summary[`s3_${v.id}`] }));
  }
  rmSync(w3, { recursive: true, force: true });
} finally {
  rmSync(ws, { recursive: true, force: true });
}
console.log(JSON.stringify({ spent_total_usd: loadSpend().spent_usd }));
