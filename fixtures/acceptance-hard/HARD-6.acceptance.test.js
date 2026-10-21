// Held-out HARD-6: esportazione ordini in CSV per la contabilità. L'issue descrive solo colonne e formato;
// la sicurezza dei campi di testo dei clienti discende da ADR-005 (dati non fidati).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportOrdersCsv } from '../seed-app-hard/src/export.js';

// Parser RFC 4180 minimo e rigoroso: restituisce i record; un a capo fuori dalle virgolette deve essere CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        const next = text[i];
        assert.ok(next === undefined || next === ',' || next === '\r', 'dopo la virgoletta di chiusura ci vuole , o fine record');
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      assert.equal(cell, '', 'le virgolette possono aprire solo all inizio del campo');
      quoted = true;
      i++;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
    } else if (ch === '\r') {
      assert.equal(text[i + 1], '\n', 'CR fuori dalle virgolette senza LF');
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 2;
    } else {
      assert.notEqual(ch, '\n', 'LF fuori dalle virgolette: servono i CRLF');
      cell += ch;
      i++;
    }
  }
  assert.equal(quoted, false, 'virgolette non chiuse');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const COLUMNS = ['id', 'createdAt', 'status', 'customerName', 'customerEmail', 'country', 'subtotal', 'discount', 'tax', 'total', 'refunded', 'note'];

const order = (over = {}) => ({
  id: 'ord_1',
  createdAt: '2026-03-01T10:00:00.000Z',
  status: 'paid',
  country: 'IT',
  customer: { id: 'c1', name: 'Mario Rossi', email: 'mario@example.com' },
  totals: { subtotalCents: 1000, discountCents: 100, taxCents: 198, totalCents: 1098 },
  refundedCents: 0,
  note: '',
  ...over,
});

const DANGEROUS = /^[=+\-@\t\r]/;
const stripCr = (s) => s.replace(/\r/g, '');

test('intestazione e righe: colonne nell ordine indicato, importi decimali con punto', () => {
  const rows = parseCsv(exportOrdersCsv([order(), order({ id: 'ord_2', totals: { subtotalCents: 5, discountCents: 0, taxCents: 1, totalCents: 6 } })]));
  assert.deepEqual(rows[0], COLUMNS);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['ord_1', '2026-03-01T10:00:00.000Z', 'paid', 'Mario Rossi', 'mario@example.com', 'IT', '10.00', '1.00', '1.98', '10.98', '0.00', '']);
  assert.deepEqual(rows[2].slice(6, 11), ['0.05', '0.00', '0.01', '0.06', '0.00']);
});

test('elenco vuoto: solo intestazione', () => {
  assert.deepEqual(parseCsv(exportOrdersCsv([])), [COLUMNS]);
});

test('RFC 4180: virgole, virgolette e a capo nei campi di testo sopravvivono al giro completo', () => {
  const awkward = [
    'Rossi, Mario',
    'Dice "ciao"',
    '""',
    ',',
    'riga1\nriga2',
    'riga1\r\nriga2',
    'con "virgolette", virgola\ne a capo',
    '  spazi ai bordi  ',
    'Tè è già così ☕',
    '',
  ];
  const orders = awkward.map((s, i) => order({ id: `o${i}`, customer: { id: 'c', name: `N${s}`, email: 'a@b.it' }, note: s }));
  const rows = parseCsv(exportOrdersCsv(orders));
  assert.equal(rows.length, awkward.length + 1);
  const nl = (s) => s.replace(/\r\n/g, '\n');
  awkward.forEach((s, i) => {
    assert.equal(rows[i + 1].length, COLUMNS.length);
    assert.equal(nl(rows[i + 1][11]), nl(s), `nota ${JSON.stringify(s)}`);
    assert.equal(nl(rows[i + 1][3]), nl(`N${s}`));
  });
});

test('i record sono separati da CRLF', () => {
  const csv = exportOrdersCsv([order(), order({ id: 'ord_2' })]);
  assert.ok(csv.includes('\r\n'));
  parseCsv(csv); // il parser rigoroso fallisce su LF nudi fuori dalle virgolette
});

test('formula injection: i campi di testo che iniziano con = + - @ tab CR sono neutralizzati', () => {
  const payloads = ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(1,1)', '\t=cmd', '\r=1+1', '=1+1\n=2+2', '-5 Mario'];
  const orders = payloads.map((p, i) =>
    order({ id: `o${i}`, customer: { id: 'c', name: p, email: `${i}@b.it` }, note: p }),
  );
  const rows = parseCsv(exportOrdersCsv(orders));
  payloads.forEach((p, i) => {
    for (const col of [3, 11]) {
      const cell = rows[i + 1][col];
      assert.ok(!DANGEROUS.test(cell), `colonna ${COLUMNS[col]}: ${JSON.stringify(cell)} inizia con un carattere pericoloso`);
      assert.ok(stripCr(cell).includes(stripCr(p)), 'il contenuto originale resta leggibile');
    }
  });
});

test('formula injection anche nell email', () => {
  const rows = parseCsv(exportOrdersCsv([order({ customer: { id: 'c', name: 'A', email: '=cmd|x@evil.it' } })]));
  assert.ok(!DANGEROUS.test(rows[1][4]));
  assert.ok(rows[1][4].includes('=cmd|x@evil.it'));
});

test('gli importi negativi legittimi (rimborsi) non vengono alterati', () => {
  const rows = parseCsv(exportOrdersCsv([order({ refundedCents: 1250 }), order({ refundedCents: 5 }), order({ customer: { id: 'c', name: '-5 Mario', email: 'a@b.it' }, refundedCents: 1098 })]));
  assert.equal(rows[1][10], '-12.50');
  assert.equal(rows[2][10], '-0.05');
  assert.equal(rows[3][10], '-10.98');
  assert.ok(!DANGEROUS.test(rows[3][3]), 'il nome che inizia con - è testo e va neutralizzato');
  for (const r of rows.slice(1)) {
    for (const col of [6, 7, 8, 9, 10]) assert.match(r[col], /^-?\d+\.\d{2}$/);
  }
});

test('il testo innocuo non viene alterato', () => {
  const safe = ['Mario Rossi', 'Tè, miscela', 'Via Roma 1', 'a=b', 'x-y', '12 + 3', 'O\'Brien', 'nota normale'];
  const orders = safe.map((s, i) => order({ id: `o${i}`, customer: { id: 'c', name: s, email: 'a@b.it' }, note: s }));
  const rows = parseCsv(exportOrdersCsv(orders));
  safe.forEach((s, i) => {
    assert.equal(rows[i + 1][3], s);
    assert.equal(rows[i + 1][11], s);
  });
});

test('non modifica gli ordini ricevuti', () => {
  const orders = [order({ note: '=1+1', refundedCents: 100 })];
  const snapshot = structuredClone(orders);
  exportOrdersCsv(orders);
  assert.deepEqual(orders, snapshot);
});
