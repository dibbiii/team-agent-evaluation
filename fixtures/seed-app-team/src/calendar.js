// Date come stringhe ISO "YYYY-MM-DD" in UTC (ADR-002). Nessun fuso orario locale.
import { fail } from './util.js';

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Restituisce il numero di giorni dall'epoca (intero).
export function parseDate(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) throw fail('invalid_date', `data non valida: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== iso) throw fail('invalid_date', `data non valida: ${iso}`);
  return ms / DAY_MS;
}

// Giorni da `from` a `to` (negativo se `to` precede `from`).
export function daysBetween(from, to) {
  return parseDate(to) - parseDate(from);
}

export function addDays(iso, n) {
  return new Date((parseDate(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

// Intervalli [start, end): il giorno di fine non è occupato.
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
