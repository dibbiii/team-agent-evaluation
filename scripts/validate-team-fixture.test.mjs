// Test della validazione della fixture di squadra (eseguire con: node --test scripts/*.test.mjs).
// La validazione completa (tutti i mutanti, 3 esecuzioni) si lancia a mano: node scripts/validate-team-fixture.mjs.
// Qui si prova una passata ridotta (--once --only TEAM-8) e la struttura della fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACC, CATALOG, SEED, listFiles, readJson, stages } from './lib/team-fixture-lib.mjs';
import { MUTANTS } from '../fixtures/reference-team/mutants.mjs';

const root = join(import.meta.dirname, '..');
const catalog = readJson(CATALOG);

test('la validazione ridotta (--once --only TEAM-8) termina con 0 e riporta mutanti catturati', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tae-valtest-'));
  try {
    const out = join(dir, 'out.json');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['scripts/validate-team-fixture.mjs', '--once', '--only', 'TEAM-8', '--json', out], { cwd: root, encoding: 'utf8', env, timeout: 280_000 });
    assert.equal(r.status, 0, r.stdout.slice(-3000));
    assert.match(r.stdout, /TUTTO OK/);
    const res = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(res.ok, true);
    const t8 = res.mutants.filter((m) => m.sub === 'TEAM-8');
    assert.ok(t8.length >= 6);
    assert.ok(t8.every((m) => m.caught !== 'NON CATTURATO' && m.caught !== 'CI NON FALLISCE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('i mutanti sono almeno 15, divisi per sotto-compito e per tipo, con i cinque tipi richiesti', () => {
  const heldOut = MUTANTS.filter((m) => m.channel === 'held-out');
  assert.ok(heldOut.length >= 15, `mutanti held-out ${heldOut.length}`);
  const types = new Set(MUTANTS.map((m) => m.type));
  for (const t of ['dependency-ignored', 'merge-conflict', 'stale-after-cr', 'incomplete-guess', 'subtle']) assert.ok(types.has(t), `manca il tipo ${t}`);
  const subs = new Set(MUTANTS.map((m) => m.subtask));
  for (const s of ['TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6', 'TEAM-8']) assert.ok(subs.has(s), `nessun mutante per ${s}`);
  assert.equal(new Set(MUTANTS.map((m) => m.name)).size, MUTANTS.length, 'nomi dei mutanti duplicati');
  for (const m of MUTANTS) assert.ok(m.edits.length >= 1 && m.description);
});

test('struttura: il seed non contiene test held-out, soluzioni, oracolo né il change-request; held-out solo nella cartella del valutatore', () => {
  const seedFiles = listFiles(SEED).join('\n');
  assert.doesNotMatch(seedFiles, /acceptance|answers|oracle|mutant|change-request|reference/i);
  assert.equal(listFiles(ACC).filter((f) => f.endsWith('.acceptance.test.js')).length, 7);
});

test('catalogo: grafo a diamante, tre tipi di sotto-compito, change-request con rilascio', () => {
  const byKey = Object.fromEntries(catalog.map((t) => [t.key, t]));
  assert.deepEqual(byKey['TEAM-5'].depends_on.sort(), ['TEAM-3', 'TEAM-4']); // D dipende da B e C
  assert.deepEqual(byKey['TEAM-3'].depends_on, ['TEAM-2']); // B e C dipendono da A
  assert.deepEqual(byKey['TEAM-4'].depends_on, ['TEAM-2']);
  assert.deepEqual(new Set(catalog.map((t) => t.expected_behavior)), new Set(['ask', 'implement', 'review']));
  assert.equal(byKey['TEAM-8'].release.after_completed, 'TEAM-4');
  assert.ok(catalog.filter((t) => t.ready).length === 1 && byKey['TEAM-1'].ready);
});

test('i rami paralleli TEAM-5 e TEAM-6 vanno in conflitto Git su src/bookings.js', () => {
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) return; // senza git non si può verificare
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { makeTmp, referenceTree, stages } from './scripts/lib/team-fixture-lib.mjs';
    import { spawnSync } from 'node:child_process';
    import { join } from 'node:path';
    const root = makeTmp('tae-conf-');
    const c = stages().parallel_conflicts[0];
    const ch = stages().chains;
    const base = referenceTree(root, ch[c.base]);
    const ours = referenceTree(root, [...ch[c.base], c.ours]);
    const theirs = referenceTree(root, [...ch[c.base], c.theirs]);
    const r = spawnSync('git', ['merge-file', '-p', join(ours, c.file), join(base, c.file), join(theirs, c.file)], { encoding: 'utf8' });
    console.log(r.status);
  `], { cwd: root, encoding: 'utf8' });
  assert.ok(Number(out.stdout.trim()) > 0, `merge-file: ${out.stdout} ${out.stderr}`);
  assert.ok(stages().parallel_conflicts.length >= 1);
});
