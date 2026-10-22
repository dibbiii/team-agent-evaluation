import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, overlaps, parseDate } from '../src/index.js';

test('daysBetween conta i giorni di calendario', () => {
  assert.equal(daysBetween('2026-03-01', '2026-03-08'), 7);
  assert.equal(daysBetween('2026-03-08', '2026-03-01'), -7);
  assert.equal(daysBetween('2026-03-01', '2026-03-01'), 0);
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3); // 2026 non è bisestile
  assert.equal(daysBetween('2028-02-27', '2028-03-02'), 4); // 2028 è bisestile
});

test('addDays attraversa mesi e anni', () => {
  assert.equal(addDays('2026-03-30', 3), '2026-04-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('le date non valide sono rifiutate', () => {
  assert.throws(() => parseDate('2026-02-30'), { code: 'invalid_date' });
  assert.throws(() => parseDate('01/03/2026'), { code: 'invalid_date' });
  assert.throws(() => parseDate(20260301), { code: 'invalid_date' });
});

test('overlaps tratta la fine come esclusa', () => {
  assert.equal(overlaps('2026-03-01', '2026-03-05', '2026-03-05', '2026-03-08'), false);
  assert.equal(overlaps('2026-03-01', '2026-03-05', '2026-03-04', '2026-03-08'), true);
});
