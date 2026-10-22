// Test di scripts/lib/workflow-acceptance.mjs (eseguire con: node --test scripts/*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitArgs, buildWorkflowAcceptance, computeDelivered } from './lib/workflow-acceptance.mjs';

test('senza flag tutto è null (non misurato) e delivered è null', () => {
  const wa = buildWorkflowAcceptance({});
  assert.deepEqual(wa, { pr_created: null, ci_status: null, review_state: null, tracker_updated: null, delivered: null, notes: null });
});

test('gli argomenti posizionali restano invariati anche con i flag', () => {
  const { positional, flags } = splitArgs(['ws', 'ISSUE-1', 'cand', 'S01', 'LIVE', 'model', '--pr=created', '--ci=passed']);
  assert.deepEqual(positional, ['ws', 'ISSUE-1', 'cand', 'S01', 'LIVE', 'model']);
  assert.deepEqual(flags, { pr: 'created', ci: 'passed' });
});

test('delivered true solo se tutto il misurato è favorevole e pr_created è misurato', () => {
  assert.equal(buildWorkflowAcceptance({ pr: 'created' }).delivered, true);
  assert.equal(buildWorkflowAcceptance({ pr: 'created', ci: 'passed', review: 'approved', tracker: 'updated' }).delivered, true);
});

test('delivered false se un campo misurato è sfavorevole', () => {
  assert.equal(buildWorkflowAcceptance({ pr: 'none' }).delivered, false);
  assert.equal(buildWorkflowAcceptance({ pr: 'created', ci: 'failed' }).delivered, false);
  assert.equal(buildWorkflowAcceptance({ pr: 'created', review: 'pending' }).delivered, false);
  assert.equal(buildWorkflowAcceptance({ ci: 'failed' }).delivered, false); // anche senza pr misurato
});

test('delivered null se pr_created non è misurato e nulla è sfavorevole', () => {
  assert.equal(buildWorkflowAcceptance({ ci: 'passed' }).delivered, null);
  assert.equal(buildWorkflowAcceptance({ tracker: 'updated', review: 'approved' }).delivered, null);
});

test('valori e flag non ammessi vengono rifiutati', () => {
  assert.throws(() => splitArgs(['--pr=maybe']), /non ammesso/);
  assert.throws(() => splitArgs(['--foo=1']), /sconosciuto/);
  assert.throws(() => splitArgs(['--pr']), /non valido/);
});

test('notes viene copiato e computeDelivered ignora i null', () => {
  assert.equal(buildWorkflowAcceptance({ notes: 'ciao' }).notes, 'ciao');
  assert.equal(computeDelivered({ pr_created: null, ci_status: null, review_state: null, tracker_updated: null }), null);
});
