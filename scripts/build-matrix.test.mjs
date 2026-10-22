// Test minimo di scripts/build-matrix.mjs con dati sintetici (eseguire con: node --test scripts/*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, codeAcceptanceOf } from './build-matrix.mjs';

const run = (extra = {}) => ({
  candidate: 'baseline-claude-code', scenario_id: 'S01', mode: 'LIVE', status: 'PASS', duration_seconds: 10,
  estimated_cost_usd: 0.1, candidate_version: 'claude-code 2.1.307 (Claude Code)',
  checks: { visible_tests: true, heldout_acceptance: true }, notes: 'issue ISSUE-1', ...extra,
});
const annotations = {
  systems: { 'baseline-claude-code': { id: 'baseline', label: 'Baseline' } },
  system_order: ['baseline'],
  families: {
    'S01-baseline-claude-code': { scenario: 'S01', kind: 'main', variant: '', delivery: 'solo workspace' },
    'S09-x': { scenario: 'S09', kind: 'control', variant: 'v', findings: ['F60'], meaning: 'solo codice' },
  },
  not_demonstrated: ['niente di niente'],
};

test('calcola n, PASS/n, costo medio e mediana dai dati', () => {
  const results = [
    { file: 'S01-baseline-claude-code-aaaaaaaa.json', data: run({ duration_seconds: 10, estimated_cost_usd: 0.1 }) },
    { file: 'S01-baseline-claude-code-bbbbbbbb.json', data: run({ status: 'FAIL', checks: { visible_tests: true, heldout_acceptance: false }, duration_seconds: 30, estimated_cost_usd: 0.3 }) },
    { file: 'S01-baseline-claude-code-cccccccc.json', data: run({ duration_seconds: 20, estimated_cost_usd: 0.2 }) },
  ];
  const { markdown, warnings } = buildMatrix({ results, ledger: { spent_usd: 1.5, runs: [] }, annotations, commit: 'abc1234', date: '2026-01-01' });
  assert.equal(warnings.length, 0);
  assert.match(markdown, /Commit: `abc1234`/);
  assert.match(markdown, /\*\*1,50 USD\*\*/);
  // n=3, PASS 2/3, costo medio 0,2000, durata mediana 20,0, code_acceptance 2/3, consegna dall'annotazione
  assert.match(markdown, /\| ISSUE-1 \| LIVE \| 3 \| 2\/3 \| 0,2000 \| 20,0 \| 2\/3 \| solo workspace \|/);
});

test('workflow_acceptance misurata nel JSON ha la precedenza e senza dati si legge «non misurato»', () => {
  const wa = { pr_created: true, ci_status: 'failed', review_state: null, tracker_updated: null, delivered: false, notes: null };
  const results = [{ file: 'S01-baseline-claude-code-aaaaaaaa.json', data: run({ workflow_acceptance: wa }) }];
  const { markdown } = buildMatrix({ results, ledger: { spent_usd: 0, runs: [] }, annotations, commit: 'x', date: 'd' });
  assert.match(markdown, /PR creata, CI failed => NON consegnato/);
  const ann2 = { ...annotations, families: { 'S01-baseline-claude-code': { scenario: 'S01', kind: 'main' } } };
  const r2 = [{ file: 'S01-baseline-claude-code-aaaaaaaa.json', data: run() }];
  assert.match(buildMatrix({ results: r2, ledger: { spent_usd: 0, runs: [] }, annotations: ann2, commit: 'x', date: 'd' }).markdown, /non misurato/);
});

test('le famiglie di controllo vanno nella sezione sicurezza, non nella tabella principale', () => {
  const results = [{ file: 'S09-x-aaaaaaaa.json', data: run({ scenario_id: 'S09', notes: '' }) }];
  const { markdown } = buildMatrix({ results, ledger: { spent_usd: 0, runs: [] }, annotations, commit: 'x', date: 'd' });
  assert.match(markdown, /\| Baseline \| S09 \| v \| LIVE \| 1 \| PASS 1 \|/);
  assert.match(markdown, /F60/);
});

test('famiglia senza annotazione: avviso; codeAcceptanceOf usa il campo esplicito', () => {
  const results = [{ file: 'ZZ-nuova-aaaaaaaa.json', data: run() }];
  const { warnings } = buildMatrix({ results, ledger: { spent_usd: 0, runs: [] }, annotations, commit: 'x', date: 'd' });
  assert.ok(warnings.some((w) => w.includes('ZZ-nuova')));
  assert.equal(codeAcceptanceOf({ code_acceptance: 'FAIL', checks: { visible_tests: true, heldout_acceptance: true } }), 'FAIL');
  assert.equal(codeAcceptanceOf({ checks: {} }), null);
});
