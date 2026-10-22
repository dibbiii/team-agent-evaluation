// Importi in centesimi interi (ADR-001). Ogni arrotondamento passa da questo file.
import { fail } from './util.js';

export function assertCents(value, name = 'importo') {
  if (!Number.isInteger(value)) throw fail('invalid_amount', `${name} deve essere un intero in centesimi`);
  return value;
}

// Percentuale intera di un importo, arrotondata half-up al centesimo.
export function pct(cents, percent) {
  assertCents(cents);
  return Math.floor((cents * percent + 50) / 100);
}

// Divisione intera per eccesso (a >= 0, b > 0).
export function ceilDiv(a, b) {
  assertCents(a);
  return Math.ceil(a / b);
}

export function sum(values) {
  return values.reduce((total, v) => total + assertCents(v), 0);
}

// 1234 -> "12,34 EUR"
export function formatEuro(cents) {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} EUR`;
}
